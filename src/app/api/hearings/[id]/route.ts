import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth } from "@/lib/api-helpers"
import { assertCaseWriteAccess } from "@/lib/permissions"
import { HEARING_STATUSES } from "@/lib/constants"
import { dhakaDateKey } from "@/lib/dates"
import { clientUserId, lawyerUserId, notifyUsers } from "@/lib/notify"

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
  },
  caseNumber: string,
  caseTitle: string
) {
  return {
    id: h.id,
    caseId: h.caseId,
    caseNumber,
    caseTitle,
    hearingDate: h.hearingDate,
    court: h.court,
    judge: h.judge,
    hearingType: h.hearingType,
    status: h.status,
    notes: h.notes,
    summary: h.summary,
    courtOrder: h.courtOrder,
    nextAction: h.nextAction,
    nextHearingDate: h.nextHearingDate,
    createdAt: h.createdAt,
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params

    const hearing = await db.hearing.findUnique({ where: { id } })
    if (!hearing) throw new ApiError("Hearing not found.", 404)
    await assertCaseWriteAccess(user, hearing.caseId)

    const kase = await db.case.findUnique({
      where: { id: hearing.caseId },
      select: { caseNumber: true, title: true, court: true, clientId: true, lawyerId: true },
    })
    if (!kase) throw new ApiError("Case not found.", 404)

    const body = await readJson<Record<string, unknown>>(request)
    const data: Record<string, unknown> = {}

    let newStatus: string | null = null
    if (body.status !== undefined) {
      const status = requireStatus(body.status)
      data.status = status
      newStatus = status
    }
    if (body.notes !== undefined) data.notes = optionalString(body.notes)
    if (body.summary !== undefined) data.summary = optionalString(body.summary)
    if (body.courtOrder !== undefined) data.courtOrder = optionalString(body.courtOrder)
    if (body.nextAction !== undefined) data.nextAction = optionalString(body.nextAction)
    if (body.hearingType !== undefined) data.hearingType = optionalString(body.hearingType)
    if (body.judge !== undefined) data.judge = optionalString(body.judge)
    if (body.hearingDate !== undefined) {
      const d = parseDateOnly(body.hearingDate)
      if (!d) throw new ApiError('"hearingDate" is required.', 422)
      data.hearingDate = d
    }
    if (body.nextHearingDate !== undefined) {
      data.nextHearingDate = parseDateOnly(body.nextHearingDate)
    }

    const updated = await db.hearing.update({ where: { id }, data: data as never })

    // Auto-create follow-up hearing when closing out with a next date
    const nextHearingDateValue = data.nextHearingDate as Date | null | undefined
    if (
      newStatus &&
      ["COMPLETED", "ADJOURNED", "POSTPONED"].includes(newStatus) &&
      nextHearingDateValue
    ) {
      const upcoming = await db.hearing.findMany({
        where: { caseId: hearing.caseId, status: "UPCOMING" },
        select: { hearingDate: true },
      })
      const targetKey = dhakaDateKey(nextHearingDateValue)
      const exists = upcoming.some((h) => dhakaDateKey(h.hearingDate) === targetKey)
      if (!exists) {
        await db.hearing.create({
          data: {
            caseId: hearing.caseId,
            hearingDate: nextHearingDateValue,
            hearingType: "Regular Hearing",
            court: kase.court,
            status: "UPCOMING",
            notes: `Follow-up scheduled after ${newStatus.toLowerCase()} hearing on ${dhakaDateKey(hearing.hearingDate)}.`,
            createdById: user.id,
          },
        })
      }
    }

    const [clientPortalUserId, caseLawyerUserId] = await Promise.all([
      clientUserId(kase.clientId),
      lawyerUserId(kase.lawyerId),
    ])
    await notifyUsers(
      [clientPortalUserId, caseLawyerUserId].filter((uid) => uid !== user.id),
      {
        title: `Hearing Update — ${kase.caseNumber}`,
        message: newStatus
          ? `Hearing on ${dhakaDateKey(updated.hearingDate)} is now ${newStatus.toLowerCase()}${
              updated.nextHearingDate ? `; next hearing ${dhakaDateKey(updated.nextHearingDate)}` : ""
            }.`
          : `Hearing details updated for ${dhakaDateKey(updated.hearingDate)}.`,
        type: "HEARING",
        caseId: hearing.caseId,
        link: `case-detail:${hearing.caseId}`,
      }
    )

    return Response.json({ data: hearingDTO(updated, kase.caseNumber, kase.title) })
  })
}

function requireStatus(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : ""
  if (!HEARING_STATUSES.includes(s as never)) {
    throw new ApiError("Invalid hearing status.", 422)
  }
  return s
}
