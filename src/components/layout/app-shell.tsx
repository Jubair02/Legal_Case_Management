"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ComponentType } from "react"
import {
  BarChart3,
  Bell,
  CalendarDays,
  FileText,
  FolderKanban,
  Gavel,
  Home,
  Info,
  LogOut,
  Menu,
  Receipt,
  Scale,
  Settings,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

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
import { ROLE_LABELS } from "@/lib/constants"
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/events"
import { cn, formatDateTime, initials } from "@/lib/utils"
import type { NotificationDTO, SessionUser, ViewKey, ViewParams, ViewProps } from "@/lib/types"

import DashboardView from "@/components/dashboard/dashboard-view"
import BillingView from "@/components/views/billing-view"
import CaseDetailView from "@/components/views/case-detail-view"
import CasesView from "@/components/views/cases-view"
import ClientsView from "@/components/views/clients-view"
import DocumentsView from "@/components/views/documents-view"
import HearingsView from "@/components/views/hearings-view"
import LawyersView from "@/components/views/lawyers-view"
import NotificationsView from "@/components/views/notifications-view"
import ReportsView from "@/components/views/reports-view"
import SettingsView from "@/components/views/settings-view"

/* --------------------------- Navigation config --------------------------- */

interface NavItem {
  label: string
  icon: LucideIcon
  view: ViewKey
  params?: ViewParams
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const DASHBOARD_ITEM: NavItem = { label: "Dashboard", icon: Home, view: "dashboard" }

const NAV_GROUPS: Record<string, NavGroup[]> = {
  ADMIN: [
    { label: "Overview", items: [DASHBOARD_ITEM] },
    {
      label: "Case Management",
      items: [
        { label: "All Cases", icon: FolderKanban, view: "cases" },
        { label: "Clients", icon: Users, view: "clients" },
        { label: "Lawyers", icon: Gavel, view: "lawyers" },
        { label: "Hearings", icon: CalendarDays, view: "hearings" },
        { label: "Documents", icon: FileText, view: "documents" },
      ],
    },
    {
      label: "Office",
      items: [
        { label: "Billing", icon: Receipt, view: "billing" },
        { label: "Notifications", icon: Bell, view: "notifications" },
      ],
    },
    {
      label: "System",
      items: [
        { label: "Reports", icon: BarChart3, view: "reports" },
        { label: "Settings", icon: Settings, view: "settings" },
      ],
    },
  ],
  STAFF: [
    { label: "Overview", items: [DASHBOARD_ITEM] },
    {
      label: "Case Management",
      items: [
        { label: "Cases", icon: FolderKanban, view: "cases" },
        { label: "Clients", icon: Users, view: "clients" },
        { label: "Hearings", icon: CalendarDays, view: "hearings" },
        { label: "Documents", icon: FileText, view: "documents" },
      ],
    },
    { label: "Office", items: [{ label: "Notifications", icon: Bell, view: "notifications" }] },
    { label: "System", items: [{ label: "Settings", icon: Settings, view: "settings" }] },
  ],
  LAWYER: [
    { label: "Overview", items: [DASHBOARD_ITEM] },
    {
      label: "Case Management",
      items: [
        { label: "My Cases", icon: FolderKanban, view: "cases" },
        { label: "Hearings", icon: CalendarDays, view: "hearings" },
        { label: "Documents", icon: FileText, view: "documents" },
      ],
    },
    {
      label: "Office",
      items: [
        { label: "My Clients", icon: Users, view: "clients" },
        { label: "Billing", icon: Receipt, view: "billing", params: { tab: "invoices" } },
        { label: "Notifications", icon: Bell, view: "notifications" },
      ],
    },
    { label: "System", items: [{ label: "Settings", icon: Settings, view: "settings" }] },
  ],
  CLIENT: [
    { label: "Overview", items: [DASHBOARD_ITEM] },
    {
      label: "Case Management",
      items: [
        { label: "My Cases", icon: FolderKanban, view: "cases" },
        { label: "My Documents", icon: FileText, view: "documents" },
      ],
    },
    {
      label: "Office",
      items: [
        { label: "Invoices", icon: Receipt, view: "billing", params: { tab: "invoices" } },
        { label: "Payments", icon: Wallet, view: "billing", params: { tab: "payments" } },
        { label: "Notifications", icon: Bell, view: "notifications" },
      ],
    },
    { label: "System", items: [{ label: "Settings", icon: Settings, view: "settings" }] },
  ],
}

const FALLBACK_NAV: NavGroup[] = [{ label: "Overview", items: [DASHBOARD_ITEM] }]

const VIEW_TITLES: Record<ViewKey, string> = {
  dashboard: "Dashboard",
  cases: "Cases",
  "case-detail": "Case File",
  clients: "Clients",
  lawyers: "Lawyers",
  hearings: "Hearings",
  documents: "Documents",
  billing: "Billing & Invoices",
  notifications: "Notifications",
  reports: "Reports",
  settings: "Settings",
}

function navGroupsFor(role: string): NavGroup[] {
  return NAV_GROUPS[role] ?? FALLBACK_NAV
}

function isItemActive(item: NavItem, view: ViewKey, params: ViewParams): boolean {
  if (item.view !== view) return false
  return (item.params?.tab ?? "") === (params.tab ?? "")
}

/* ------------------------------ View registry ------------------------------ */

const VIEW_REGISTRY: Record<ViewKey, ComponentType<ViewProps>> = {
  dashboard: DashboardView,
  cases: CasesView,
  "case-detail": CaseDetailView,
  clients: ClientsView,
  lawyers: LawyersView,
  hearings: HearingsView,
  documents: DocumentsView,
  billing: BillingView,
  notifications: NotificationsView,
  reports: ReportsView,
  settings: SettingsView,
}

/* ---------------------------- Notification bell ---------------------------- */

const NOTIF_TYPE_STYLES: Record<string, { icon: LucideIcon; className: string }> = {
  HEARING: { icon: CalendarDays, className: "bg-amber-100 text-amber-700" },
  BILLING: { icon: Receipt, className: "bg-teal-100 text-teal-700" },
  CASE: { icon: FolderKanban, className: "bg-emerald-100 text-emerald-700" },
  INFO: { icon: Info, className: "bg-stone-100 text-stone-600" },
}

function NotificationBell({ navigate }: { navigate: (view: ViewKey, params?: ViewParams) => void }) {
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
      toast.error(e instanceof Error ? e.message : "Could not load notifications.")
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
      toast.success("All notifications marked as read.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark notifications as read.")
    }
  }, [])
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) void fetchItems()
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 ? (
            <Badge className="bg-rose-600 text-white hover:bg-rose-600">{count} new</Badge>
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
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications</p>
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
                    "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-stone-50",
                    !n.isRead && "bg-emerald-50"
                  )}
                >
                  <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", style.className)}>
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
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => void markAllRead()}>
            Mark all as read
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------ Sidebar pieces ------------------------------ */

function SidebarBrand() {
  return (
    <div className="flex items-center gap-3 px-5 pb-2 pt-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-md shadow-emerald-950/50">
        <Scale className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-tight text-white">AinSheba</span>
        <span className="block truncate text-xs text-emerald-200/60">আইনসেবা · Case Management</span>
      </span>
    </div>
  )
}

function SidebarNav({
  groups,
  activeView,
  viewParams,
  onNavigate,
}: {
  groups: NavGroup[]
  activeView: ViewKey
  viewParams: ViewParams
  onNavigate: (view: ViewKey, params?: ViewParams) => void
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1 pt-4 text-[11px] uppercase tracking-wider text-emerald-200/50">{group.label}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isItemActive(item, activeView, viewParams)
              const Icon = item.icon
              return (
                <button
                  key={`${item.view}:${item.label}`}
                  type="button"
                  onClick={() => onNavigate(item.view, item.params)}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active ? "bg-white/10 text-white" : "text-emerald-50/75 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-amber-400"
                    />
                  ) : null}
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function SidebarUserBlock({
  user,
  onLogout,
}: {
  user: SessionUser
  onLogout: () => void | Promise<void>
}) {
  return (
    <div className="border-t border-emerald-900/60 p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9 border border-emerald-800">
          <AvatarFallback className="bg-emerald-600 text-xs font-semibold text-white">
            {initials(user.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-emerald-200/60">{ROLE_LABELS[user.role] ?? user.role}</p>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          title="Log out"
          aria-label="Log out"
          className="rounded-md p-2 text-emerald-200/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function UserMenu({ user, onLogout }: { user: SessionUser; onLogout: () => void | Promise<void> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="rounded-full outline-none ring-ring/50 transition focus-visible:ring-[3px]"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-emerald-600 text-xs font-semibold text-white">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs font-medium text-emerald-700">{ROLE_LABELS[user.role] ?? user.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void onLogout()} className="text-rose-600 focus:text-rose-700">
          <LogOut className="h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* -------------------------------- App shell -------------------------------- */

export interface AppShellProps {
  user: SessionUser
  onLogout: () => void | Promise<void>
}

export function AppShell({ user, onLogout }: AppShellProps) {
  const [activeView, setActiveView] = useState<ViewKey>("dashboard")
  const [viewParams, setViewParams] = useState<ViewParams>({})
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const mainRef = useRef<HTMLElement | null>(null)

  const groups = useMemo(() => navGroupsFor(user.role), [user.role])
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups])

  const navigate = useCallback((view: ViewKey, params?: ViewParams) => {
    setActiveView(view)
    setViewParams(params ?? {})
    setMobileNavOpen(false)
    requestAnimationFrame(() => {
      mainRef.current?.scrollTo({ top: 0 })
    })
  }, [])

  const pageTitle = useMemo(() => {
    const match = flatItems.find((it) => isItemActive(it, activeView, viewParams))
    if (match) return match.label
    return VIEW_TITLES[activeView] ?? "AinSheba"
  }, [flatItems, activeView, viewParams])

  const ActiveView = VIEW_REGISTRY[activeView] ?? DashboardView

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-emerald-950 text-emerald-50/90 md:flex">
        <SidebarBrand />
        <SidebarNav groups={groups} activeView={activeView} viewParams={viewParams} onNavigate={navigate} />
        <SidebarUserBlock user={user} onLogout={onLogout} />
      </aside>

      {/* Mobile navigation sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          className="w-72 border-emerald-900/60 bg-emerald-950 p-0 text-emerald-50/90 [&>button]:text-emerald-100"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation for AinSheba</SheetDescription>
          <SidebarBrand />
          <SidebarNav groups={groups} activeView={activeView} viewParams={viewParams} onNavigate={navigate} />
          <SidebarUserBlock user={user} onLogout={onLogout} />
        </SheetContent>
      </Sheet>

      {/* Content column */}
      <div className="flex h-screen flex-col md:ml-64">
        <header className="sticky top-0 z-30 shrink-0 border-b border-stone-200/80 bg-white/80 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2 md:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white">
                <Scale className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">AinSheba</span>
            </div>
            <h2 className="hidden truncate text-sm font-semibold tracking-tight md:block md:text-base">{pageTitle}</h2>
            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell navigate={navigate} />
              <UserMenu user={user} onLogout={onLogout} />
            </div>
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col p-4 md:p-6">
            <ActiveView user={user} navigate={navigate} params={viewParams} />
            <footer className="mt-auto pt-6 text-center">
              <p className="text-xs text-muted-foreground">
                © 2026 AinSheba · আইনসেবা — Legal Case Management for Bangladesh
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/70">Built for chambers, advocates & clients</p>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
