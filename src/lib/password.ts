import { randomBytes, scryptSync, timingSafeEqual } from "crypto"

/**
 * Hash a password using scrypt (Node built-in, no external deps).
 * Format: `<salt-hex>:<hash-hex>`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

/**
 * Verify a password against a stored `<salt-hex>:<hash-hex>` string.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":")
    if (!salt || !hash) return false
    const test = scryptSync(password, salt, 64)
    const storedBuf = Buffer.from(hash, "hex")
    if (storedBuf.length !== test.length) return false
    return timingSafeEqual(storedBuf, test)
  } catch {
    return false
  }
}
