"use client"

import { useEffect, useState } from "react"
import { Loader2, Scale } from "lucide-react"

import { LoginScreen } from "@/components/auth/login-screen"
import { AppShell } from "@/components/layout/app-shell"
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-emerald-950 text-emerald-50">
        <span className="flex h-14 w-14 animate-pulse items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg shadow-emerald-950/60">
          <Scale className="h-7 w-7" />
        </span>
        <div className="text-center">
          <p className="text-2xl font-semibold tracking-tight">AinSheba</p>
          <p className="text-sm text-emerald-200/60">আইনসেবা · Case Management</p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
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
