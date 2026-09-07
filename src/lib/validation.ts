/**
 * Shared validation primitives used by both API routes and client forms.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** True when the given string looks like a deliverable email address. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}
