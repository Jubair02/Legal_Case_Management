"use client"

import { Suspense, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { LoginScreen } from "@/components/auth/login-screen"
import { LanguageProvider } from "@/lib/i18n/language"
import { DEFAULT_ROUTE } from "@/lib/routes"
import type { SessionUser } from "@/lib/types"

/** Only ever return to a path on this site — never to an attacker's URL. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_ROUTE
  return value
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const onLogin = useCallback(
    (_user: SessionUser) => {
      // Land on whatever the visitor originally asked for (middleware records
      // it as ?next=), otherwise the dashboard. refresh() re-runs middleware
      // so the new session cookie is picked up.
      router.replace(safeNext(searchParams.get("next")))
      router.refresh()
    },
    [router, searchParams]
  )

  return <LoginScreen onLogin={onLogin} />
}

export default function LoginPage() {
  return (
    <LanguageProvider>
      <Suspense fallback={null}>
        <LoginPageInner />
      </Suspense>
    </LanguageProvider>
  )
}
