import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireNumber, requireString, throwConflictIfUniqueViolation } from "@/lib/api-helpers"
import { hashPassword, MAX_PASSWORD_LENGTH } from "@/lib/password"
import { EMAIL_RE } from "@/lib/validation"

const ACTIVE_CASE_STATUSES = ["ACTIVE", "PENDING", "ON_HOLD"]

type LawyerWithUser = Prisma.LawyerGetPayload<{ include: { user: { select: { email: true } } } }>

function lawyerDTO(l: LawyerWithUser, totalCases: number, activeCases: number) {
  return {
    id: l.id,
    userId: l.userId,
    name: l.name,
    phone: l.phone,
    email: l.email ?? l.user?.email ?? null,
    barCouncilId: l.barCouncilId,
    specialization: l.specialization,
    chamberName: l.chamberName,
    experience: l.experience,
    status: l.status,
    totalCases,
    activeCases,
    createdAt: l.createdAt.toISOString(),
  }
}

/** Active counts per lawyerId. */
async function activeCaseCounts(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (ids.length === 0) return map
  const groups = await db.case.groupBy({
    by: ["lawyerId"],
    where: { lawyerId: { in: ids }, status: { in: ACTIVE_CASE_STATUSES } },
    _count: { _all: true },
  })
  for (const g of groups) {
    if (g.lawyerId) map.set(g.lawyerId, g._count._all)
  }
  return map
}

/** GET /api/lawyers — internal staff & lawyers only (clients have no directory access). */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { searchParams } = new URL(request.url)
    const specialization = searchParams.get("specialization")?.trim() ?? ""
    const status = searchParams.get("status")?.trim() ?? ""
    const search = searchParams.get("search")?.trim() ?? ""

    const where: Prisma.LawyerWhereInput = {}
    if (specialization) where.specialization = specialization
    if (status) where.status = status
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { barCouncilId: { contains: search } },
      ]
    }

    const lawyers = await db.lawyer.findMany({
      where,
      include: { user: { select: { email: true } }, _count: { select: { cases: true } } },
      orderBy: { name: "asc" },
    })

    const activeMap = await activeCaseCounts(lawyers.map((l) => l.id))
    return ok(lawyers.map((l) => lawyerDTO(l, l._count.cases, activeMap.get(l.id) ?? 0)))
  })
}

/** POST /api/lawyers — ADMIN only. */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const body = await readJson<Record<string, unknown>>(request)

    const name = requireString(body.name, "name")
    const phone = optionalString(body.phone)
    const emailRaw = optionalString(body.email)
    const email = emailRaw ? emailRaw.toLowerCase() : null
    if (email && !EMAIL_RE.test(email)) {
      throw new ApiError("Please enter a valid email address.", 422)
    }
    const barCouncilId = optionalString(body.barCouncilId)
    const specialization = optionalString(body.specialization)
    const chamberName = optionalString(body.chamberName)
    const createPortalAccess = body.createPortalAccess === true || body.createPortalAccess === "true"

    let experience = 0
    if (body.experience !== undefined && body.experience !== null && body.experience !== "") {
      experience = Math.max(0, Math.trunc(requireNumber(body.experience, "experience")))
    }

    let portalPassword = ""
    if (createPortalAccess) {
      if (!email) throw new ApiError("Email is required for portal access.", 422)
      portalPassword = typeof body.password === "string" ? body.password : ""
      if (portalPassword.length < 6) throw new ApiError("Password must be at least 6 characters.", 422)
      if (portalPassword.length > MAX_PASSWORD_LENGTH) {
        throw new ApiError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`, 422)
      }
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) throw new ApiError("A user with this email already exists.", 409)
    }

    const profileData = { name, phone, email, barCouncilId, specialization, chamberName, experience, status: "ACTIVE" }

    const lawyer = createPortalAccess
      ? (
          await db.user
            .create({
              data: {
                name,
                email: email as string,
                phone,
                role: "LAWYER",
                status: "ACTIVE",
                password: hashPassword(portalPassword),
                lawyerProfile: { create: profileData },
              },
              include: { lawyerProfile: true },
            })
            .catch((e: unknown) => {
              throwConflictIfUniqueViolation(e, "A user with this email already exists.")
              throw e
            })
        ).lawyerProfile
      : await db.lawyer.create({ data: profileData })

    // A newly created lawyer has no cases yet.
    return ok({
      id: lawyer.id,
      userId: lawyer.userId,
      name: lawyer.name,
      phone: lawyer.phone,
      email: lawyer.email,
      barCouncilId: lawyer.barCouncilId,
      specialization: lawyer.specialization,
      chamberName: lawyer.chamberName,
      experience: lawyer.experience,
      status: lawyer.status,
      totalCases: 0,
      activeCases: 0,
      createdAt: lawyer.createdAt.toISOString(),
    })
  })
}
