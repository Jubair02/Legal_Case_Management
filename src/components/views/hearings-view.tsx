"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock,
  CornerDownRight,
  Gavel,
  Landmark,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { DialogHead, FieldGroup, RequiredMark } from "@/components/shared/dialog-chrome"
import { StatCard } from "@/components/shared/stat-card"
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
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { CaseListDTO, HearingDTO, ViewProps } from "@/lib/types"
import { cn, formatDate, formatRelativeDay, hearingStatusStyles, toDateInputValue } from "@/lib/utils"
import { useResetOnOpen } from "@/lib/use-reset-on-open"

type HearingFilter = "today" | "upcoming" | "past" | "all"

const FILTERS: { key: HearingFilter; labelKey: string }[] = [
  { key: "today", labelKey: "common.today" },
  { key: "upcoming", labelKey: "status.upcoming" },
  { key: "past", labelKey: "hearings.filterPast" },
  { key: "all", labelKey: "common.all" },
]

const EMPTY_BY_FILTER: Record<HearingFilter, { titleKey: string; descKey: string }> = {
  today: { titleKey: "hearings.emptyTodayTitle", descKey: "hearings.emptyTodayDesc" },
  upcoming: { titleKey: "hearings.emptyUpcomingTitle", descKey: "hearings.emptyUpcomingDesc" },
  past: { titleKey: "hearings.emptyPastTitle", descKey: "hearings.emptyPastDesc" },
  all: { titleKey: "hearings.emptyAllTitle", descKey: "hearings.emptyAllDesc" },
}

/** Timeline node tint per hearing status — always paired with the text badge. */
const NODE_TONES: Record<string, string> = {
  UPCOMING: "bg-emerald-500",
  COMPLETED: "bg-stone-300",
  ADJOURNED: "bg-amber-500",
  POSTPONED: "bg-orange-500",
  CANCELLED: "bg-rose-500",
}

const ADJOURNED_STATUSES = new Set(["ADJOURNED", "POSTPONED"])

const DHAKA_TZ = "Asia/Dhaka"

/* -------------------------------- Formatting -------------------------------- */

/**
 * Builds a derived enum dictionary key: enumTKey("hearings.type", "Order Date")
 * → "hearings.typeOrderDate". Non-alphanumeric runs split words.
 */
function enumTKey(prefix: string, value: string): string {
  return (
    prefix +
    value
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("")
  )
}

/** Translates a domain enum value (hearing types), falling back to the raw value. */
function enumLabel(prefix: string, value: string | null | undefined, t: TranslateFn): string {
  if (!value) return "—"
  const key = enumTKey(prefix, value)
  const translated = t(key)
  return translated === key ? value : translated
}

/** Translates the relative-day words emitted by formatRelativeDay (dates pass through). */
function relDay(rel: string, t: TranslateFn): string {
  if (rel === "Today") return t("common.today")
  if (rel === "Tomorrow") return t("common.tomorrow")
  if (rel === "Yesterday") return t("common.yesterday")
  return rel
}

/** Re-labels a StatusStyle map with translated status labels (styles untouched). */
function translatedStyles(
  map: Record<string, { label: string; className: string }>,
  t: TranslateFn
): Record<string, { label: string; className: string }> {
  return Object.fromEntries(
    Object.entries(map).map(([value, style]) => [value, { ...style, label: statusLabel(value, t) }])
  )
}

/** Memoised, translated hearing-status badge styles. */
function useHearingStatusStyles(): Record<string, { label: string; className: string }> {
  const { t } = useLanguage()
  return useMemo(() => translatedStyles(hearingStatusStyles, t), [t])
}

function dhakaParts(
  iso: string | Date,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatPart[] {
  const d = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return []
  return new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA_TZ, ...options }).formatToParts(d)
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ""
}

/**
 * Dhaka-timezone "10:30 AM", or null when the record carries no real time.
 *
 * Hearings booked through the app are date-only: the API pins them to 12:00
 * Dhaka (`parseDateOnly`) as a sentinel, so printing a clock for those would
 * invent a court time nobody entered. Records that do carry a time still show
 * it.
 */
function hearingTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const parts = dhakaParts(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  if (parts.length === 0) return null
  if (part(parts, "hour") === "12" && part(parts, "minute") === "00") return null
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso))
}

/** "THURSDAY" weekday label in Asia/Dhaka. */
function weekdayUpper(iso: string): string {
  return part(dhakaParts(iso, { weekday: "long" }), "weekday").toUpperCase()
}

/** Day-of-month and short month for the date medallion: ["12", "FEB"]. */
function medallionParts(iso: string): [string, string] {
  const parts = dhakaParts(iso, { day: "2-digit", month: "short" })
  return [part(parts, "day") || "—", part(parts, "month").toUpperCase()]
}

/** "12 Feb" — compact enough to sit in a metric tile without truncating. */
function formatDayMonth(iso: string): string {
  const parts = dhakaParts(iso, { day: "2-digit", month: "short" })
  const day = part(parts, "day")
  const month = part(parts, "month")
  return day && month ? `${day} ${month}` : "—"
}

/** Stable Dhaka-day key for grouping and comparison ("2026-02-12"). */
function dhakaDayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return typeof iso === "string" ? iso : ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/**
 * Groups into Dhaka days, keeping the server's day order (ascending for
 * today/upcoming, descending for past) while sorting each day's entries
 * chronologically — the order a cause list is actually called in.
 */
function groupByDay(list: HearingDTO[]): { key: string; date: string; hearings: HearingDTO[] }[] {
  const map = new Map<string, HearingDTO[]>()
  for (const h of list) {
    const key = dhakaDayKey(h.hearingDate)
    const arr = map.get(key)
    if (arr) arr.push(h)
    else map.set(key, [h])
  }
  return Array.from(map.entries()).map(([key, hearings]) => {
    const ordered = [...hearings].sort((a, b) => Date.parse(a.hearingDate) - Date.parse(b.hearingDate))
    return { key, date: ordered[0].hearingDate, hearings: ordered }
  })
}

/* ------------------------------- Hearing row ------------------------------- */

function HearingRow({
  hearing,
  showTime,
  isNext,
  canUpdate,
  statusStyles,
  navigate,
  onUpdate,
}: {
  hearing: HearingDTO
  /** Reserve the time gutter — decided per day so date-only lists stay tight. */
  showTime: boolean
  isNext: boolean
  canUpdate: boolean
  statusStyles: Record<string, { label: string; className: string }>
  navigate: ViewProps["navigate"]
  onUpdate: (h: HearingDTO) => void
}) {
  const { t } = useLanguage()
  const time = hearingTime(hearing.hearingDate)
  const digest = hearing.summary ?? hearing.notes

  return (
    <li className="group relative transition-colors hover:bg-paper-shade/60">
      <div className="flex gap-3 px-4 py-3.5 md:gap-4 md:px-5">
        {showTime ? (
          <div className="flex w-[3.75rem] shrink-0 flex-col items-end pt-px md:w-[4.25rem]">
            {time ? (
              <span className="flex items-center gap-1 text-[0.8125rem] leading-none font-semibold tabular-nums text-ink">
                <Clock aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                {time}
              </span>
            ) : (
              <span aria-hidden className="text-[0.8125rem] leading-none text-muted-foreground/40">
                ·
              </span>
            )}
            {isNext ? (
              <span className="mt-1.5 text-[0.5625rem] leading-[1.2] font-semibold tracking-[0.14em] uppercase text-brass-deep">{t("hearings.next")}</span>
            ) : null}
          </div>
        ) : null}

        {/* Timeline rail: a hairline running through the row with a status node on it. */}
        <div aria-hidden className="relative flex w-2.5 shrink-0 justify-center">
          <span className="absolute inset-y-0 w-px bg-border/70" />
          <span
            className={cn(
              "relative mt-1 h-2 w-2 rounded-full ring-[3px] ring-card",
              NODE_TONES[hearing.status] ?? "bg-stone-300",
              isNext && "h-2.5 w-2.5 ring-brass-tint"
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={() => navigate("case-detail", { id: hearing.caseId })}
              aria-label={t("hearings.viewCase", { caseNumber: hearing.caseNumber })}
              className="group/case min-w-0 flex-1 rounded-sm text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex items-center gap-1 text-sm leading-snug font-semibold text-ink transition-colors group-hover/case:text-primary">
                <span className="truncate">{hearing.caseNumber}</span>
                <ChevronRight
                  aria-hidden
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200 group-hover/case:translate-x-0.5 group-hover/case:text-primary"
                />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{hearing.caseTitle}</span>
            </button>

            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {hearing.hearingType ? (
                <Badge variant="outline" className="border-brass/30 bg-brass-tint text-brass-deep">
                  {enumLabel("hearings.type", hearing.hearingType, t)}
                </Badge>
              ) : null}
              <StatusBadge map={statusStyles} value={hearing.status} />
            </div>
          </div>

          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Landmark aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">{hearing.court ?? t("hearings.noCourt")}</span>
            {hearing.judge ? (
              <>
                <span aria-hidden className="shrink-0 opacity-50">
                  ·
                </span>
                <span className="truncate">{hearing.judge}</span>
              </>
            ) : null}
          </p>

          {digest ? (
            <p className="mt-2 line-clamp-2 border-l-2 border-border bg-paper-shade/70 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
              {digest}
            </p>
          ) : null}

          {hearing.nextAction ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-ink/75">
              <CornerDownRight aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-brass-deep" />
              <span className="line-clamp-1">{hearing.nextAction}</span>
            </p>
          ) : null}

          {canUpdate ? (
            <div className="mt-2.5 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onUpdate(hearing)}
                className="h-8 px-2.5 text-xs text-primary hover:bg-emerald-50 hover:text-emerald-800"
              >
                {t("hearings.update")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/* -------------------------------- Day panel -------------------------------- */

function DayPanel({
  date,
  hearings,
  isToday,
  nextId,
  canUpdate,
  statusStyles,
  navigate,
  onUpdate,
  delay,
}: {
  date: string
  hearings: HearingDTO[]
  isToday: boolean
  nextId: string | null
  canUpdate: boolean
  statusStyles: Record<string, { label: string; className: string }>
  navigate: ViewProps["navigate"]
  onUpdate: (h: HearingDTO) => void
  delay: number
}) {
  const { t } = useLanguage()
  const [day, month] = medallionParts(date)
  const rel = formatRelativeDay(date)
  const showChip = !isToday && rel !== formatDate(date)
  // Collapse the time gutter on days where nothing carries a real court time.
  const showTimes = hearings.some((h) => hearingTime(h.hearingDate) !== null)

  return (
    <section
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={cn(
        "u-rise relative overflow-hidden rounded-xl border bg-card shadow-soft",
        isToday ? "border-brass/35" : "border-border/80"
      )}
    >
      {isToday ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brass/70 via-brass/30 to-transparent"
        />
      ) : null}

      <header className="flex items-center gap-3.5 px-4 py-4 md:px-5">
        <span
          aria-hidden
          className={cn(
            "flex h-[3.25rem] w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-lg ring-1",
            isToday ? "bg-brass-tint text-brass-deep ring-brass/30" : "bg-paper-shade text-ink ring-border/70"
          )}
        >
          <span className="font-serif text-xl leading-none font-semibold">{day}</span>
          <span className="mt-1 text-[0.5625rem] leading-[1.2] font-semibold tracking-[0.14em] uppercase opacity-75">{month}</span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate font-serif text-base leading-tight font-semibold tracking-tight text-ink md:text-lg">
              {isToday ? t("hearings.todayWithDate", { date: formatDate(date) }) : formatDate(date)}
            </h2>
            {showChip ? (
              <Badge variant="outline" className="border-border bg-paper-shade text-muted-foreground">
                {relDay(rel, t)}
              </Badge>
            ) : null}
          </div>
          <p className="u-eyebrow mt-1 text-muted-foreground">{weekdayUpper(date)}</p>
        </div>

        <span className="shrink-0 rounded-md bg-paper-shade px-2 py-1 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border/70">
          {t(hearings.length === 1 ? "hearings.countHearing" : "hearings.countHearings", {
            count: hearings.length,
          })}
        </span>
      </header>

      <div aria-hidden className="mx-4 h-px bg-border/70 md:mx-5" />

      <ol className="divide-y divide-border/50">
        {hearings.map((h) => (
          <HearingRow
            key={h.id}
            hearing={h}
            showTime={showTimes}
            isNext={h.id === nextId}
            canUpdate={canUpdate}
            statusStyles={statusStyles}
            navigate={navigate}
            onUpdate={onUpdate}
          />
        ))}
      </ol>
    </section>
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
  const { t } = useLanguage()
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

  // Network sync on open: the form reset itself lives in useResetOnOpen below.
  /* eslint-disable react-hooks/set-state-in-effect -- network sync, see above */
  useEffect(() => {
    if (!open) return
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
          toast.error(e instanceof Error ? e.message : t("hearings.errLoadCases"))
        }
      })
      .finally(() => {
        if (active) setCasesLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

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
      toast.error(t("hearings.errSelectCase"))
      return
    }
    if (!date) {
      toast.error(t("hearings.errDateRequired"))
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
      toast.success(t("hearings.toastScheduledFor", { caseNumber: selectedCase.caseNumber }))
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hearings.errSchedule"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHead
          icon={CalendarPlus}
          title={t("hearings.scheduleHearing")}
          description={t("hearings.scheduleDesc")}
        />

        <div className="space-y-6">
          <FieldGroup label={t("hearings.secCase")}>
            <div className="space-y-1.5">
              <Label>
                {t("hearings.caseLabel")} <RequiredMark />
              </Label>
              {selectedCase ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/25 bg-emerald-50/70 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-emerald-900">{selectedCase.caseNumber}</p>
                    <p className="truncate text-xs text-emerald-800/80">{selectedCase.title}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCase(null)} disabled={pending}>
                    {t("ui.change")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search
                      aria-hidden
                      className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={caseQuery}
                      onChange={(e) => setCaseQuery(e.target.value)}
                      placeholder={t("hearings.searchCasesPh")}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-paper-shade/40 p-1">
                    {casesLoading ? (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">{t("ui.loadingCases")}</p>
                    ) : candidateCases.length === 0 ? (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        {cases && cases.length === 0 ? t("hearings.noActiveCases") : t("ui.noCaseMatch")}
                      </p>
                    ) : (
                      candidateCases.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setSelectedCase(c)}
                          className="w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-card hover:shadow-soft focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          <p className="text-sm font-semibold text-ink">{c.caseNumber}</p>
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
          </FieldGroup>

          <FieldGroup label={t("hearings.secSchedule")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hearing-date">
                  {t("hearings.hearingDate")} <RequiredMark />
                </Label>
                <Input id="hearing-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hearing-type">{t("hearings.hearingType")}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="hearing-type" className="w-full">
                    <SelectValue placeholder={t("ui.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("ui.notSpecified")}</SelectItem>
                    {HEARING_TYPES.map((ht) => (
                      <SelectItem key={ht} value={ht}>
                        {enumLabel("hearings.type", ht, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hearing-court">{t("cases.court")}</Label>
                <Input
                  id="hearing-court"
                  value={court}
                  onChange={(e) => setCourt(e.target.value)}
                  placeholder={t("hearings.courtPh")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hearing-judge">{t("hearings.judge")}</Label>
                <Input
                  id="hearing-judge"
                  value={judge}
                  onChange={(e) => setJudge(e.target.value)}
                  placeholder={t("hearings.judgePh")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hearing-notes">{t("common.notes")}</Label>
              <Textarea
                id="hearing-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("hearings.notesPh")}
                rows={2}
              />
            </div>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            <CalendarPlus className="h-4 w-4" /> {pending ? t("ui.scheduling") : t("hearings.scheduleHearing")}
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
  const { t } = useLanguage()
  const [status, setStatus] = useState("UPCOMING")
  const [hearingDate, setHearingDate] = useState("")
  const [notes, setNotes] = useState("")
  const [summary, setSummary] = useState("")
  const [courtOrder, setCourtOrder] = useState("")
  const [nextAction, setNextAction] = useState("")
  const [nextHearingDate, setNextHearingDate] = useState("")
  const [pending, setPending] = useState(false)

  useResetOnOpen(open && hearing ? hearing.id : null, () => {
    if (!hearing) return
    setStatus(hearing.status && HEARING_STATUS_LABELS[hearing.status] ? hearing.status : "UPCOMING")
    setHearingDate(toDateInputValue(hearing.hearingDate))
    setNotes(hearing.notes ?? "")
    setSummary(hearing.summary ?? "")
    setCourtOrder(hearing.courtOrder ?? "")
    setNextAction(hearing.nextAction ?? "")
    setNextHearingDate(toDateInputValue(hearing.nextHearingDate))
    setPending(false)
  })

  const submit = async () => {
    if (!hearing) return
    if (!hearingDate) {
      toast.error(t("hearings.errDateRequired"))
      return
    }
    try {
      setPending(true)
      await apiSend<HearingDTO>("PATCH", `/api/hearings/${hearing.id}`, {
        status,
        hearingDate,
        notes: notes.trim() || null,
        summary: summary.trim() || null,
        courtOrder: courtOrder.trim() || null,
        nextAction: nextAction.trim() || null,
        nextHearingDate: nextHearingDate || null,
      })
      toast.success(t("hearings.toastUpdatedFor", { caseNumber: hearing.caseNumber }))
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hearings.errUpdate"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHead
          icon={Gavel}
          title={t("hearings.updateHearing")}
          description={
            hearing
              ? `${hearing.caseNumber} · ${formatDate(hearing.hearingDate)}`
              : t("hearings.updateDescFallback")
          }
        />

        <div className="space-y-6">
          <FieldGroup label={t("hearings.secSchedule")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="update-status">{t("common.status")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="update-status" className="w-full">
                    <SelectValue placeholder={t("ui.selectStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    {HEARING_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="update-hearing-date">{t("hearings.hearingDate")}</Label>
                <Input
                  id="update-hearing-date"
                  type="date"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("hearings.secOutcome")}>
            <div className="space-y-1.5">
              <Label htmlFor="update-summary">{t("hearings.summary")}</Label>
              <Textarea
                id="update-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={t("hearings.summaryPh")}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="update-order">{t("hearings.courtOrder")}</Label>
              <Textarea
                id="update-order"
                value={courtOrder}
                onChange={(e) => setCourtOrder(e.target.value)}
                placeholder={t("hearings.courtOrderPh")}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="update-notes">{t("hearings.internalNotes")}</Label>
              <Textarea
                id="update-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("hearings.internalNotesPh")}
                rows={2}
              />
            </div>
          </FieldGroup>

          <FieldGroup label={t("hearings.secFollowUp")}>
            <div className="space-y-1.5">
              <Label htmlFor="update-next-action">{t("hearings.nextAction")}</Label>
              <Input
                id="update-next-action"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder={t("hearings.nextActionPh")}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="update-next-date">{t("hearings.nextHearingDate")}</Label>
              <Input
                id="update-next-date"
                type="date"
                value={nextHearingDate}
                onChange={(e) => setNextHearingDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("hearings.autoCreateHint")}</p>
            </div>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? t("common.saving") : t("hearings.saveUpdate")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function HearingsView({ user, navigate }: ViewProps) {
  const { t } = useLanguage()
  // Lawyers can schedule for their own assigned cases (same as inside a case file).
  const canSchedule = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LAWYER"
  const canUpdate = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LAWYER"

  const [filter, setFilter] = useState<HearingFilter>("today")
  const [query, setQuery] = useState("")
  const { data, loading, error, refetch } = useApiData<HearingDTO[]>(`/api/hearings?filter=${filter}`)

  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [updateTarget, setUpdateTarget] = useState<HearingDTO | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)

  const statusStyles = useHearingStatusStyles()
  const hearings = useMemo(() => data ?? [], [data])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return hearings
    return hearings.filter((h) =>
      [h.caseNumber, h.caseTitle, h.court ?? "", h.judge ?? "", h.hearingType ?? ""].some((v) =>
        v.toLowerCase().includes(q)
      )
    )
  }, [hearings, query])

  const groups = useMemo(() => groupByDay(visible), [visible])
  const todayKey = useMemo(() => dhakaDayKey(new Date()), [])

  /** Counts describe the loaded page for the active filter, not the whole table. */
  const metrics = useMemo(() => {
    let upcoming = 0
    let adjourned = 0
    const courts = new Set<string>()
    for (const h of visible) {
      if (h.status === "UPCOMING") upcoming += 1
      if (ADJOURNED_STATUSES.has(h.status)) adjourned += 1
      const court = (h.court ?? "").trim()
      if (court) courts.add(court.toLowerCase())
    }
    return { total: visible.length, upcoming, adjourned, courts: courts.size }
  }, [visible])

  /**
   * The soonest still-pending hearing. Compared on Dhaka day keys so a
   * date-only record booked for today is not read as already past.
   */
  const nextHearing = useMemo(() => {
    const pending = visible
      .filter((h) => h.status === "UPCOMING" && dhakaDayKey(h.hearingDate) >= todayKey)
      .sort((a, b) => Date.parse(a.hearingDate) - Date.parse(b.hearingDate))
    return pending[0] ?? null
  }, [visible, todayKey])

  const nextValue = useMemo(() => {
    if (!nextHearing) return "—"
    const rel = formatRelativeDay(nextHearing.hearingDate)
    if (rel === "Today" || rel === "Tomorrow") return relDay(rel, t)
    return formatDayMonth(nextHearing.hearingDate)
  }, [nextHearing, t])

  const nextSub = useMemo(() => {
    if (!nextHearing) return undefined
    const time = hearingTime(nextHearing.hearingDate)
    return [nextHearing.caseNumber, time].filter(Boolean).join(" · ")
  }, [nextHearing])

  const openUpdate = (h: HearingDTO) => {
    setUpdateTarget(h)
    setUpdateOpen(true)
  }

  const searching = query.trim().length > 0
  const hasData = !(loading && !data) && !(error && !data) && hearings.length > 0

  return (
    <div className="space-y-6">
      <PageHeader title={t("hearings.pageTitle")} description={t("hearings.pageSubtitle")}>
        {canSchedule ? (
          <Button onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="h-4 w-4" /> {t("hearings.scheduleHearing")}
          </Button>
        ) : null}
      </PageHeader>

      {/* Filter + search toolbar */}
      <div className="u-rise rounded-xl border border-border/80 bg-card p-3 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label={t("hearings.filterLabel")} className="-mx-1 flex overflow-x-auto px-1 pb-0.5">
            <div className="inline-flex gap-1 rounded-lg bg-paper-shade p-1 ring-1 ring-border/70">
              {FILTERS.map((f) => {
                const active = filter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200",
                      "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      active
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:bg-card hover:text-foreground"
                    )}
                  >
                    {t(f.labelKey)}
                    {active && data ? <span className="text-xs tabular-nums opacity-75">{data.length}</span> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="relative lg:w-72">
            <Search aria-hidden className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t("hearings.searchLabel")}
              placeholder={t("hearings.searchPh")}
              className="pr-9 pl-9"
            />
            {searching ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("hearings.clearSearch")}
                className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {hasData ? (
          <p className="mt-2.5 px-1 text-xs text-muted-foreground" aria-live="polite">
            {searching
              ? t("hearings.matchCount", { shown: visible.length, total: hearings.length })
              : t(metrics.total === 1 ? "hearings.countHearing" : "hearings.countHearings", {
                  count: metrics.total,
                })}
            {metrics.courts > 0 ? ` · ${t("hearings.countCourts", { count: metrics.courts })}` : ""}
          </p>
        ) : null}
      </div>

      {/* Tiles summarise the loaded page for the active filter — hidden when a
          search narrows it to nothing, where every value would read zero. */}
      {hasData && visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Gavel} label={t("hearings.statListed")} value={metrics.total} tone="emerald" delay={0} />
          <StatCard
            icon={CalendarClock}
            label={t("hearings.statNext")}
            value={nextValue}
            sub={nextSub}
            tone="gold"
            delay={60}
          />
          <StatCard
            icon={CalendarDays}
            label={t("hearings.statUpcoming")}
            value={metrics.upcoming}
            tone="teal"
            delay={120}
            onClick={filter === "upcoming" ? undefined : () => setFilter("upcoming")}
            actionLabel={t("hearings.gotoUpcoming")}
          />
          <StatCard
            icon={RotateCcw}
            label={t("hearings.statAdjourned")}
            value={metrics.adjourned}
            tone="amber"
            delay={180}
          />
        </div>
      ) : null}

      {loading && !data ? (
        <LoadingBlock rows={3} tiles={4} panels={2} />
      ) : error && !data ? (
        <EmptyState
          icon={CalendarDays}
          title={t("hearings.errLoad")}
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : hearings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t(EMPTY_BY_FILTER[filter].titleKey)}
          description={t(EMPTY_BY_FILTER[filter].descKey)}
          action={
            canSchedule ? (
              <Button size="sm" onClick={() => setScheduleOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> {t("hearings.scheduleHearing")}
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("hearings.noMatchTitle")}
          description={t("hearings.noMatchDesc")}
          action={
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              {t("hearings.clearSearch")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g, i) => (
            <DayPanel
              key={g.key}
              date={g.date}
              hearings={g.hearings}
              isToday={g.key === todayKey}
              nextId={nextHearing?.id ?? null}
              canUpdate={canUpdate}
              statusStyles={statusStyles}
              navigate={navigate}
              onUpdate={openUpdate}
              delay={Math.min(i, 6) * 50}
            />
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
