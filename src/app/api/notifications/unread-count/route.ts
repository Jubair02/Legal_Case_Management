import { db } from "@/lib/db"
import { handle, requireAuth } from "@/lib/api-helpers"

export async function GET() {
  return handle(async () => {
    const user = await requireAuth()
    const count = await db.notification.count({ where: { userId: user.id, isRead: false } })
    return Response.json({ data: { count } })
  })
}
