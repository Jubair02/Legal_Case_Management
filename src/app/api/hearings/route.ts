import { db } from "@/lib/db"
import { ApiError, handle, requireAuth } from "@/lib/api-helpers"
import { caseScopeWhere } from "@/lib/permissions"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"

function hearingDTO(
  h: {
    id: string
    caseId: string
    hearingDate: Date
    court: string | null
    judge: string | null
    hearingType: string | null
    status: string
    notes: string | null
    summary: string | null
    courtOrder: string | null
    nextAction: string | null
    nextHearingDate: Date | null
    createdAt: Date
    case: { caseNumber: string; title: string }
  },
  forClient = false
) {
  const base = {
    id: h.id,
    caseId: h.caseId,
    caseNumber: h.case.caseNumber,
    caseTitle: h.case.title,
    hearingDate: h.hearingDate,
    court: h.court,
    hearingType: h.hearingType,
    status: h.status,
    nextHearingDate: h.nextHearingDate,
    createdAt: h.createdAt,
  }
  if (forClient) {
    // Internal work-product (judge, notes, orders, strategy) is not exposed to clients.
    return base
  }
  return {
    ...base,
    judge: h.judge,
    notes: h.notes,
    summary: h.summary,
    courtOrder: h.courtOrder,
    nextAction: h.nextAction,
  }
}

function parseDayKeyOrThrow(value: string | null, field: string): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(`Invalid "${field}" date. Use YYYY-MM-DD.`, 422)
  }
  return value
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get("filter") ?? "all"
    const caseId = searchParams.get("caseId") || undefined
    const fromKey = parseDayKeyOrThrow(searchParams.get("from"), "from")
    const toKey = parseDayKeyOrThrow(searchParams.get("to"), "to")

    const caseWhere = caseScopeWhere(user, caseId ? { id: caseId } : {})
    const where: Record<string, unknown> = { case: caseWhere }

    const now = new Date()
    const todayRange = dhakaDayRange(dhakaDayOffset(0))

    if (filter === "today") {
      where.hearingDate = { gte: todayRange.start, lt: todayRange.end }
    } else if (filter === "upcoming") {
      where.hearingDate = { gte: now }
      where.status = "UPCOMING"
    } else if (filter === "past") {
      where.hearingDate = { lt: todayRange.start }
    } else if (fromKey || toKey) {
      const range: Record<string, Date> = {}
      if (fromKey) range.gte = dhakaDayRange(fromKey).start
      if (toKey) range.lt = dhakaDayRange(toKey).end // inclusive of the "to" day
      where.hearingDate = range
    }

    const ascending = filter === "today" || filter === "upcoming"
    const hearings = await db.hearing.findMany({
      where: where as never,
      include: { case: { select: { caseNumber: true, title: true } } },
      orderBy: { hearingDate: ascending ? "asc" : "desc" },
    })

    return Response.json({ data: hearings.map((h) => hearingDTO(h, user.role === "CLIENT")) })
  })
}
