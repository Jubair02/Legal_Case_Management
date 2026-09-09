"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { LoginScreen } from "@/components/auth/login-screen"
import { AppShell } from "@/components/layout/app-shell"
import { BrandMark } from "@/components/shared/brand-mark"
import { apiGet, apiSend, clearStoredToken, SESSION_EXPIRED_EVENT } from "@/lib/api-client"
import { LanguageProvider } from "@/lib/i18n/language"
import type { SessionUser } from "@/lib/types"

export default function Home() {
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

  // Any API 401 (expired/invalidated session) resets to the login screen so the
  // user is never stranded on a dead SPA with silently failing requests.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  if (booting) {
    return (
      <LanguageProvider>
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
      </LanguageProvider>
    )
  }

  if (!user) {
    return (
      <LanguageProvider>
        <LoginScreen onLogin={setUser} />
      </LanguageProvider>
    )
  }

  return (
    <LanguageProvider>
    <AppShell
      user={user}
      onLogout={async () => {
        try {
          await apiSend("POST", "/api/auth/logout")
        } catch {
          /* ignore — clear locally regardless */
        }
        clearStoredToken()
        setUser(null)
      }}
    />
    </LanguageProvider>
  )
}
