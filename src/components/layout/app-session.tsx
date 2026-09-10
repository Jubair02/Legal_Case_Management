"use client"

import { createContext, useContext, useMemo } from "react"
import { useSearchParams } from "next/navigation"

import type { SessionUser, ViewKey, ViewParams, ViewProps } from "@/lib/types"

/**
 * Session + navigation shared by every routed page.
 *
 * Views still take the original `{ user, navigate, params }` contract, so none
 * of them had to change when the app moved from one URL to real routes. What
 * changed is underneath: `navigate` pushes a URL instead of setting state.
 */
interface AppSession {
  user: SessionUser
  navigate: (view: ViewKey, params?: ViewParams) => void
}

const AppSessionContext = createContext<AppSession | null>(null)

export function AppSessionProvider({
  user,
  navigate,
  children,
}: AppSession & { children: React.ReactNode }) {
  const value = useMemo(() => ({ user, navigate }), [user, navigate])
  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>
}

export function useAppSession(): AppSession {
  const ctx = useContext(AppSessionContext)
  if (!ctx) throw new Error("useAppSession must be used inside the (app) layout")
  return ctx
}

/**
 * Props for a routed view. Path params (`/cases/:id`) come from the page;
 * anything else in the query string is passed through, so `?tab=hearings`
 * survives a refresh and can be shared as a link.
 */
export function useViewProps(pathParams?: ViewParams): ViewProps {
  const { user, navigate } = useAppSession()
  const searchParams = useSearchParams()

  // Pages pass a fresh object literal each render, so key the memo on the
  // contents rather than the identity — otherwise `params` would be a new
  // object every render and re-trigger effects in the views that read it.
  const pathKey = JSON.stringify(pathParams ?? {})
  const params = useMemo(() => {
    const merged: ViewParams = {}
    searchParams.forEach((value, key) => {
      merged[key] = value
    })
    return { ...merged, ...(JSON.parse(pathKey) as ViewParams) }
  }, [searchParams, pathKey])

  return { user, navigate, params }
}
