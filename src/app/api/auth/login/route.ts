import { db } from "@/lib/db"
import { ApiError, handle, ok, readJson, requireString } from "@/lib/api-helpers"
import { setSessionCookie, signSession } from "@/lib/auth"
import { DUMMY_HASH, MAX_PASSWORD_LENGTH, verifyPassword } from "@/lib/password"
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit"
import { audit } from "@/lib/audit"

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ email?: unknown; password?: unknown }>(request)
    const email = requireString(body.email, "email").toLowerCase()
    const password = requireString(body.password, "password")

    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new ApiError("Invalid email or password.", 401)
    }

    // Per-IP+email brute-force protection.
    if (isRateLimited(request, email)) {
      throw new ApiError(
        "Too many failed sign-in attempts. Please wait a few minutes and try again.",
        429,
        "RATE_LIMITED"
      )
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        lawyerProfile: { select: { id: true, name: true, specialization: true } },
        clientProfile: { select: { id: true, name: true } },
      },
    })

    // Always run a scrypt comparison (against a dummy hash when the user does not
    // exist) so response timing does not reveal whether the email is registered.
    const storedHash = user?.status === "ACTIVE" ? user.password : DUMMY_HASH
    const passwordOk = verifyPassword(password, storedHash)

    if (!user || !passwordOk || user.status !== "ACTIVE") {
      if (!user || user.status === "ACTIVE") recordFailedAttempt(request, email)
      // Best-effort audit of the wrong-password path only. Unknown emails stay
      // unaudited so no new account-existence signal is added beyond the
      // (already rate-limited) timing equalization above.
      if (user && !passwordOk) {
        await audit(null, "AUTH_LOGIN_FAILED", "Auth", null, email, "Failed sign-in attempt")
      }
      // Same message for unknown email, wrong password and inactive account so
      // the endpoint cannot be used as an account-status oracle.
      throw new ApiError("Invalid email or password.", 401)
    }

    clearAttempts(request, email)

    const token = await signSession({
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    })
    await setSessionCookie(token)

    await audit(user, "AUTH_LOGIN", "Auth", user.id, user.email, "Signed in")

    // The token is returned in the body so the SPA can fall back to an
    // `Authorization: Bearer` header when cookies are unavailable (e.g. the
    // preview panel embeds the app in a cross-site iframe that blocks
    // SameSite=Lax cookies). The httpOnly cookie is still the primary carrier.
    return ok({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      lawyerProfile: user.lawyerProfile,
      clientProfile: user.clientProfile,
      token,
    })
  })
}
