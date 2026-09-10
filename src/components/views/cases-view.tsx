"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  FilePen,
  FilePlus2,
  FolderKanban,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { DialogHead, FieldGroup, RequiredMark } from "@/components/shared/dialog-chrome"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { apiGet, apiSend } from "@/lib/api-client"
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  CASE_TYPES,
  COURTS,
  DISTRICTS,
} from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import { hrefFor } from "@/lib/routes"
import { useResetOnOpen } from "@/lib/use-reset-on-open"
import {
  caseStatusStyles,
  cn,
  formatDate,
  formatRelativeDay,
  priorityStyles,
  toDateInputValue,
} from "@/lib/utils"
import type {
  CaseDetailDTO,
  CaseListDTO,
  ClientDTO,
  LawyerDTO,
  ViewProps,
} from "@/lib/types"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const VIEW_TABS = [
  { key: "all", labelKey: "common.all" },
  { key: "active", labelKey: "status.active" },
  { key: "closed", labelKey: "status.closed" },
] as const

type ViewTab = (typeof VIEW_TABS)[number]["key"]

const SORTS = [
  { key: "recent", labelKey: "cases.sortRecent" },
  { key: "hearing", labelKey: "cases.sortHearing" },
  { key: "priority", labelKey: "cases.sortPriority" },
  { key: "number", labelKey: "cases.sortNumber" },
] as const

type SortKey = (typeof SORTS)[number]["key"]

/** Sentinel for optional Radix Select values (empty string is not allowed). */
const NONE = "__none__"

/** Priority as a silent visual rank: an edge bar on the row, a dot in the cell. */
const PRIORITY_ACCENT: Record<string, { bar: string; dot: string }> = {
  URGENT: { bar: "bg-rose-500", dot: "bg-rose-500" },
  HIGH: { bar: "bg-orange-400", dot: "bg-orange-400" },
  MEDIUM: { bar: "bg-amber-300", dot: "bg-amber-400" },
  LOW: { bar: "bg-border", dot: "bg-stone-300" },
}
const FALLBACK_ACCENT = { bar: "bg-border", dot: "bg-stone-300" }

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

/**
 * Builds a derived enum dictionary key: enumTKey("cases.type", "Civil Case")
 * → "cases.typeCivilCase". Non-alphanumeric runs split words.
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

/** Translates a domain enum value (case type, court, district…), falling back to the raw value. */
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

/* ------------------------------- date helpers ------------------------------- */

const DHAKA = "Asia/Dhaka"

/** Epoch ms, or NaN when missing/unparseable. */
function ts(d: string | null | undefined): number {
  return d ? Date.parse(d) : Number.NaN
}

/** First parseable date in the list, as epoch ms; 0 when none parse. */
function firstDate(...values: (string | null | undefined)[]): number {
  for (const v of values) {
    const n = ts(v)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

function dhakaDayKey(d: Date | string | null | undefined): string {
  if (!d) return ""
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/**
 * Whole days from today to `d`, in Dhaka. Compared on day keys rather than
 * timestamps so a date-only hearing booked for today reads as 0, not as past.
 */
function daysUntil(d: string | null | undefined): number | null {
  const key = dhakaDayKey(d)
  if (!key) return null
  const diff = (Date.parse(key) - Date.parse(dhakaDayKey(new Date()))) / 86_400_000
  return Number.isNaN(diff) ? null : diff
}

/** "Mon" weekday in Dhaka — the secondary line when the date needs no relative word. */
function weekday(d: string | null | undefined): string {
  if (!d) return ""
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA, weekday: "long" }).format(date)
}

/**
 * Splits a hearing date into a headline and a supporting line without ever
 * printing the same string twice: formatRelativeDay falls back to the full
 * date for anything past tomorrow, so the weekday carries the second line.
 */
function hearingLines(d: string, t: TranslateFn): { lead: string; sub: string } {
  const rel = formatRelativeDay(d)
  const full = formatDate(d)
  if (rel === full) return { lead: full, sub: weekday(d) }
  return { lead: relDay(rel, t), sub: full }
}

/* ------------------------------------------------------------------ */
/*                        Case create / edit dialog                    */
/* ------------------------------------------------------------------ */

export interface CaseFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  editing?: CaseDetailDTO | CaseListDTO | null
  /** Role of the acting user — LAWYER cannot reassign client/lawyer. */
  actorRole?: string
}

export function CaseFormDialog({ open, onOpenChange, onSaved, editing, actorRole }: CaseFormDialogProps) {
  const { t } = useLanguage()
  const [clients, setClients] = useState<ClientDTO[]>([])
  const [lawyers, setLawyers] = useState<LawyerDTO[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [pending, setPending] = useState(false)

  const [caseNumber, setCaseNumber] = useState("")
  const [title, setTitle] = useState("")
  const [type, setType] = useState<string>("")
  const [clientId, setClientId] = useState<string>("")
  const [lawyerId, setLawyerId] = useState<string>("")
  const [court, setCourt] = useState<string>("")
  const [district, setDistrict] = useState<string>("")
  const [filingDate, setFilingDate] = useState("")
  const [status, setStatus] = useState<string>("ACTIVE")
  const [priority, setPriority] = useState<string>("MEDIUM")
  const [oppositeParty, setOppositeParty] = useState("")
  const [description, setDescription] = useState("")
  const [resolutionSummary, setResolutionSummary] = useState("")
  const [outcome, setOutcome] = useState("")

  const isEditing = Boolean(editing)
  const isLawyer = actorRole === "LAWYER"
  const closing = status === "RESOLVED" || status === "CLOSED"
  /** Status options: restricted on create, full list when editing. */
  const statusOptions: readonly string[] = isEditing ? CASE_STATUSES : (["DRAFT", "ACTIVE", "PENDING"] as const)

  // Prefill when the dialog opens
  useResetOnOpen(open ? (editing?.id ?? "new") : null, () => {
    const e = editing ?? null
    setCaseNumber(e?.caseNumber ?? "")
    setTitle(e?.title ?? "")
    setType(e?.type ?? "")
    setClientId(e?.client?.id ?? "")
    setLawyerId(e?.lawyer?.id ?? "")
    setCourt(e?.court ?? "")
    setDistrict(e?.district ?? "")
    setFilingDate(toDateInputValue(e?.filingDate))
    setStatus(e?.status ?? "ACTIVE")
    setPriority(e?.priority ?? "MEDIUM")
    setOppositeParty(e?.oppositeParty ?? "")
    // CaseListDTO omits the long-form fields; read them off the detail shape.
    const detail = e as Partial<CaseDetailDTO> | null
    setDescription(detail?.description ?? "")
    setResolutionSummary(detail?.resolutionSummary ?? "")
    setOutcome(detail?.outcome ?? "")
  })

  // Load client / lawyer options when opened. Synchronising with the network
  // is what effects are for; the loading flag has to be set alongside the
  // request it describes.
  /* eslint-disable react-hooks/set-state-in-effect -- network sync, see above */
  useEffect(() => {
    if (!open) return
    let active = true
    setOptionsLoading(true)
    Promise.all([apiGet<ClientDTO[]>("/api/clients"), apiGet<LawyerDTO[]>("/api/lawyers")])
      .then(([cls, lws]) => {
        if (!active) return
        setClients(Array.isArray(cls) ? cls : [])
        setLawyers(Array.isArray(lws) ? lws : [])
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : t("cases.errLoadOptions"))
      })
      .finally(() => {
        if (active) setOptionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    // Client-side validation
    if (!isEditing && !caseNumber.trim()) {
      toast.error(t("cases.errCaseNumberRequired"))
      return
    }
    if (!title.trim()) {
      toast.error(t("cases.errCaseTitleRequired"))
      return
    }
    if (!type) {
      toast.error(t("cases.errSelectType"))
      return
    }
    if (!clientId) {
      toast.error(t("cases.errSelectClient"))
      return
    }
    if (!court) {
      toast.error(t("cases.errSelectCourt"))
      return
    }
    if (closing && !resolutionSummary.trim()) {
      toast.error(t("cases.errResolutionRequired"))
      return
    }

    const prev = editing ?? null
    const payload: Record<string, unknown> = {}

    if (!prev) {
      // Create — required fields + provided optionals
      payload.caseNumber = caseNumber.trim()
      payload.title = title.trim()
      payload.type = type
      payload.clientId = clientId
      payload.court = court
      if (lawyerId) payload.lawyerId = lawyerId
      if (district) payload.district = district
      if (filingDate) payload.filingDate = filingDate
      payload.status = status
      payload.priority = priority
      if (oppositeParty.trim()) payload.oppositeParty = oppositeParty.trim()
      if (description.trim()) payload.description = description.trim()
      if (closing) payload.resolutionSummary = resolutionSummary.trim()
      if (outcome.trim()) payload.outcome = outcome.trim()
    } else {
      // Edit — only fields that were provided / actually changed.
      // District / filing date / opposite party / description are editable by
      // every role that can open this dialog (the server only blocks
      // assignment changes for lawyers), so they are always diffed and sent.
      payload.title = title.trim()
      payload.type = type
      payload.court = court
      payload.status = status
      payload.priority = priority
      if (!isLawyer) {
        // Only ADMIN/STAFF can change case assignment.
        if (clientId !== prev.client?.id) payload.clientId = clientId
        if ((lawyerId || null) !== (prev.lawyer?.id ?? null)) payload.lawyerId = lawyerId || null
      }
      if (district !== (prev.district ?? "")) payload.district = district.trim() || null
      if ((filingDate || null) !== (prev.filingDate ? toDateInputValue(prev.filingDate) : null))
        payload.filingDate = filingDate || null
      if (oppositeParty.trim() !== (prev.oppositeParty ?? ""))
        payload.oppositeParty = oppositeParty.trim() || null
      const prevDescription = "description" in prev ? (prev.description ?? "") : ""
      if (description.trim() !== prevDescription) payload.description = description.trim() || null
      if (closing) {
        payload.resolutionSummary = resolutionSummary.trim()
        if (outcome.trim()) payload.outcome = outcome.trim()
      }
    }

    try {
      setPending(true)
      if (prev) {
        await apiSend("PATCH", `/api/cases/${prev.id}`, payload)
        toast.success(t("cases.toastUpdated"))
      } else {
        await apiSend("POST", "/api/cases", payload)
        toast.success(t("cases.toastRegistered"))
      }
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("cases.errSave"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHead
          icon={isEditing ? FilePen : FilePlus2}
          title={isEditing ? t("cases.editCase") : t("cases.registerNewCase")}
          description={isEditing ? t("cases.editCaseDesc") : t("cases.newCaseDesc")}
        />

        <div className="space-y-5">
          <FieldGroup label={t("cases.groupIdentity")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="case-number">{t("cases.caseNumber")}</Label>
                <Input
                  id="case-number"
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  placeholder={t("cases.caseNumberPh")}
                  disabled={isEditing}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="case-title">
                  {t("cases.caseTitle")} <RequiredMark />
                </Label>
                <Input
                  id="case-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("cases.caseTitlePh")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>
                  {t("cases.caseType")} <RequiredMark />
                </Label>
                <Select value={type || undefined} onValueChange={setType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("ui.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((ct) => (
                      <SelectItem key={ct} value={ct}>
                        {enumLabel("cases.type", ct, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="case-description">{t("common.description")}</Label>
                <Textarea
                  id="case-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("cases.descriptionPh")}
                  rows={3}
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("cases.groupParties")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {t("cases.client")} <RequiredMark />
                </Label>
                <Select value={clientId || undefined} onValueChange={setClientId} disabled={isLawyer}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={optionsLoading ? t("ui.loadingClients") : t("ui.selectClient")} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("cases.assignedLawyer")}</Label>
                <Select
                  value={lawyerId || NONE}
                  onValueChange={(v) => setLawyerId(v === NONE ? "" : v)}
                  disabled={isLawyer}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={optionsLoading ? t("ui.loadingLawyers") : t("cases.unassigned")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("cases.unassigned")}</SelectItem>
                    {lawyers.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="opposite-party">{t("cases.oppositeParty")}</Label>
                <Input
                  id="opposite-party"
                  value={oppositeParty}
                  onChange={(e) => setOppositeParty(e.target.value)}
                  placeholder={t("cases.oppositePartyPh")}
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("cases.groupCourt")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {t("cases.court")} <RequiredMark />
                </Label>
                <Select value={court || undefined} onValueChange={setCourt}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("cases.selectCourt")} />
                  </SelectTrigger>
                  <SelectContent>
                    {COURTS.map((ct) => (
                      <SelectItem key={ct} value={ct}>
                        {enumLabel("cases.court", ct, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("cases.district")}</Label>
                <Select value={district || NONE} onValueChange={(v) => setDistrict(v === NONE ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("cases.selectDistrict")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("ui.notSpecified")}</SelectItem>
                    {DISTRICTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {enumLabel("cases.district", d, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="filing-date">{t("cases.filingDate")}</Label>
                <Input
                  id="filing-date"
                  type="date"
                  value={filingDate}
                  onChange={(e) => setFilingDate(e.target.value)}
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("cases.groupTracking")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("common.status")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("cases.priority")}</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {statusLabel(p, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FieldGroup>

          {closing ? (
            <FieldGroup label={t("cases.groupResolution")}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="resolution-summary">
                    {t("cases.resolutionSummary")} <RequiredMark />
                  </Label>
                  <Textarea
                    id="resolution-summary"
                    value={resolutionSummary}
                    onChange={(e) => setResolutionSummary(e.target.value)}
                    placeholder={t("cases.resolutionPh")}
                    rows={3}
                    required
                  />
                  <p className="text-xs text-muted-foreground">{t("cases.resolutionHint")}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="case-outcome">{t("cases.outcome")}</Label>
                  <Input
                    id="case-outcome"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder={t("cases.outcomePh")}
                  />
                </div>
              </div>
            </FieldGroup>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button className="cursor-pointer" onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? t("ui.saveChanges") : t("cases.registerCase")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*                              List view                              */
/* ------------------------------------------------------------------ */

export default function CasesView({ user, navigate }: ViewProps) {
  const { t } = useLanguage()
  const [view, setView] = useState<ViewTab>("all")
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [priority, setPriority] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("recent")
  const [formOpen, setFormOpen] = useState(false)

  // 300ms debounce for the search box
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const url = useMemo(() => {
    const qs = new URLSearchParams()
    qs.set("view", view)
    if (status) qs.set("status", status)
    if (type) qs.set("type", type)
    if (priority) qs.set("priority", priority)
    if (search) qs.set("search", search)
    return `/api/cases?${qs.toString()}`
  }, [view, status, type, priority, search])

  const { data, loading, error, refetch } = useApiData<CaseListDTO[]>(url)
  const rows = useMemo(() => (Array.isArray(data) ? data : []), [data])

  /** Client-side ordering of the loaded page — the API returns an unsorted set. */
  const ordered = useMemo(() => {
    const list = [...rows]
    switch (sort) {
      case "hearing":
        return list.sort((a, b) => {
          const av = ts(a.nextHearingDate)
          const bv = ts(b.nextHearingDate)
          const an = Number.isNaN(av)
          const bn = Number.isNaN(bv)
          if (an && bn) return 0
          if (an) return 1 // cases with no hearing sink to the bottom
          if (bn) return -1
          return av - bv
        })
      case "priority":
        return list.sort(
          (a, b) =>
            (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
            firstDate(b.filingDate, b.createdAt) - firstDate(a.filingDate, a.createdAt)
        )
      case "number":
        return list.sort((a, b) => a.caseNumber.localeCompare(b.caseNumber, undefined, { numeric: true }))
      default:
        return list.sort(
          (a, b) => firstDate(b.filingDate, b.createdAt) - firstDate(a.filingDate, a.createdAt)
        )
    }
  }, [rows, sort])

  /** Counts describe the loaded page for the active filter, not the whole table. */
  const metrics = useMemo(() => {
    let urgent = 0
    let thisWeek = 0
    let soonest: { row: CaseListDTO; days: number } | null = null
    for (const c of rows) {
      if (c.priority === "URGENT") urgent += 1
      const days = daysUntil(c.nextHearingDate)
      if (days === null || days < 0) continue
      if (days <= 7) thisWeek += 1
      if (!soonest || days < soonest.days) soonest = { row: c, days }
    }
    return { total: rows.length, urgent, thisWeek, soonest }
  }, [rows])

  const canCreate = user.role === "ADMIN" || user.role === "STAFF"
  const hasFilters = Boolean(status || type || priority || searchInput)
  const searching = searchInput.trim().length > 0

  const clearFilters = () => {
    setStatus("")
    setType("")
    setPriority("")
    setSearchInput("")
  }

  const loadingFirst = loading && !data && !error
  const hasData = !loadingFirst && !(error && !data) && rows.length > 0

  /**
   * Rows are real links now that every case owns a URL, so middle-click,
   * "open in new tab" and "copy link" all behave. A plain left click is
   * intercepted and handed to the router for a client-side transition.
   */
  const caseLink = (id: string) => ({
    href: hrefFor("case-detail", { id }),
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // let the browser take it
      e.preventDefault()
      navigate("case-detail", { id })
    },
  })

  const viewDescription =
    view === "all"
      ? t("cases.filterAllDesc")
      : view === "active"
        ? t("cases.filterActiveDesc")
        : t("cases.filterClosedDesc")

  return (
    <div className="space-y-6">
      <PageHeader title={t("cases.pageTitle")} description={t("cases.pageSubtitle")}>
        {canCreate ? (
          <Button className="cursor-pointer" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> {t("cases.newCase")}
          </Button>
        ) : null}
      </PageHeader>

      {/* ------------------------------ Toolbar ------------------------------ */}
      <div className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label={t("cases.filterLabel")}
            className="-mx-1 flex overflow-x-auto px-1 pb-0.5"
          >
            <div className="inline-flex gap-1 rounded-lg bg-paper-shade p-1 ring-1 ring-border/70">
              {VIEW_TABS.map((tab) => {
                const active = view === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setView(tab.key)}
                    aria-pressed={active}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
                      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      active
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:bg-card hover:text-foreground"
                    )}
                  >
                    {t(tab.labelKey)}
                    {active && data ? (
                      <span className="text-xs tabular-nums opacity-75">{rows.length}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="relative lg:w-80">
            <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label={t("cases.searchAria")}
              placeholder={t("cases.searchPh")}
              className="pl-9 pr-9"
            />
            {searching ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label={t("cases.clearSearch")}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div aria-hidden className="mx-3 h-px bg-border/70" />

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full" aria-label={t("ui.allStatuses")}>
              <SelectValue placeholder={t("ui.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.allStatuses")}</SelectItem>
              {CASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full" aria-label={t("ui.allTypes")}>
              <SelectValue placeholder={t("ui.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.allTypes")}</SelectItem>
              {CASE_TYPES.map((ct) => (
                <SelectItem key={ct} value={ct}>
                  {enumLabel("cases.type", ct, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={priority || "all"} onValueChange={(v) => setPriority(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full" aria-label={t("cases.anyPriority")}>
              <SelectValue placeholder={t("cases.anyPriority")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cases.anyPriority")}</SelectItem>
              {CASE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>
                  {statusLabel(p, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-full" aria-label={t("cases.sortAria")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {t("cases.sortLabel")}: {t(s.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasData || hasFilters ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t(rows.length === 1 ? "cases.caseCountOne" : "cases.caseCountOther", { count: rows.length })}
              {" · "}
              {viewDescription}
            </p>
            {hasFilters ? (
              <Button variant="ghost" size="sm" className="h-7 shrink-0 cursor-pointer" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> {t("cases.clearFilters")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------ Vitals ------------------------------ */}
      {hasData ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={FolderKanban}
            label={t("cases.caseFiles")}
            value={metrics.total}
            tone="emerald"
            delay={0}
          />
          <StatCard
            icon={CalendarClock}
            label={t("cases.colNextHearing")}
            value={
              metrics.soonest
                ? hearingLines(metrics.soonest.row.nextHearingDate as string, t).lead
                : t("common.none")
            }
            sub={metrics.soonest?.row.caseNumber ?? undefined}
            tone="gold"
            delay={60}
          />
          <StatCard
            icon={CalendarDays}
            label={t("cases.statThisWeek")}
            value={metrics.thisWeek}
            tone="teal"
            delay={120}
          />
          <StatCard
            icon={AlertTriangle}
            label={statusLabel("URGENT", t)}
            value={metrics.urgent}
            tone="rose"
            delay={180}
            onClick={priority === "URGENT" || metrics.urgent === 0 ? undefined : () => setPriority("URGENT")}
            actionLabel={t("cases.gotoUrgent")}
          />
        </div>
      ) : null}

      {/* ------------------------------- Docket ------------------------------- */}
      {loadingFirst ? (
        <LoadingBlock rows={5} tiles={4} panels={1} />
      ) : error && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("cases.errLoad")}
          description={error}
          action={
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={searching ? Search : FolderKanban}
          title={t("cases.emptyTitle")}
          description={hasFilters ? t("cases.emptyFilters") : t("cases.emptyFirst")}
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={clearFilters}>
                {t("cases.clearFilters")}
              </Button>
            ) : canCreate ? (
              <Button size="sm" className="cursor-pointer" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> {t("cases.newCase")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <section className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
          <header className="flex items-start gap-3 px-5 pb-4 pt-5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
              <FolderKanban className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-serif text-lg font-semibold leading-tight tracking-tight text-ink">
                {t("cases.caseFiles")}
              </h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">{viewDescription}</p>
            </div>
            <span className="mt-1 shrink-0 rounded-md bg-paper-shade px-2 py-1 text-xs font-semibold tabular-nums text-muted-foreground ring-1 ring-border/70">
              {rows.length}
            </span>
          </header>

          <div aria-hidden className="mx-5 h-px bg-border/70" />

          {/* Desktop: the docket table. */}
          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{t("cases.colCaseNo")}</TableHead>
                  <TableHead>{t("common.type")}</TableHead>
                  <TableHead>{t("cases.colParties")}</TableHead>
                  <TableHead>{t("cases.court")}</TableHead>
                  <TableHead>{t("cases.colNextHearing")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="pr-5 text-right">{t("cases.colFiled")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordered.map((c) => {
                  const accent = PRIORITY_ACCENT[c.priority] ?? FALLBACK_ACCENT
                  const days = daysUntil(c.nextHearingDate)
                  const imminent = days !== null && days >= 0 && days <= 2
                  const lines = c.nextHearingDate ? hearingLines(c.nextHearingDate, t) : null
                  return (
                    <TableRow
                      key={c.id}
                      className="group cursor-pointer border-border/60 transition-colors hover:bg-paper-shade/70"
                      onClick={() => navigate("case-detail", { id: c.id })}
                    >
                      <TableCell className="py-3 pl-5 align-top">
                        <div className="flex items-start gap-3">
                          <span
                            aria-hidden
                            className={cn("mt-1 h-9 w-[3px] shrink-0 rounded-full", accent.bar)}
                          />
                          <div className="min-w-0">
                            <a
                              {...caseLink(c.id)}
                              className="rounded font-mono text-[0.8125rem] font-semibold text-ink transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                            >
                              {c.caseNumber}
                            </a>
                            <p className="mt-0.5 max-w-[20rem] truncate text-sm font-medium">{c.title}</p>
                            {c.oppositeParty ? (
                              <p className="max-w-[20rem] truncate text-xs text-muted-foreground">
                                {t("ui.vs")} {c.oppositeParty}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="align-top text-sm">
                        {enumLabel("cases.type", c.type, t)}
                      </TableCell>

                      <TableCell className="align-top">
                        <p className="max-w-[11rem] truncate text-sm">{c.client?.name ?? "—"}</p>
                        <p className="max-w-[11rem] truncate text-xs text-muted-foreground">
                          {c.lawyer?.name ?? <span className="italic">{t("cases.unassigned")}</span>}
                        </p>
                      </TableCell>

                      <TableCell className="align-top">
                        <p className="max-w-[11rem] truncate text-sm text-muted-foreground">{c.court}</p>
                        {c.district ? (
                          <p className="max-w-[11rem] truncate text-xs text-muted-foreground/80">
                            {enumLabel("cases.district", c.district, t)}
                          </p>
                        ) : null}
                      </TableCell>

                      <TableCell className="align-top">
                        {lines ? (
                          <div className="flex items-start gap-2">
                            <span
                              aria-hidden
                              className={cn(
                                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                imminent ? "bg-brass" : "bg-border"
                              )}
                            />
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "text-sm font-medium tabular-nums",
                                  imminent && "text-brass-deep"
                                )}
                              >
                                {lines.lead}
                              </p>
                              {lines.sub ? (
                                <p className="text-xs tabular-nums text-muted-foreground">{lines.sub}</p>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={c.status} />
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
                          {statusLabel(c.priority, t)}
                        </p>
                      </TableCell>

                      <TableCell className="pr-5 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {formatDate(c.filingDate)}
                          </span>
                          <ChevronRight
                            aria-hidden
                            className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brass-deep"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile / tablet: one record per case — no horizontal scrolling. */}
          <ul className="divide-y divide-border/60 lg:hidden">
            {ordered.map((c) => {
              const accent = PRIORITY_ACCENT[c.priority] ?? FALLBACK_ACCENT
              const days = daysUntil(c.nextHearingDate)
              const imminent = days !== null && days >= 0 && days <= 2
              const lines = c.nextHearingDate ? hearingLines(c.nextHearingDate, t) : null
              return (
                <li key={c.id}>
                  <a
                    {...caseLink(c.id)}
                    aria-label={t("cases.openCaseAria", { caseNumber: c.caseNumber })}
                    className="group relative flex items-start gap-3 py-3.5 pl-5 pr-4 transition-colors hover:bg-paper-shade/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                  >
                    <span
                      aria-hidden
                      className={cn("absolute inset-y-3 left-2 w-[3px] rounded-full", accent.bar)}
                    />

                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink">{c.caseNumber}</span>
                        <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={c.status} />
                        <StatusBadge map={translatedStyles(priorityStyles, t)} value={c.priority} />
                      </div>

                      <p className="text-sm font-medium leading-snug">{c.title}</p>
                      {c.oppositeParty ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {t("ui.vs")} {c.oppositeParty}
                        </p>
                      ) : null}

                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          enumLabel("cases.type", c.type, t),
                          c.client?.name,
                          c.lawyer?.name ?? t("cases.unassigned"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground/80">{c.court}</p>

                      {lines ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            imminent
                              ? "bg-brass-tint text-brass-deep ring-brass/25"
                              : "bg-paper-shade text-muted-foreground ring-border/70"
                          )}
                        >
                          <CalendarDays aria-hidden className="h-3 w-3" />
                          {t("cases.colNextHearing")}: {lines.lead}
                        </span>
                      ) : null}
                    </div>

                    <ChevronRight
                      aria-hidden
                      className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brass-deep"
                    />
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <CaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={refetch}
        editing={null}
        actorRole={user.role}
      />
    </div>
  )
}
