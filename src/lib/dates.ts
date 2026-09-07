/**
 * Date helpers aware of the Asia/Dhaka timezone (server may run in UTC).
 * Hearing dates and "today" boundaries are computed in Dhaka civil time.
 */
export const DHAKA_TZ = "Asia/Dhaka"

/** Get "YYYY-MM-DD" for a date in Dhaka timezone. */
export function dhakaDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/** Start (UTC instant) of a Dhaka civil day given a date key "YYYY-MM-DD". */
export function dhakaDayStart(key: string): Date {
  // Dhaka is UTC+6 with no DST => civil day starts at 18:00 UTC of previous day
  return new Date(`${key}T00:00:00+06:00`)
}

/** Start and end (exclusive) UTC instants for a Dhaka civil day. */
export function dhakaDayRange(key: string): { start: Date; end: Date } {
  const start = dhakaDayStart(key)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

/** Day key for N days from today (Dhaka). Negative offsets allowed. */
export function dhakaDayOffset(offsetDays: number): string {
  const now = new Date()
  const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000)
  return dhakaDateKey(d)
}

/** Days between a date and today (Dhaka civil days). Positive = future. */
export function daysFromToday(d: Date): number {
  const a = dhakaDateKey(d)
  const b = dhakaDateKey(new Date())
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  const da = Date.UTC(ay, am - 1, ad)
  const dbb = Date.UTC(by, bm - 1, bd)
  return Math.round((da - dbb) / (24 * 60 * 60 * 1000))
}
