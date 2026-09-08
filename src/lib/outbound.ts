import { db } from "@/lib/db"
import { getOutboundSettings, outboundProviderStatus, type OutboundSettings } from "@/lib/settings"
import { dhakaDateKey } from "@/lib/dates"

/**
 * SMS/Email delivery bridge.
 *
 * Every message is first ENQUEUED into the OutboundMessage table (the durable
 * outbox the chamber can inspect), then dispatched through a provider:
 *
 *  - SMS:   a generic HTTP gateway — most Bangladeshi providers (SSL Wireless,
 *           BulkSMSBD, AlphaNet, MDL...) expose a simple GET endpoint. Configure
 *           SMS_API_URL as a template containing {PHONE} and {MESSAGE}
 *           placeholders, e.g.
 *           https://api.provider.com/send?api_key=xxx&to={PHONE}&text={MESSAGE}
 *  - EMAIL: a generic webhook — EMAIL_WEBHOOK_URL receives a POST with
 *           { to, subject, body } JSON.
 *
 * When no provider is configured, the message is marked SIMULATED (wording is
 * preserved in the outbox so the chamber can review exactly what would send).
 * Enqueueing/dispatching is best-effort: it must never break the main flow.
 */

export type OutboundEvent =
  | "HEARING_TODAY"
  | "HEARING_TOMORROW"
  | "HEARING_SCHEDULED"
  | "HEARING_UPDATED"
  | "INVOICE_ISSUED"
  | "INVOICE_OVERDUE"
  | "PAYMENT_RECEIVED"
  | "TEST"

export interface OutboundRecipient {
  /** SMS phone number (e.g. +8801712345678 / 01712345678). */
  phone?: string | null
  /** Email address. */
  email?: string | null
  name?: string | null
  /** Linked portal user id, when known. */
  userId?: string | null
}

export interface EnqueueOutboundInput {
  event: OutboundEvent
  recipients: OutboundRecipient[]
  subject: string
  smsBody: string
  emailBody?: string
  caseId?: string | null
  caseNumber?: string | null
  /** Unique per logical message (event + entity + day). Duplicates are skipped. */
  dedupeKey?: string | null
}

function normalizePhone(raw: string): string {
  const p = raw.replace(/[\s()-]/g, "")
  if (/^880\d{10}$/.test(p)) return p
  if (/^0\d{10}$/.test(p)) return `880${p.slice(1)}`
  return p
}

/** Fire a configured SMS gateway (GET with {PHONE}/{MESSAGE} substitution). */
async function dispatchSms(
  template: string,
  phone: string,
  message: string
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const url = template
      .replaceAll("{PHONE}", encodeURIComponent(phone))
      .replaceAll("{MESSAGE}", encodeURIComponent(message))
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000) })
    const text = (await res.text()).slice(0, 500)
    if (res.ok) return { ok: true, ref: text.slice(0, 120) }
    return { ok: false, error: `HTTP ${res.status}: ${text}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMS gateway request failed" }
  }
}

/** Fire the configured email webhook (POST JSON { to, subject, body }). */
async function dispatchEmail(
  webhook: string,
  to: string,
  subject: string,
  body: string
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
      signal: AbortSignal.timeout(10_000),
    })
    const text = (await res.text()).slice(0, 500)
    if (res.ok) return { ok: true, ref: text.slice(0, 120) }
    return { ok: false, error: `HTTP ${res.status}: ${text}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Email webhook request failed" }
  }
}

/**
 * Enqueue + dispatch outbound messages for an event. Best-effort by contract:
 * resolves even when the DB write or the provider fails (failures are recorded
 * on the message row so the outbox UI can retry).
 */
export async function enqueueOutbound(input: EnqueueOutboundInput): Promise<void> {
  try {
    const settings: OutboundSettings = await getOutboundSettings()
    if (!settings.smsEnabled && !settings.emailEnabled) return
    const eventEnabled = settings.events[input.event as keyof typeof settings.events]
    if (input.event !== "TEST" && eventEnabled === false) return

    const providers = outboundProviderStatus()

    for (const r of input.recipients) {
      const name = r.name?.trim() || null

      // ---- SMS ----
      if (settings.smsEnabled && r.phone && r.phone.trim().length >= 6) {
        const phone = normalizePhone(r.phone.trim())
        await deliver({
          channel: "SMS",
          recipient: phone,
          recipientName: name,
          userId: r.userId ?? null,
          event: input.event,
          body: input.smsBody,
          caseId: input.caseId ?? null,
          caseNumber: input.caseNumber ?? null,
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:sms:${phone}` : null,
          live: providers.sms === "live",
          send: () => dispatchSms(providers.smsProviderUrl!, phone, input.smsBody),
        })
      }

      // ---- EMAIL ----
      if (settings.emailEnabled && r.email && /.+@.+\..+/.test(r.email)) {
        const email = r.email.trim()
        await deliver({
          channel: "EMAIL",
          recipient: email,
          recipientName: name,
          userId: r.userId ?? null,
          event: input.event,
          body: input.emailBody ?? input.smsBody,
          caseId: input.caseId ?? null,
          caseNumber: input.caseNumber ?? null,
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:email:${email}` : null,
          live: providers.email === "live",
          send: () => dispatchEmail(providers.emailProviderUrl!, email, input.subject, input.emailBody ?? input.smsBody),
        })
      }
    }
  } catch {
    // never break the business flow because of messaging
  }
}

async function deliver(msg: {
  channel: "SMS" | "EMAIL"
  recipient: string
  recipientName: string | null
  userId: string | null
  event: string
  body: string
  caseId: string | null
  caseNumber: string | null
  dedupeKey: string | null
  live: boolean
  send: () => Promise<{ ok: boolean; ref?: string; error?: string }>
}): Promise<void> {
  try {
    // Deduplicate at the DB level: a unique dedupeKey means the same logical
    // message (e.g. hearing reminder for a given day) is never sent twice even
    // when sweeps overlap.
    const existing = msg.dedupeKey
      ? await db.outboundMessage.findUnique({ where: { dedupeKey: msg.dedupeKey }, select: { id: true } })
      : null
    if (existing) return

    const created = await db.outboundMessage.create({
      data: {
        channel: msg.channel,
        recipient: msg.recipient,
        recipientName: msg.recipientName,
        userId: msg.userId,
        event: msg.event,
        body: msg.body,
        caseId: msg.caseId,
        caseNumber: msg.caseNumber,
        status: "PENDING",
        dedupeKey: msg.dedupeKey,
      },
    })

    if (!msg.live) {
      await db.outboundMessage.update({
        where: { id: created.id },
        data: { status: "SIMULATED", sentAt: new Date(), error: "No provider configured — simulated delivery" },
      })
      return
    }

    const result = await msg.send()
    await db.outboundMessage.update({
      where: { id: created.id },
      data: {
        status: result.ok ? "SENT" : "FAILED",
        providerRef: result.ref ?? null,
        error: result.error ?? null,
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
    })
  } catch {
    // swallow — messaging must never break business flows
  }
}

/**
 * Retry delivery of one outbox message (uses its stored body/recipient).
 * Returns true when dispatch produced a live or simulated success.
 */
export async function retryOutbound(id: string): Promise<{ ok: boolean; status: string; error?: string }> {
  const msg = await db.outboundMessage.findUnique({ where: { id } })
  if (!msg) return { ok: false, status: "NOT_FOUND", error: "Message not found." }
  const providers = outboundProviderStatus()
  const live = msg.channel === "SMS" ? providers.sms === "live" : providers.email === "live"

  if (!live) {
    await db.outboundMessage.update({
      where: { id },
      data: { status: "SIMULATED", sentAt: new Date(), error: "No provider configured — simulated delivery" },
    })
    return { ok: true, status: "SIMULATED" }
  }

  const result =
    msg.channel === "SMS"
      ? await dispatchSms(providers.smsProviderUrl!, msg.recipient, msg.body)
      : await dispatchEmail(providers.emailProviderUrl!, msg.recipient, subjectForEvent(msg.event), msg.body)

  await db.outboundMessage.update({
    where: { id },
    data: {
      status: result.ok ? "SENT" : "FAILED",
      providerRef: result.ref ?? null,
      error: result.error ?? null,
      attempts: { increment: 1 },
      sentAt: new Date(),
    },
  })
  return { ok: result.ok, status: result.ok ? "SENT" : "FAILED", error: result.error }
}

function subjectForEvent(event: string): string {
  switch (event) {
    case "INVOICE_ISSUED":
      return "Invoice issued — AinSheba"
    case "PAYMENT_RECEIVED":
      return "Payment received — AinSheba"
    case "INVOICE_OVERDUE":
      return "Invoice overdue — AinSheba"
    default:
      return "Case update — AinSheba"
  }
}

/** Compact "7 Sept 2026, 11:00 am" Dhaka formatter for message bodies. */
export function formatHearingWhen(date: Date, timeLabel: string | null): string {
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
  const timePart = timeLabel ? ` at ${timeLabel}` : ""
  return `${datePart}${timePart}`
}

/** Day key of a Dhaka date — used in dedupe keys so reminders are once per day. */
export function dayKeyOf(date: Date): string {
  return dhakaDateKey(date)
}
