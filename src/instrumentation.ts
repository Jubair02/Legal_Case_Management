/**
 * Next.js instrumentation hook — runs once per server process start.
 *
 * Boots the hearing-reminder scheduler (lib/scheduler.ts): an idempotent
 * sweep that enqueues "hearing today/tomorrow" SMS/Email + in-app
 * notifications for upcoming hearings, re-run every 30 minutes.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startScheduler } = await import("@/lib/scheduler")
  startScheduler()
}
