"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

import { AppSessionProvider } from "@/components/layout/app-session"
import { AppShell } from "@/components/layout/app-shell"
import { BrandMark } from "@/components/shared/brand-mark"
import { apiGet, apiSend, clearStoredToken, SESSION_EXPIRED_EVENT } from "@/lib/api-client"
import { LanguageProvider } from "@/lib/i18n/language"
import { canAccess, DEFAULT_ROUTE, hrefFor, LOGIN_ROUTE } from "@/lib/routes"
import type { SessionUser, ViewKey, ViewParams } from "@/lib/types"

function BootSplash() {
  return (
    <div className="u-forest u-engrave u-bloom relative flex min-h-screen flex-col items-center justify-center overflow-hidden text-emerald-50">
      <div className="u-rise relative z-10 flex flex-col items-center gap-5">
        <BrandMark className="h-16 w-16 shadow-seal" />
        <div className="text-center">
          <p className="u-wordmark text-[1.75rem] font-semibold leading-none tracking-tight text-white">
            AinSheba
          </p>
          <p className="mt-2 text-sm text-emerald-100/70">আইনসেবা · Case Management</p>
        </div>
        <hr className="u-rule w-28" />
        <Loader2 aria-label="Loading" className="h-4 w-4 animate-spin text-brass" />
      </div>
    </div>
  )
}

/**
 * Shared layout for every signed-in route.
 *
 * Middleware already turned away unauthenticated and unauthorised requests
 * before this rendered; the checks here cover what it cannot see — a session
 * revoked server-side (status/sessionVersion, which need the database) and
 * the Bearer-fallback deployment where there is no cookie to inspect at the
 * edge. Being a layout, it is not re-mounted when moving between routes, so
 * the session is fetched once and the chrome never flashes.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    let active = true
    apiGet<SessionUser | null>("/api/auth/me")
      .then((u) => {
        if (active) setUser(u ?? null)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setBooting(false)
      })
    return () => {
      active = false
    }
  }, [])

  // Any API 401 (expired or revoked session) returns to the login screen
  // rather than stranding the user on a page whose requests all fail.
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      router.replace(LOGIN_ROUTE)
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [router])

  useEffect(() => {
    if (booting) return
    if (!user) {
      const next = encodeURIComponent(pathname)
      router.replace(`${LOGIN_ROUTE}?next=${next}`)
      return
    }
    // Role gate, re-checked here because middleware trusts the JWT claim
    // while this uses the freshly loaded account.
    if (!canAccess(pathname, user.role)) router.replace(DEFAULT_ROUTE)
  }, [booting, user, pathname, router])

  const navigate = useCallback(
    (view: ViewKey, params?: ViewParams) => router.push(hrefFor(view, params)),
    [router]
  )

  const onLogout = useCallback(async () => {
    try {
      await apiSend("POST", "/api/auth/logout")
    } catch {
      /* ignore — clear locally regardless */
    }
    clearStoredToken()
    setUser(null)
    router.replace(LOGIN_ROUTE)
    router.refresh()
  }, [router])

  if (booting || !user || !canAccess(pathname, user.role)) {
    return (
      <LanguageProvider>
        <BootSplash />
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider>
      <AppSessionProvider user={user} navigate={navigate}>
        <AppShell user={user} onLogout={onLogout}>
          {children}
        </AppShell>
      </AppSessionProvider>
    </LanguageProvider>
  )
}
