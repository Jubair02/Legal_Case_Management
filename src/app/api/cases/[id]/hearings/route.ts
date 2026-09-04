import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth, requireString } from "@/lib/api-helpers"
import { assertCaseWriteAccess } from "@/lib/permissions"
import { dhakaDateKey } from "@/lib/dates"
import { adminIds, clientUserId, lawyerUserId, notifyUsers } from "@/lib/notify"

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params
    await assertCaseWriteAccess(user, id)
    const fullCase = await db.case.findUnique({
      where: { id },
      select: { caseNumber: true, title: true, court: true, clientId: true, lawyerId: true },
    })
    if (!fullCase) throw new ApiError("Case not found.", 404)

    const body = await readJson<Record<string, unknown>>(request)
    const hearingDate = parseDateOnly(body.hearingDate)
    if (!hearingDate) throw new ApiError('"hearingDate" is required.', 422)
    const hearingType = optionalString(body.hearingType)
    const court = optionalString(body.court) ?? fullCase.court
    const judge = optionalString(body.judge)
    const notes = optionalString(body.notes)

    const created = await db.hearing.create({
      data: {
        caseId: id,
        hearingDate,
        court,
        judge,
        hearingType,
        notes,
        status: "UPCOMING",
        createdById: user.id,
      },
    })

    const [clientPortalUserId, caseLawyerUserId, admins] = await Promise.all([
      clientUserId(fullCase.clientId),
      lawyerUserId(fullCase.lawyerId),
      adminIds(),
    ])
    await notifyUsers(
      [clientPortalUserId, caseLawyerUserId, ...admins.filter((uid) => uid !== user.id)],
      {
        title: `Hearing Scheduled — ${fullCase.caseNumber}`,
        message: `${hearingType ?? "Hearing"} on ${dhakaDateKey(hearingDate)}${court ? ` at ${court}` : ""}.`,
        type: "HEARING",
        caseId: id,
        link: `case-detail:${id}`,
      }
    )

    return Response.json(
      { data: hearingDTO(created, fullCase.caseNumber, fullCase.title) },
      { status: 201 }
    )
  })
}
