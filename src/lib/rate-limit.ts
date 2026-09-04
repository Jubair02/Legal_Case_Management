/**
 * Minimal in-memory rate limiter for failed login attempts.
 * Keyed by client IP + email. Slots auto-expire; no external deps.
 *
 * NOTE: this protects a single process. Behind multiple instances you would
 * swap the Map for a shared store — for this MVP one process is the norm.
 */

type Attempt = { count: number; firstAt: number; blockedUntil?: number }

const attempts = new Map<string, Attempt>()

const WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 8
const BLOCK_MS = 5 * 60 * 1000 // block for 5 minutes after too many failures

// Periodically evict stale entries so the map cannot grow unbounded.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, a] of attempts) {
    const expired = now - a.firstAt > WINDOW_MS && (!a.blockedUntil || now > a.blockedUntil)
    if (expired) attempts.delete(key)
  }
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "unknown"
}

function keyFor(request: Request, email: string): string {
  return `${clientIp(request)}::${email}`
}

export function isRateLimited(request: Request, email: string): boolean {
  const now = Date.now()
  sweep(now)
  const a = attempts.get(keyFor(request, email))
  if (!a) return false
  if (a.blockedUntil && now < a.blockedUntil) return true
  if (a.blockedUntil && now >= a.blockedUntil) {
    attempts.delete(keyFor(request, email))
  }
  return false
}

export function recordFailedAttempt(request: Request, email: string): void {
  const now = Date.now()
  const key = keyFor(request, email)
  const a = attempts.get(key)
  if (!a || now - a.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now })
    return
  }
  a.count += 1
  if (a.count >= MAX_ATTEMPTS) {
    a.blockedUntil = now + BLOCK_MS
  }
}

export function clearAttempts(request: Request, email: string): void {
  attempts.delete(keyFor(request, email))
}
