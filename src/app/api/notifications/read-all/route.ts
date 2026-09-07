import { db } from "@/lib/db"
import { handle, requireAuth } from "@/lib/api-helpers"

export async function POST() {
  return handle(async () => {
    const user = await requireAuth()
    await db.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    })
    return Response.json({ data: { ok: true } })
  })
}
