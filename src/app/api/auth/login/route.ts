import { db } from "@/lib/db"
import { ApiError, handle, ok, readJson, requireString } from "@/lib/api-helpers"
import { setSessionCookie, signSession } from "@/lib/auth"
import { verifyPassword } from "@/lib/password"

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson<{ email?: unknown; password?: unknown }>(request)
    const email = requireString(body.email, "email").toLowerCase()
    const password = requireString(body.password, "password")

    const user = await db.user.findUnique({
      where: { email },
      include: {
        lawyerProfile: { select: { id: true, name: true, specialization: true } },
        clientProfile: { select: { id: true, name: true } },
      },
    })

    if (!user || !verifyPassword(password, user.password)) {
      throw new ApiError("Invalid email or password.", 401)
    }
    if (user.status !== "ACTIVE") {
      throw new ApiError("Your account is inactive. Contact the administrator.", 403)
    }

    const token = await signSession({ sub: user.id, email: user.email, role: user.role })
    await setSessionCookie(token)

    return ok({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      lawyerProfile: user.lawyerProfile,
      clientProfile: user.clientProfile,
    })
  })
}
