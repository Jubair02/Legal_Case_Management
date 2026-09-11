"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3,
  Bell,
  CalendarDays,
  FileText,
  FolderKanban,
  Gavel,
  Home,
  Info,
  Languages,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { BrandMark } from "@/components/shared/brand-mark"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { apiGet, apiSend } from "@/lib/api-client"
import { statusLabel, useLanguage } from "@/lib/i18n/language"
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/events"
import { hrefFor, matchRoute } from "@/lib/routes"
import { cn, formatDateTime, initials } from "@/lib/utils"
import type { NotificationDTO, SessionUser, ViewKey, ViewParams } from "@/lib/types"


/* --------------------------- Navigation config --------------------------- */

interface NavItem {
  /** i18n key under `nav.*` — resolved with t() at render time. */
  labelKey: string
  icon: LucideIcon
  view: ViewKey
  params?: ViewParams
}

interface NavGroup {
  labelKey: string
  items: NavItem[]
}

const DASHBOARD_ITEM: NavItem = { labelKey: "nav.dashboard", icon: Home, view: "dashboard" }

const NAV_GROUPS: Record<string, NavGroup[]> = {
  ADMIN: [
    { labelKey: "nav.overview", items: [DASHBOARD_ITEM] },
    {
      labelKey: "nav.caseManagement",
      items: [
        { labelKey: "nav.allCases", icon: FolderKanban, view: "cases" },
        { labelKey: "nav.clients", icon: Users, view: "clients" },
        { labelKey: "nav.lawyers", icon: Gavel, view: "lawyers" },
        { labelKey: "nav.hearings", icon: CalendarDays, view: "hearings" },
        { labelKey: "nav.documents", icon: FileText, view: "documents" },
      ],
    },
    {
      labelKey: "nav.office",
      items: [
        { labelKey: "nav.billing", icon: Receipt, view: "billing" },
        { labelKey: "nav.notifications", icon: Bell, view: "notifications" },
      ],
    },
    {
      labelKey: "nav.system",
      items: [
        { labelKey: "nav.reports", icon: BarChart3, view: "reports" },
        { labelKey: "nav.auditLog", icon: ScrollText, view: "audit" },
      ],
    },
  ],
  STAFF: [
    { labelKey: "nav.overview", items: [DASHBOARD_ITEM] },
    {
      labelKey: "nav.caseManagement",
      items: [
        { labelKey: "nav.cases", icon: FolderKanban, view: "cases" },
        { labelKey: "nav.clients", icon: Users, view: "clients" },
        { labelKey: "nav.hearings", icon: CalendarDays, view: "hearings" },
        { labelKey: "nav.documents", icon: FileText, view: "documents" },
      ],
    },
    { labelKey: "nav.office", items: [{ labelKey: "nav.notifications", icon: Bell, view: "notifications" }] },
  ],
  LAWYER: [
    { labelKey: "nav.overview", items: [DASHBOARD_ITEM] },
    {
      labelKey: "nav.caseManagement",
      items: [
        { labelKey: "nav.myCases", icon: FolderKanban, view: "cases" },
        { labelKey: "nav.hearings", icon: CalendarDays, view: "hearings" },
        { labelKey: "nav.documents", icon: FileText, view: "documents" },
      ],
    },
    {
      labelKey: "nav.office",
      items: [
        { labelKey: "nav.myClients", icon: Users, view: "clients" },
        { labelKey: "nav.billing", icon: Receipt, view: "billing", params: { tab: "invoices" } },
        { labelKey: "nav.notifications", icon: Bell, view: "notifications" },
      ],
    },
  ],
  CLIENT: [
    { labelKey: "nav.overview", items: [DASHBOARD_ITEM] },
    {
      labelKey: "nav.caseManagement",
      items: [
        { labelKey: "nav.myCases", icon: FolderKanban, view: "cases" },
        { labelKey: "nav.myDocuments", icon: FileText, view: "documents" },
      ],
    },
    {
      labelKey: "nav.office",
      items: [
        { labelKey: "nav.invoices", icon: Receipt, view: "billing", params: { tab: "invoices" } },
        { labelKey: "nav.payments", icon: Wallet, view: "billing", params: { tab: "payments" } },
        { labelKey: "nav.notifications", icon: Bell, view: "notifications" },
      ],
    },
  ],
}

const FALLBACK_NAV: NavGroup[] = [{ labelKey: "nav.overview", items: [DASHBOARD_ITEM] }]

/** ViewKey → nav.* title key (used when no nav item matches, e.g. case-detail). */
const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: "nav.dashboard",
  cases: "nav.cases",
  "case-detail": "nav.caseFile",
  clients: "nav.clients",
  lawyers: "nav.lawyers",
  hearings: "nav.hearings",
  documents: "nav.documents",
  billing: "nav.billingAndInvoices",
  notifications: "nav.notifications",
  reports: "nav.reports",
  settings: "nav.settings",
  audit: "nav.auditLog",
}

function navGroupsFor(role: string): NavGroup[] {
  return NAV_GROUPS[role] ?? FALLBACK_NAV
}

/**
 * Highlight by URL rather than by view+tab. Two nav items can share a view
 * (Billing/Payments, Settings/Profile/Users) and detail pages should light up
 * their parent, so comparing the resolved paths is both simpler and correct.
 */
function isItemActive(item: NavItem, pathname: string): boolean {
  const href = hrefFor(item.view, item.params).split("?")[0]
  if (pathname === href) return true
  return href !== "/" && pathname.startsWith(href + "/")
}

/* ---------------------------- Notification bell ---------------------------- */

const NOTIF_TYPE_STYLES: Record<string, { icon: LucideIcon; className: string }> = {
  HEARING: { icon: CalendarDays, className: "bg-amber-50 text-amber-700 ring-amber-600/15" },
  BILLING: { icon: Receipt, className: "bg-teal-50 text-teal-700 ring-teal-600/15" },
  CASE: { icon: FolderKanban, className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  INFO: { icon: Info, className: "bg-stone-100 text-stone-600 ring-stone-500/15" },
}

function NotificationBell({ navigate }: { navigate: (view: ViewKey, params?: ViewParams) => void }) {
  const { t } = useLanguage()
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationDTO[]>([])
  const [loading, setLoading] = useState(false)

  // unread badge — poll every 60s
  useEffect(() => {
    let active = true
    const loadCount = async () => {
      try {
        const res = await apiGet<{ count: number }>("/api/notifications/unread-count")
        if (active && typeof res?.count === "number") setCount(res.count)
      } catch {
        /* silent — polling must not spam toasts */
      }
    }
    void loadCount()
    const timer = setInterval(loadCount, 60_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<NotificationDTO[]>("/api/notifications?take=8")
      setItems(res ?? [])
      // Badge count stays driven by the dedicated unread-count endpoint —
      // the dropdown list only shows the latest 8 items.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("notifications.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshCount = useCallback(async () => {
    try {
      const res = await apiGet<{ count: number }>("/api/notifications/unread-count")
      if (typeof res?.count === "number") setCount(res.count)
    } catch {
      /* silent */
    }
  }, [])

  // Other surfaces (the full Notifications page) mark items read too — listen
  // for their signal so the badge never goes stale until the next poll.
  useEffect(() => {
    const handler = () => void refreshCount()
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler)
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler)
  }, [refreshCount])

  const handleClick = useCallback(
    async (n: NotificationDTO) => {
      if (!n.isRead) {
        try {
          await apiSend<NotificationDTO>("PATCH", `/api/notifications/${n.id}`, { isRead: true })
          setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, isRead: true } : p)))
          void refreshCount()
        } catch {
          /* ignore */
        }
      }
      if (n.link && n.link.startsWith("case-detail:")) {
        const id = n.link.slice("case-detail:".length)
        if (id) {
          setOpen(false)
          navigate("case-detail", { id })
        }
      }
    },
    [navigate, refreshCount]
  )

  const markAllRead = useCallback(async () => {
    try {
      await apiSend<{ ok: boolean }>("POST", "/api/notifications/read-all")
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setCount(0)
      toast.success(t("notifications.markAllReadToast"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("notifications.markAllReadFailed"))
    }
  }, [t])
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) void fetchItems()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 cursor-pointer sm:h-9 sm:w-9"
          aria-label={t("nav.notifications")}
        >
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-paper">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <p className="font-serif text-base font-semibold tracking-tight text-ink">
            {t("notifications.title")}
          </p>
          {count > 0 ? (
            <Badge className="bg-rose-600 text-white hover:bg-rose-600">{t("notifications.countNew", { count })}</Badge>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
          ) : (
            items.map((n) => {
              const style = NOTIF_TYPE_STYLES[n.type] ?? NOTIF_TYPE_STYLES.INFO
              const Icon = style.icon
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void handleClick(n)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-paper-shade/70",
                    !n.isRead && "bg-emerald-50/50"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                      style.className
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">{formatDateTime(n.createdAt)}</span>
                  </span>
                  {!n.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" /> : null}
                </button>
              )
            })
          )}
        </div>
        <div className="flex items-center gap-1 border-t border-border/70 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 cursor-pointer text-xs"
            disabled={count === 0}
            onClick={() => void markAllRead()}
          >
            {t("notifications.markAllRead")}
          </Button>
          {/* The dropdown only holds the latest 8 — the full feed is a page. */}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 cursor-pointer text-xs text-brass-deep"
            onClick={() => {
              setOpen(false)
              navigate("notifications")
            }}
          >
            {t("common.viewAll")}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------ Sidebar pieces ------------------------------ */

function SidebarBrand() {
  const { t } = useLanguage()
  return (
    <div className="relative z-10 flex items-center gap-3 px-5 pb-3 pt-5">
      <BrandMark className="h-10 w-10 shrink-0 shadow-seal" />
      <span className="min-w-0">
        {/* u-wordmark keeps the Latin mark in the serif even under html[lang="bn"]. */}
        <span className="u-wordmark block text-lg font-semibold leading-none tracking-tight text-white">
          {t("common.appName")}
        </span>
        <span className="mt-1 block truncate text-[11px] text-emerald-200/55">{t("shell.brandSub")}</span>
      </span>
    </div>
  )
}

function SidebarNav({
  groups,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[]
  pathname: string
  onNavigate: (view: ViewKey, params?: ViewParams) => void
}) {
  const { t } = useLanguage()
  return (
    <nav className="relative z-10 flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((group) => (
        <div key={group.labelKey}>
          <p className="u-eyebrow px-3 pb-1.5 pt-4 text-emerald-200/45">{t(group.labelKey)}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isItemActive(item, pathname)
              const Icon = item.icon
              return (
                <button
                  key={`${item.view}:${item.labelKey}`}
                  type="button"
                  onClick={() => onNavigate(item.view, item.params)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass/60",
                    active
                      ? "bg-white/10 font-medium text-white"
                      : "text-emerald-50/75 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {/* Brass is the accent of the system — the scales' metal. */}
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brass shadow-[0_0_10px_0] shadow-brass/50"
                    />
                  ) : null}
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-brass")} />
                  <span className="truncate">{t(item.labelKey)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

/**
 * Identity, settings and sign-out live here at every breakpoint, so the
 * sidebar carries navigation only — it ends with the last nav group, and
 * Settings is no longer a nav item competing with the day's work.
 */
function UserMenu({
  user,
  onLogout,
  navigate,
}: {
  user: SessionUser
  onLogout: () => void | Promise<void>
  navigate: (view: ViewKey, params?: ViewParams) => void
}) {
  const { t } = useLanguage()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("shell.accountMenu")}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full outline-none ring-ring/50 transition focus-visible:ring-[3px] sm:h-9 sm:w-9"
        >
          <Avatar className="h-8 w-8 ring-1 ring-inset ring-emerald-900/15">
            <AvatarFallback className="bg-emerald-600 text-xs font-bold text-white">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="u-eyebrow mt-1.5 text-brass-deep">{statusLabel(user.role, t)}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("settings")}>
          <Settings className="h-4 w-4" />
          {t("nav.settings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void onLogout()}
          className="cursor-pointer text-rose-600 focus:bg-rose-50 focus:text-rose-700"
        >
          <LogOut className="h-4 w-4" />
          {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* -------------------------------- App shell -------------------------------- */

export interface AppShellProps {
  user: SessionUser
  onLogout: () => void | Promise<void>
  /** The routed page. The shell is chrome now; the router picks the view. */
  children: React.ReactNode
}

export function AppShell({ user, onLogout, children }: AppShellProps) {
  const { lang, setLang, t } = useLanguage()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  // Which nav item is current comes from the URL, not from state — so a
  // refresh, a pasted link and Back/Forward all highlight the right item.
  const matched = useMemo(() => matchRoute(pathname), [pathname])
  const activeView: ViewKey = matched?.route.view ?? "dashboard"
  const activeParams: ViewParams = useMemo(() => matched?.params ?? {}, [matched])

  const groups = useMemo(() => navGroupsFor(user.role), [user.role])
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const navigate = useCallback(
    (view: ViewKey, params?: ViewParams) => {
      setMobileNavOpen(false)
      router.push(hrefFor(view, params))
    },
    [router]
  )

  // Each navigation starts at the top of the page, as a document would.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  const pageTitle = useMemo(() => {
    const match = flatItems.find((it) => isItemActive(it, pathname))
    if (match) return t(match.labelKey)
    return t(VIEW_TITLES[activeView] ?? "common.appName")
  }, [flatItems, pathname, activeView, t])

  return (
    <div className="u-paper min-h-screen">
      {/* Keyboard users should not have to walk the whole sidebar every page. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lift"
      >
        {t("shell.skipToContent")}
      </a>

      {/* Desktop sidebar — the forest ground and engraved weave of the system. */}
      <aside className="u-forest u-engrave fixed inset-y-0 left-0 z-40 bg-forest-deep hidden w-64 flex-col overflow-hidden border-r border-forest-deep/50 text-emerald-50/90 md:flex">
        <SidebarBrand />
        <SidebarNav groups={groups} pathname={pathname} onNavigate={navigate} />
      </aside>

      {/* Mobile navigation sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="u-forest u-engrave flex w-[min(18rem,85vw)] bg-forest-deep flex-col overflow-hidden border-forest-deep/50 p-0 text-emerald-50/90 [&>button]:z-10 [&>button]:text-emerald-100"
        >
          <SheetTitle className="sr-only">{t("shell.navigation")}</SheetTitle>
          <SheetDescription className="sr-only">{t("shell.mainNavigation")}</SheetDescription>

          {/* Brand first, then nav, then the language switch — it belongs with
              the controls at the foot of the drawer, not above the masthead.
              Identity and sign-out are in the header's account menu. */}
          <SidebarBrand />
          <SidebarNav groups={groups} pathname={pathname} onNavigate={navigate} />
          <div className="relative z-10 shrink-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full cursor-pointer gap-2 border-white/20 bg-white/5 text-xs font-medium text-emerald-50 hover:bg-white/10 hover:text-white"
              aria-label={t("common.language")}
              onClick={() => setLang(lang === "en" ? "bn" : "en")}
            >
              <Languages className="h-4 w-4" />
              {lang === "en" ? "বাংলা" : "English"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Content column */}
      <div className="flex h-screen flex-col md:ml-64">
        <header className="sticky top-0 z-30 shrink-0 border-b border-border/70 bg-paper/80 backdrop-blur-xl supports-[backdrop-filter]:bg-paper/65">
          <div className="flex h-14 items-center gap-2 px-3 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 cursor-pointer md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t("shell.openMenu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <BrandMark className="h-7 w-7 shrink-0" />
              <span className="u-wordmark truncate text-base font-semibold tracking-tight text-ink">
                {t("common.appName")}
              </span>
            </div>
            {/* A location label, not a heading — every page renders its own h1
                just below, so this must not compete in the outline. */}
            <p className="u-eyebrow hidden truncate text-muted-foreground md:block">{pageTitle}</p>

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-10 cursor-pointer px-0 text-xs font-medium sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2.5"
                aria-label={t("common.language")}
                onClick={() => setLang(lang === "en" ? "bn" : "en")}
              >
                <Languages className="h-4 w-4" />
                <span className="hidden sm:inline">{lang === "en" ? "বাংলা" : "English"}</span>
              </Button>
              <NotificationBell navigate={navigate} />
              <UserMenu user={user} onLogout={onLogout} navigate={navigate} />
            </div>
          </div>
        </header>

        <main id="main-content" ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col p-4 md:p-6">
            {children}
            <footer className="mt-auto pt-10">
              <span aria-hidden className="u-rule mx-auto block max-w-xs" />
              <p className="mt-4 text-center text-xs text-muted-foreground">
                © 2026 <span className="u-wordmark font-medium">{t("common.appName")}</span> · আইনসেবা —{" "}
                {t("shell.footerTagline")}
              </p>
              <p className="mt-1 text-center text-[11px] text-muted-foreground/70">
                {t("shell.footerBuiltFor")}
              </p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
