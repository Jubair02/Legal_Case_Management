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
  HEARING_STATUS_LABELS,
  HEARING_TYPES,
  MAX_FILE_SIZE,
} from "@/lib/constants"
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

  useEffect(() => {
    if (open) {
      setSummary("")
      setOutcome("")
    }
  }, [open])

  const handleSubmit = async () => {
    if (!status) return
    if (!summary.trim()) {
      toast.error("Resolution summary is required.")
      return
    }
    try {
      setPending(true)
      await apiSend("PATCH", `/api/cases/${caseId}`, {
        status,
        resolutionSummary: summary.trim(),
        outcome: outcome.trim() || undefined,
      })
      toast.success(status === "CLOSED" ? "Case closed" : "Case marked resolved")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the case.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{status === "CLOSED" ? "Close Case" : "Mark Case Resolved"}</DialogTitle>
          <DialogDescription>
            A resolution summary is required to record this outcome in the case file.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="close-summary">
              Resolution Summary <span className="text-rose-600">*</span>
            </Label>
            <Textarea
              id="close-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              placeholder="How was the case resolved?"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="close-outcome">Outcome</Label>
            <Input
              id="close-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="e.g. Won, Settled, Dismissed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirm
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
      toast.error("Hearing date is required.")
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
      toast.success("Hearing scheduled")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule the hearing.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule Hearing</DialogTitle>
          <DialogDescription>Add a new hearing date to this case file.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="hearing-date">
              Hearing Date <span className="text-rose-600">*</span>
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
            <Label>Hearing Type</Label>
            <Select value={hearingType || undefined} onValueChange={setHearingType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {HEARING_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-judge">Judge</Label>
            <Input
              id="hearing-judge"
              value={judge}
              onChange={(e) => setJudge(e.target.value)}
              placeholder="Presiding judge"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-court">Court</Label>
            <Input
              id="hearing-court"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder={defaultCourt ?? "Court name"}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-notes">Notes</Label>
            <Textarea
              id="hearing-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything to prepare for this hearing…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Schedule Hearing
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
      toast.error("Hearing date is required.")
      return
    }
    const body: Record<string, unknown> = { status, hearingDate }
    if (summary.trim()) body.summary = summary.trim()
    if (courtOrder.trim()) body.courtOrder = courtOrder.trim()
    if (nextAction.trim()) body.nextAction = nextAction.trim()
    if (nextHearingDate) body.nextHearingDate = nextHearingDate
    if (notes.trim()) body.notes = notes.trim()
    try {
      setPending(true)
      await apiSend("PATCH", `/api/hearings/${hearing.id}`, body)
      toast.success("Hearing updated")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the hearing.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update Hearing</DialogTitle>
          <DialogDescription>
            {hearing ? `${hearing.caseNumber} · ${formatDate(hearing.hearingDate)}` : "Record the hearing outcome."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEARING_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {HEARING_STATUS_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="update-hearing-date">
              Hearing Date <span className="text-rose-600">*</span>
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
            <Label htmlFor="hearing-summary">Summary</Label>
            <Textarea
              id="hearing-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              placeholder="What happened in this hearing?"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-court-order">Court Order</Label>
            <Textarea
              id="hearing-court-order"
              value={courtOrder}
              onChange={(e) => setCourtOrder(e.target.value)}
              rows={2}
              placeholder="Order passed by the court…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-next-action">Next Action</Label>
            <Input
              id="hearing-next-action"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="e.g. Submit evidence list"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hearing-next-date">Next Hearing Date</Label>
            <Input
              id="hearing-next-date"
              type="date"
              value={nextHearingDate}
              onChange={(e) => setNextHearingDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="hearing-update-notes">Notes</Label>
            <Textarea
              id="hearing-update-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          If a Next Hearing Date is provided on completion, it is auto-created as an upcoming hearing.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Hearing
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
      toast.error("Please choose a file to upload.")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`)
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
      toast.success("Document uploaded")
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the document.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Attach a file to this case (PDF, Word, image or text · max 10 MB).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-file">
              File <span className="text-rose-600">*</span>
            </Label>
            <Input
              id="upload-file"
              type="file"
              accept=".pdf,.doc,.docx,image/*,.txt"
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
            <Label htmlFor="upload-name">Document Name</Label>
            <Input
              id="upload-name"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              placeholder="Display name for this document"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={documentType || undefined} onValueChange={setDocumentType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category || undefined} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-stone-200/80 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="share-client">Share with client portal</Label>
              <p className="text-xs text-muted-foreground">Client can view and download this document.</p>
            </div>
            <Switch id="share-client" checked={shared} onCheckedChange={setShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- main view ------------------------------- */

export default function CaseDetailView({ user, navigate, params }: ViewProps) {
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
          title="No case selected"
          description="Pick a case from the Case Management list to open its file."
          action={
            <Button variant="outline" onClick={() => navigate("cases")}>
              <ArrowLeft className="h-4 w-4" /> Back to Cases
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
          title="Could not load this case"
          description={error}
          action={
            <Button variant="outline" onClick={() => navigate("cases")}>
              <ArrowLeft className="h-4 w-4" /> Back to Cases
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
      toast.success(`Status set to ${status.replace(/_/g, " ").toLowerCase()}`)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the status.")
    }
  }

  const toggleShare = async (doc: DocumentDTO) => {
    try {
      setSharingId(doc.id)
      await apiSend("PATCH", `/api/documents/${doc.id}`, { sharedWithClient: !doc.sharedWithClient })
      toast.success(doc.sharedWithClient ? "Sharing turned off" : "Document shared with client")
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sharing.")
    } finally {
      setSharingId(null)
    }
  }

  const submitUpdate = async () => {
    if (!updateText.trim()) {
      toast.error("Please write an update first.")
      return
    }
    try {
      setUpdatePending(true)
      await apiSend("POST", `/api/cases/${detail.id}/updates`, { update: updateText.trim() })
      toast.success("Update added")
      setUpdateText("")
      setUpdateOpen(false)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the update.")
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
            <ArrowLeft className="h-4 w-4" /> Back to Cases
          </Button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-lg font-bold tracking-tight md:text-xl">{detail.caseNumber}</span>
              <StatusBadge map={caseStatusStyles} value={detail.status} />
              <StatusBadge map={priorityStyles} value={detail.priority} />
              {detail.nextHearingDate ? (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                  <CalendarDays className="h-3 w-3" />
                  Next: {formatRelativeDay(detail.nextHearingDate)}
                </Badge>
              ) : null}
            </div>
            <p className="text-lg font-semibold tracking-tight">{detail.title}</p>
          </div>

          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <FileText className="h-4 w-4" /> Edit Case
              </Button>
              {isAdmin || user.role === "STAFF" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Status <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Set Status</DropdownMenuLabel>
                    <DropdownMenuItem onSelect={() => void patchStatus("ACTIVE")}>Set Active</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void patchStatus("PENDING")}>Set Pending</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void patchStatus("ON_HOLD")}>Set On Hold</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setCloseStatus("RESOLVED")}>Mark Resolved</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCloseStatus("CLOSED")}>Close Case</DropdownMenuItem>
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
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Meta grid */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-stone-200/80 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetaItem label="Client">
            <span>{detail.client?.name ?? "—"}</span>
            {detail.client?.phone ? (
              <span className="block text-xs text-muted-foreground">{detail.client.phone}</span>
            ) : null}
          </MetaItem>
          <MetaItem label="Assigned Lawyer">
            {detail.lawyer?.name ?? <span className="italic text-muted-foreground">Unassigned</span>}
          </MetaItem>
          <MetaItem label="Court">{detail.court}</MetaItem>
          <MetaItem label="District">{detail.district ?? "—"}</MetaItem>
          <MetaItem label="Type">{detail.type}</MetaItem>
          <MetaItem label="Opposite Party">{detail.oppositeParty ?? "—"}</MetaItem>
          <MetaItem label="Filed">{formatDate(detail.filingDate)}</MetaItem>
          <MetaItem label="Created">{formatDateTime(detail.createdAt)}</MetaItem>
        </dl>
      </div>

      {/* Closed banner */}
      {isClosed && detail.resolutionSummary ? (
        <SectionCard title="Case Resolution" className="border-amber-300 bg-amber-50/60">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="whitespace-pre-wrap text-sm">{detail.resolutionSummary}</p>
            {detail.outcome ? (
              <Badge variant="outline" className="border-amber-300 bg-white text-amber-800">
                Outcome: {detail.outcome}
              </Badge>
            ) : null}
          </div>
          {detail.closedAt ? (
            <p className="mt-2 text-xs text-muted-foreground">Closed {formatDateTime(detail.closedAt)}</p>
          ) : null}
        </SectionCard>
      ) : null}

      {/* Tabs */}
      <Tabs defaultValue="hearings">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="hearings">Hearings</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          {showInvoices ? <TabsTrigger value="invoices">Invoices</TabsTrigger> : null}
        </TabsList>

        {/* ------------------------------ Overview ------------------------------ */}
        <TabsContent value="overview" className="mt-4 space-y-6">
          <SectionCard title="Description">
            {detail.description ? (
              <p className="whitespace-pre-wrap text-sm">{detail.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">No description provided.</p>
            )}
          </SectionCard>

          <SectionCard title="Case Information">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetaItem label="Case Number">
                <span className="font-mono font-semibold">{detail.caseNumber}</span>
              </MetaItem>
              <MetaItem label="Status">
                <StatusBadge map={caseStatusStyles} value={detail.status} />
              </MetaItem>
              <MetaItem label="Priority">
                <StatusBadge map={priorityStyles} value={detail.priority} />
              </MetaItem>
              <MetaItem label="Type">{detail.type}</MetaItem>
              <MetaItem label="Client">
                <span>{detail.client?.name ?? "—"}</span>
                {detail.client?.phone ? (
                  <span className="block text-xs text-muted-foreground">{detail.client.phone}</span>
                ) : null}
              </MetaItem>
              <MetaItem label="Assigned Lawyer">
                {detail.lawyer?.name ?? <span className="italic text-muted-foreground">Unassigned</span>}
              </MetaItem>
              <MetaItem label="Court">{detail.court}</MetaItem>
              <MetaItem label="District">{detail.district ?? "—"}</MetaItem>
              <MetaItem label="Opposite Party">{detail.oppositeParty ?? "—"}</MetaItem>
              <MetaItem label="Filed">{formatDate(detail.filingDate)}</MetaItem>
              <MetaItem label="Next Hearing">
                {detail.nextHearingDate
                  ? `${formatRelativeDay(detail.nextHearingDate)} · ${formatDate(detail.nextHearingDate)}`
                  : "—"}
              </MetaItem>
              <MetaItem label="Created">{formatDateTime(detail.createdAt)}</MetaItem>
            </dl>
          </SectionCard>

          {detail.resolutionSummary && !isClosed ? (
            <SectionCard title="Resolution">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="whitespace-pre-wrap text-sm">{detail.resolutionSummary}</p>
                {detail.outcome ? <Badge variant="outline">Outcome: {detail.outcome}</Badge> : null}
              </div>
            </SectionCard>
          ) : null}
        </TabsContent>

        {/* ------------------------------ Hearings ------------------------------ */}
        <TabsContent value="hearings" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {hearings.length} {hearings.length === 1 ? "hearing" : "hearings"} on record
            </p>
            {canWrite ? (
              <Button size="sm" onClick={() => setHearingFormOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> Schedule Hearing
              </Button>
            ) : null}
          </div>

          {hearings.length === 0 ? (
            <EmptyState
              icon={Gavel}
              title="No hearings yet"
              description="Scheduled hearings will appear here."
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
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge map={hearingStatusStyles} value={h.status} />
                          {h.hearingType ? <span className="text-sm font-medium">{h.hearingType}</span> : null}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {[h.judge, h.court].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {h.notes ? <p className="text-xs text-muted-foreground">{h.notes}</p> : null}
                      </div>
                    </div>
                    {canWrite ? (
                      <Button variant="outline" size="sm" onClick={() => setEditingHearing(h)}>
                        Update
                      </Button>
                    ) : null}
                  </div>

                  {h.nextHearingDate ? (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        <CalendarDays className="h-3 w-3" />
                        Next Hearing: {formatDate(h.nextHearingDate)}
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
              {documents.length} {documents.length === 1 ? "document" : "documents"} on file
            </p>
            {canWrite ? (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="h-4 w-4" /> Upload Document
              </Button>
            ) : null}
          </div>

          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No documents"
              description={
                canWrite ? "Upload court filings, evidence and supporting documents." : "No documents have been shared yet."
              }
            />
          ) : (
            <Card className="border-stone-200/80 py-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
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
                              <Users className="h-3 w-3" /> Shared
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.documentType ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.category ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatFileSize(doc.fileSize)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{doc.uploadedByName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={`/api/files/${doc.id}?download=1`} aria-label={`Download ${doc.documentName}`} title="Download">
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
                              title={doc.sharedWithClient ? "Stop sharing with client" : "Share with client"}
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
                              title="Delete document"
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
              {updates.length} {updates.length === 1 ? "entry" : "entries"}
            </p>
            {canWrite ? (
              <Button size="sm" onClick={() => setUpdateOpen(true)}>
                <MessageSquarePlus className="h-4 w-4" /> Add Update
              </Button>
            ) : null}
          </div>

          {updates.length === 0 ? (
            <EmptyState
              icon={MessageSquarePlus}
              title="No updates yet"
              description="Progress notes added by the chamber will appear here."
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
              <EmptyState icon={Receipt} title="No invoices" description="No invoices have been raised for this case." />
            ) : (
              <Card className="border-stone-200/80 py-2">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Invoice</TableHead>
                      <TableHead>Case</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Billing Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground">{inv.billingType ?? "—"}</TableCell>
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
                          <StatusBadge map={invoiceStatusStyles} value={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
            <p className="text-xs text-muted-foreground">
              {user.role === "CLIENT"
                ? "Contact your chamber to clear dues."
                : "Manage invoices and payments from Billing."}
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
          title="Delete this case?"
          description="Delete this case and all its hearings, documents and updates? This action cannot be undone."
          confirmLabel="Delete Case"
          destructive
          onConfirm={async () => {
            await apiSend("DELETE", `/api/cases/${detail.id}`)
            toast.success("Case deleted")
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
          title={`Delete "${docToDelete.documentName}"?`}
          description="The document and its file will be permanently removed from the case file."
          confirmLabel="Delete Document"
          destructive
          onConfirm={async () => {
            await apiSend("DELETE", `/api/documents/${docToDelete.id}`)
            toast.success("Document deleted")
            setDocToDelete(null)
            refetch()
          }}
        />
      ) : null}

      {/* Add update dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Case Update</DialogTitle>
            <DialogDescription>Progress notes are visible to the assigned team and the client portal.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={updateText}
            onChange={(e) => setUpdateText(e.target.value)}
            rows={4}
            placeholder="e.g. Written statement submitted to the court…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateOpen(false)} disabled={updatePending}>
              Cancel
            </Button>
            <Button onClick={() => void submitUpdate()} disabled={updatePending}>
              {updatePending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
