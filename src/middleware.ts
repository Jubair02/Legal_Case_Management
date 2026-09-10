import { NextResponse, type NextRequest } from "next/server"
import { jwtVerify } from "jose"

import { canAccess, DEFAULT_ROUTE, LOGIN_ROUTE, matchRoute } from "@/lib/routes"

/**
 * Route gate for direct URL access, refresh and Back/Forward.
 *
 * Now that every screen has its own address, anyone can type `/audit` or
 * refresh into `/reports`. This redirects before the app renders, so a signed
 * out visitor never sees a flash of chrome and a client never lands on a page
 * built for the chamber.
 *
 * This is UX, not the security boundary. It can only check the JWT — the
 * account-status and sessionVersion checks need the database, which is not
 * available in the edge runtime. Every API route still calls `requireAuth`,
 * and that remains the thing that actually protects the data.
 */

const SESSION_COOKIE = "lcm_session"

// When the Bearer fallback is on, the session lives in localStorage because
// the embedding context blocks cookies — there is nothing here to read, so
// the client-side guard in (app)/layout.tsx takes over instead.
const BEARER_FALLBACK = process.env.NEXT_PUBLIC_ENABLE_BEARER_FALLBACK === "true"

function secret(): Uint8Array {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || "ainsheba-legal-case-management-dev-secret-key-2026"
  )
}

async function roleFromRequest(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secret())
    return typeof payload.role === "string" ? payload.role : null
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (BEARER_FALLBACK) return NextResponse.next()

  const role = await roleFromRequest(request)
  const signedIn = role !== null

  // Signed in users have no business on the login screen.
  if (pathname === LOGIN_ROUTE) {
    if (signedIn) return NextResponse.redirect(new URL(DEFAULT_ROUTE, request.url))
    return NextResponse.next()
  }

  // "/" is the entry point: send people where they belong.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(signedIn ? DEFAULT_ROUTE : LOGIN_ROUTE, request.url))
  }

  const match = matchRoute(pathname)
  if (!match) return NextResponse.next() // unknown path → Next's own 404

  if (!signedIn) {
    // Remember where they were headed so login can return them there.
    const url = new URL(LOGIN_ROUTE, request.url)
    url.searchParams.set("next", pathname + search)
    return NextResponse.redirect(url)
  }

  if (!canAccess(pathname, role)) {
    return NextResponse.redirect(new URL(DEFAULT_ROUTE, request.url))
  }

  return NextResponse.next()
}

export const config = {
  // Everything except API routes, Next internals and static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|logo.svg|robots.txt|uploads).*)"],
}
