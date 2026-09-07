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
import type { CaseDetailDTO, CaseListDTO, DocumentDTO, ViewProps } from "@/lib/types"
import { cn, formatDate, formatFileSize } from "@/lib/utils"

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

  useEffect(() => {
    if (!open) return
    setFile(null)
    setName("")
    setType("__none__")
    setCategory("__none__")
    setShare(false)
    setPending(false)
    lastFileNameRef.current = ""
  }, [open])

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
      toast.error("Choose a file to upload.")
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is larger than the 10 MB limit.")
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
      toast.success("Document uploaded.")
      onOpenChange(false)
      onUploaded()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Add a file to the {caseNumber} case file. PDF, Word, image or text up to 10 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">
              File <span className="text-rose-500">*</span>
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
            <Label htmlFor="doc-name">Document name</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vakalatnama — CS-123/2026"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="doc-type" className="w-full">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not specified</SelectItem>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="doc-category" className="w-full">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not specified</SelectItem>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="min-w-0">
              <Label htmlFor="doc-share">Share with client portal</Label>
              <p className="text-xs text-muted-foreground">The client sees it after their next sign-in</p>
            </div>
            <Switch id="doc-share" checked={share} onCheckedChange={setShare} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            <Upload className="h-4 w-4" /> {pending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function DocumentsView({ user }: ViewProps) {
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

  useEffect(() => {
    if (!selectedId && cases.length > 0) setSelectedId(cases[0].id)
  }, [cases, selectedId])

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
      toast.success(doc.sharedWithClient ? "Sharing turned off." : "Document shared with the client portal.")
      refetchDetail()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update sharing.")
    } finally {
      setSharingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await apiSend("DELETE", `/api/documents/${deleteTarget.id}`)
    toast.success(`${deleteTarget.documentName} deleted.`)
    refetchDetail()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description={isClient ? "Vakalatnama, orders & evidence shared with you." : "Vakalatnama, orders & evidence vault — organised per case."}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Case picker */}
        <SectionCard
          title={isClient ? "My Cases" : "Select a case"}
          description={isClient ? "Open a case to view its shared documents." : "Documents are filed per case."}
          className="h-fit lg:col-span-1"
        >
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                placeholder="Search cases…"
                aria-label="Search cases"
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
                  <p className="text-xs text-muted-foreground">Could not load cases.</p>
                  <Button variant="outline" size="sm" onClick={refetchCases}>
                    Try again
                  </Button>
                </div>
              ) : filteredCases.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  {cases.length === 0 ? (isClient ? "No cases yet." : "No cases yet — register a case first.") : "No cases match your search."}
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
                      <p className="truncate text-xs text-muted-foreground">{c.type}</p>
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
                  {detail ? `${detail.caseNumber} — Documents` : selectedCase ? `${selectedCase.caseNumber} — Documents` : "Documents"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {detail?.title ?? selectedCase?.title ?? "—"} · {documents.length} document
                  {documents.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            {canWrite && selectedId ? (
              <Button onClick={() => setUploadOpen(true)} className="shrink-0">
                <Upload className="h-4 w-4" /> Upload Document
              </Button>
            ) : null}
          </div>

          {isClient ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              You can see documents shared by your chamber.
            </p>
          ) : null}

          {detailLoading && !detail ? (
            <LoadingBlock rows={4} />
          ) : detailError && !detail ? (
            <EmptyState
              icon={AlertTriangle}
              title="Could not load documents"
              description={detailError}
              action={
                <Button variant="outline" size="sm" onClick={refetchDetail}>
                  Try again
                </Button>
              }
            />
          ) : !selectedId ? (
            <EmptyState icon={FolderKanban} title="No case selected" description="Pick a case on the left to view its documents." />
          ) : documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={isClient ? "No documents shared yet" : "No documents yet — upload the Vakalatnama to get started."}
              description={isClient ? "Your chamber has not shared any documents for this case." : "PDF, Word, image or text files up to 10 MB."}
              action={
                canWrite ? (
                  <Button size="sm" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-4 w-4" /> Upload Document
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
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead className="hidden lg:table-cell">Category</TableHead>
                      <TableHead className="hidden sm:table-cell">Size</TableHead>
                      <TableHead className="hidden lg:table-cell">Uploaded By</TableHead>
                      <TableHead className="hidden sm:table-cell">Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
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
                                <Users className="h-3 w-3" /> Shared
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
                            {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          {doc.documentType ?? "—"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                          {doc.category ?? "—"}
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
                              <a href={`/api/files/${doc.id}?download=1`} title="Download" aria-label={`Download ${doc.documentName}`}>
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                            {canWrite ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={doc.sharedWithClient ? "Stop sharing with client" : "Share with client portal"}
                                aria-label={doc.sharedWithClient ? "Stop sharing with client" : "Share with client portal"}
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
                                title="Delete document"
                                aria-label={`Delete ${doc.documentName}`}
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
          caseNumber={detail?.caseNumber ?? selectedCase?.caseNumber ?? "selected"}
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
        title="Delete this document?"
        description={`${deleteTarget?.documentName ?? "This file"} will be removed from the case file permanently.`}
        confirmLabel="Delete document"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  )
}
