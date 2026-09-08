"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, FolderKanban, Loader2, Plus, Search, X } from "lucide-react"
import { toast } from "sonner"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
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

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

/** Sentinel for optional Radix Select values (empty string is not allowed). */
const NONE = "__none__"

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
  useEffect(() => {
    if (!open) return
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
    setDescription(e && "description" in e ? (e.description ?? "") : "")
    setResolutionSummary(e && "resolutionSummary" in e ? (e.resolutionSummary ?? "") : "")
    setOutcome(e && "outcome" in e ? (e.outcome ?? "") : "")
  }, [open, editing])

  // Load client / lawyer options when opened
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
        <DialogHeader>
          <DialogTitle>{isEditing ? t("cases.editCase") : t("cases.registerNewCase")}</DialogTitle>
          <DialogDescription>
            {isEditing ? t("cases.editCaseDesc") : t("cases.newCaseDesc")}
          </DialogDescription>
        </DialogHeader>

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
              {t("cases.caseTitle")} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="case-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("cases.caseTitlePh")}
            />
          </div>

          <div className="space-y-2">
            <Label>
              {t("cases.caseType")} <span className="text-rose-600">*</span>
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

          <div className="space-y-2">
            <Label>
              {t("cases.client")} <span className="text-rose-600">*</span>
            </Label>
            <Select
              value={clientId || undefined}
              onValueChange={setClientId}
              disabled={isLawyer}
            >
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

          <div className="space-y-2">
            <Label>
              {t("cases.court")} <span className="text-rose-600">*</span>
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

          <div className="space-y-2">
            <Label htmlFor="filing-date">{t("cases.filingDate")}</Label>
            <Input
              id="filing-date"
              type="date"
              value={filingDate}
              onChange={(e) => setFilingDate(e.target.value)}
            />
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="opposite-party">{t("cases.oppositeParty")}</Label>
            <Input
              id="opposite-party"
              value={oppositeParty}
              onChange={(e) => setOppositeParty(e.target.value)}
              placeholder={t("cases.oppositePartyPh")}
            />
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

          {closing ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="resolution-summary">
                  {t("cases.resolutionSummary")} <span className="text-rose-600">*</span>
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
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
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

  const canCreate = user.role === "ADMIN" || user.role === "STAFF"
  const hasFilters = Boolean(status || type || priority || searchInput)

  const clearFilters = () => {
    setStatus("")
    setType("")
    setPriority("")
    setSearchInput("")
  }

  const loadingFirst = loading && !data && !error

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("cases.pageTitle")}
        description={t("cases.pageSubtitle")}
      >
        <div className="flex items-center rounded-lg border border-stone-200/80 bg-white p-0.5">
          {VIEW_TABS.map((tab) => (
            <Button
              key={tab.key}
              size="sm"
              variant={view === tab.key ? "default" : "outline"}
              className={cn("h-7 border-0 px-3", view !== tab.key && "bg-transparent shadow-none")}
              onClick={() => setView(tab.key)}
            >
              {t(tab.labelKey)}
            </Button>
          ))}
        </div>
        {canCreate ? (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> {t("cases.newCase")}
          </Button>
        ) : null}
      </PageHeader>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[15rem] flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("cases.searchPh")}
            aria-label={t("cases.searchAria")}
            className="pl-8"
          />
        </div>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[10.5rem]">
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
          <SelectTrigger className="w-[11.5rem]">
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
          <SelectTrigger className="w-[9.5rem]">
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
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" /> {t("cases.clearFilters")}
          </Button>
        ) : null}
      </div>

      {loadingFirst ? (
        <LoadingBlock rows={6} />
      ) : error && !data ? (
        <EmptyState icon={AlertTriangle} title={t("cases.errLoad")} description={error} />
      ) : (
        <Card className="border-stone-200/80">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">{t("cases.caseFiles")}</CardTitle>
            <CardDescription>
              {view === "all" ? t("cases.filterAllDesc") : view === "active" ? t("cases.filterActiveDesc") : t("cases.filterClosedDesc")}
            </CardDescription>
            <CardAction>
              <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
                {t(rows.length === 1 ? "cases.caseCountOne" : "cases.caseCountOther", { count: rows.length })}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {rows.length === 0 ? (
              <div className="px-6 pb-4">
                <EmptyState
                  icon={FolderKanban}
                  title={t("cases.emptyTitle")}
                  description={hasFilters ? t("cases.emptyFilters") : t("cases.emptyFirst")}
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">{t("cases.colCaseNo")}</TableHead>
                    <TableHead>{t("cases.colTitle")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("cases.colClient")}</TableHead>
                    <TableHead>{t("cases.colLawyer")}</TableHead>
                    <TableHead>{t("cases.court")}</TableHead>
                    <TableHead>{t("cases.colNextHearing")}</TableHead>
                    <TableHead>{t("cases.priority")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="pr-6">{t("cases.colFiled")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const rel = c.nextHearingDate ? formatRelativeDay(c.nextHearingDate) : null
                    return (
                      <TableRow
                        key={c.id}
                        role="button"
                        tabIndex={0}
                        aria-label={t("cases.openCaseAria", { caseNumber: c.caseNumber })}
                        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
                        onClick={() => navigate("case-detail", { id: c.id })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            navigate("case-detail", { id: c.id })
                          }
                        }}
                      >
                        <TableCell className="pl-6 font-mono font-semibold">{c.caseNumber}</TableCell>
                        <TableCell>
                          <div className="max-w-[16rem]">
                            <p className="truncate font-medium">{c.title}</p>
                            {c.oppositeParty ? (
                              <p className="truncate text-xs text-muted-foreground">
                                {t("ui.vs")} {c.oppositeParty}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{enumLabel("cases.type", c.type, t)}</TableCell>
                        <TableCell className="text-sm">{c.client?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {c.lawyer?.name ?? <span className="italic text-muted-foreground">{t("cases.unassigned")}</span>}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[12rem] truncate text-sm text-muted-foreground">{c.court}</p>
                        </TableCell>
                        <TableCell>
                          {c.nextHearingDate && rel ? (
                            <div>
                              <p className={cn("text-sm font-medium", rel === "Today" && "text-emerald-700")}>
                                {relDay(rel, t)}
                              </p>
                              <p className="text-xs text-muted-foreground">{formatDate(c.nextHearingDate)}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge map={translatedStyles(priorityStyles, t)} value={c.priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={c.status} />
                        </TableCell>
                        <TableCell className="pr-6 text-sm text-muted-foreground">{formatDate(c.filingDate)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
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
