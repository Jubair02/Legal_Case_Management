import { db } from "@/lib/db"
import { handle, optionalString, requireAuth } from "@/lib/api-helpers"

/**
 * GET /api/audit — ADMIN-only, paginated audit trail with filters.
 *
 * Query params:
 *  - page (1-based), pageSize (1..100, default 25)
 *  - entityType (e.g. Case, Invoice, Auth), action (prefix match, e.g. CASE_),
 *    actorId, q (matches entityLabel/summary/entityId/actorName), from, to (ISO dates)
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAuth(["ADMIN"])

    const { searchParams } = new URL(request.url)
    const pageRaw = Number(searchParams.get("page") ?? "1")
    const sizeRaw = Number(searchParams.get("pageSize") ?? "25")
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const pageSize =
      Number.isFinite(sizeRaw) && sizeRaw >= 1 && sizeRaw <= 100 ? Math.floor(sizeRaw) : 25

    const entityType = optionalString(searchParams.get("entityType"))
    const action = optionalString(searchParams.get("action"))
    const actorId = optionalString(searchParams.get("actorId"))
    const q = optionalString(searchParams.get("q"))
    const from = optionalString(searchParams.get("from"))
    const to = optionalString(searchParams.get("to"))

    const where: Record<string, unknown> = {}
    if (entityType) where.entityType = entityType
    if (action) where.action = { startsWith: action }
    if (actorId) where.actorId = actorId
    if (from || to) {
      const createdAt: Record<string, Date> = {}
      const fromDate = from ? new Date(from) : null
      const toDate = to ? new Date(to) : null
      if (fromDate && !Number.isNaN(fromDate.getTime())) createdAt.gte = fromDate
      if (toDate && !Number.isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999)
        createdAt.lte = toDate
      }
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt
    }
    if (q) {
      where.OR = [
        { entityLabel: { contains: q } },
        { summary: { contains: q } },
        { entityId: { contains: q } },
        { actorName: { contains: q } },
      ]
    }

    const [total, rows] = await Promise.all([
      db.auditLog.count({ where: where as never }),
      db.auditLog.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    const items = rows.map((r) => {
      let meta: unknown = null
      if (r.meta) {
        try {
          meta = JSON.parse(r.meta)
        } catch {
          meta = null
        }
      }
      return {
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorName,
        actorRole: r.actorRole,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        entityLabel: r.entityLabel,
        summary: r.summary,
        meta,
        createdAt: r.createdAt,
      }
    })

    return Response.json({ data: { items, total, page, pageSize } })
  })
}
