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
  CASE_STATUS_LABELS,
  CASE_TYPES,
  COURTS,
  DISTRICTS,
  PRIORITY_LABELS,
} from "@/lib/constants"
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
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "closed", label: "Closed" },
] as const

type ViewTab = (typeof VIEW_TABS)[number]["key"]

/** Sentinel for optional Radix Select values (empty string is not allowed). */
const NONE = "__none__"

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
        toast.error(e instanceof Error ? e.message : "Could not load clients and lawyers.")
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
      toast.error("Case number is required.")
      return
    }
    if (!title.trim()) {
      toast.error("Case title is required.")
      return
    }
    if (!type) {
      toast.error("Please select a case type.")
      return
    }
    if (!clientId) {
      toast.error("Please select a client.")
      return
    }
    if (!court) {
      toast.error("Please select a court.")
      return
    }
    if (closing && !resolutionSummary.trim()) {
      toast.error("Resolution summary is required to resolve or close a case.")
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
      // Edit — only fields that were provided / actually changed
      payload.title = title.trim()
      payload.type = type
      payload.court = court
      payload.status = status
      payload.priority = priority
      if (!isLawyer) {
        if (clientId !== prev.client?.id) payload.clientId = clientId
        if ((lawyerId || null) !== (prev.lawyer?.id ?? null)) payload.lawyerId = lawyerId || null
        if (district !== (prev.district ?? "")) payload.district = district.trim() || null
        if ((filingDate || null) !== (prev.filingDate ? toDateInputValue(prev.filingDate) : null))
          payload.filingDate = filingDate || null
        if (oppositeParty.trim() !== (prev.oppositeParty ?? "")) payload.oppositeParty = oppositeParty.trim() || null
        const prevDescription = "description" in prev ? (prev.description ?? "") : ""
        if (description.trim() !== prevDescription) payload.description = description.trim() || null
      }
      if (closing) {
        payload.resolutionSummary = resolutionSummary.trim()
        if (outcome.trim()) payload.outcome = outcome.trim()
      }
    }

    try {
      setPending(true)
      if (prev) {
        await apiSend("PATCH", `/api/cases/${prev.id}`, payload)
        toast.success("Case updated")
      } else {
        await apiSend("POST", "/api/cases", payload)
        toast.success("Case registered")
      }
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the case.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Case" : "Register New Case"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the case file details below."
              : "Fill in the details to register a new case file."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="case-number">Case Number</Label>
            <Input
              id="case-number"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="e.g. CS-124/2026"
              disabled={isEditing}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="case-title">
              Case Title <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="case-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rahman vs Karim — land dispute"
            />
          </div>

          <div className="space-y-2">
            <Label>
              Case Type <span className="text-rose-600">*</span>
            </Label>
            <Select value={type || undefined} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {CASE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Client <span className="text-rose-600">*</span>
            </Label>
            <Select
              value={clientId || undefined}
              onValueChange={setClientId}
              disabled={isLawyer}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={optionsLoading ? "Loading clients…" : "Select client"} />
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
            <Label>Assigned Lawyer</Label>
            <Select
              value={lawyerId || NONE}
              onValueChange={(v) => setLawyerId(v === NONE ? "" : v)}
              disabled={isLawyer}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={optionsLoading ? "Loading lawyers…" : "Unassigned"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
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
              Court <span className="text-rose-600">*</span>
            </Label>
            <Select value={court || undefined} onValueChange={setCourt}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select court" />
              </SelectTrigger>
              <SelectContent>
                {COURTS.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {ct}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>District</Label>
            <Select value={district || NONE} onValueChange={(v) => setDistrict(v === NONE ? "" : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select district" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not specified</SelectItem>
                {DISTRICTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="filing-date">Filing Date</Label>
            <Input
              id="filing-date"
              type="date"
              value={filingDate}
              onChange={(e) => setFilingDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CASE_STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p] ?? p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="opposite-party">Opposite Party</Label>
            <Input
              id="opposite-party"
              value={oppositeParty}
              onChange={(e) => setOppositeParty(e.target.value)}
              placeholder="Name of the opposing party"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="case-description">Description</Label>
            <Textarea
              id="case-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of the matter…"
              rows={3}
            />
          </div>

          {closing ? (
            <>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="resolution-summary">
                  Resolution Summary <span className="text-rose-600">*</span>
                </Label>
                <Textarea
                  id="resolution-summary"
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  placeholder="How was the case resolved?"
                  rows={3}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Example: Case resolved through mutual settlement.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="case-outcome">Outcome</Label>
                <Input
                  id="case-outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="e.g. Won, Settled, Dismissed"
                />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEditing ? "Save Changes" : "Register Case"}
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
        title="Case Management"
        description="Register, track and resolve cases across Bangladesh courts."
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
              {tab.label}
            </Button>
          ))}
        </div>
        {canCreate ? (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> New Case
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
            placeholder="Search case no, title, opposite party…"
            className="pl-8"
          />
        </div>
        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[10.5rem]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(CASE_STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type || "all"} onValueChange={(v) => setType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[11.5rem]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CASE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority || "all"} onValueChange={(v) => setPriority(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[9.5rem]">
            <SelectValue placeholder="Any priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any priority</SelectItem>
            {CASE_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {PRIORITY_LABELS[p] ?? p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4" /> Clear
          </Button>
        ) : null}
      </div>

      {loadingFirst ? (
        <LoadingBlock rows={6} />
      ) : error && !data ? (
        <EmptyState icon={AlertTriangle} title="Could not load cases" description={error} />
      ) : (
        <Card className="border-stone-200/80">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight">Case Files</CardTitle>
            <CardDescription>
              {view === "all" ? "All cases" : view === "active" ? "Active, pending & on hold cases" : "Resolved & closed cases"}
            </CardDescription>
            <CardAction>
              <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
                {rows.length} {rows.length === 1 ? "case" : "cases"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {rows.length === 0 ? (
              <div className="px-6 pb-4">
                <EmptyState
                  icon={FolderKanban}
                  title="No cases found"
                  description={
                    hasFilters
                      ? "Try adjusting or clearing the filters."
                      : "Register your first case to get started."
                  }
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6">Case No</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Lawyer</TableHead>
                    <TableHead>Court</TableHead>
                    <TableHead>Next Hearing</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-6">Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const rel = c.nextHearingDate ? formatRelativeDay(c.nextHearingDate) : null
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => navigate("case-detail", { id: c.id })}
                      >
                        <TableCell className="pl-6 font-mono font-semibold">{c.caseNumber}</TableCell>
                        <TableCell>
                          <div className="max-w-[16rem]">
                            <p className="truncate font-medium">{c.title}</p>
                            {c.oppositeParty ? (
                              <p className="truncate text-xs text-muted-foreground">vs {c.oppositeParty}</p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{c.type}</TableCell>
                        <TableCell className="text-sm">{c.client?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {c.lawyer?.name ?? <span className="italic text-muted-foreground">Unassigned</span>}
                        </TableCell>
                        <TableCell>
                          <p className="max-w-[12rem] truncate text-sm text-muted-foreground">{c.court}</p>
                        </TableCell>
                        <TableCell>
                          {c.nextHearingDate && rel ? (
                            <div>
                              <p className={cn("text-sm font-medium", rel === "Today" && "text-emerald-700")}>{rel}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(c.nextHearingDate)}</p>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge map={priorityStyles} value={c.priority} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge map={caseStatusStyles} value={c.status} />
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
