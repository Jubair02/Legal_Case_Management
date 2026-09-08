import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireNumber, requireString } from "@/lib/api-helpers"
import { caseScopeWhere } from "@/lib/permissions"
import { EMAIL_RE } from "@/lib/validation"
import { audit, diffFields } from "@/lib/audit"

const ACTIVE_CASE_STATUSES = ["ACTIVE", "PENDING", "ON_HOLD"]

/** Earliest future UPCOMING hearing date per caseId (ISO string). */
async function nextHearingMap(caseIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (caseIds.length === 0) return map
  const hearings = await db.hearing.findMany({
    where: { caseId: { in: caseIds }, status: "UPCOMING", hearingDate: { gte: new Date() } },
    select: { caseId: true, hearingDate: true },
    orderBy: { hearingDate: "asc" },
  })
  for (const h of hearings) {
    if (!map.has(h.caseId)) map.set(h.caseId, h.hearingDate.toISOString())
  }
  return map
}

/** GET /api/lawyers/[id] — internal roles only. Cases scoped by role. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params

    const lawyer = await db.lawyer.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, _count: { select: { cases: true } } },
    })
    if (!lawyer) throw new ApiError("Lawyer not found.", 404)

    const activeCases = await db.case.count({
      where: { lawyerId: id, status: { in: ACTIVE_CASE_STATUSES } },
    })

    const cases = await db.case.findMany({
      where: caseScopeWhere(user, { lawyerId: id }) as Prisma.CaseWhereInput,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        court: true,
      },
      orderBy: { createdAt: "desc" },
    })
    const nextMap = await nextHearingMap(cases.map((c) => c.id))

    return ok({
      id: lawyer.id,
      userId: lawyer.userId,
      name: lawyer.name,
      phone: lawyer.phone,
      email: lawyer.email ?? lawyer.user?.email ?? null,
      barCouncilId: lawyer.barCouncilId,
      specialization: lawyer.specialization,
      chamberName: lawyer.chamberName,
      experience: lawyer.experience,
      status: lawyer.status,
      totalCases: lawyer._count.cases,
      activeCases,
      createdAt: lawyer.createdAt.toISOString(),
      cases: cases.map((c) => ({ ...c, nextHearingDate: nextMap.get(c.id) ?? null })),
    })
  })
}

/** PATCH /api/lawyers/[id] — ADMIN only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN"])
    const { id } = await params
    const body = await readJson<Record<string, unknown>>(request)

    const lawyer = await db.lawyer.findUnique({ where: { id } })
    if (!lawyer) throw new ApiError("Lawyer not found.", 404)

    const data: Prisma.LawyerUpdateInput = {}
    if (body.name !== undefined) data.name = requireString(body.name, "name")
    if (body.phone !== undefined) data.phone = optionalString(body.phone)
    if (body.barCouncilId !== undefined) data.barCouncilId = optionalString(body.barCouncilId)
    if (body.specialization !== undefined) data.specialization = optionalString(body.specialization)
    if (body.chamberName !== undefined) data.chamberName = optionalString(body.chamberName)
    if (body.experience !== undefined && body.experience !== null && body.experience !== "") {
      data.experience = Math.max(0, Math.trunc(requireNumber(body.experience, "experience")))
    }
    if (body.status !== undefined) {
      const status = requireString(body.status, "status")
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        throw new ApiError(`"status" must be ACTIVE or INACTIVE.`, 422)
      }
      data.status = status
    }

    const emailRaw = optionalString(body.email)
    const newEmail = emailRaw ? emailRaw.toLowerCase() : null
    if (newEmail && !EMAIL_RE.test(newEmail)) {
      throw new ApiError("Please enter a valid email address.", 422)
    }
    const nameChanged = typeof data.name === "string" && data.name !== lawyer.name
    const emailChanged =
      body.email !== undefined && newEmail !== (lawyer.email ? lawyer.email.toLowerCase() : null)
    if (emailChanged) {
      // Portal accounts have a non-nullable email — forbid clearing it there and
      // fall back to keeping the account email in sync.
      if (!newEmail && lawyer.userId) {
        throw new ApiError(
          "This lawyer has a portal account — the email cannot be removed. Set a different email instead.",
          422
        )
      }
      data.email = newEmail
    }

    // Keep the portal account status in step with the lawyer profile.
    const statusChanged =
      body.status !== undefined && typeof data.status === "string" && data.status !== lawyer.status

    // Portal user email uniqueness check when syncing an email change.
    if (emailChanged && lawyer.userId && newEmail) {
      const dup = await db.user.findFirst({ where: { email: newEmail, NOT: { id: lawyer.userId } } })
      if (dup) throw new ApiError("A user with this email already exists.", 409)
    }

    await db.$transaction(async (tx) => {
      await tx.lawyer.update({ where: { id }, data })
      if (lawyer.userId && (nameChanged || emailChanged || statusChanged)) {
        await tx.user.update({
          where: { id: lawyer.userId },
          data: {
            ...(nameChanged ? { name: data.name as string } : {}),
            ...(emailChanged && newEmail ? { email: newEmail } : {}),
            ...(statusChanged ? { status: data.status as string } : {}),
          },
        })
      }
    })

    const updated = await db.lawyer.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, _count: { select: { cases: true } } },
    })
    const activeCases = await db.case.count({
      where: { lawyerId: id, status: { in: ACTIVE_CASE_STATUSES } },
    })

    const lawyerDiff = diffFields(
      lawyer as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      ["name", "phone", "email", "barCouncilId", "specialization", "chamberName", "experience", "status"]
    )
    await audit(user, "LAWYER_UPDATE", "Lawyer", id, lawyer.name,
      `Updated lawyer ${lawyer.name}`, lawyerDiff)

    return ok({
      id: updated!.id,
      userId: updated!.userId,
      name: updated!.name,
      phone: updated!.phone,
      email: updated!.email ?? updated!.user?.email ?? null,
      barCouncilId: updated!.barCouncilId,
      specialization: updated!.specialization,
      chamberName: updated!.chamberName,
      experience: updated!.experience,
      status: updated!.status,
      totalCases: updated!._count.cases,
      activeCases,
      createdAt: updated!.createdAt.toISOString(),
    })
  })
}

/** DELETE /api/lawyers/[id] — ADMIN only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const { id } = await params

    const lawyer = await db.lawyer.findUnique({
      where: { id },
      include: { _count: { select: { cases: true } } },
    })
    if (!lawyer) throw new ApiError("Lawyer not found.", 404)
    if (lawyer._count.cases > 0) {
      throw new ApiError("This lawyer has assigned cases and cannot be deleted.", 409)
    }

    await db.$transaction(async (tx) => {
      if (lawyer.userId) {
        await tx.notification.deleteMany({ where: { userId: lawyer.userId } })
      }
      await tx.lawyer.delete({ where: { id } })
      if (lawyer.userId) {
        await tx.user.delete({ where: { id: lawyer.userId } })
      }
    })

    return ok({ ok: true })
  })
}
