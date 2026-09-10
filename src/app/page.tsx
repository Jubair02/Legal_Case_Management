"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { DEFAULT_ROUTE } from "@/lib/routes"

/**
 * "/" is just an entry point now — every screen lives at its own address.
 *
 * Middleware normally redirects this before it renders (to /dashboard or
 * /login). This client redirect covers the one case middleware skips: the
 * Bearer-fallback deployment, where there is no cookie to read at the edge.
 * The (app) layout bounces on to /login if there turns out to be no session.
 */
export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace(DEFAULT_ROUTE)
  }, [router])

  return null
}
