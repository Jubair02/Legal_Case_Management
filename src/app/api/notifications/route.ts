import { db } from "@/lib/db"
import { handle, requireAuth } from "@/lib/api-helpers"
import { caseScopeWhere } from "@/lib/permissions"
import { dhakaDateKey, dhakaDayOffset, dhakaDayRange } from "@/lib/dates"

function formatDhakaTime(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d)
}

/** Reminder sweep: create hearing-today/tomorrow notifications (deduped) for this user. */
async function runHearingReminderSweep(user: { id: string; role: string }) {
  const todayRange = dhakaDayRange(dhakaDayOffset(0))
  const tomorrowRange = dhakaDayRange(dhakaDayOffset(1))
  const todayKey = dhakaDayOffset(0)

  const hearings = await db.hearing.findMany({
    where: {
      status: "UPCOMING",
      case: caseScopeWhere(user as never),
      OR: [
        { hearingDate: { gte: todayRange.start, lt: todayRange.end } },
        { hearingDate: { gte: tomorrowRange.start, lt: tomorrowRange.end } },
      ],
    },
    include: { case: { select: { caseNumber: true } } },
  })
  if (hearings.length === 0) return

  const candidates = hearings.map((h) => {
    const isToday = dhakaDateKey(h.hearingDate) === todayKey
    return {
      dedupeKey: `${isToday ? "hearing-today" : "hearing-tomorrow"}:${h.id}`,
      title: `${isToday ? "Hearing Today" : "Hearing Tomorrow"} — ${h.case.caseNumber}`,
      message: `${h.hearingType ?? "Hearing"}${h.court ? ` · ${h.court}` : ""} at ${formatDhakaTime(h.hearingDate)}.`,
      caseId: h.caseId,
    }
  })

  const existing = await db.notification.findMany({
    where: { userId: user.id, dedupeKey: { in: candidates.map((c) => c.dedupeKey) } },
    select: { dedupeKey: true },
  })
  const existingSet = new Set(existing.map((e) => e.dedupeKey))

  for (const c of candidates) {
    if (existingSet.has(c.dedupeKey)) continue
    try {
      await db.notification.create({
        data: {
          userId: user.id,
          title: c.title,
          message: c.message,
          type: "HEARING",
          caseId: c.caseId,
          link: `case-detail:${c.caseId}`,
          dedupeKey: c.dedupeKey,
        },
      })
    } catch {
      // best-effort sweep
    }
  }
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)

    await runHearingReminderSweep(user)

    const unreadOnly = searchParams.get("unread") === "true"
    const takeParam = Number(searchParams.get("take"))
    const take = Number.isFinite(takeParam) && takeParam > 0 ? Math.min(Math.floor(takeParam), 200) : 100

    const where: Record<string, unknown> = { userId: user.id }
    if (unreadOnly) where.isRead = false

    const rows = await db.notification.findMany({
      where: where as never,
      orderBy: { createdAt: "desc" },
      take,
    })

    return Response.json({
      data: rows.map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        caseId: n.caseId,
        link: n.link,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
    })
  })
}
