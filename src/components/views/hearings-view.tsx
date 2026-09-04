"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock,
  Search,
} from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { apiGet, apiSend } from "@/lib/api-client"
import { HEARING_STATUS_LABELS, HEARING_STATUSES, HEARING_TYPES } from "@/lib/constants"
import type { CaseListDTO, HearingDTO, ViewProps } from "@/lib/types"
import { cn, formatDate, formatRelativeDay, hearingStatusStyles, toDateInputValue } from "@/lib/utils"

type HearingFilter = "today" | "upcoming" | "past" | "all"

const FILTERS: { key: HearingFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
]

const EMPTY_BY_FILTER: Record<HearingFilter, { title: string; description: string }> = {
  today: { title: "No hearings today", description: "Nothing on the cause list for today." },
  upcoming: { title: "No upcoming hearings", description: "New hearings will appear here as they are scheduled." },
  past: { title: "No past hearings", description: "Completed and adjourned hearings will appear here." },
  all: { title: "No hearings", description: "Schedule a hearing to see it on the court calendar." },
}

/** Dhaka-timezone "10:30 AM" for hearing timestamps. */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d)
}

/** "THURSDAY" weekday label in Asia/Dhaka. */
function weekdayUpper(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", weekday: "long" })
    .format(d)
    .toUpperCase()
}

/** Stable Dhaka-day key for grouping ("2026-02-12"). */
function dhakaDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function groupByDay(list: HearingDTO[]): { key: string; date: string; hearings: HearingDTO[] }[] {
  const map = new Map<string, HearingDTO[]>()
  for (const h of list) {
    const key = dhakaDayKey(h.hearingDate)
    const arr = map.get(key)
    if (arr) arr.push(h)
    else map.set(key, [h])
  }
  return Array.from(map.entries()).map(([key, hearings]) => ({ key, date: hearings[0].hearingDate, hearings }))
}

/* -------------------------------- Hearing card -------------------------------- */

function HearingCard({
  hearing,
  canUpdate,
  navigate,
  onUpdate,
}: {
  hearing: HearingDTO
  canUpdate: boolean
  navigate: ViewProps["navigate"]
  onUpdate: (h: HearingDTO) => void
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white p-3 transition-colors hover:border-emerald-300 md:p-4">
      <div className="flex gap-3">
        <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-50 py-2 text-emerald-800">
          <Clock className="mb-0.5 h-3.5 w-3.5" />
          <span className="text-xs font-bold leading-tight">{formatTime(hearing.hearingDate)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <button
              type="button"
              onClick={() => navigate("case-detail", { id: hearing.caseId })}
              className="group min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-1 text-sm font-semibold leading-tight group-hover:text-emerald-700">
                {hearing.caseNumber}
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-300 transition-colors group-hover:text-emerald-600" />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground group-hover:text-emerald-700">
                {hearing.caseTitle}
              </span>
            </button>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {hearing.hearingType ? (
                <Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                  {hearing.hearingType}
                </Badge>
              ) : null}
              <StatusBadge map={hearingStatusStyles} value={hearing.status} />
            </div>
          </div>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">
            {hearing.court ?? "Court —"}
            {hearing.judge ? ` · ${hearing.judge}` : ""}
          </p>
          {hearing.notes ? <p className="mt-1 line-clamp-1 text-xs text-stone-500">{hearing.notes}</p> : null}
        </div>
      </div>
      {canUpdate ? (
        <div className="mt-2 flex justify-end border-t border-stone-100 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            onClick={() => onUpdate(hearing)}
          >
            Update
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------- Schedule hearing dialog ---------------------------- */

export interface ScheduleHearingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

/** Creates a hearing via POST /api/cases/[caseId]/hearings (case picked from active cases). */
export function ScheduleHearingDialog({ open, onOpenChange, onSaved }: ScheduleHearingDialogProps) {
  const [cases, setCases] = useState<CaseListDTO[] | null>(null)
  const [casesLoading, setCasesLoading] = useState(false)
  const [caseQuery, setCaseQuery] = useState("")
  const [selectedCase, setSelectedCase] = useState<CaseListDTO | null>(null)
  const [date, setDate] = useState("")
  const [type, setType] = useState("__none__")
  const [judge, setJudge] = useState("")
  const [court, setCourt] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    // reset form on every open
    setSelectedCase(null)
    setCaseQuery("")
    setDate("")
    setType("__none__")
    setJudge("")
    setCourt("")
    setNotes("")
    setPending(false)

    let active = true
    setCasesLoading(true)
    apiGet<CaseListDTO[]>("/api/cases?view=active")
      .then((list) => {
        if (active) setCases(list ?? [])
      })
      .catch((e) => {
        if (active) {
          setCases([])
          toast.error(e instanceof Error ? e.message : "Could not load the case list.")
        }
      })
      .finally(() => {
        if (active) setCasesLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  const candidateCases = useMemo(() => {
    const list = cases ?? []
    const q = caseQuery.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) =>
      [c.caseNumber, c.title, c.client?.name ?? ""].some((v) => v.toLowerCase().includes(q))
    )
  }, [cases, caseQuery])

  const submit = async () => {
    if (!selectedCase) {
      toast.error("Select the case this hearing belongs to.")
      return
    }
    if (!date) {
      toast.error("Hearing date is required.")
      return
    }
    try {
      setPending(true)
      await apiSend<HearingDTO>("POST", `/api/cases/${selectedCase.id}/hearings`, {
        hearingDate: date,
        hearingType: type === "__none__" ? null : type,
        court: court.trim() || null,
        judge: judge.trim() || null,
        notes: notes.trim() || null,
      })
      toast.success(`Hearing scheduled for ${selectedCase.caseNumber}.`)
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the hearing.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule hearing</DialogTitle>
          <DialogDescription>Pick an active case and set the court date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Case <span className="text-rose-500">*</span>
            </Label>
            {selectedCase ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-emerald-900">{selectedCase.caseNumber}</p>
                  <p className="truncate text-xs text-emerald-800/80">{selectedCase.title}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCase(null)} disabled={pending}>
                  Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={caseQuery}
                    onChange={(e) => setCaseQuery(e.target.value)}
                    placeholder="Search active cases…"
                    className="pl-8"
                  />
                </div>
                <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-stone-200 p-1">
                  {casesLoading ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading cases…</p>
                  ) : candidateCases.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      {cases && cases.length === 0 ? "No active cases found." : "No cases match your search."}
                    </p>
                  ) : (
                    candidateCases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCase(c)}
                        className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-emerald-50"
                      >
                        <p className="text-sm font-semibold text-emerald-800">{c.caseNumber}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.title} · {c.client?.name ?? "—"}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hearing-date">
                Hearing date <span className="text-rose-500">*</span>
              </Label>
              <Input id="hearing-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hearing-type">Hearing type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="hearing-type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not specified</SelectItem>
                  {HEARING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hearing-court">Court</Label>
            <Input id="hearing-court" value={court} onChange={(e) => setCourt(e.target.value)} placeholder="Defaults to case court" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hearing-judge">Judge</Label>
            <Input id="hearing-judge" value={judge} onChange={(e) => setJudge(e.target.value)} placeholder="e.g. Justice A. K. M. Fazlul Karim" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hearing-notes">Notes</Label>
            <Textarea
              id="hearing-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the chamber should prepare for"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <CalendarPlus className="h-4 w-4" /> {pending ? "Scheduling…" : "Schedule hearing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ----------------------------- Hearing update dialog ----------------------------- */

export interface HearingUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The hearing being updated (required when open). */
  hearing: HearingDTO | null
  onSaved: () => void
}

/** Records the outcome of a hearing via PATCH /api/hearings/[id]. */
export function HearingUpdateDialog({ open, onOpenChange, hearing, onSaved }: HearingUpdateDialogProps) {
  const [status, setStatus] = useState("UPCOMING")
  const [summary, setSummary] = useState("")
  const [courtOrder, setCourtOrder] = useState("")
  const [nextAction, setNextAction] = useState("")
  const [nextHearingDate, setNextHearingDate] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open || !hearing) return
    setStatus(hearing.status && HEARING_STATUS_LABELS[hearing.status] ? hearing.status : "UPCOMING")
    setSummary(hearing.summary ?? "")
    setCourtOrder(hearing.courtOrder ?? "")
    setNextAction(hearing.nextAction ?? "")
    setNextHearingDate(toDateInputValue(hearing.nextHearingDate))
    setPending(false)
  }, [open, hearing])

  const submit = async () => {
    if (!hearing) return
    try {
      setPending(true)
      await apiSend<HearingDTO>("PATCH", `/api/hearings/${hearing.id}`, {
        status,
        summary: summary.trim() || null,
        courtOrder: courtOrder.trim() || null,
        nextAction: nextAction.trim() || null,
        nextHearingDate: nextHearingDate || null,
      })
      toast.success(`Hearing updated for ${hearing.caseNumber}.`)
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the hearing.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update hearing</DialogTitle>
          <DialogDescription>
            {hearing ? `${hearing.caseNumber} · ${formatDate(hearing.hearingDate)}` : "Record the hearing outcome."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="update-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="update-status" className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {HEARING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {HEARING_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="update-summary">Summary</Label>
            <Textarea
              id="update-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What happened in court today"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="update-order">Court order</Label>
            <Textarea
              id="update-order"
              value={courtOrder}
              onChange={(e) => setCourtOrder(e.target.value)}
              placeholder="Order passed by the court, if any"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="update-next-action">Next action</Label>
            <Input
              id="update-next-action"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Prepare written statement"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="update-next-date">Next hearing date</Label>
            <Input id="update-next-date" type="date" value={nextHearingDate} onChange={(e) => setNextHearingDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Setting a date on a completed or adjourned hearing creates the next upcoming hearing automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function HearingsView({ user, navigate }: ViewProps) {
  const canSchedule = user.role === "ADMIN" || user.role === "STAFF"
  const canUpdate = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LAWYER"

  const [filter, setFilter] = useState<HearingFilter>("today")
  const { data, loading, error, refetch } = useApiData<HearingDTO[]>(`/api/hearings?filter=${filter}`)

  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [updateTarget, setUpdateTarget] = useState<HearingDTO | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)

  const hearings = useMemo(() => data ?? [], [data])
  const groups = useMemo(
    () => (filter === "today" ? [] : groupByDay(hearings)),
    [filter, hearings]
  )
  const todayGroup = useMemo(() => (filter === "today" ? groupByDay(hearings) : []), [filter, hearings])

  const openUpdate = (h: HearingDTO) => {
    setUpdateTarget(h)
    setUpdateOpen(true)
  }

  const renderCards = (list: HearingDTO[]) => (
    <div className="space-y-3">
      {list.map((h) => (
        <HearingCard key={h.id} hearing={h} canUpdate={canUpdate} navigate={navigate} onUpdate={openUpdate} />
      ))}
    </div>
  )

  const renderDayHeader = (date: string) => {
    const rel = formatRelativeDay(date)
    const isToday = rel === "Today"
    return (
      <div
        className={cn(
          "flex flex-wrap items-baseline gap-x-2 rounded-lg border px-3 py-2",
          isToday ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-white"
        )}
      >
        <span className={cn("text-sm font-semibold", isToday ? "text-emerald-800" : "text-foreground")}>
          {isToday ? `Today — ${formatDate(date)}` : formatDate(date)}
        </span>
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground">{weekdayUpper(date)}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {rel !== "Today" && rel !== formatDate(date) ? rel : null}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Hearings" description="Court calendar, hearing updates and adjournment tracking.">
        {canSchedule ? (
          <Button onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> Schedule Hearing
          </Button>
        ) : null}
      </PageHeader>

      <div className="flex w-full overflow-x-auto pb-0.5 sm:w-auto">
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-1">
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:bg-stone-100 hover:text-foreground"
                )}
              >
                {f.label}
                {active && data ? ` (${data.length})` : ""}
              </button>
            )
          })}
        </div>
      </div>

      {loading && !data ? (
        <LoadingBlock rows={4} />
      ) : error && !data ? (
        <EmptyState
          icon={CalendarDays}
          title="Could not load hearings"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : hearings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={EMPTY_BY_FILTER[filter].title}
          description={EMPTY_BY_FILTER[filter].description}
          action={
            canSchedule ? (
              <Button size="sm" onClick={() => setScheduleOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> Schedule Hearing
              </Button>
            ) : undefined
          }
        />
      ) : filter === "today" ? (
        <div className="space-y-3">
          {todayGroup.map((g) => (
            <div key={g.key} className="space-y-3">
              {renderDayHeader(g.date)}
              {renderCards(g.hearings)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key} className="space-y-3">
              {renderDayHeader(g.date)}
              {renderCards(g.hearings)}
            </div>
          ))}
        </div>
      )}

      <ScheduleHearingDialog open={scheduleOpen} onOpenChange={setScheduleOpen} onSaved={refetch} />

      <HearingUpdateDialog
        open={updateOpen}
        onOpenChange={setUpdateOpen}
        hearing={updateTarget}
        onSaved={refetch}
      />
    </div>
  )
}
