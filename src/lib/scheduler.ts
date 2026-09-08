import { runReminderSweep } from "@/lib/reminders"

/**
 * In-process scheduler for hearing reminders.
 *
 * Started once per server process from src/instrumentation.ts. Runs the
 * reminder sweep shortly after boot and then every 30 minutes. The sweep is
 * idempotent (unique dedupeKeys per hearing/day/channel in the outbox +
 * notifyUsers unread-dedupe), so frequent runs are cheap and safe.
 *
 * The globalThis guard protects against double-registration during dev
 * hot-reload, where the module can be re-evaluated in the same process.
 */
const SWEEP_INTERVAL_MS = 30 * 60 * 1000
const BOOT_DELAY_MS = 10_000

interface SchedulerState {
  started: boolean
  timer?: ReturnType<typeof setInterval>
  bootTimer?: ReturnType<typeof setTimeout>
}

const globalScope = globalThis as typeof globalThis & {
  __ainShebaScheduler?: SchedulerState
}

async function safeSweep(): Promise<void> {
  try {
    const result = await runReminderSweep()
    const total = result.today.hearings + result.tomorrow.hearings
    if (total > 0) {
      console.log(
        `[scheduler] reminder sweep: today=${result.today.hearings}h tomorrow=${result.tomorrow.hearings}h`
      )
    }
  } catch (e) {
    console.error("[scheduler] reminder sweep failed", e)
  }
}

export function startScheduler(): void {
  if (globalScope.__ainShebaScheduler?.started) return
  const state: SchedulerState = { started: true }
  globalScope.__ainShebaScheduler = state

  state.bootTimer = setTimeout(() => {
    void safeSweep()
  }, BOOT_DELAY_MS)

  state.timer = setInterval(() => {
    void safeSweep()
  }, SWEEP_INTERVAL_MS)

  console.log("[scheduler] hearing reminder scheduler started (every 30 min)")
}
