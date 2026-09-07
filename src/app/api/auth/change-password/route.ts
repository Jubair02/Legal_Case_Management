import { db } from "@/lib/db"
import { ApiError, handle, ok, readJson, requireAuth, requireString } from "@/lib/api-helpers"
import { hashPassword, MAX_PASSWORD_LENGTH, verifyPassword } from "@/lib/password"

/**
 * POST /api/auth/change-password
 * Self-service password change for ANY authenticated user.
 * Body: { currentPassword, newPassword }
 */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    const body = await readJson<{ currentPassword?: unknown; newPassword?: unknown }>(request)

    const currentPassword = requireString(body.currentPassword, "currentPassword")
    const newPassword = requireString(body.newPassword, "newPassword")

    if (newPassword.length < 6) {
      throw new ApiError("New password must be at least 6 characters.", 422)
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      throw new ApiError(`New password must be at most ${MAX_PASSWORD_LENGTH} characters.`, 422)
    }
    if (newPassword === currentPassword) {
      throw new ApiError("The new password must be different from the current password.", 422)
    }

    const stored = await db.user.findUnique({ where: { id: user.id }, select: { password: true } })
    if (!stored || !verifyPassword(currentPassword, stored.password)) {
      throw new ApiError("Your current password is incorrect.", 401, "WRONG_PASSWORD")
    }

    await db.user.update({
      where: { id: user.id },
      data: { password: hashPassword(newPassword) },
    })

    return ok({ ok: true })
  })
}
