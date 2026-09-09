import { db } from "@/lib/db"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { notifyUsers } from "@/lib/notify"
import { enqueueOutbound } from "@/lib/outbound"
import { pruneLoginAttempts } from "@/lib/rate-limit"

/**
 * Hearing reminder sweep.
 *
 * Scans TODAY's and TOMORROW's (Asia/Dhaka) scheduled hearings and fans out:
 *  - in-app notifications to the client + assigned lawyer portal users,
 *  - SMS/Email through the outbound bridge (lib/outbound.ts).
 *
 * Fully idempotent: the bridge dedupes per (hearing, day, channel) via a
 * unique dedupeKey, and notifyUsers dedupes unread notifications with the
 * same title + case within 20h — so the sweep can run as often as wanted.
 * Never throws; returns counters for the admin sweep endpoint.
 */
export interface SweepResult {
  ranAt: string
  today: { hearings: number; notified: number }
  tomorrow: { hearings: number; notified: number }
  overdueInvoices: number
  prunedLoginAttempts: number
}

/**
 * The only invoice transition driven by the clock rather than by a write:
 * an unpaid invoice whose due date has passed becomes OVERDUE. Every other
 * transition is persisted by the route that causes it. One bulk statement, so
 * reads never have to repair stored status themselves.
 */
async function refreshOverdueInvoices(): Promise<number> {
  try {
    const { start } = dhakaDayRange(dhakaDayOffset(0))
    const { count } = await db.invoice.updateMany({
      where: { status: "UNPAID", dueDate: { lt: start } },
      data: { status: "OVERDUE" },
    })
    return count
  } catch {
    return 0
  }
}

export async function runReminderSweep(): Promise<SweepResult> {
  const today = await sweepDay("HEARING_TODAY", dhakaDayOffset(0), "Hearing today")
  const tomorrow = await sweepDay("HEARING_TOMORROW", dhakaDayOffset(1), "Hearing tomorrow")
  const overdueInvoices = await refreshOverdueInvoices()
  const prunedLoginAttempts = await pruneLoginAttempts()
  return {
    ranAt: new Date().toISOString(),
    today,
    tomorrow,
    overdueInvoices,
    prunedLoginAttempts,
  }
}

async function sweepDay(
  event: "HEARING_TODAY" | "HEARING_TOMORROW",
  dayKey: string,
  inAppTitle: string
): Promise<{ hearings: number; notified: number }> {
  try {
    const { start, end } = dhakaDayRange(dayKey)

    const hearings = await db.hearing.findMany({
      where: { hearingDate: { gte: start, lt: end }, status: "UPCOMING" },
      include: {
        case: {
          select: {
            id: true,
            caseNumber: true,
            title: true,
            client: { select: { id: true, name: true, phone: true, email: true, userId: true } },
            lawyer: { select: { id: true, name: true, phone: true, email: true, userId: true } },
          },
        },
      },
      orderBy: { hearingDate: "asc" },
    })
    if (hearings.length === 0) return { hearings: 0, notified: 0 }

    let notified = 0
    for (const h of hearings) {
      const c = h.case
      if (!c) continue

      const recipients = [
        {
          phone: c.client?.phone ?? null,
          email: c.client?.email ?? null,
          name: c.client?.name ?? null,
          userId: c.client?.userId ?? null,
        },
        c.lawyer
          ? {
              phone: c.lawyer.phone ?? null,
              email: c.lawyer.email ?? null,
              name: c.lawyer.name ?? null,
              userId: c.lawyer.userId ?? null,
            }
          : null,
      ].filter((r): r is NonNullable<typeof r> => r !== null)

      const when = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(h.hearingDate)

      await enqueueOutbound({
        event,
        recipients,
        subject: `${event === "HEARING_TOMORROW" ? "Hearing tomorrow" : "Hearing today"} — ${c.caseNumber}`,
        smsBody: `AinSheba: ${
          event === "HEARING_TOMORROW" ? "Hearing TOMORROW" : "Hearing TODAY"
        } for case ${c.caseNumber} on ${when}. Please arrive on time.`,
        caseId: c.id,
        caseNumber: c.caseNumber,
        dedupeKey: `${event.toLowerCase()}:${h.id}:${dayKey}`,
      })

      // In-app reminder to client + lawyer portal users (deduped by notifyUsers).
      const portalIds = [c.client?.userId ?? null, c.lawyer?.userId ?? null]
      await notifyUsers(portalIds, {
        title: inAppTitle,
        message: `${c.caseNumber} — ${c.title} (${when})`,
        type: "HEARING",
        caseId: c.id,
        link: `case-detail:${c.id}`,
      })

      notified += recipients.filter((r) => r.phone || r.email).length
    }

    return { hearings: hearings.length, notified }
  } catch (e) {
    console.error(`[reminders] sweepDay failed (${event})`, e)
    // A failed sweep must never break callers — returns zeroed counters.
    return { hearings: 0, notified: 0 }
  }
}
