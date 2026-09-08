"use client"

import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Gavel,
  Loader2,
  MessageSquarePlus,
  Receipt,
  Trash2,
  Upload,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { CaseFormDialog } from "@/components/views/cases-view"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { SectionCard } from "@/components/shared/section-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { apiSend, apiUpload } from "@/lib/api-client"
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES,
  HEARING_STATUSES,
  HEARING_TYPES,
  MAX_FILE_SIZE,
  UPLOAD_ACCEPT,
} from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import {
  caseStatusStyles,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatRelativeDay,
  hearingStatusStyles,
  invoiceStatusStyles,
  priorityStyles,
  toDateInputValue,
} from "@/lib/utils"
import type {
  CaseDetailDTO,
  DocumentDTO,
  HearingDTO,
  ViewProps,
} from "@/lib/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

/** Sentinel for optional Radix Select values (empty string is not allowed). */
const NONE = "__none__"

/* ------------------------------- i18n helpers ------------------------------- */

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

/** Translates a domain enum value (hearing/document types, categories…), falling back to the raw value. */
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

/* ------------------------------- helpers ------------------------------- */

/** "10:30 AM" in Asia/Dhaka. */
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

/** "Mon" / "Tuesday" style weekday in Asia/Dhaka. */
function formatWeekday(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", weekday: "short" }).format(d)
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/* --------------------------- status quick actions --------------------------- */

function CloseCaseDialog({
  caseId,
  status,
  open,
  onOpenChange,
  onSaved,
}: {
  caseId: string
  status: "RESOLVED" | "CLOSED" | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [summary, setSummary] = useState("")
  const [outcome, setOutcome] = useState("")
  const [pending, setPending] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (open) {
      setSummary("")
      setOutcome("")
    }
  }, [open])

  const handleSubmit = async () => {
    if (!status) return
    if (!summary.trim()) {
      toast.error(t("caseDetail.errResolutionRequired"))
      return
    }
    try {
      setPending(true)
      await apiSend("PATCH", `/api/cases/${caseId}`, {
        status,
        resolutionSummary: summary.trim(),
        outcome: outcome.trim() || undefined,
      })
      toast.success(status === "CLOSED" ? t("caseDetail.toastClosed") : t("caseDetail.toastResolved"))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("caseDetail.errUpdate"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{status === "CLOSED" ? t("caseDetail.closeCase") : t("caseDetail.markResolvedTitle")}</DialogTitle>
          <DialogDescription>{t("caseDetail.closeDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="close-summary">
              {t("caseDetail.resolutionSummary")} <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              id="close-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder={t("caseDetail.resolutionPh")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="close-outcome">{t("caseDetail.outcome")}</Label>
            <Input
              id="close-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder={t("caseDetail.outcomePh")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- hearings ------------------------------- */

function HearingFormDialog({
  caseId,
  defaultCourt,
  open,
  onOpenChange,
  onSaved,
}: {
  caseId: string
  defaultCourt: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [hearingDate, setHearingDate] = useState("")
  const [hearingType, setHearingType] = useState("")
  const [judge, setJudge] = useState("")
  const [court, setCourt] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (open) {
      setHearingDate("")
      setHearingType("")
      setJudge("")
      setCourt("")
      setNotes("")
    }
  }, [open])

  const handleSubmit = async () => {
    if (!hearingDate) {
      toast.error(t("hearings.errDateRequired"))
      return
    }
    const body: Record<string, unknown> = { hearingDate }
    if (hearingType) body.hearingType = hearingType
    if (judge.trim()) body.judge = judge.trim()
    if (court.trim()) body.court = court.trim()
    if (notes.trim()) body.notes = notes.trim()
    try {
      setPending(true)
      await apiSend("POST", `/api/cases/${caseId}/hearings`, body)
      toast.success(t("hearings.toastScheduled"))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hearings.errSchedule"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hearings.scheduleHearing")}</DialogTitle>
          <DialogDescription>{t("hearings.scheduleDescInline")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hearing-date">
              {t("hearings.hearingDate")} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="hearing-date"
              type="date"
              value={hearingDate}
              onChange={(e) => setHearingDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t("hearings.hearingType")}</Label>
            <Select value={hearingType || undefined} onValueChange={setHearingType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("ui.selectType")} />
              </SelectTrigger>
              <SelectContent>
                {HEARING_TYPES.map((ht) => (
                  <SelectItem key={ht} value={ht}>
                    {enumLabel("hearings.type", ht, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-judge">{t("hearings.judge")}</Label>
            <Input
              id="hearing-judge"
              value={judge}
              onChange={(e) => setJudge(e.target.value)}
              placeholder={t("caseDetail.judgePh")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-court">{t("cases.court")}</Label>
            <Input
              id="hearing-court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder={defaultCourt ?? t("hearings.courtNamePh")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-notes">{t("common.notes")}</Label>
            <Textarea
              id="hearing-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("hearings.notesPhInline")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("hearings.scheduleHearing")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HearingUpdateDialog({
  hearing,
  open,
  onOpenChange,
  onSaved,
}: {
  hearing: HearingDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [status, setStatus] = useState("UPCOMING")
  const [hearingDate, setHearingDate] = useState("")
  const [summary, setSummary] = useState("")
  const [courtOrder, setCourtOrder] = useState("")
  const [nextAction, setNextAction] = useState("")
  const [nextHearingDate, setNextHearingDate] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (open && hearing) {
      setStatus(hearing.status || "UPCOMING")
      setHearingDate(toDateInputValue(hearing.hearingDate))
      setSummary(hearing.summary ?? "")
      setCourtOrder(hearing.courtOrder ?? "")
      setNextAction(hearing.nextAction ?? "")
      setNextHearingDate(toDateInputValue(hearing.nextHearingDate))
      setNotes(hearing.notes ?? "")
    }
  }, [open, hearing])

  const handleSubmit = async () => {
    if (!hearing) return
    if (!hearingDate) {
      toast.error(t("hearings.errDateRequired"))
      return
    }
    // Same contract as the Hearings page dialog: emptied fields clear the
    // stored value (the server maps "" -> null).
    const body: Record<string, unknown> = {
      status,
      hearingDate,
      notes: notes.trim() || null,
      summary: summary.trim() || null,
      courtOrder: courtOrder.trim() || null,
      nextAction: nextAction.trim() || null,
      nextHearingDate: nextHearingDate || null,
    }
    try {
      setPending(true)
      await apiSend("PATCH", `/api/hearings/${hearing.id}`, body)
      toast.success(t("hearings.toastUpdated"))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("hearings.errUpdate"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hearings.updateHearing")}</DialogTitle>
          <DialogDescription>
            {hearing ? `${hearing.caseNumber} · ${formatDate(hearing.hearingDate)}` : t("hearings.updateDescFallback")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("common.status")}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
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
          <div className="space-y-2">
            <Label htmlFor="update-hearing-date">
              {t("hearings.hearingDate")} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="update-hearing-date"
              type="date"
              value={hearingDate}
              onChange={(e) => setHearingDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-summary">{t("hearings.summary")}</Label>
            <Textarea
              id="hearing-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder={t("hearings.summaryPhInline")}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-court-order">{t("hearings.courtOrder")}</Label>
            <Textarea
              id="hearing-court-order"
              value={courtOrder}
              onChange={(e) => setCourtOrder(e.target.value)}
              rows={2}
              placeholder={t("hearings.courtOrderPhInline")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-next-action">{t("hearings.nextAction")}</Label>
            <Input
              id="hearing-next-action"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder={t("hearings.nextActionPhInline")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-next-date">{t("hearings.nextHearingDate")}</Label>
            <Input
              id="hearing-next-date"
              type="date"
              value={nextHearingDate}
              onChange={(e) => setNextHearingDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-update-notes">{t("common.notes")}</Label>
            <Textarea
              id="hearing-update-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("hearings.autoCreateHintInline")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("hearings.saveHearing")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- documents ------------------------------- */

function UploadDialog({
  caseId,
  open,
  onOpenChange,
  onSaved,
}: {
  caseId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [documentName, setDocumentName] = useState("")
  const [documentType, setDocumentType] = useState("")
  const [category, setCategory] = useState("")
  const [shared, setShared] = useState(false)
  const [pending, setPending] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (open) {
      setFile(null)
      setDocumentName("")
      setDocumentType("")
      setCategory("")
      setShared(false)
    }
  }, [open])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (f && !documentName.trim()) setDocumentName(f.name)
  }

  const handleSubmit = async () => {
    if (!file) {
      toast.error(t("documents.errChooseFile"))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("documents.errFileTooLargeCd", { size: formatFileSize(MAX_FILE_SIZE) }))
      return
    }
    const form = new FormData()
    form.append("file", file)
    form.append("documentName", documentName.trim() || file.name)
    if (documentType) form.append("documentType", documentType)
    if (category) form.append("category", category)
    form.append("sharedWithClient", shared ? "true" : "false")
    try {
      setPending(true)
      await apiUpload(`/api/cases/${caseId}/documents`, form)
      toast.success(t("documents.toastUploaded"))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("documents.errUploadCd"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("documents.uploadDocument")}</DialogTitle>
          <DialogDescription>{t("documents.uploadDescInline")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-file">
              {t("documents.file")} <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="upload-file"
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={handleFileChange}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1 file:text-sm file:font-medium"
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatFileSize(file.size)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="upload-name">{t("documents.documentName")}</Label>
            <Input
              id="upload-name"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder={t("documents.namePhInline")}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("common.type")}</Label>
              <Select value={documentType || undefined} onValueChange={setDocumentType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("ui.selectType")} />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {enumLabel("documents.type", dt, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("documents.category")}</Label>
              <Select value={category || undefined} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("documents.selectCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((dc) => (
                    <SelectItem key={dc} value={dc}>
                      {enumLabel("documents.cat", dc, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-stone-200/80 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="share-client">{t("documents.shareWithClient")}</Label>
              <p className="text-xs text-muted-foreground">{t("documents.shareHintInline")}</p>
            </div>
            <Switch id="share-client" checked={shared} onCheckedChange={setShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("common.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- main view ------------------------------- */

export default function CaseDetailView({ user, navigate, params }: ViewProps) {
  const { t } = useLanguage()
  const id = params.id
  const { data: detail, loading, error, refetch } = useApiData<CaseDetailDTO>(
    id ? `/api/cases/${id}` : null
  )

  const [editOpen, setEditOpen] = useState(false)
  const [closeStatus, setCloseStatus] = useState<"RESOLVED" | "CLOSED" | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [hearingFormOpen, setHearingFormOpen] = useState(false)
  const [editingHearing, setEditingHearing] = useState<HearingDTO | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [docToDelete, setDocToDelete] = useState<DocumentDTO | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateText, setUpdateText] = useState("")
  const [updatePending, setUpdatePending] = useState(false)

  const isAdmin = user.role === "ADMIN"
  const canWrite = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LAWYER"
  const showInvoices = Array.isArray(detail?.invoices) && user.role !== "STAFF"

  if (!id) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={FolderOpen}
          title={t("ui.noCaseSelected")}
          description={t("caseDetail.noCaseSelectedDesc")}
          action={
            <Button variant="outline" onClick={() => navigate("cases")}>
              <ArrowLeft className="h-4 w-4" /> {t("caseDetail.backToCases")}
            </Button>
          }
        />
      </div>
    )
  }

  if (loading && !detail) return <LoadingBlock rows={6} />

  if (error && !detail) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={AlertTriangle}
          title={t("caseDetail.errLoad")}
          description={error}
          action={
            <Button variant="outline" onClick={() => navigate("cases")}>
              <ArrowLeft className="h-4 w-4" /> {t("caseDetail.backToCases")}
            </Button>
          }
        />
      </div>
    )
  }

  if (!detail) return <LoadingBlock rows={6} />

  const isClosed = detail.status === "RESOLVED" || detail.status === "CLOSED"
  const hearings = Array.isArray(detail.hearings) ? detail.hearings : []
  const documents = Array.isArray(detail.documents) ? detail.documents : []
  const updates = Array.isArray(detail.updates) ? detail.updates : []
  const invoices = Array.isArray(detail.invoices) ? detail.invoices : []

  const patchStatus = async (status: string) => {
    try {
      await apiSend("PATCH", `/api/cases/${detail.id}`, { status })
      toast.success(t("caseDetail.toastStatusSet", { status: statusLabel(status, t) }))
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("caseDetail.errStatus"))
    }
  }

  const toggleShare = async (doc: DocumentDTO) => {
    try {
      setSharingId(doc.id)
      await apiSend("PATCH", `/api/documents/${doc.id}`, { sharedWithClient: !doc.sharedWithClient })
      toast.success(doc.sharedWithClient ? t("caseDetail.toastSharingOff") : t("caseDetail.toastShared"))
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("caseDetail.errSharing"))
    } finally {
      setSharingId(null)
    }
  }

  const submitUpdate = async () => {
    if (!updateText.trim()) {
      toast.error(t("caseDetail.errEmptyUpdate"))
      return
    }
    try {
      setUpdatePending(true)
      await apiSend("POST", `/api/cases/${detail.id}/updates`, { update: updateText.trim() })
      toast.success(t("caseDetail.toastUpdateAdded"))
      setUpdateText("")
      setUpdateOpen(false)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("caseDetail.errUpdateAdd"))
    } finally {
      setUpdatePending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("cases")}>
            <ArrowLeft className="h-4 w-4" /> {t("caseDetail.backToCases")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold tracking-tight md:text-xl">{detail.caseNumber}</span>
              <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={detail.status} />
              <StatusBadge map={translatedStyles(priorityStyles, t)} value={detail.priority} />
              {detail.nextHearingDate ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  <CalendarDays className="h-3 w-3" />
                  {t("caseDetail.nextBadge", { date: relDay(formatRelativeDay(detail.nextHearingDate), t) })}
                </Badge>
              ) : null}
            </div>
            <p className="text-lg font-semibold tracking-tight">{detail.title}</p>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <FileText className="h-4 w-4" /> {t("caseDetail.editCase")}
              </Button>
              {isAdmin || user.role === "STAFF" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      {t("common.status")} <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t("caseDetail.setStatus")}</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => void patchStatus("ACTIVE")}>{t("caseDetail.setActive")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void patchStatus("PENDING")}>{t("caseDetail.setPending")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void patchStatus("ON_HOLD")}>{t("caseDetail.setOnHold")}</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setCloseStatus("RESOLVED")}>{t("caseDetail.markResolved")}</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCloseStatus("CLOSED")}>{t("caseDetail.closeCase")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" /> {t("common.delete")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Meta grid */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-stone-200/80 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetaItem label={t("caseDetail.metaClient")}>
            <span>{detail.client?.name ?? "—"}</span>
            {detail.client?.phone ? (
              <span className="block text-xs text-muted-foreground">{detail.client.phone}</span>
            ) : null}
          </MetaItem>
          <MetaItem label={t("caseDetail.metaLawyer")}>
            {detail.lawyer?.name ?? <span className="italic text-muted-foreground">{t("cases.unassigned")}</span>}
          </MetaItem>
          <MetaItem label={t("caseDetail.metaCourt")}>{detail.court}</MetaItem>
          <MetaItem label={t("caseDetail.metaDistrict")}>{detail.district ?? "—"}</MetaItem>
          <MetaItem label={t("caseDetail.metaType")}>{enumLabel("cases.type", detail.type, t)}</MetaItem>
          <MetaItem label={t("caseDetail.metaOppositeParty")}>{detail.oppositeParty ?? "—"}</MetaItem>
          <MetaItem label={t("caseDetail.metaFiled")}>{formatDate(detail.filingDate)}</MetaItem>
          <MetaItem label={t("caseDetail.metaCreated")}>{formatDateTime(detail.createdAt)}</MetaItem>
        </dl>
      </div>

      {/* Closed banner */}
      {isClosed && detail.resolutionSummary ? (
        <SectionCard title={t("caseDetail.resolutionCard")} className="border-amber-300 bg-amber-50/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="whitespace-pre-wrap text-sm">{detail.resolutionSummary}</p>
            {detail.outcome ? (
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                {t("caseDetail.outcomeBadge", { outcome: detail.outcome })}
              </Badge>
            ) : null}
          </div>
          {detail.closedAt ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("caseDetail.closedAt", { datetime: formatDateTime(detail.closedAt) })}</p>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("caseDetail.tabOverview")}</TabsTrigger>
          <TabsTrigger value="hearings">{t("caseDetail.tabHearings")}</TabsTrigger>
          <TabsTrigger value="documents">{t("caseDetail.tabDocuments")}</TabsTrigger>
          <TabsTrigger value="updates">{t("caseDetail.tabUpdates")}</TabsTrigger>
          {showInvoices ? <TabsTrigger value="invoices">{t("caseDetail.tabInvoices")}</TabsTrigger> : null}
        </TabsList>

        {/* ------------------------------ Overview ------------------------------ */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <SectionCard title={t("common.description")}>
            {detail.description ? (
              <p className="whitespace-pre-wrap text-sm">{detail.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">{t("caseDetail.noDescription")}</p>
            )}
          </SectionCard>

          <SectionCard title={t("caseDetail.caseInfo")}>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetaItem label={t("caseDetail.metaCaseNumber")}>
                <span className="font-mono font-semibold">{detail.caseNumber}</span>
              </MetaItem>
              <MetaItem label={t("caseDetail.metaStatus")}>
                <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={detail.status} />
              </MetaItem>
              <MetaItem label={t("caseDetail.metaPriority")}>
                <StatusBadge map={translatedStyles(priorityStyles, t)} value={detail.priority} />
              </MetaItem>
              <MetaItem label={t("caseDetail.metaType")}>{enumLabel("cases.type", detail.type, t)}</MetaItem>
              <MetaItem label={t("caseDetail.metaClient")}>
                <span>{detail.client?.name ?? "—"}</span>
                {detail.client?.phone ? (
                  <span className="block text-xs text-muted-foreground">{detail.client.phone}</span>
                ) : null}
              </MetaItem>
              <MetaItem label={t("caseDetail.metaLawyer")}>
                {detail.lawyer?.name ?? <span className="italic text-muted-foreground">{t("cases.unassigned")}</span>}
              </MetaItem>
              <MetaItem label={t("caseDetail.metaCourt")}>{detail.court}</MetaItem>
              <MetaItem label={t("caseDetail.metaDistrict")}>{detail.district ?? "—"}</MetaItem>
              <MetaItem label={t("caseDetail.metaOppositeParty")}>{detail.oppositeParty ?? "—"}</MetaItem>
              <MetaItem label={t("caseDetail.metaFiled")}>{formatDate(detail.filingDate)}</MetaItem>
              <MetaItem label={t("caseDetail.metaNextHearing")}>
                {detail.nextHearingDate
                  ? `${relDay(formatRelativeDay(detail.nextHearingDate), t)} · ${formatDate(detail.nextHearingDate)}`
                  : "—"}
              </MetaItem>
              <MetaItem label={t("caseDetail.metaCreated")}>{formatDateTime(detail.createdAt)}</MetaItem>
            </dl>
          </SectionCard>

          {detail.resolutionSummary && !isClosed ? (
            <SectionCard title={t("caseDetail.resolutionTitle")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="whitespace-pre-wrap text-sm">{detail.resolutionSummary}</p>
                {detail.outcome ? (
                  <Badge variant="outline">{t("caseDetail.outcomeBadge", { outcome: detail.outcome })}</Badge>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
        </TabsContent>

        {/* ------------------------------ Hearings ------------------------------ */}
        <TabsContent value="hearings" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t(hearings.length === 1 ? "caseDetail.hearingCountOne" : "caseDetail.hearingCountOther", {
                count: hearings.length,
              })}
            </p>
            {canWrite ? (
              <Button size="sm" onClick={() => setHearingFormOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> {t("hearings.scheduleHearing")}
              </Button>
            ) : null}
          </div>

          {hearings.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title={t("caseDetail.noHearings")}
              description={t("caseDetail.noHearingsDesc")}
            />
          ) : (
            <div className="space-y-3">
              {hearings.map((h) => (
                <Card key={h.id} className="gap-3 border-stone-200/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="w-20 shrink-0 rounded-lg border border-stone-200/80 bg-stone-50 p-2 text-center">
                        <p className="text-sm font-bold leading-tight">{formatDate(h.hearingDate)}</p>
                        <p className="text-[11px] text-muted-foreground">{formatWeekday(h.hearingDate)}</p>
                        <p className="text-xs font-medium text-emerald-700">{formatTime(h.hearingDate)}</p>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <StatusBadge map={translatedStyles(hearingStatusStyles, t)} value={h.status} />
                          {h.hearingType ? (
                            <span className="text-sm font-medium">{enumLabel("hearings.type", h.hearingType, t)}</span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {[h.judge, h.court].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {h.notes ? <p className="text-xs text-muted-foreground">{h.notes}</p> : null}
                      </div>
                    </div>
                    {canWrite ? (
                      <Button variant="outline" size="sm" onClick={() => setEditingHearing(h)}>
                        {t("hearings.update")}
                      </Button>
                    ) : null}
                  </div>

                  {h.nextHearingDate ? (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        <CalendarDays className="h-3 w-3" />
                        {t("caseDetail.nextHearingBadge", { date: formatDate(h.nextHearingDate) })}
                      </Badge>
                    </div>
                  ) : null}

                  {h.summary || h.courtOrder || h.nextAction ? (
                    <div className="space-y-1.5 border-t border-stone-100 pt-3">
                      {h.summary ? (
                        <p className="flex items-start gap-2 text-xs text-muted-foreground">
                          <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {h.summary}
                        </p>
                      ) : null}
                      {h.courtOrder ? (
                        <p className="flex items-start gap-2 text-xs text-muted-foreground">
                          <Gavel className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {h.courtOrder}
                        </p>
                      ) : null}
                      {h.nextAction ? (
                        <p className="flex items-start gap-2 text-xs text-muted-foreground">
                          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {h.nextAction}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------ Documents ------------------------------ */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t(documents.length === 1 ? "caseDetail.docCountOne" : "caseDetail.docCountOther", {
                count: documents.length,
              })}
            </p>
            {canWrite ? (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" /> {t("documents.uploadDocument")}
              </Button>
            ) : null}
          </div>

          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={t("caseDetail.noDocuments")}
              description={canWrite ? t("caseDetail.noDocumentsDescWrite") : t("caseDetail.noDocumentsDescClient")}
            />
          ) : (
            <Card className="border-stone-200/80 py-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">{t("caseDetail.colDocument")}</TableHead>
                    <TableHead>{t("common.type")}</TableHead>
                    <TableHead>{t("documents.category")}</TableHead>
                    <TableHead>{t("documents.colSize")}</TableHead>
                    <TableHead>{t("documents.colUploadedBy")}</TableHead>
                    <TableHead>{t("common.date")}</TableHead>
                    <TableHead className="pr-4 text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="pl-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{doc.documentName}</span>
                          {doc.sharedWithClient ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-800"
                            >
                              <Users className="h-3 w-3" /> {t("documents.sharedBadge")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.documentType ? enumLabel("documents.type", doc.documentType, t) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.category ? enumLabel("documents.cat", doc.category, t) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatFileSize(doc.fileSize)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.uploadedByName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={`/api/files/${doc.id}?download=1`} aria-label={t("documents.downloadAria", { name: doc.documentName })} title={t("common.download")}>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                          {canWrite ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={sharingId === doc.id}
                              onClick={() => void toggleShare(doc)}
                              title={doc.sharedWithClient ? t("documents.stopSharing") : t("documents.shareWithClient")}
                            >
                              {sharingId === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : doc.sharedWithClient ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                          ) : null}
                          {canWrite ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => setDocToDelete(doc)}
                              title={t("documents.deleteTitle")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ------------------------------- Updates ------------------------------- */}
        <TabsContent value="updates" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t(updates.length === 1 ? "caseDetail.updateCountOne" : "caseDetail.updateCountOther", {
                count: updates.length,
              })}
            </p>
            {canWrite ? (
              <Button size="sm" onClick={() => setUpdateOpen(true)}>
                <MessageSquarePlus className="h-4 w-4" /> {t("caseDetail.addUpdate")}
              </Button>
            ) : null}
          </div>

          {updates.length === 0 ? (
            <EmptyState
              icon={MessageSquarePlus}
              title={t("caseDetail.noUpdates")}
              description={t("caseDetail.noUpdatesDesc")}
            />
          ) : (
            <div className="ml-2 space-y-6 border-l-2 border-emerald-200 pl-6">
              {updates.map((u) => (
                <div key={u.id} className="relative">
                  <span className="absolute -left-[1.9rem] top-1 h-3 w-3 rounded-full border-2 border-emerald-500 bg-white" />
                  <p className="whitespace-pre-wrap text-sm">{u.update}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.createdByName ?? "—"} · {formatDateTime(u.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------- Invoices ------------------------------- */}
        {showInvoices ? (
          <TabsContent value="invoices" className="mt-4 space-y-4">
            {invoices.length === 0 ? (
              <EmptyState icon={Receipt} title={t("caseDetail.noInvoices")} description={t("caseDetail.noInvoicesDesc")} />
            ) : (
              <Card className="border-stone-200/80 py-2">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">{t("billing.colInvoice")}</TableHead>
                      <TableHead>{t("billing.colCase")}</TableHead>
                      <TableHead>{t("billing.colClient")}</TableHead>
                      <TableHead>{t("billing.colBillingType")}</TableHead>
                      <TableHead className="text-right">{t("common.amount")}</TableHead>
                      <TableHead className="text-right">{t("billing.colPaid")}</TableHead>
                      <TableHead>{t("billing.colDue")}</TableHead>
                      <TableHead className="pr-4">{t("common.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="pl-4 font-semibold">{inv.invoiceNumber}</TableCell>
                        <TableCell>
                          {inv.caseNumber ? (
                            <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
                              {inv.caseNumber}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{inv.clientName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.billingType ? enumLabel("billing.type", inv.billingType, t) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(inv.amount)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatCurrency(inv.paidAmount)}
                        </TableCell>
                        <TableCell
                          className={cn("text-sm", inv.status === "OVERDUE" && "font-medium text-rose-600")}
                        >
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell className="pr-4">
                          <StatusBadge map={translatedStyles(invoiceStatusStyles, t)} value={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
            <p className="text-xs text-muted-foreground">
              {user.role === "CLIENT" ? t("caseDetail.invoicesNoteClient") : t("caseDetail.invoicesNoteStaff")}
            </p>
          </TabsContent>
        ) : null}
      </Tabs>

      {/* Dialogs */}
      <CaseFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={refetch}
        editing={detail}
        actorRole={user.role}
      />
      <CloseCaseDialog
        caseId={detail.id}
        status={closeStatus}
        open={closeStatus !== null}
        onOpenChange={(open) => {
          if (!open) setCloseStatus(null)
        }}
        onSaved={refetch}
      />
      {isAdmin ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={t("cases.deleteConfirmTitle")}
          description={t("cases.deleteConfirmDesc")}
          confirmLabel={t("cases.deleteConfirmBtn")}
          destructive
          onConfirm={async () => {
            await apiSend("DELETE", `/api/cases/${detail.id}`)
            toast.success(t("cases.toastDeleted"))
            navigate("cases")
          }}
        />
      ) : null}
      <HearingFormDialog
        caseId={detail.id}
        defaultCourt={detail.court}
        open={hearingFormOpen}
        onOpenChange={setHearingFormOpen}
        onSaved={refetch}
      />
      <HearingUpdateDialog
        hearing={editingHearing}
        open={editingHearing !== null}
        onOpenChange={(open) => {
          if (!open) setEditingHearing(null)
        }}
        onSaved={refetch}
      />
      <UploadDialog
        caseId={detail.id}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSaved={refetch}
      />
      {docToDelete ? (
        <ConfirmDialog
          open={docToDelete !== null}
          onOpenChange={(open) => {
            if (!open) setDocToDelete(null)
          }}
          title={t("documents.deleteConfirmTitleNamed", { name: docToDelete.documentName })}
          description={t("documents.deleteConfirmDescCd")}
          confirmLabel={t("documents.deleteConfirmBtn")}
          destructive
          onConfirm={async () => {
            await apiSend("DELETE", `/api/documents/${docToDelete.id}`)
            toast.success(t("documents.toastDeleted"))
            setDocToDelete(null)
            refetch()
          }}
        />
      ) : null}

      {/* Add update dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("caseDetail.addUpdateTitle")}</DialogTitle>
            <DialogDescription>{t("caseDetail.addUpdateDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            rows={4}
            placeholder={t("caseDetail.updatePh")}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={updatePending}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submitUpdate()} disabled={updatePending}>
              {updatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("caseDetail.addUpdate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
