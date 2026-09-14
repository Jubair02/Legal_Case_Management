import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireEnum, requireString, throwConflictIfUniqueViolation } from "@/lib/api-helpers"
import { ROLES } from "@/lib/constants"
import { hashPassword, MAX_PASSWORD_LENGTH } from "@/lib/password"
import { EMAIL_RE } from "@/lib/validation"
import { audit, diffFields } from "@/lib/audit"

const userInclude = {
  lawyerProfile: { select: { name: true } },
  clientProfile: { select: { name: true } },
} satisfies Prisma.UserInclude

type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof userInclude }>

function userDTO(u: UserWithProfiles) {
  const linkedName = u.lawyerProfile?.name ?? u.clientProfile?.name ?? null
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    linkedName,
  }
}

/** PATCH /api/users/[id] — ADMIN only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(["ADMIN"])
    const { id } = await params
    const body = await readJson<Record<string, unknown>>(request)

    const target = await db.user.findUnique({ where: { id }, include: userInclude })
    if (!target) throw new ApiError("User not found.", 404)

    // A user cannot change their own role or status.
    if (id === auth.id && (body.role !== undefined || body.status !== undefined)) {
      throw new ApiError("You cannot change your own role or status.", 400)
    }

    const data: Prisma.UserUpdateInput = {}

    if (body.name !== undefined) data.name = requireString(body.name, "name")
    if (body.phone !== undefined) data.phone = optionalString(body.phone)

    if (body.email !== undefined) {
      const email = requireString(body.email, "email").toLowerCase()
      if (!EMAIL_RE.test(email)) throw new ApiError("Please enter a valid email address.", 422)
      // The email IS the login identity, so the uniqueness check matters as
      // much here as at creation. The race between this read and the update is
      // closed by the unique index — see the catch below.
      if (email !== target.email) {
        const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
        if (existing) throw new ApiError("A user with this email already exists.", 409)
      }
      data.email = email
    }

    if (body.role !== undefined) {
      data.role = requireEnum(body.role, ROLES, "role")
    }
    if (body.status !== undefined) {
      const status = requireString(body.status, "status")
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        throw new ApiError(`"status" must be ACTIVE or INACTIVE.`, 422)
      }
      data.status = status
    }
    if (body.password !== undefined && body.password !== null) {
      const password = typeof body.password === "string" ? body.password : ""
      if (password.length < 6) throw new ApiError("Password must be at least 6 characters.", 422)
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw new ApiError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`, 422)
      }
      data.password = hashPassword(password)
      // Revoke every session issued before this reset. Without the bump an
      // admin resetting a compromised account's password would leave the
      // attacker's existing token valid for the rest of its 7-day life.
      data.sessionVersion = { increment: 1 }
    }

    const updated = await db.user
      .update({ where: { id }, data, include: userInclude })
      .catch((e: unknown) => {
        throwConflictIfUniqueViolation(e, "A user with this email already exists.")
        throw e
      })

    // Password material is never audited — only whitelisted profile fields diff.
    const userDiff = diffFields(
      target as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["name", "email", "phone", "role", "status"]
    )
    const passwordReset = data.password !== undefined
    await audit(auth, "USER_UPDATE", "User", id, target.email,
      `Updated user ${target.email}${passwordReset ? " (password reset — existing sessions revoked)" : ""}`,
      userDiff)

    return ok(userDTO(updated))
  })
}

/** DELETE /api/users/[id] — ADMIN only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const auth = await requireAuth(["ADMIN"])
    const { id } = await params

    if (id === auth.id) throw new ApiError("You cannot delete your own account.", 400)

    const target = await db.user.findUnique({
      where: { id },
      include: {
        lawyerProfile: { select: { id: true, _count: { select: { cases: true } } } },
        clientProfile: { select: { id: true, _count: { select: { cases: true, invoices: true } } } },
      },
    })
    if (!target) throw new ApiError("User not found.", 404)

    const lawyer = target.lawyerProfile
    const client = target.clientProfile
    const hasLinkedRecords =
      (lawyer && lawyer._count.cases > 0) ||
      (client && (client._count.cases > 0 || client._count.invoices > 0))
    if (hasLinkedRecords) {
      throw new ApiError("This user has linked records and cannot be deleted.", 409)
    }

    await db.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { userId: id } })
      if (lawyer) await tx.lawyer.delete({ where: { id: lawyer.id } })
      if (client) await tx.client.delete({ where: { id: client.id } })
      await tx.user.delete({ where: { id } })
    })

    await audit(auth, "USER_DELETE", "User", id, target.email,
      `Deleted user ${target.name} (${target.email}) — role ${target.role}`)

    return ok({ ok: true })
  })
}
