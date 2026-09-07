"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCheck,
  FolderKanban,
  Info,
  Receipt,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { useApiData } from "@/hooks/use-api-data"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { apiSend } from "@/lib/api-client"
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/events"
import type { NotificationDTO, ViewProps } from "@/lib/types"
import { cn, formatDateTime } from "@/lib/utils"

const TYPE_META: Record<string, { icon: LucideIcon; className: string }> = {
  HEARING: { icon: CalendarDays, className: "bg-amber-100 text-amber-700" },
  BILLING: { icon: Receipt, className: "bg-teal-100 text-teal-700" },
  CASE: { icon: FolderKanban, className: "bg-emerald-100 text-emerald-700" },
  INFO: { icon: Info, className: "bg-stone-100 text-stone-600" },
  SYSTEM: { icon: Info, className: "bg-stone-100 text-stone-600" },
}

type Filter = "all" | "unread"

function TypeIcon({ type }: { type: string }) {
  const meta = TYPE_META[type] ?? TYPE_META.INFO
  const Icon = meta.icon
  return (
    <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", meta.className)}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

export default function NotificationsView({ navigate }: ViewProps) {
  const { data, loading, error, refetch } = useApiData<NotificationDTO[]>("/api/notifications?take=50")
  const [filter, setFilter] = useState<Filter>("all")
  const [marking, setMarking] = useState(false)

  const list = useMemo(() => data ?? [], [data])
  const unreadCount = list.filter((n) => !n.isRead).length
  const shown = filter === "unread" ? list.filter((n) => !n.isRead) : list

  const markAll = async () => {
    setMarking(true)
    try {
      await apiSend("POST", "/api/notifications/read-all")
      toast.success("All notifications marked as read")
      // Let the header badge know the unread count dropped to zero.
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark notifications as read.")
    } finally {
      setMarking(false)
    }
  }

  const openNotification = async (n: NotificationDTO) => {
    if (!n.isRead) {
      try {
        await apiSend("PATCH", `/api/notifications/${n.id}`, { isRead: true })
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT))
        refetch()
      } catch {
        // non-blocking: still allow navigation below
      }
    }
    if (n.link && n.link.startsWith("case-detail:")) {
      const id = n.link.slice("case-detail:".length)
      if (id) navigate("case-detail", { id })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Hearing reminders & case alerts">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void markAll()}
          disabled={marking || unreadCount === 0}
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </Button>
      </PageHeader>

      {/* Filter chips */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filter === "all"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          )}
        >
          All {list.length > 0 ? `(${list.length})` : ""}
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          aria-pressed={filter === "unread"}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            filter === "unread"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          )}
        >
          Unread {unreadCount > 0 ? `(${unreadCount})` : ""}
        </button>
      </div>

      {loading && !data ? (
        <LoadingBlock rows={4} />
      ) : error && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load notifications"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description={
            filter === "unread"
              ? "No unread notifications right now."
              : "New hearing reminders and case alerts will appear here."
          }
        />
      ) : (
        <Card className="gap-0 border-stone-200/80 py-0 shadow-sm">
          <div className="divide-y divide-stone-100">
            {shown.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openNotification(n)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-4 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-stone-50 md:px-6",
                  !n.isRead && "bg-emerald-50/60"
                )}
              >
                <TypeIcon type={n.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-sm", n.isRead ? "font-medium" : "font-bold text-foreground")}>
                      {n.title}
                    </p>
                    {!n.isRead ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="Unread" /> : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.message}</p>
                </div>
                <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
