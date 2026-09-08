import { db } from "@/lib/db"

/**
 * System settings stored in the SystemSetting table (JSON-encoded values).
 * The "outbound" key drives the SMS/Email bridge (lib/outbound.ts).
 */

export interface OutboundSettings {
  smsEnabled: boolean
  emailEnabled: boolean
  events: {
    HEARING_TODAY: boolean
    HEARING_TOMORROW: boolean
    HEARING_SCHEDULED: boolean
    HEARING_UPDATED: boolean
    INVOICE_ISSUED: boolean
    INVOICE_OVERDUE: boolean
    PAYMENT_RECEIVED: boolean
  }
}

export const DEFAULT_OUTBOUND_SETTINGS: OutboundSettings = {
  smsEnabled: true,
  emailEnabled: true,
  events: {
    HEARING_TODAY: true,
    HEARING_TOMORROW: true,
    HEARING_SCHEDULED: true,
    HEARING_UPDATED: true,
    INVOICE_ISSUED: true,
    INVOICE_OVERDUE: true,
    PAYMENT_RECEIVED: true,
  },
}

const OUTBOUND_KEY = "outbound"

function sanitizeEvents(raw: unknown): OutboundSettings["events"] {
  const defaults = DEFAULT_OUTBOUND_SETTINGS.events
  if (!raw || typeof raw !== "object") return defaults
  const out = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === "boolean") out[key] = v
  }
  return out
}

export function sanitizeOutboundSettings(raw: unknown): OutboundSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_OUTBOUND_SETTINGS
  const r = raw as Record<string, unknown>
  return {
    smsEnabled: typeof r.smsEnabled === "boolean" ? r.smsEnabled : true,
    emailEnabled: typeof r.emailEnabled === "boolean" ? r.emailEnabled : true,
    events: sanitizeEvents(r.events),
  }
}

/** Read the outbound settings (falls back to defaults when unset/corrupt). */
export async function getOutboundSettings(): Promise<OutboundSettings> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: OUTBOUND_KEY } })
    if (!row) return DEFAULT_OUTBOUND_SETTINGS
    return sanitizeOutboundSettings(JSON.parse(row.value))
  } catch {
    return DEFAULT_OUTBOUND_SETTINGS
  }
}

/** Persist outbound settings (validates shape; falls back to defaults on bad input). */
export async function saveOutboundSettings(
  raw: unknown,
  updatedBy: string
): Promise<OutboundSettings> {
  const clean = sanitizeOutboundSettings(raw)
  const value = JSON.stringify(clean)
  await db.systemSetting.upsert({
    where: { key: OUTBOUND_KEY },
    update: { value, updatedBy },
    create: { key: OUTBOUND_KEY, value, updatedBy },
  })
  return clean
}

export interface OutboundProviderStatus {
  sms: "live" | "simulated"
  email: "live" | "simulated"
  smsProviderUrl: string | null
  emailProviderUrl: string | null
}

/** Which delivery providers the environment has configured (secrets stay in env). */
export function outboundProviderStatus(): OutboundProviderStatus {
  const smsUrl = process.env.SMS_API_URL?.trim() || null
  const emailUrl = process.env.EMAIL_WEBHOOK_URL?.trim() || null
  return {
    sms: smsUrl ? "live" : "simulated",
    email: emailUrl ? "live" : "simulated",
    smsProviderUrl: smsUrl,
    emailProviderUrl: emailUrl,
  }
}
