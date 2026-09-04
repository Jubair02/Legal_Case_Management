import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireString, throwConflictIfUniqueViolation } from "@/lib/api-helpers"
import { ROLES } from "@/lib/constants"
import { hashPassword, MAX_PASSWORD_LENGTH } from "@/lib/password"

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const userInclude = {
  lawyerProfile: { select: { name: true } },
  clientProfile: { select: { name: true } },
} satisfies Prisma.UserInclude

type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof userInclude }>

function userDTO(u: UserWithProfiles) {
  const linkedName = u.lawyerProfile?.name ?? u.clientProfile?.name ?? null
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt.toISOString(),
    linkedName,
  }
}

export async function GET(request: Request) {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")?.trim() ?? ""
    const role = searchParams.get("role")?.trim() ?? ""

    const where: Prisma.UserWhereInput = {}
    if (role) where.role = role
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ]
    }

    const users = await db.user.findMany({
      where,
      include: userInclude,
      orderBy: { createdAt: "desc" },
    })

    return ok(users.map(userDTO))
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const body = await readJson<Record<string, unknown>>(request)

    const name = requireString(body.name, "name")
    const email = requireString(body.email, "email").toLowerCase()
    const password = typeof body.password === "string" ? body.password : ""
    const phone = optionalString(body.phone)
    const role = requireString(body.role, "role")

    if (!EMAIL_RE.test(email)) throw new ApiError("Please enter a valid email address.", 422)
    if (password.length < 6) throw new ApiError("Password must be at least 6 characters.", 422)
    if (password.length > MAX_PASSWORD_LENGTH) {
      throw new ApiError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`, 422)
    }
    if (!(ROLES as readonly string[]).includes(role)) {
      throw new ApiError(`"role" must be one of: ${ROLES.join(", ")}.`, 422)
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) throw new ApiError("A user with this email already exists.", 409)

    const user = await db.user
      .create({
        data: {
          name,
          email,
          phone,
          role,
          status: "ACTIVE",
          password: hashPassword(password),
        },
        include: userInclude,
      })
      .catch((e: unknown) => {
        throwConflictIfUniqueViolation(e, "A user with this email already exists.")
        throw e
      })

    return ok(userDTO(user))
  })
}
