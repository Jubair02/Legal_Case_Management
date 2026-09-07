import { db } from "@/lib/db"
import { ApiError, handle, readJson, requireAuth } from "@/lib/api-helpers"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth()
    const { id } = await params

    const notification = await db.notification.findUnique({ where: { id } })
    if (!notification) throw new ApiError("Notification not found.", 404)
    if (notification.userId !== user.id) {
      throw new ApiError("You do not have permission to modify this notification.", 403)
    }

    const body = await readJson<Record<string, unknown>>(request)
    const isRead =
      typeof body.isRead === "boolean" ? body.isRead : body.isRead === "true" ? true : body.isRead === "false" ? false : notification.isRead

    const updated = await db.notification.update({ where: { id }, data: { isRead } })

    return Response.json({
      data: {
        id: updated.id,
        title: updated.title,
        message: updated.message,
        type: updated.type,
        caseId: updated.caseId,
        link: updated.link,
        isRead: updated.isRead,
        createdAt: updated.createdAt,
      },
    })
  })
}
