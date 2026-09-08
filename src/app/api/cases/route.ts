import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth, requireString, throwConflictIfUniqueViolation } from "@/lib/api-helpers"
import { caseScopeWhere } from "@/lib/permissions"
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES } from "@/lib/constants"
import { adminIds, clientUserId, lawyerUserId, notifyUsers } from "@/lib/notify"
import { audit } from "@/lib/audit"

type CaseRow = {
  id: string
  caseNumber: string
  title: string
  type: string
  status: string
  priority: string
  court: string
  district: string | null
  filingDate: Date | null
  oppositeParty: string | null
  createdAt: Date
  client: { id: string; name: string; phone: string | null }
  lawyer: { id: string; name: string } | null
}

function caseListDTO(c: CaseRow, nextHearingDate: Date | null, lastUpdate: string | null) {
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    type: c.type,
    status: c.status,
    priority: c.priority,
    court: c.court,
    district: c.district,
    filingDate: c.filingDate,
    oppositeParty: c.oppositeParty,
    client: { id: c.client.id, name: c.client.name, phone: c.client.phone },
    lawyer: c.lawyer ? { id: c.lawyer.id, name: c.lawyer.name } : null,
    nextHearingDate,
    lastUpdate,
    createdAt: c.createdAt,
  }
}

async function buildCaseListDTOs(cases: CaseRow[]) {
  const ids = cases.map((c) => c.id)
  const now = new Date()
  const [upcoming, updates] = await Promise.all([
    ids.length
      ? db.hearing.findMany({
          where: { caseId: { in: ids }, status: "UPCOMING", hearingDate: { gte: now } },
          select: { caseId: true, hearingDate: true },
          orderBy: { hearingDate: "asc" },
        })
      : Promise.resolve([] as { caseId: string; hearingDate: Date }[]),
    ids.length
      ? db.caseUpdate.findMany({
          where: { caseId: { in: ids } },
          select: { caseId: true, update: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([] as { caseId: string; update: string }[]),
  ])
  const nextByCase = new Map<string, Date>()
  for (const h of upcoming) if (!nextByCase.has(h.caseId)) nextByCase.set(h.caseId, h.hearingDate)
  const lastByCase = new Map<string, string>()
  for (const u of updates) if (!lastByCase.has(u.caseId)) lastByCase.set(u.caseId, u.update.slice(0, 90))
  return cases.map((c) => caseListDTO(c, nextByCase.get(c.id) ?? null, lastByCase.get(c.id) ?? null))
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const view = searchParams.get("view") ?? "all"
    const status = optionalString(searchParams.get("status"))
    const type = optionalString(searchParams.get("type"))
    const lawyerId = optionalString(searchParams.get("lawyerId"))
    const clientId = optionalString(searchParams.get("clientId"))
    const priority = optionalString(searchParams.get("priority"))
    const search = optionalString(searchParams.get("search"))

    const extra: Record<string, unknown> = {}
    if (status) extra.status = status
    else if (view === "active") extra.status = { in: ["ACTIVE", "PENDING", "ON_HOLD"] }
    else if (view === "closed") extra.status = { in: ["RESOLVED", "CLOSED"] }
    if (type) extra.type = type
    if (lawyerId) extra.lawyerId = lawyerId
    if (clientId) extra.clientId = clientId
    if (priority) extra.priority = priority
    if (search) {
      extra.OR = [
        { caseNumber: { contains: search } },
        { title: { contains: search } },
        { oppositeParty: { contains: search } },
      ]
    }

    const where = caseScopeWhere(user, extra)
    const rows = await db.case.findMany({
      where: where as never,
      include: {
        client: { select: { id: true, name: true, phone: true } },
        lawyer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    return Response.json({ data: await buildCaseListDTOs(rows as CaseRow[]) })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF"])
    const body = await readJson<Record<string, unknown>>(request)

    const caseNumber = requireString(body.caseNumber, "caseNumber")
    const title = requireString(body.title, "title")
    const type = requireString(body.type, "type")
    const clientId = requireString(body.clientId, "clientId")
    const court = requireString(body.court, "court")
    const district = optionalString(body.district)
    const oppositeParty = optionalString(body.oppositeParty)
    const description = optionalString(body.description)
    const filingDate = parseDateOnly(body.filingDate)

    const status = optionalString(body.status) ?? "ACTIVE"
    if (!CASE_STATUSES.includes(status as never)) {
      throw new ApiError("Invalid case status.", 422)
    }
    const priority = optionalString(body.priority) ?? "MEDIUM"
    if (!CASE_PRIORITIES.includes(priority as never)) {
      throw new ApiError("Invalid case priority.", 422)
    }
    if (!CASE_TYPES.includes(type as never)) {
      throw new ApiError("Invalid case type.", 422)
    }

    const existing = await db.case.findUnique({ where: { caseNumber }, select: { id: true } })
    if (existing) throw new ApiError("Case number already exists.", 409)

    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) throw new ApiError("Client not found.", 422)

    const lawyerId = optionalString(body.lawyerId)
    if (lawyerId) {
      const lawyer = await db.lawyer.findUnique({ where: { id: lawyerId }, select: { id: true } })
      if (!lawyer) throw new ApiError("Lawyer not found.", 422)
    }

    let created
    try {
      created = await db.case.create({
        data: {
          caseNumber,
          title,
          type,
          clientId,
          lawyerId: lawyerId ?? null,
          court,
          district,
          filingDate,
          status,
          priority,
          oppositeParty,
          description,
        },
        include: {
          client: { select: { id: true, name: true, phone: true } },
          lawyer: { select: { id: true, name: true } },
        },
      })
    } catch (e) {
      throwConflictIfUniqueViolation(e, "Case number already exists.")
      throw e
    }

    await db.caseUpdate.create({
      data: {
        caseId: created.id,
        update: "Case registered in the system.",
        createdById: user.id,
        createdByName: user.name,
      },
    })

    const lawyerIdToNotify = await lawyerUserId(created.lawyerId)
    const clientIdToNotify = await clientUserId(created.clientId)
    const admins = await adminIds()
    await notifyUsers([lawyerIdToNotify, clientIdToNotify, ...admins.filter((id) => id !== user.id)], {
      title: `New Case — ${created.caseNumber}`,
      message: `${created.title}${created.lawyer ? ` · Assigned to ${created.lawyer.name}` : ""}`,
      type: "CASE",
      caseId: created.id,
      link: `case-detail:${created.id}`,
    })

    await audit(user, "CASE_CREATE", "Case", created.id, created.caseNumber,
      `Created case ${created.caseNumber} — ${created.title}`)

    return Response.json({
      data: caseListDTO(created as CaseRow, null, "Case registered in the system."),
    }, { status: 201 })
  })
}
