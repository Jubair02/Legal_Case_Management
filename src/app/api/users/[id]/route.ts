import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireString } from "@/lib/api-helpers"
import { ROLES } from "@/lib/constants"
import { hashPassword, MAX_PASSWORD_LENGTH } from "@/lib/password"
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

    if (body.role !== undefined) {
      const role = requireString(body.role, "role")
      if (!(ROLES as readonly string[]).includes(role)) {
        throw new ApiError(`"role" must be one of: ${ROLES.join(", ")}.`, 422)
      }
      data.role = role
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
    }

    const updated = await db.user.update({ where: { id }, data, include: userInclude })

    // Password material is never audited — only whitelisted profile fields diff.
    const userDiff = diffFields(
      target as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["name", "email", "phone", "role", "status"]
    )
    await audit(auth, "USER_UPDATE", "User", id, target.email,
      `Updated user ${target.email}`, userDiff)

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

    return ok({ ok: true })
  })
}
