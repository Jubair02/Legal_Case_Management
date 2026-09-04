import { getSessionUser } from "@/lib/auth"
import { handle, ok } from "@/lib/api-helpers"

export async function GET() {
  return handle(async () => {
    const user = await getSessionUser()
    return ok(user)
  })
}
