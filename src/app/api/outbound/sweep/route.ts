import { handle, requireAuth } from "@/lib/api-helpers"
import { audit } from "@/lib/audit"
import { runReminderSweep } from "@/lib/reminders"

/**
 * POST /api/outbound/sweep — ADMIN: trigger the hearing-reminder sweep now
 * (normally it runs automatically every 30 minutes via the scheduler).
 * Idempotent — reminders dedupe per hearing/day/channel.
 */
export async function POST() {
  return handle(async () => {
    const user = await requireAuth(["ADMIN"])
    const result = await runReminderSweep()

    const totalHearings = result.today.hearings + result.tomorrow.hearings
    await audit(
      user,
      "REMINDER_SWEEP",
      "OutboundMessage",
      null,
      null,
      `Ran reminder sweep — ${totalHearings} upcoming hearing(s) processed`,
      { today: result.today.hearings, tomorrow: result.tomorrow.hearings }
    )

    return Response.json({ data: result })
  })
}
