import { db } from "@/lib/db"
import { handle, optionalString, requireAuth } from "@/lib/api-helpers"
import { getOutboundSettings } from "@/lib/settings"
import { outboundProviderStatus } from "@/lib/settings"

/**
 * GET /api/outbound — ADMIN-only SMS/Email outbox.
 *
 * Returns the latest 200 messages plus live provider status, the bridge
 * settings and per-status counters for the admin panel.
 *
 * Query params: channel (SMS|EMAIL), status (PENDING|SENT|SIMULATED|FAILED),
 * event (e.g. INVOICE_ISSUED), q (recipient/body/caseNumber contains).
 */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAuth(["ADMIN"])

    const { searchParams } = new URL(request.url)
    const channel = optionalString(searchParams.get("channel"))
    const status = optionalString(searchParams.get("status"))
    const event = optionalString(searchParams.get("event"))
    const q = optionalString(searchParams.get("q"))

    const where: Record<string, unknown> = {}
    if (channel === "SMS" || channel === "EMAIL") where.channel = channel
    if (status) where.status = status
    if (event) where.event = event
    if (q) {
      where.OR = [
        { recipient: { contains: q } },
        { body: { contains: q } },
        { caseNumber: { contains: q } },
        { recipientName: { contains: q } },
      ]
    }

    const [items, counts, settings] = await Promise.all([
      db.outboundMessage.findMany({
        where: where as never,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      db.outboundMessage.groupBy({ by: ["status"], _count: { _all: true } }),
      getOutboundSettings(),
    ])

    const stats: Record<string, number> = { PENDING: 0, SENT: 0, SIMULATED: 0, FAILED: 0 }
    for (const row of counts) stats[row.status] = row._count._all

    return Response.json({
      data: {
        items,
        stats,
        settings,
        providers: outboundProviderStatus(),
      },
    })
  })
}
