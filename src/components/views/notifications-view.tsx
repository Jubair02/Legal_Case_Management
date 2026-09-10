"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  FolderKanban,
  Info,
  Loader2,
  Receipt,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { Toolbar } from "@/components/shared/toolbar"
import { useApiData } from "@/hooks/use-api-data"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiSend } from "@/lib/api-client"
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/events"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import { hrefFor } from "@/lib/routes"
import type { NotificationDTO, ViewProps } from "@/lib/types"
import { cn, formatDate, formatRelativeDay } from "@/lib/utils"

const DHAKA = "Asia/Dhaka"
const ALL = "ALL"

/** Notification types, in the order they appear in the type filter. */
const TYPES = ["HEARING", "CASE", "BILLING", "INFO", "SYSTEM"] as const

const TYPE_META: Record<string, { icon: LucideIcon; plate: string; stripe: string }> = {
  HEARING: { icon: CalendarDays, plate: "bg-amber-50 text-amber-700 ring-amber-600/15", stripe: "bg-amber-400" },
  BILLING: { icon: Receipt, plate: "bg-teal-50 text-teal-700 ring-teal-600/15", stripe: "bg-teal-400" },
  CASE: { icon: FolderKanban, plate: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", stripe: "bg-emerald-500" },
  INFO: { icon: Info, plate: "bg-stone-100 text-stone-600 ring-stone-500/15", stripe: "bg-stone-300" },
  SYSTEM: { icon: Info, plate: "bg-stone-100 text-stone-600 ring-stone-500/15", stripe: "bg-stone-300" },
}

type Filter = "all" | "unread"

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: "all", labelKey: "common.all" },
  { key: "unread", labelKey: "notifications.unread" },
]

/* ------------------------------- date helpers ------------------------------- */

function dhakaDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/** "10:30 AM" in Dhaka — the row timestamp, once the day is already a heading. */
function dhakaTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d)
}

/**
 * "Today" / "Yesterday" / "04 Sept 2026" for a day heading. formatRelativeDay
 * falls back to the full date, so no date is ever printed twice.
 */
function dayHeading(iso: string, t: TranslateFn): string {
  const rel = formatRelativeDay(iso)
  if (rel === "Today") return t("common.today")
  if (rel === "Tomorrow") return t("common.tomorrow")
  if (rel === "Yesterday") return t("common.yesterday")
  return formatDate(iso)
}

/** Groups a feed into Dhaka days, newest first, newest-first within each day. */
function groupByDay(list: NotificationDTO[]): { key: string; date: string; items: NotificationDTO[] }[] {
  const map = new Map<string, NotificationDTO[]>()
  for (const n of list) {
    const key = dhakaDayKey(n.createdAt)
    const arr = map.get(key)
    if (arr) arr.push(n)
    else map.set(key, [n])
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([key, items]) => {
      const ordered = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      return { key, date: ordered[0].createdAt, items: ordered }
    })
}

/** The case id a notification points at, or null when it links nowhere. */
function linkedCaseId(n: NotificationDTO): string | null {
  if (!n.link || !n.link.startsWith("case-detail:")) return null
  return n.link.slice("case-detail:".length) || null
}

/* ---------------------------------- View ---------------------------------- */

export default function NotificationsView({ navigate }: ViewProps) {
  const { t } = useLanguage()
  const { data, loading, error, refetch } = useApiData<NotificationDTO[]>("/api/notifications?take=50")
  const [filter, setFilter] = useState<Filter>("all")
  const [typeFilter, setTypeFilter] = useState<string>(ALL)
  const [marking, setMarking] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const list = useMemo(() => data ?? [], [data])
  const unreadCount = useMemo(() => list.filter((n) => !n.isRead).length, [list])

  const shown = useMemo(() => {
    let rows = list
    if (filter === "unread") rows = rows.filter((n) => !n.isRead)
    if (typeFilter !== ALL) rows = rows.filter((n) => n.type === typeFilter)
    return rows
  }, [list, filter, typeFilter])

  const groups = useMemo(() => groupByDay(shown), [shown])

  const markAll = async () => {
    setMarking(true)
    try {
      await apiSend("POST", "/api/notifications/read-all")
      toast.success(t("notifications.markAllReadToast"))
      // Let the header badge know the unread count dropped to zero.
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("notifications.markAllReadFailed"))
    } finally {
      setMarking(false)
    }
  }

  /** Marks one notification read without navigating anywhere. */
  const markOne = async (n: NotificationDTO) => {
    setMarkingId(n.id)
    try {
      await apiSend("PATCH", `/api/notifications/${n.id}`, { isRead: true })
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("notifications.markReadFailed"))
    } finally {
      setMarkingId(null)
    }
  }

  /** Opening a linked notification marks it read on the way through. */
  const openLinked = (n: NotificationDTO, caseId: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // let the browser take it
    e.preventDefault()
    if (!n.isRead) {
      void apiSend("PATCH", `/api/notifications/${n.id}`, { isRead: true })
        .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)))
        .catch(() => {
          /* non-blocking: navigation still happens */
        })
    }
    navigate("case-detail", { id: caseId })
  }

  const clearAll = () => {
    setFilter("all")
    setTypeFilter(ALL)
  }

  const hasFilters = filter !== "all" || typeFilter !== ALL
  const loadingFirst = loading && !data

  /** One feed row. Only notifications that link somewhere become links. */
  const row = (n: NotificationDTO) => {
    const meta = TYPE_META[n.type] ?? TYPE_META.INFO
    const Icon = meta.icon
    const caseId = linkedCaseId(n)

    const body = (
      <>
        {!n.isRead ? (
          <span aria-hidden className={cn("absolute inset-y-2 left-0 w-[3px] rounded-full", meta.stripe)} />
        ) : null}

        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            meta.plate
          )}
        >
          <Icon className="h-4 w-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                n.isRead ? "font-medium text-foreground" : "font-semibold text-ink"
              )}
            >
              {n.title}
            </span>
            {/* Timestamp sits inline on wide rows, under the message on narrow ones. */}
            <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
              {dhakaTime(n.createdAt)}
            </span>
          </span>

          <span className="mt-0.5 block line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {n.message}
          </span>

          <span className="mt-1 flex items-center gap-2 sm:hidden">
            <span className="text-xs tabular-nums text-muted-foreground">{dhakaTime(n.createdAt)}</span>
            {!n.isRead ? (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                {t("notifications.unread")}
              </span>
            ) : null}
          </span>
        </span>
      </>
    )

    const shell =
      "relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors md:px-5"

    return (
      <li key={n.id} className={cn(!n.isRead && "bg-emerald-50/40")}>
        <div className="flex items-start">
          {caseId ? (
            <a
              href={hrefFor("case-detail", { id: caseId })}
              onClick={openLinked(n, caseId)}
              className={cn(
                shell,
                "group cursor-pointer hover:bg-paper-shade/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
              )}
            >
              {body}
              <ChevronRight
                aria-hidden
                className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brass-deep sm:block"
              />
            </a>
          ) : (
            <div className={shell}>{body}</div>
          )}

          {/* Reading something no longer requires navigating away from it. */}
          {!n.isRead ? (
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 mt-2.5 h-10 w-10 shrink-0 cursor-pointer text-muted-foreground hover:text-emerald-700"
              disabled={markingId === n.id}
              onClick={() => void markOne(n)}
              aria-label={t("notifications.markRead")}
              title={t("notifications.markRead")}
            >
              {markingId === n.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
          ) : null}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("notifications.title")} description={t("notifications.description")}>
        <Button
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={() => void markAll()}
          disabled={marking || unreadCount === 0}
        >
          {marking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          {t("notifications.markAllRead")}
        </Button>
      </PageHeader>

      {/* ------------------------------ Toolbar ------------------------------ */}
      <Toolbar
        note={
          shown.length > 0
            ? t(shown.length === 1 ? "notifications.countOne" : "notifications.countOther", {
                count: shown.length,
              })
            : undefined
        }
        action={
          hasFilters ? (
            <Button variant="ghost" size="sm" className="h-7 cursor-pointer" onClick={clearAll}>
              {t("notifications.clearFilters")}
            </Button>
          ) : undefined
        }
      >
        <div
          role="group"
          aria-label={t("notifications.filterAria")}
          className="-mx-1 flex overflow-x-auto px-1 pb-0.5"
        >
          <div className="inline-flex gap-1 rounded-lg bg-paper-shade p-1 ring-1 ring-border/70">
              {FILTERS.map((f) => {
                const active = filter === f.key
                const count = f.key === "unread" ? unreadCount : list.length
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      active
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:bg-card hover:text-foreground"
                    )}
                  >
                    {t(f.labelKey)}
                    {count > 0 ? <span className="text-xs tabular-nums opacity-75">{count}</span> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-48" aria-label={t("notifications.typeAll")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("notifications.typeAll")}</SelectItem>
              {TYPES.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {statusLabel(ty, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
      </Toolbar>

      {/* -------------------------------- Feed -------------------------------- */}
      {loadingFirst ? (
        <LoadingBlock rows={4} tiles={0} panels={1} />
      ) : error && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("notifications.loadFailed")}
          description={error}
          action={
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={t("notifications.allCaughtUp")}
          description={
            hasFilters ? t("notifications.noUnread") : t("notifications.emptyDescription")
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={clearAll}
              >
                {t("notifications.clearFilters")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g, i) => (
            <section key={g.key} style={{ "--d": `${Math.min(i, 6) * 50}ms` } as React.CSSProperties}>
              <div className="mb-2 flex items-center gap-2.5">
                <h2 className="u-eyebrow shrink-0 text-brass-deep">{dayHeading(g.date, t)}</h2>
                <span className="shrink-0 rounded-full bg-paper-shade px-1.5 text-[10px] font-bold tabular-nums text-muted-foreground ring-1 ring-border/70">
                  {g.items.length}
                </span>
                <span aria-hidden className="u-rule flex-1" />
              </div>

              <ul className="u-rise divide-y divide-border/60 overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
                {g.items.map(row)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
