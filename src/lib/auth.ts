import { SignJWT, jwtVerify } from "jose"
import { cookies, headers } from "next/headers"
import { db } from "@/lib/db"

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET environment variable is required in production. Refusing to sign sessions with an insecure fallback key."
    )
  }
  return new TextEncoder().encode(
    secret || "ainsheba-legal-case-management-dev-secret-key-2026"
  )
}

export const SESSION_COOKIE = "lcm_session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export interface SessionPayload {
  sub: string // user id
  email: string
  role: string
  /** Value of User.sessionVersion at issue time — checked on every request. */
  sessionVersion?: number
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return await new SignJWT({
    email: payload.email,
    role: payload.role,
    ...(payload.sessionVersion !== undefined ? { sessionVersion: payload.sessionVersion } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      email: (payload.email as string) || "",
      role: (payload.role as string) || "",
      sessionVersion: typeof payload.sessionVersion === "number" ? payload.sessionVersion : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Read the session token for the current request. The httpOnly cookie is the
 * primary carrier; an `Authorization: Bearer` header is accepted as a fallback
 * for embedding contexts (e.g. the sandbox preview panel) where the browser
 * blocks SameSite=Lax cookies in cross-site iframes.
 */
async function getRequestToken(): Promise<string | null> {
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get(SESSION_COOKIE)?.value
  if (cookieToken) return cookieToken
  const headerStore = await headers()
  const authorization = headerStore.get("authorization")
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim()
    return token.length > 0 ? token : null
  }
  return null
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // The sandbox proxies HTTPS -> HTTP, so only enable `secure` in real production.
    secure: process.env.NODE_ENV === "production" && process.env.DISABLE_SECURE_COOKIES !== "true",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
}

export interface SessionUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  status: string
  lawyerProfile: { id: string; name: string; specialization: string | null } | null
  clientProfile: { id: string; name: string } | null
}

/**
 * Read the session cookie, verify the JWT and load the fresh user from DB.
 * Returns null when not authenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = await getRequestToken()
  if (!token) return null
  const payload = await verifySessionToken(token)
  if (!payload) return null
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    include: {
      lawyerProfile: { select: { id: true, name: true, specialization: true } },
      clientProfile: { select: { id: true, name: true } },
    },
  })
  if (!user || user.status !== "ACTIVE") return null
  // Session revocation: a password change bumps sessionVersion, invalidating
  // every token issued before it (old tokens carry the stale value).
  if ((payload.sessionVersion ?? 0) !== user.sessionVersion) return null
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    lawyerProfile: user.lawyerProfile,
    clientProfile: user.clientProfile,
  }
}
