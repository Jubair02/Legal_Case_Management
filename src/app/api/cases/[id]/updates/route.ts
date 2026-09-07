import { db } from "@/lib/db"
import { ApiError, handle, readJson, requireAuth, requireString } from "@/lib/api-helpers"
import { assertCaseWriteAccess } from "@/lib/permissions"
import { clientUserId, lawyerUserId, notifyUsers } from "@/lib/notify"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params
    const kase = await assertCaseWriteAccess(user, id)
    const body = await readJson<Record<string, unknown>>(request)
    const update = requireString(body.update, "update")

    const created = await db.caseUpdate.create({
      data: {
        caseId: id,
        update,
        createdById: user.id,
        createdByName: user.name,
      },
    })

    const fullCase = await db.case.findUnique({
      where: { id },
      select: { caseNumber: true, clientId: true, lawyerId: true },
    })
    if (fullCase) {
      const [clientPortalUserId, caseLawyerUserId] = await Promise.all([
        clientUserId(fullCase.clientId),
        lawyerUserId(fullCase.lawyerId),
      ])
      await notifyUsers(
        [clientPortalUserId, caseLawyerUserId].filter((uid) => uid !== user.id),
        {
          title: `Case Update — ${fullCase.caseNumber}`,
          message: update.length > 140 ? `${update.slice(0, 140)}…` : update,
          type: "CASE",
          caseId: id,
          link: `case-detail:${id}`,
        }
      )
    }

    return Response.json(
      {
        data: {
          id: created.id,
          caseId: created.caseId,
          update: created.update,
          createdByName: created.createdByName,
          createdAt: created.createdAt,
        },
      },
      { status: 201 }
    )
  })
}
