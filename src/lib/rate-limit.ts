import { db } from "@/lib/db"

/**
 * Brute-force protection for failed sign-ins.
 *
 * Buckets live in the database (LoginAttempt) rather than process memory, so
 * the limit is shared by every instance. With an in-memory Map each replica
 * kept its own counter, which multiplied the real attempt allowance by the
 * number of instances and reset on every deploy.
 *
 * Two buckets are kept per attempt:
 *  - IP + email, the normal case;
 *  - email alone, a backstop that cannot be bypassed by rotating the
 *    spoofable X-Forwarded-For header.
 */

const WINDOW_MS = 10 * 60 * 1000 // attempts older than this start a fresh count
const MAX_ATTEMPTS = 8
const BLOCK_MS = 5 * 60 * 1000 // lockout once the ceiling is hit

/** Rows untouched for this long are prunable (see pruneLoginAttempts). */
export const ATTEMPT_RETENTION_MS = WINDOW_MS + BLOCK_MS

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return request.headers.get("x-real-ip") || "unknown"
}

function bucketKeys(request: Request, email: string): string[] {
  return [`${clientIp(request)}::${email}`, `email::${email}`]
}

/** True when either bucket is currently locked out. */
export async function isRateLimited(request: Request, email: string): Promise<boolean> {
  const now = new Date()
  const rows = await db.loginAttempt.findMany({
    where: { key: { in: bucketKeys(request, email) }, blockedUntil: { gt: now } },
    select: { key: true },
  })
  return rows.length > 0
}

/** Count one failure against both buckets, locking out at the ceiling. */
export async function recordFailedAttempt(request: Request, email: string): Promise<void> {
  const now = Date.now()
  const windowStart = new Date(now - WINDOW_MS)

  for (const key of bucketKeys(request, email)) {
    const existing = await db.loginAttempt.findUnique({ where: { key } })

    // No bucket, or the window has rolled over — start counting again.
    if (!existing || existing.firstAt < windowStart) {
      await db.loginAttempt.upsert({
        where: { key },
        create: { key, count: 1, firstAt: new Date(now) },
        update: { count: 1, firstAt: new Date(now), blockedUntil: null },
      })
      continue
    }

    const count = existing.count + 1
    await db.loginAttempt.update({
      where: { key },
      data: {
        count,
        blockedUntil: count >= MAX_ATTEMPTS ? new Date(now + BLOCK_MS) : existing.blockedUntil,
      },
    })
  }
}

/** Successful sign-in clears the buckets. */
export async function clearAttempts(request: Request, email: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { key: { in: bucketKeys(request, email) } } })
}

/** Drop buckets that can no longer block anyone. Called from the sweep. */
export async function pruneLoginAttempts(): Promise<number> {
  try {
    const { count } = await db.loginAttempt.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - ATTEMPT_RETENTION_MS) } },
    })
    return count
  } catch {
    return 0
  }
}
