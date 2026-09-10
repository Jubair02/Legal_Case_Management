import type { ViewKey, ViewParams } from "@/lib/types"

/**
 * URL ⇄ view mapping.
 *
 * The app used to be a single page at "/" that swapped views from React
 * state, so every screen shared one URL: refreshing dropped you back on the
 * dashboard, links could not be shared, and Back/Forward left the app.
 * Each screen now owns a real route, and this module is the single place that
 * knows how the two relate.
 *
 * Views still receive the same `{ view, params }` contract they always did —
 * `navigate()` simply pushes a URL now instead of setting state.
 */

export const LOGIN_ROUTE = "/login"
export const DEFAULT_ROUTE = "/dashboard"

/** Roles allowed to open a route. Mirrors the sidebar each role is given. */
export type RoleName = "ADMIN" | "LAWYER" | "STAFF" | "CLIENT"

const ALL_ROLES: RoleName[] = ["ADMIN", "LAWYER", "STAFF", "CLIENT"]

interface RouteDef {
  /** Path pattern; ":id" marks a dynamic segment. */
  pattern: string
  view: ViewKey
  /** Params merged in for every match (e.g. which tab a route pins). */
  fixedParams?: ViewParams
  roles: RoleName[]
}

/**
 * Order matters: the first match wins, so concrete paths precede dynamic ones.
 * `/payments`, `/profile` and `/users` are distinct URLs onto a tabbed view —
 * a tab someone can link to is a page, and should have its own address.
 */
export const ROUTES: RouteDef[] = [
  { pattern: "/dashboard", view: "dashboard", roles: ALL_ROLES },

  { pattern: "/cases", view: "cases", roles: ALL_ROLES },
  { pattern: "/cases/:id", view: "case-detail", roles: ALL_ROLES },

  { pattern: "/clients", view: "clients", roles: ["ADMIN", "STAFF", "LAWYER"] },
  { pattern: "/clients/:id", view: "clients", roles: ["ADMIN", "STAFF", "LAWYER"] },

  { pattern: "/lawyers", view: "lawyers", roles: ["ADMIN", "STAFF", "LAWYER"] },
  { pattern: "/lawyers/:id", view: "lawyers", roles: ["ADMIN", "STAFF", "LAWYER"] },

  { pattern: "/hearings", view: "hearings", roles: ALL_ROLES },
  { pattern: "/documents", view: "documents", roles: ALL_ROLES },

  // STAFF is excluded from money end to end — the API 403s them too.
  { pattern: "/billing", view: "billing", fixedParams: { tab: "invoices" }, roles: ["ADMIN", "LAWYER", "CLIENT"] },
  { pattern: "/payments", view: "billing", fixedParams: { tab: "payments" }, roles: ["ADMIN", "LAWYER", "CLIENT"] },

  { pattern: "/notifications", view: "notifications", roles: ALL_ROLES },
  { pattern: "/reports", view: "reports", roles: ["ADMIN"] },
  { pattern: "/audit", view: "audit", roles: ["ADMIN"] },

  { pattern: "/users", view: "settings", fixedParams: { tab: "users" }, roles: ["ADMIN"] },
  { pattern: "/profile", view: "settings", fixedParams: { tab: "account" }, roles: ALL_ROLES },
  { pattern: "/settings", view: "settings", roles: ALL_ROLES },
]

export interface RouteMatch {
  route: RouteDef
  params: ViewParams
}

/** Resolve a pathname to its route definition and path params. */
export function matchRoute(pathname: string): RouteMatch | null {
  const path = normalise(pathname)
  for (const route of ROUTES) {
    const params = matchPattern(route.pattern, path)
    if (params) return { route, params: { ...route.fixedParams, ...params } }
  }
  return null
}

function normalise(pathname: string): string {
  const trimmed = pathname.split("?")[0].split("#")[0]
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1)
  return trimmed || "/"
}

function matchPattern(pattern: string, path: string): ViewParams | null {
  const p = pattern.split("/").filter(Boolean)
  const a = path.split("/").filter(Boolean)
  if (p.length !== a.length) return null
  const params: ViewParams = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) {
      if (!a[i]) return null
      params[p[i].slice(1)] = decodeURIComponent(a[i])
    } else if (p[i] !== a[i]) {
      return null
    }
  }
  return params
}

/**
 * Build the URL for a view + params. This is what `navigate()` calls, so every
 * existing `navigate("case-detail", { id })` keeps working and now produces a
 * real, linkable address.
 */
export function hrefFor(view: ViewKey, params: ViewParams = {}): string {
  const { id, tab, ...rest } = params

  let path: string
  switch (view) {
    case "case-detail":
      path = id ? `/cases/${encodeURIComponent(id)}` : "/cases"
      break
    case "clients":
      path = id ? `/clients/${encodeURIComponent(id)}` : "/clients"
      break
    case "lawyers":
      path = id ? `/lawyers/${encodeURIComponent(id)}` : "/lawyers"
      break
    case "billing":
      path = tab === "payments" ? "/payments" : "/billing"
      break
    case "settings":
      // "users" and "account" have their own pages; the rest stay on
      // /settings?tab=… so they are still linkable and survive a refresh.
      path = tab === "users" ? "/users" : tab === "account" ? "/profile" : "/settings"
      if (path === "/settings" && tab) rest.tab = tab
      break
    default:
      path = `/${view}`
  }

  // Tabs that the path itself does not encode stay in the query string, so
  // they survive a refresh and can be linked (e.g. /cases/x?tab=hearings).
  const query = new URLSearchParams(rest as Record<string, string>)
  const pathEncodesTab = view === "billing" || view === "settings"
  if (tab && !pathEncodesTab) query.set("tab", tab)
  
  const qs = query.toString()
  return qs ? `${path}?${qs}` : path
}

/** May this role open this path? Unknown paths are left to Next's 404. */
export function canAccess(pathname: string, role: string | null | undefined): boolean {
  const match = matchRoute(pathname)
  if (!match) return true
  return match.route.roles.includes(role as RoleName)
}

/** Every path a role may open — used for nav building and tests. */
export function routesForRole(role: string): string[] {
  return ROUTES.filter((r) => r.roles.includes(role as RoleName)).map((r) => r.pattern)
}
