"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangle,
  Download,
  EyeOff,
  FileText,
  FolderKanban,
  FolderOpen,
  Search,
  Share2,
  Trash2,
  Upload,
  Users,
} from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiSend, apiUpload } from "@/lib/api-client"
import { DOCUMENT_CATEGORIES, DOCUMENT_TYPES, MAX_FILE_SIZE, UPLOAD_ACCEPT } from "@/lib/constants"
import { useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { CaseDetailDTO, CaseListDTO, DocumentDTO, ViewProps } from "@/lib/types"
import { cn, formatDate, formatFileSize } from "@/lib/utils"
import { useResetOnOpen } from "@/lib/use-reset-on-open"

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
  const [type, setType] = useState("__none__")
  const [category, setCategory] = useState("__none__")
  const [share, setShare] = useState(false)
  const [pending, setPending] = useState(false)
  const lastFileNameRef = useRef("")
  const { t } = useLanguage()

  useResetOnOpen(open ? "open" : null, () => {
    setFile(null)
    setName("")
    setType("__none__")
    setCategory("__none__")
    setShare(false)
    setPending(false)
    lastFileNameRef.current = ""
  })

  const handleFile = (f: File | null) => {
    setFile(f)
    // Prefill document name with the file name unless the user already typed a custom one.
    setName((prev) => {
      if (!f) return prev
      if (!prev || prev === lastFileNameRef.current) return f.name
      return prev
    })
    lastFileNameRef.current = f?.name ?? ""
  }

  const submit = async () => {
    if (!file) {
      toast.error(t("documents.errChooseFile"))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("documents.errTooLarge"))
      return
    }
    const fd = new FormData()
    fd.append("file", file)
    fd.append("documentName", name.trim() || file.name)
    if (type !== "__none__") fd.append("documentType", type)
    if (category !== "__none__") fd.append("category", category)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("documents.uploadDocument")}</DialogTitle>
          <DialogDescription>{t("documents.uploadDesc", { caseNumber })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">
              {t("documents.file")} <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="doc-file"
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-xs text-muted-foreground">
                {file.name} · {formatFileSize(file.size)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-name">{t("documents.documentName")}</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("documents.namePh")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">{t("common.type")}</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="doc-type" className="w-full">
                  <SelectValue placeholder={t("ui.notSpecified")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("ui.notSpecified")}</SelectItem>
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
                <SelectTrigger id="doc-category" className="w-full">
                  <SelectValue placeholder={t("ui.notSpecified")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("ui.notSpecified")}</SelectItem>
                  {DOCUMENT_CATEGORIES.map((dc) => (
                    <SelectItem key={dc} value={dc}>
                      {enumLabel("documents.cat", dc, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="min-w-0">
              <Label htmlFor="doc-share">{t("documents.shareWithClient")}</Label>
              <p className="text-xs text-muted-foreground">{t("documents.shareHint")}</p>
            </div>
            <Switch id="doc-share" checked={share} onCheckedChange={setShare} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Upload className="h-4 w-4" /> {pending ? t("ui.uploading") : t("common.upload")}
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

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim().toLowerCase()
    if (!q) return cases
    return cases.filter((c) => [c.caseNumber, c.title, c.type].some((v) => v.toLowerCase().includes(q)))
  }, [cases, caseSearch])

  const selectedCase = cases.find((c) => c.id === selectedId) ?? null

  const toggleShare = async (doc: DocumentDTO) => {
    try {
      setSharingId(doc.id)
      await apiSend<DocumentDTO>("PATCH", `/api/documents/${doc.id}`, { sharedWithClient: !doc.sharedWithClient })
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("documents.pageTitle")}
        description={isClient ? t("documents.pageSubtitleClient") : t("documents.pageSubtitle")}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Case picker */}
        <SectionCard
          title={isClient ? t("documents.myCases") : t("documents.selectCase")}
          description={isClient ? t("documents.pickerDescClient") : t("documents.pickerDesc")}
          className="h-fit lg:col-span-1"
        >
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                placeholder={t("documents.searchPh")}
                aria-label={t("cases.searchAria")}
                className="pl-8"
              />
            </div>
            <div className="max-h-[420px] space-y-1 overflow-y-auto">
              {casesLoading ? (
                <div className="space-y-2 pt-1" aria-busy="true">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : casesError && cases.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <p className="text-xs text-muted-foreground">{t("documents.errLoadCases")}</p>
                  <Button variant="outline" size="sm" onClick={refetchCases}>
                    {t("common.retry")}
                  </Button>
                </div>
              ) : filteredCases.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {cases.length === 0
                    ? isClient
                      ? t("documents.noCasesClient")
                      : t("documents.noCases")
                    : t("ui.noCaseMatch")}
                </p>
              ) : (
                filteredCases.map((c) => {
                  const selected = c.id === selectedId
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        selected
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-transparent hover:border-stone-200 hover:bg-stone-100"
                      )}
                    >
                      <p className={cn("text-sm font-semibold", selected ? "text-emerald-900" : "text-foreground")}>
                        {c.caseNumber}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{enumLabel("cases.type", c.type, t)}</p>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </SectionCard>

        {/* Documents of the selected case */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <FolderOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold tracking-tight">
                  {detail
                    ? t("documents.caseDocumentsTitle", { caseNumber: detail.caseNumber })
                    : selectedCase
                      ? t("documents.caseDocumentsTitle", { caseNumber: selectedCase.caseNumber })
                      : t("documents.pageTitle")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t(documents.length === 1 ? "documents.docCountOne" : "documents.docCountOther", {
                    title: detail?.title ?? selectedCase?.title ?? "—",
                    count: documents.length,
                  })}
                </p>
              </div>
            </div>
            {canWrite && selectedId ? (
              <Button onClick={() => setUploadOpen(true)} className="shrink-0">
                <Upload className="h-4 w-4" /> {t("documents.uploadDocument")}
              </Button>
            ) : null}
          </div>

          {isClient ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {t("documents.clientBanner")}
            </p>
          ) : null}

          {detailLoading && !detail ? (
            <LoadingBlock rows={4} />
          ) : detailError && !detail ? (
            <EmptyState
              icon={AlertTriangle}
              title={t("documents.errLoad")}
              description={detailError}
              action={
                <Button variant="outline" size="sm" onClick={refetchDetail}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : !selectedId ? (
            <EmptyState icon={FolderKanban} title={t("ui.noCaseSelected")} description={t("documents.noCaseSelectedDesc")} />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={isClient ? t("documents.emptyClientTitle") : t("documents.emptyTitle")}
              description={isClient ? t("documents.emptyClientDesc") : t("documents.emptyDesc")}
              action={
                canWrite ? (
                  <Button size="sm" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-4 w-4" /> {t("documents.uploadDocument")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-stone-50/60">
                      <TableHead>{t("common.name")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("common.type")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t("documents.category")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("documents.colSize")}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t("documents.colUploadedBy")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("common.date")}</TableHead>
                      <TableHead className="text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="max-w-[220px]">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                            <span className="truncate text-sm font-medium" title={doc.documentName}>
                              {doc.documentName}
                            </span>
                            {doc.sharedWithClient ? (
                              <Badge variant="outline" className="shrink-0 gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700">
                                <Users className="h-3 w-3" /> {t("documents.sharedBadge")}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                            {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {doc.documentType ? enumLabel("documents.type", doc.documentType, t) : "—"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {doc.category ? enumLabel("documents.cat", doc.category, t) : "—"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                          {formatFileSize(doc.fileSize)}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {doc.uploadedByName ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-sm whitespace-nowrap text-muted-foreground sm:table-cell">
                          {formatDate(doc.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
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
                                className="h-8 w-8"
                                title={doc.sharedWithClient ? t("documents.stopSharing") : t("documents.shareWithClient")}
                                aria-label={doc.sharedWithClient ? t("documents.stopSharing") : t("documents.shareWithClient")}
                                disabled={sharingId === doc.id}
                                onClick={() => toggleShare(doc)}
                              >
                                {doc.sharedWithClient ? <EyeOff className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                              </Button>
                            ) : null}
                            {canWrite ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                title={t("documents.deleteTitle")}
                                aria-label={t("documents.deleteAria", { name: doc.documentName })}
                                onClick={() => setDeleteTarget(doc)}
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
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedId ? (
        <UploadDocumentDialog
          caseId={selectedId}
          caseNumber={detail?.caseNumber ?? selectedCase?.caseNumber ?? t("ui.caseFallbackSelected")}
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
