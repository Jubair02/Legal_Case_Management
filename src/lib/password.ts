import { randomBytes, scryptSync, timingSafeEqual } from "crypto"

/** Maximum accepted password length everywhere (protects scrypt from CPU DoS). */
export const MAX_PASSWORD_LENGTH = 128

/**
 * A fixed dummy hash with the same format as real stored hashes. Login uses it
 * to keep response timing constant when the given email does not exist.
 * Corresponds to the password "dummy-password-reference-not-a-real-account".
 */
export const DUMMY_HASH =
  "4f0b6fa02e6d4c9db9a1d33e5d1f2a3b:9d3f8e2b7c6a5d4e3f2b1a0c9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a695e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d2c1b0a9988776655"

/**
 * Hash a password using scrypt (Node built-in, no external deps).
 * Format: `<salt-hex>:<hash-hex>`
 */
export function hashPassword(password: string): string {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`)
  }
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
