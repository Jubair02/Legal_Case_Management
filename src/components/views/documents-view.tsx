"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  FolderOpen,
  HardDrive,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DialogHead, FieldGroup, RequiredMark } from "@/components/shared/dialog-chrome"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiSend, apiUpload } from "@/lib/api-client"
import { DOCUMENT_CATEGORIES, DOCUMENT_TYPES, MAX_FILE_SIZE, UPLOAD_ACCEPT } from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { CaseDetailDTO, CaseListDTO, DocumentDTO, ViewProps } from "@/lib/types"
import { caseStatusStyles, cn, formatDate, formatFileSize, formatRelativeDay } from "@/lib/utils"
import { useResetOnOpen } from "@/lib/use-reset-on-open"

/* ------------------------------- enum labels ------------------------------- */

/**
 * Builds a derived enum dictionary key: enumTKey("documents.type", "Court Order")
 * → "documents.typeCourtOrder". Non-alphanumeric runs split words.
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

/** Translates a domain enum value (document types/categories, case types), falling back to the raw value. */
function enumLabel(prefix: string, value: string | null | undefined, t: TranslateFn): string {
  if (!value) return "—"
  const key = enumTKey(prefix, value)
  const translated = t(key)
  return translated === key ? value : translated
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

/** formatRelativeDay speaks English; route its three relative days through the dictionary. */
function relDay(iso: string | null | undefined, t: TranslateFn): string {
  const rel = formatRelativeDay(iso)
  if (rel === "Today") return t("common.today")
  if (rel === "Yesterday") return t("common.yesterday")
  if (rel === "Tomorrow") return t("common.tomorrow")
  return rel
}

/* ------------------------------ file visuals ------------------------------ */

/** Icon-plate tints, matching the tone vocabulary of StatCard and case-detail-view. */
const FILE_TONES = {
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/15",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  gold: "bg-brass-tint text-brass-deep ring-brass/25",
  stone: "bg-stone-100 text-stone-600 ring-stone-500/15",
} as const

type FileTone = keyof typeof FILE_TONES

/** Picks an icon + tint for a document from its MIME type. */
function fileVisual(mimeType: string | null | undefined): { Icon: LucideIcon; tone: FileTone } {
  const m = (mimeType ?? "").toLowerCase()
  if (m.startsWith("image/")) return { Icon: FileImage, tone: "teal" }
  if (m.includes("pdf")) return { Icon: FileText, tone: "rose" }
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) {
    return { Icon: FileSpreadsheet, tone: "emerald" }
  }
  if (m.includes("word") || m.includes("officedocument")) return { Icon: FileText, tone: "gold" }
  return { Icon: FileText, tone: "stone" }
}

/** "vakalatnama.pdf" → "PDF". Absent/implausible extensions yield null rather than noise. */
function fileExt(fileName: string | null | undefined): string | null {
  if (!fileName || !fileName.includes(".")) return null
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  return ext.length > 0 && ext.length <= 5 ? ext.toUpperCase() : null
}

/** Left accent stripe per case status — carries the same meaning as the badge. */
const CASE_STRIPES: Record<string, string> = {
  DRAFT: "bg-stone-300",
  ACTIVE: "bg-emerald-500",
  PENDING: "bg-amber-400",
  ON_HOLD: "bg-orange-400",
  RESOLVED: "bg-teal-400",
  CLOSED: "bg-slate-300",
}

/* ------------------------------ filter config ------------------------------ */

const ACCESS_TABS = [
  { key: "all", labelKey: "common.all", descKey: "documents.filterAllDesc" },
  { key: "shared", labelKey: "ui.shared", descKey: "documents.filterSharedDesc" },
  { key: "internal", labelKey: "documents.filterInternal", descKey: "documents.filterInternalDesc" },
] as const

type AccessTab = (typeof ACCESS_TABS)[number]["key"]

const SORTS = [
  { key: "newest", labelKey: "documents.sortNewest" },
  { key: "oldest", labelKey: "documents.sortOldest" },
  { key: "name", labelKey: "documents.sortName" },
  { key: "largest", labelKey: "documents.sortLargest" },
] as const

type SortKey = (typeof SORTS)[number]["key"]

/** Radix Select cannot hold an empty value; "all" is the unfiltered sentinel. */
const ALL = "all"

/** Sentinel for optional Select values in the upload form. */
const NONE = "__none__"

/** Extensions the file picker advertises, reused to reject a dropped file early. */
const ALLOWED_EXT = UPLOAD_ACCEPT.split(",").map((e) => e.trim().toLowerCase())

/* ------------------------------- Upload dialog ------------------------------- */

function UploadDocumentDialog({
  caseId,
  caseNumber,
  open,
  onOpenChange,
  onUploaded,
}: {
  caseId: string
  caseNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState("")
  const [type, setType] = useState(NONE)
  const [category, setCategory] = useState(NONE)
  const [share, setShare] = useState(false)
  const [pending, setPending] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const lastFileNameRef = useRef("")
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { t } = useLanguage()

  useResetOnOpen(open ? "open" : null, () => {
    setFile(null)
    setName("")
    setType(NONE)
    setCategory(NONE)
    setShare(false)
    setPending(false)
    setDragging(false)
    setFileError(null)
    lastFileNameRef.current = ""
  })

  /**
   * Validates locally — the server re-checks both rules — and prefills the
   * display name from the file name unless a custom one was typed.
   */
  const acceptFile = (f: File | null) => {
    if (!f) return
    const ext = f.name.includes(".") ? `.${f.name.split(".").pop()?.toLowerCase()}` : ""
    if (!ALLOWED_EXT.includes(ext)) {
      setFileError(t("documents.errFileType"))
      return
    }
    if (f.size > MAX_FILE_SIZE) {
      setFileError(t("documents.errFileTooLargeCd", { size: formatFileSize(MAX_FILE_SIZE) }))
      return
    }
    setFileError(null)
    setFile(f)
    setName((prev) => (!prev || prev === lastFileNameRef.current ? f.name : prev))
    lastFileNameRef.current = f.name
  }

  const clearFile = () => {
    setFile(null)
    setFileError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const submit = async () => {
    if (!file) {
      setFileError(t("documents.errChooseFile"))
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("documentName", name.trim() || file.name)
    if (type !== NONE) fd.append("documentType", type)
    if (category !== NONE) fd.append("category", category)
    fd.append("sharedWithClient", share ? "true" : "false")
    try {
      setPending(true)
      await apiUpload<DocumentDTO>(`/api/cases/${caseId}/documents`, fd)
      toast.success(t("documents.toastUploaded"))
      onOpenChange(false)
      onUploaded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("documents.errUpload"))
    } finally {
      setPending(false)
    }
  }

  const visual = fileVisual(file?.type)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHead
          icon={UploadCloud}
          title={t("documents.uploadDocument")}
          description={t("documents.uploadDesc", { caseNumber })}
        />

        <div className="space-y-6 py-1">
          <FieldGroup label={t("documents.file")}>
            {/* The dropzone below is the accessible control; the input is only a picker. */}
            <input
              ref={inputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              tabIndex={-1}
              aria-hidden
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />

            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-paper-shade/60 p-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
                    FILE_TONES[visual.tone]
                  )}
                >
                  <visual.Icon className="h-[1.15rem] w-[1.15rem]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {[formatFileSize(file.size), fileExt(file.name)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 cursor-pointer"
                  onClick={() => inputRef.current?.click()}
                  disabled={pending}
                >
                  {t("ui.change")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 cursor-pointer"
                  onClick={clearFile}
                  disabled={pending}
                  aria-label={t("documents.removeFile")}
                  title={t("documents.removeFile")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  acceptFile(e.dataTransfer.files?.[0] ?? null)
                }}
                aria-label={t("documents.dropzoneAria")}
                aria-describedby="doc-file-hint"
                className={cn(
                  "flex w-full cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  dragging
                    ? "border-primary/50 bg-primary/[0.06]"
                    : "border-border bg-paper-shade/50 hover:border-primary/35 hover:bg-primary/[0.04]"
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-ink">
                  {t("documents.dropzoneTitle")} <RequiredMark />
                </span>
                <span id="doc-file-hint" className="text-xs text-muted-foreground">
                  {t("documents.dropzoneHint")}
                </span>
              </button>
            )}

            {fileError ? (
              <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-rose-600">
                <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
                {fileError}
              </p>
            ) : null}
          </FieldGroup>

          <FieldGroup label={t("documents.groupDetails")}>
            <div className="space-y-1.5">
              <Label htmlFor="doc-name">{t("documents.documentName")}</Label>
              <Input
                id="doc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("documents.namePh")}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="doc-type">{t("common.type")}</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="doc-type" className="w-full cursor-pointer">
                    <SelectValue placeholder={t("ui.notSpecified")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("ui.notSpecified")}</SelectItem>
                    {DOCUMENT_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {enumLabel("documents.type", dt, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc-category">{t("documents.category")}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="doc-category" className="w-full cursor-pointer">
                    <SelectValue placeholder={t("ui.notSpecified")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("ui.notSpecified")}</SelectItem>
                    {DOCUMENT_CATEGORIES.map((dc) => (
                      <SelectItem key={dc} value={dc}>
                        {enumLabel("documents.cat", dc, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("documents.groupAccess")}>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-paper-shade/60 p-3">
              <div className="min-w-0">
                <Label htmlFor="doc-share" className="cursor-pointer">
                  {t("documents.shareWithClient")}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("documents.shareHint")}</p>
              </div>
              <Switch
                id="doc-share"
                checked={share}
                onCheckedChange={setShare}
                className="cursor-pointer"
              />
            </div>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
          <Button className="cursor-pointer" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {pending ? t("ui.uploading") : t("common.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function DocumentsView({ user }: ViewProps) {
  const { t } = useLanguage()
  const isClient = user.role === "CLIENT"
  const canWrite = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LAWYER"

  const {
    data: casesData,
    loading: casesLoading,
    error: casesError,
    refetch: refetchCases,
  } = useApiData<CaseListDTO[]>("/api/cases")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [caseSearch, setCaseSearch] = useState("")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DocumentDTO | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)

  // Document-level filters, applied client-side to the selected case file.
  const [docQuery, setDocQuery] = useState("")
  const [access, setAccess] = useState<AccessTab>("all")
  const [docType, setDocType] = useState(ALL)
  const [docCategory, setDocCategory] = useState(ALL)
  const [sort, setSort] = useState<SortKey>("newest")

  const cases = useMemo(() => casesData ?? [], [casesData])

  // Select the first case once the list arrives from the server; there is no
  // earlier point at which a default can be chosen.
  /* eslint-disable react-hooks/set-state-in-effect -- defaulting from fetched data */
  useEffect(() => {
    if (!selectedId && cases.length > 0) setSelectedId(cases[0].id)
  }, [cases, selectedId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const {
    data: detail,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useApiData<CaseDetailDTO>(selectedId ? `/api/cases/${selectedId}` : null)

  const documents = useMemo(() => detail?.documents ?? [], [detail])

  // A different case file is a different cabinet — open it unfiltered.
  useResetOnOpen(selectedId, () => {
    setDocQuery("")
    setAccess("all")
    setDocType(ALL)
    setDocCategory(ALL)
    setSort("newest")
  })

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase()
    if (!q) return cases
    return cases.filter((c) =>
      [c.caseNumber, c.title, c.type].some((v) => v.toLowerCase().includes(q))
    )
  }, [cases, caseSearch])

  const selectedCase = cases.find((c) => c.id === selectedId) ?? null
  const activeCase = detail ?? selectedCase

  /** Case-file vitals, always measured against the whole case (never the filters). */
  const metrics = useMemo(() => {
    let shared = 0
    let size = 0
    let latest: string | null = null
    for (const d of documents) {
      if (d.sharedWithClient) shared += 1
      size += d.fileSize ?? 0
      if (!latest || Date.parse(d.createdAt) > Date.parse(latest)) latest = d.createdAt
    }
    return { total: documents.length, shared, size, latest }
  }, [documents])

  const visible = useMemo(() => {
    const q = docQuery.trim().toLowerCase()
    const rows = documents.filter((d) => {
      if (access === "shared" && !d.sharedWithClient) return false
      if (access === "internal" && d.sharedWithClient) return false
      if (docType !== ALL && d.documentType !== docType) return false
      if (docCategory !== ALL && d.category !== docCategory) return false
      if (!q) return true
      return [d.documentName, d.fileName, d.documentType, d.category, d.uploadedByName].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      )
    })
    return rows.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return Date.parse(a.createdAt) - Date.parse(b.createdAt)
        case "name":
          return a.documentName.localeCompare(b.documentName)
        case "largest":
          return (b.fileSize ?? 0) - (a.fileSize ?? 0)
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt)
      }
    })
  }, [documents, access, docType, docCategory, docQuery, sort])

  const hasDocFilters =
    access !== "all" || docType !== ALL || docCategory !== ALL || docQuery.trim().length > 0

  const clearDocFilters = () => {
    setAccess("all")
    setDocType(ALL)
    setDocCategory(ALL)
    setDocQuery("")
  }

  const accessDescription = t(ACCESS_TABS.find((tab) => tab.key === access)?.descKey ?? "documents.filterAllDesc")

  const toggleShare = async (doc: DocumentDTO) => {
    try {
      setSharingId(doc.id)
      await apiSend<DocumentDTO>("PATCH", `/api/documents/${doc.id}`, {
        sharedWithClient: !doc.sharedWithClient,
      })
      toast.success(doc.sharedWithClient ? t("caseDetail.toastSharingOff") : t("caseDetail.toastShared"))
      refetchDetail()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("caseDetail.errSharing"))
    } finally {
      setSharingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await apiSend("DELETE", `/api/documents/${deleteTarget.id}`)
    toast.success(t("documents.toastDeletedFor", { name: deleteTarget.documentName }))
    refetchDetail()
  }

  /** View / download / share / delete cluster for one document. `big` sizes it for touch. */
  const docActions = (doc: DocumentDTO, big = false) => {
    const size = big ? "h-11 w-11" : "h-9 w-9"
    return (
      <div className="flex items-center justify-end gap-0.5">
        <Button asChild variant="ghost" size="icon" className={cn(size, "cursor-pointer")}>
          <a
            href={`/api/files/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title={t("common.view")}
            aria-label={t("documents.viewAria", { name: doc.documentName })}
          >
            <Eye className="h-4 w-4" />
          </a>
        </Button>

        <Button asChild variant="ghost" size="icon" className={cn(size, "cursor-pointer")}>
          <a
            href={`/api/files/${doc.id}?download=1`}
            title={t("common.download")}
            aria-label={t("documents.downloadAria", { name: doc.documentName })}
          >
            <Download className="h-4 w-4" />
          </a>
        </Button>

        {canWrite ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(size, "cursor-pointer")}
            disabled={sharingId === doc.id}
            onClick={() => void toggleShare(doc)}
            title={doc.sharedWithClient ? t("documents.stopSharing") : t("documents.shareWithClient")}
            aria-label={doc.sharedWithClient ? t("documents.stopSharing") : t("documents.shareWithClient")}
          >
            {sharingId === doc.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : doc.sharedWithClient ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Users className="h-4 w-4" />
            )}
          </Button>
        ) : null}

        {canWrite ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(size, "cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700")}
            onClick={() => setDeleteTarget(doc)}
            title={t("documents.deleteTitle")}
            aria-label={t("documents.deleteAria", { name: doc.documentName })}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    )
  }

  const sharedBadge = (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-brass/25 bg-brass-tint text-brass-deep"
    >
      <Users className="h-3 w-3" /> {t("documents.sharedBadge")}
    </Badge>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("documents.pageTitle")}
        description={isClient ? t("documents.pageSubtitleClient") : t("documents.pageSubtitle")}
      >
        {canWrite && selectedId ? (
          <Button className="cursor-pointer" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> {t("documents.uploadDocument")}
          </Button>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18.5rem)_minmax(0,1fr)]">
        {/* ------------------------------ Case rail ------------------------------ */}
        <aside className="lg:sticky lg:top-0 lg:self-start">
          <section className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
            <header className="flex items-start gap-3 px-4 pb-3.5 pt-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                <FolderKanban className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-serif text-base font-semibold leading-tight tracking-tight text-ink">
                  {isClient ? t("documents.myCases") : t("documents.selectCase")}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {isClient ? t("documents.pickerDescClient") : t("documents.pickerDesc")}
                </p>
              </div>
              {cases.length > 0 ? (
                <span className="mt-0.5 shrink-0 rounded-md bg-paper-shade px-2 py-1 text-xs font-semibold tabular-nums text-muted-foreground ring-1 ring-border/70">
                  {cases.length}
                </span>
              ) : null}
            </header>

            <div aria-hidden className="mx-4 h-px bg-border/70" />

            <div className="p-3">
              <div className="relative">
                <Search
                  aria-hidden
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={caseSearch}
                  onChange={(e) => setCaseSearch(e.target.value)}
                  placeholder={t("documents.searchPh")}
                  aria-label={t("cases.searchAria")}
                  className="pl-9 pr-9"
                />
                {caseSearch ? (
                  <button
                    type="button"
                    onClick={() => setCaseSearch("")}
                    aria-label={t("cases.clearSearch")}
                    className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-[22rem] overflow-y-auto px-2 pb-2 lg:max-h-[calc(100dvh-24rem)]">
              {casesLoading && cases.length === 0 ? (
                <div className="space-y-2 px-1 pb-1" aria-busy="true">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : casesError && cases.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={AlertTriangle}
                  title={t("documents.errLoadCases")}
                  action={
                    <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetchCases}>
                      {t("common.retry")}
                    </Button>
                  }
                />
              ) : filteredCases.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={cases.length === 0 ? FolderKanban : Search}
                  title={
                    cases.length === 0
                      ? isClient
                        ? t("documents.noCasesClient")
                        : t("documents.noCases")
                      : t("ui.noCaseMatch")
                  }
                />
              ) : (
                <ul className="space-y-1">
                  {filteredCases.map((c) => {
                    const selected = c.id === selectedId
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.id)}
                          aria-current={selected ? "true" : undefined}
                          aria-label={t("documents.railSelectAria", { caseNumber: c.caseNumber })}
                          className={cn(
                            "group relative flex w-full cursor-pointer items-start gap-2.5 rounded-lg py-2.5 pl-4 pr-2 text-left transition-colors duration-200",
                            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            selected
                              ? "bg-primary/[0.07] ring-1 ring-inset ring-primary/20"
                              : "hover:bg-paper-shade"
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "absolute inset-y-2.5 left-1.5 w-[3px] rounded-full",
                              selected ? "bg-brass" : (CASE_STRIPES[c.status] ?? "bg-border")
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate font-mono text-[0.8125rem] font-semibold",
                                selected ? "text-primary" : "text-ink"
                              )}
                            >
                              {c.caseNumber}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-medium text-foreground/90">
                              {c.title}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {enumLabel("cases.type", c.type, t)} · {statusLabel(c.status, t)}
                            </p>
                          </div>
                          <ChevronRight
                            aria-hidden
                            className={cn(
                              "mt-0.5 h-4 w-4 shrink-0 transition-all duration-200",
                              selected
                                ? "text-brass-deep"
                                : "text-muted-foreground/30 group-hover:translate-x-0.5 group-hover:text-brass-deep"
                            )}
                          />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>
        </aside>

        {/* ------------------------------- The vault ------------------------------- */}
        <div className="min-w-0 space-y-5">
          {isClient ? (
            <p className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/[0.05] px-3.5 py-2.5 text-xs leading-relaxed text-primary">
              <ShieldCheck aria-hidden className="mt-px h-4 w-4 shrink-0" />
              {t("documents.clientBanner")}
            </p>
          ) : null}

          {detailLoading && !detail ? (
            <LoadingBlock rows={4} tiles={canWrite ? 4 : 3} panels={1} />
          ) : detailError && !detail ? (
            <EmptyState
              icon={AlertTriangle}
              title={t("documents.errLoad")}
              description={detailError}
              action={
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetchDetail}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : !selectedId ? (
            <EmptyState
              icon={FolderKanban}
              title={t("ui.noCaseSelected")}
              description={t("documents.noCaseSelectedDesc")}
            />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={isClient ? t("documents.emptyClientTitle") : t("documents.emptyTitle")}
              description={isClient ? t("documents.emptyClientDesc") : t("documents.emptyDesc")}
              action={
                canWrite ? (
                  <Button size="sm" className="cursor-pointer" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-4 w-4" /> {t("documents.uploadDocument")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* ------------------------------ Vitals ------------------------------ */}
              <div
                className={cn(
                  "grid grid-cols-1 gap-4 sm:grid-cols-2",
                  canWrite ? "xl:grid-cols-4" : "xl:grid-cols-3"
                )}
              >
                <StatCard
                  icon={FileText}
                  label={t("documents.statFiles")}
                  value={metrics.total}
                  tone="emerald"
                  delay={0}
                />
                {canWrite ? (
                  <StatCard
                    icon={Users}
                    label={t("documents.statShared")}
                    value={metrics.shared}
                    tone="gold"
                    delay={60}
                    onClick={
                      access === "shared" || metrics.shared === 0 ? undefined : () => setAccess("shared")
                    }
                    actionLabel={t("documents.gotoShared")}
                  />
                ) : null}
                <StatCard
                  icon={HardDrive}
                  label={t("documents.statSize")}
                  value={formatFileSize(metrics.size)}
                  tone="teal"
                  delay={120}
                />
                <StatCard
                  icon={CalendarClock}
                  label={t("documents.statLatest")}
                  value={relDay(metrics.latest, t)}
                  sub={metrics.latest ? formatDate(metrics.latest) : undefined}
                  tone="stone"
                  delay={180}
                />
              </div>

              {/* ------------------------------ Toolbar ------------------------------ */}
              <div className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
                <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
                  {canWrite ? (
                    <div
                      role="group"
                      aria-label={t("documents.accessFilterLabel")}
                      className="-mx-1 flex overflow-x-auto px-1 pb-0.5"
                    >
                      <div className="inline-flex gap-1 rounded-lg bg-paper-shade p-1 ring-1 ring-border/70">
                        {ACCESS_TABS.map((tab) => {
                          const active = access === tab.key
                          const count =
                            tab.key === "all"
                              ? metrics.total
                              : tab.key === "shared"
                                ? metrics.shared
                                : metrics.total - metrics.shared
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setAccess(tab.key)}
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
                              <span className="text-xs tabular-nums opacity-75">{count}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className={cn("relative", canWrite ? "lg:w-72" : "lg:w-full")}>
                    <Search
                      aria-hidden
                      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      value={docQuery}
                      onChange={(e) => setDocQuery(e.target.value)}
                      placeholder={t("documents.searchDocsPh")}
                      aria-label={t("documents.searchDocsAria")}
                      className="pl-9 pr-9"
                    />
                    {docQuery ? (
                      <button
                        type="button"
                        onClick={() => setDocQuery("")}
                        aria-label={t("cases.clearSearch")}
                        className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div aria-hidden className="mx-3 h-px bg-border/70" />

                <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
                  <Select value={docType} onValueChange={setDocType}>
                    <SelectTrigger className="w-full cursor-pointer" aria-label={t("ui.allTypes")}>
                      <SelectValue placeholder={t("ui.allTypes")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("ui.allTypes")}</SelectItem>
                      {DOCUMENT_TYPES.map((dt) => (
                        <SelectItem key={dt} value={dt}>
                          {enumLabel("documents.type", dt, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={docCategory} onValueChange={setDocCategory}>
                    <SelectTrigger
                      className="w-full cursor-pointer"
                      aria-label={t("documents.allCategories")}
                    >
                      <SelectValue placeholder={t("documents.allCategories")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("documents.allCategories")}</SelectItem>
                      {DOCUMENT_CATEGORIES.map((dc) => (
                        <SelectItem key={dc} value={dc}>
                          {enumLabel("documents.cat", dc, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                    <SelectTrigger
                      className="w-full cursor-pointer"
                      aria-label={t("documents.sortAria")}
                    >
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

                <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground" aria-live="polite">
                    {t(visible.length === 1 ? "documents.countOne" : "documents.countOther", {
                      count: visible.length,
                    })}
                    {" · "}
                    {accessDescription}
                  </p>
                  {hasDocFilters ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 cursor-pointer"
                      onClick={clearDocFilters}
                    >
                      <X className="h-3.5 w-3.5" /> {t("cases.clearFilters")}
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* --------------------------- Document ledger --------------------------- */}
              <section className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
                <header className="flex items-start gap-3 px-5 pb-4 pt-5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                    <FolderOpen className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-serif text-lg font-semibold leading-tight tracking-tight text-ink">
                      {t("documents.caseDocumentsTitle", {
                        caseNumber: activeCase?.caseNumber ?? t("ui.caseFallbackSelected"),
                      })}
                    </h2>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {t(metrics.total === 1 ? "documents.docCountOne" : "documents.docCountOther", {
                        title: activeCase?.title ?? "—",
                        count: metrics.total,
                      })}
                    </p>
                  </div>
                  {activeCase ? (
                    <div className="mt-0.5 hidden shrink-0 sm:block">
                      <StatusBadge
                        map={translatedStyles(caseStatusStyles, t)}
                        value={activeCase.status}
                      />
                    </div>
                  ) : null}
                </header>

                <div aria-hidden className="mx-5 h-px bg-border/70" />

                {visible.length === 0 ? (
                  <EmptyState
                    variant="inline"
                    icon={Search}
                    title={t("documents.noMatchTitle")}
                    description={t("documents.noMatchDesc")}
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        onClick={clearDocFilters}
                      >
                        {t("cases.clearFilters")}
                      </Button>
                    }
                  />
                ) : (
                  <>
                    {/* Desktop: the document ledger. */}
                    <div className="hidden overflow-x-auto lg:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="pl-5">{t("documents.colDocument")}</TableHead>
                            <TableHead>{t("documents.colClassification")}</TableHead>
                            <TableHead>{t("documents.colSize")}</TableHead>
                            <TableHead>{t("documents.colUploaded")}</TableHead>
                            <TableHead className="pr-5 text-right">{t("common.actions")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visible.map((doc) => {
                            const v = fileVisual(doc.mimeType)
                            const ext = fileExt(doc.fileName)
                            return (
                              <TableRow
                                key={doc.id}
                                className="group border-border/60 transition-colors hover:bg-paper-shade/70"
                              >
                                <TableCell className="py-3 pl-5 align-top">
                                  <div className="flex items-start gap-3">
                                    <span
                                      aria-hidden
                                      className={cn(
                                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
                                        FILE_TONES[v.tone]
                                      )}
                                    >
                                      <v.Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p
                                          className="max-w-[20rem] truncate text-sm font-medium text-ink"
                                          title={doc.documentName}
                                        >
                                          {doc.documentName}
                                        </p>
                                        {doc.sharedWithClient ? sharedBadge : null}
                                      </div>
                                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                        {ext ? (
                                          <span className="rounded bg-paper-shade px-1.5 py-px font-mono text-[10px] font-semibold tracking-wide ring-1 ring-border/70">
                                            {ext}
                                          </span>
                                        ) : null}
                                        <span className="max-w-[16rem] truncate" title={doc.fileName}>
                                          {doc.fileName}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>

                                <TableCell className="align-top">
                                  <p className="max-w-[11rem] truncate text-sm">
                                    {enumLabel("documents.type", doc.documentType, t)}
                                  </p>
                                  {doc.category ? (
                                    <p className="max-w-[11rem] truncate text-xs text-muted-foreground">
                                      {enumLabel("documents.cat", doc.category, t)}
                                    </p>
                                  ) : null}
                                </TableCell>

                                <TableCell className="align-top text-sm tabular-nums text-muted-foreground">
                                  {formatFileSize(doc.fileSize)}
                                </TableCell>

                                <TableCell className="align-top">
                                  <p
                                    className="whitespace-nowrap text-sm tabular-nums"
                                    title={formatDate(doc.createdAt)}
                                  >
                                    {relDay(doc.createdAt, t)}
                                  </p>
                                  <p className="max-w-[10rem] truncate text-xs text-muted-foreground">
                                    {doc.uploadedByName ?? "—"}
                                  </p>
                                </TableCell>

                                <TableCell className="pr-5 align-top">{docActions(doc)}</TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile / tablet: one record per document — no horizontal scrolling. */}
                    <ul className="divide-y divide-border/60 lg:hidden">
                      {visible.map((doc) => {
                        const v = fileVisual(doc.mimeType)
                        const ext = fileExt(doc.fileName)
                        return (
                          <li key={doc.id} className="px-4 py-3.5">
                            <div className="flex items-start gap-3">
                              <span
                                aria-hidden
                                className={cn(
                                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1",
                                  FILE_TONES[v.tone]
                                )}
                              >
                                <v.Icon className="h-[1.15rem] w-[1.15rem]" />
                              </span>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <p className="text-sm font-medium leading-snug text-ink">
                                  {doc.documentName}
                                </p>
                                <p className="truncate text-xs text-muted-foreground" title={doc.fileName}>
                                  {doc.fileName}
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {ext ? (
                                    <span className="rounded bg-paper-shade px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-muted-foreground ring-1 ring-border/70">
                                      {ext}
                                    </span>
                                  ) : null}
                                  <span className="rounded-md bg-paper-shade px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-inset ring-border/70">
                                    {formatFileSize(doc.fileSize)}
                                  </span>
                                  <span className="rounded-md bg-paper-shade px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-inset ring-border/70">
                                    {relDay(doc.createdAt, t)}
                                  </span>
                                  {doc.sharedWithClient ? sharedBadge : null}
                                </div>
                                <p className="truncate text-[11px] text-muted-foreground/80">
                                  {[
                                    enumLabel("documents.type", doc.documentType, t),
                                    enumLabel("documents.cat", doc.category, t),
                                    doc.uploadedByName,
                                  ]
                                    .filter((part) => part && part !== "—")
                                    .join(" · ")}
                                </p>
                              </div>
                            </div>
                            <div className="mt-1.5">{docActions(doc, true)}</div>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {selectedId ? (
        <UploadDocumentDialog
          caseId={selectedId}
          caseNumber={activeCase?.caseNumber ?? t("ui.caseFallbackSelected")}
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          onUploaded={refetchDetail}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t("documents.deleteConfirmTitle")}
        description={t("documents.deleteConfirmDesc", {
          name: deleteTarget?.documentName ?? t("documents.file"),
        })}
        confirmLabel={t("documents.deleteConfirmBtn")}
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
