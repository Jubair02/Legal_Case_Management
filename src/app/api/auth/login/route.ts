import { db } from "@/lib/db"
import { ApiError, handle, ok, readJson, requireString } from "@/lib/api-helpers"
import { setSessionCookie, signSession } from "@/lib/auth"
import { DUMMY_HASH, MAX_PASSWORD_LENGTH, verifyPassword } from "@/lib/password"
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit"

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
      // Same message for unknown email, wrong password and inactive account so
      // the endpoint cannot be used as an account-status oracle.
      throw new ApiError("Invalid email or password.", 401)
    }

    clearAttempts(request, email)

    const token = await signSession({ sub: user.id, email: user.email, role: user.role })
    await setSessionCookie(token)

    return ok({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      lawyerProfile: user.lawyerProfile,
      clientProfile: user.clientProfile,
    })
  })
}
