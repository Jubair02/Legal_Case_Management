import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireString, throwConflictIfUniqueViolation } from "@/lib/api-helpers"
import { CLIENT_TYPES } from "@/lib/constants"
import { hashPassword, MAX_PASSWORD_LENGTH } from "@/lib/password"
import { EMAIL_RE } from "@/lib/validation"
import { audit } from "@/lib/audit"

const ACTIVE_CASE_STATUSES = ["ACTIVE", "PENDING", "ON_HOLD"]

function clientDTO(
  c: {
    id: string
    userId: string | null
    name: string
    phone: string | null
    email: string | null
    nid: string | null
    address: string | null
    clientType: string
    createdAt: Date
  },
  caseCount: number,
  activeCaseCount: number,
  portalEmail: string | null
) {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    nid: c.nid,
    address: c.address,
    clientType: c.clientType,
    caseCount,
    activeCaseCount,
    portalEmail,
    createdAt: c.createdAt.toISOString(),
  }
}

/** Active case counts per clientId. */
async function activeCaseCounts(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (ids.length === 0) return map
  const groups = await db.case.groupBy({
    by: ["clientId"],
    where: { clientId: { in: ids }, status: { in: ACTIVE_CASE_STATUSES } },
    _count: { _all: true },
  })
  for (const g of groups) map.set(g.clientId, g._count._all)
  return map
}

/** GET /api/clients — ADMIN/STAFF all, LAWYER clients with cases assigned to them, CLIENT own profile. */
export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim() ?? ""
    const clientType = searchParams.get("clientType")?.trim() ?? ""
    const hasPortal = searchParams.get("hasPortal")?.trim() ?? ""

    const where: Prisma.ClientWhereInput = {}

    if (user.role === "LAWYER") {
      const lp = await db.lawyer.findUnique({ where: { userId: user.id }, select: { id: true } })
      if (!lp) return ok([])
      where.cases = { some: { lawyerId: lp.id } }
    } else if (user.role === "CLIENT") {
      const cp = await db.client.findUnique({ where: { userId: user.id }, select: { id: true } })
      if (!cp) return ok([])
      where.id = cp.id
    }

    if (clientType) where.clientType = clientType
    if (hasPortal === "true") where.userId = { not: null }
    else if (hasPortal === "false") where.userId = null
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { nid: { contains: search } },
      ]
    }

    const clients = await db.client.findMany({
      where,
      include: { user: { select: { email: true } }, _count: { select: { cases: true } } },
      orderBy: { name: "asc" },
    })

    const activeMap = await activeCaseCounts(clients.map((c) => c.id))
    return ok(
      clients.map((c) =>
        clientDTO(c, c._count.cases, activeMap.get(c.id) ?? 0, c.user?.email ?? null)
      )
    )
  })
}

/** POST /api/clients — ADMIN, STAFF. */
export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF"])
    const body = await readJson<Record<string, unknown>>(request)

    const name = requireString(body.name, "name")
    const phone = optionalString(body.phone)
    const emailRaw = optionalString(body.email)
    const email = emailRaw ? emailRaw.toLowerCase() : null
    if (email && !EMAIL_RE.test(email)) {
      throw new ApiError("Please enter a valid email address.", 422)
    }
    const nid = optionalString(body.nid)
    const address = optionalString(body.address)
    const clientType = optionalString(body.clientType) ?? "INDIVIDUAL"
    if (!(CLIENT_TYPES as readonly string[]).includes(clientType)) {
      throw new ApiError(`"clientType" must be one of: ${CLIENT_TYPES.join(", ")}.`, 422)
    }
    const createPortalAccess = body.createPortalAccess === true || body.createPortalAccess === "true"

    if (createPortalAccess) {
      if (!email) throw new ApiError("Email is required for portal access.", 422)
      const password = typeof body.password === "string" ? body.password : ""
      if (password.length < 6) throw new ApiError("Password must be at least 6 characters.", 422)
      if (password.length > MAX_PASSWORD_LENGTH) {
        throw new ApiError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`, 422)
      }
      const existing = await db.user.findUnique({ where: { email } })
      if (existing) throw new ApiError("A user with this email already exists.", 409)

      const user = await db.user
        .create({
          data: {
            name,
            email,
            phone,
            role: "CLIENT",
            status: "ACTIVE",
            password: hashPassword(password),
            clientProfile: { create: { name, phone, email, nid, address, clientType } },
          },
          include: { clientProfile: true },
        })
        .catch((e: unknown) => {
          throwConflictIfUniqueViolation(e, "A user with this email already exists.")
          throw e
        })
      const profile = user.clientProfile!
      await audit(user, "CLIENT_CREATE", "Client", profile.id, profile.name,
        `Created client ${name} with portal access`)
      return ok(clientDTO(profile, 0, 0, user.email))
    }

    const client = await db.client.create({
      data: { name, phone, email, nid, address, clientType },
    })
    await audit(user, "CLIENT_CREATE", "Client", client.id, client.name, `Created client ${name}`)
    return ok(clientDTO(client, 0, 0, null))
  })
}
