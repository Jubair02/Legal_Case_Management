"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Gavel,
  Loader2,
  MessageSquarePlus,
  MoreHorizontal,
  Phone,
  Receipt,
  Scale,
  Send,
  Trash2,
  Upload,
  UserCog,
  Users,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"

import { CaseFormDialog } from "@/components/views/cases-view"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { HearingUpdateDialog } from "@/components/views/hearings-view"
import { apiSend, apiUpload } from "@/lib/api-client"
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES,
  HEARING_TYPES,
  MAX_FILE_SIZE,
  UPLOAD_ACCEPT,
} from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import { useResetOnOpen } from "@/lib/use-reset-on-open"
import {
  caseStatusStyles,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatRelativeDay,
  hearingStatusStyles,
  initials,
  invoiceStatusStyles,
  priorityStyles,
} from "@/lib/utils"
import type {
  CaseDetailDTO,
  DocumentDTO,
  HearingDTO,
  UpdateDTO,
  ViewProps,
} from "@/lib/types"

import { Button } from "@/components/ui/button"
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

/** Tab keys, in strip order. `invoices` is appended only when visible to the role. */
const TAB_KEYS = ["overview", "hearings", "documents", "updates", "invoices"] as const

/** Mount transition for tab panels — Radix unmounts inactive panels, so this runs per switch. */
const PANEL_ANIM = "animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out motion-reduce:animate-none"

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

/* ------------------------------- date helpers ------------------------------- */

const DHAKA = "Asia/Dhaka"

function dhakaPart(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA, ...opts }).format(d)
}

/** "10:30 AM" in Asia/Dhaka. */
function formatTime(iso: string | null | undefined): string {
  return dhakaPart(iso, { hour: "numeric", minute: "2-digit", hour12: true }) || "—"
}

/** "Mon" style weekday in Asia/Dhaka. */
function formatWeekday(iso: string | null | undefined): string {
  return dhakaPart(iso, { weekday: "short" })
}

/** "Feb" — month line of the date medallion. */
function formatMonthShort(iso: string | null | undefined): string {
  return dhakaPart(iso, { month: "short" })
}

/** "12" — day line of the date medallion. */
function formatDayNum(iso: string | null | undefined): string {
  return dhakaPart(iso, { day: "2-digit" })
}

/** Epoch ms for a date string, or NaN when missing/unparseable. */
function ts(iso: string | null | undefined): number {
  return iso ? Date.parse(iso) : Number.NaN
}

/* ------------------------------ visual helpers ------------------------------ */

/** Tinted icon-tile classes shared by vital tiles, party avatars and file chips. */
const TONES = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  teal: "bg-teal-50 text-teal-700 ring-teal-100",
  stone: "bg-stone-100 text-stone-600 ring-stone-200",
} as const

type Tone = keyof typeof TONES

/** Left accent stripe per hearing status — carries the same meaning as the badge. */
const HEARING_STRIPES: Record<string, string> = {
  UPCOMING: "bg-emerald-500",
  COMPLETED: "bg-slate-300",
  ADJOURNED: "bg-amber-400",
  POSTPONED: "bg-orange-400",
  CANCELLED: "bg-rose-400",
}

/** Picks an icon + tint for a document from its MIME type. */
function fileVisual(mimeType: string | null | undefined): { Icon: typeof FileText; tone: Tone } {
  const m = (mimeType ?? "").toLowerCase()
  if (m.startsWith("image/")) return { Icon: FileImage, tone: "teal" }
  if (m.includes("pdf")) return { Icon: FileText, tone: "rose" }
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) {
    return { Icon: FileSpreadsheet, tone: "emerald" }
  }
  return { Icon: FileText, tone: "stone" }
}

/**
 * Tracks whether the sticky command bar has left its resting position, by
 * observing a zero-height sentinel rendered just above it. Drives a purely
 * horizontal reveal of the condensed case identity, so the bar's height never
 * changes and the scroll position never jumps.
 */
function useStuck(offsetPx = 64) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => setStuck(!entries[0]?.isIntersecting), {
      rootMargin: `-${offsetPx}px 0px 0px 0px`,
      threshold: 0,
    })
    io.observe(el)
    return () => io.disconnect()
  }, [offsetPx])

  return { sentinelRef, stuck }
}

/* ------------------------------ building blocks ------------------------------ */

/** The chamber "seal" — anchors the case identity at the top of the file. */
function CaseSeal({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700",
        "text-emerald-50 shadow-[0_10px_24px_-12px_rgba(6,78,59,0.75)] ring-1 ring-inset ring-white/20",
        className
      )}
    >
      <Scale className="h-6 w-6 sm:h-7 sm:w-7" />
    </span>
  )
}

/** Bordered content section with a hairline header. */
function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  headerClassName,
  bodyClassName,
}: {
  title?: string
  icon?: typeof FileText
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm", className)}>
      {title ? (
        <header
          className={cn(
            "flex min-h-[2.75rem] items-center gap-2 border-b border-border/60 px-4 py-2",
            headerClassName
          )}
        >
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
          <h2 className="truncate text-[13px] font-semibold tracking-tight">{title}</h2>
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

/** Micro-label + value pair used by the filing-details list. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">{children}</dd>
    </div>
  )
}

/** Month/day medallion used wherever a hearing date is shown. */
function DateMedallion({
  iso,
  highlight,
  className,
}: {
  iso: string | null | undefined
  highlight?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "grid h-14 w-14 shrink-0 place-content-center rounded-xl border text-center",
        highlight ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border/70 bg-muted/50",
        className
      )}
    >
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.08em]",
          highlight ? "text-amber-700" : "text-muted-foreground"
        )}
      >
        {formatMonthShort(iso) || "—"}
      </span>
      <span className="text-lg font-bold leading-none">{formatDayNum(iso)}</span>
    </div>
  )
}

/** At-a-glance metric in the header strip; clickable tiles jump to the matching tab. */
function VitalTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "emerald",
  onClick,
}: {
  icon: typeof FileText
  label: string
  value: React.ReactNode
  sub?: string
  tone?: Tone
  onClick?: () => void
}) {
  const shared = "flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:p-4"
  const body = (
    <>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset", TONES[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-base font-semibold tracking-tight sm:text-lg">{value}</p>
        {sub ? <p className="truncate text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      {onClick ? (
        <ArrowUpRight className="h-4 w-4 shrink-0 text-transparent transition-colors group-hover:text-muted-foreground" />
      ) : null}
    </>
  )

  if (!onClick) return <div className={shared}>{body}</div>

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        shared,
        "group cursor-pointer text-left transition-all duration-200 motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md motion-reduce:hover:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      {body}
    </button>
  )
}

/** One person/entity attached to the case. */
function PartyRow({
  name,
  role,
  meta,
  tone,
  icon: Icon,
  phone,
  phoneAria,
}: {
  name: string | null
  role: string
  meta?: string | null
  tone: Tone
  icon: typeof FileText
  phone?: string | null
  phoneAria?: string
}) {
  return (
    <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ring-1 ring-inset",
          TONES[tone]
        )}
      >
        {name ? initials(name) : <Icon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name ?? "—"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {role}
          {meta ? ` · ${meta}` : ""}
        </p>
      </div>
      {phone ? (
        <Button asChild variant="ghost" size="icon" className="h-9 w-9 shrink-0 cursor-pointer">
          <a href={`tel:${phone}`} aria-label={phoneAria} title={phone}>
            <Phone className="h-4 w-4" />
          </a>
        </Button>
      ) : null}
    </li>
  )
}

/** Progress-note timeline. Draws its own rail so items stay evenly connected. */
function UpdateTimeline({ items }: { items: UpdateDTO[] }) {
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border/70">
      {items.map((u) => (
        <li key={u.id} className="relative flex gap-3">
          <span
            aria-hidden
            className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-[9px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-100"
          >
            {u.createdByName ? initials(u.createdByName) : <MessageSquarePlus className="h-3 w-3" />}
          </span>
          <div className="-mt-0.5 min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{u.update}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">{u.createdByName ?? "—"}</span>
              <span aria-hidden>·</span>
              <Clock3 className="h-3 w-3" />
              {formatDateTime(u.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
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

  useResetOnOpen(open ? "open" : null, () => {
    setSummary("")
    setOutcome("")
  })

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
          <DialogTitle>
            {status === "CLOSED" ? t("caseDetail.closeCase") : t("caseDetail.markResolvedTitle")}
          </DialogTitle>
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

  useResetOnOpen(open ? "open" : null, () => {
    setHearingDate("")
    setHearingType("")
    setJudge("")
    setCourt("")
    setNotes("")
  })

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

  useResetOnOpen(open ? "open" : null, () => {
    setFile(null)
    setDocumentName("")
    setDocumentType("")
    setCategory("")
    setShared(false)
  })

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
              className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium"
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
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3">
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

  const [tab, setTab] = useState<string>(() => {
    const requested = params.tab ?? ""
    return (TAB_KEYS as readonly string[]).includes(requested) ? requested : "overview"
  })
  const [editOpen, setEditOpen] = useState(false)
  const [closeStatus, setCloseStatus] = useState<"RESOLVED" | "CLOSED" | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [hearingFormOpen, setHearingFormOpen] = useState(false)
  const [editingHearing, setEditingHearing] = useState<HearingDTO | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [docToDelete, setDocToDelete] = useState<DocumentDTO | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)
  const [updateText, setUpdateText] = useState("")
  const [updatePending, setUpdatePending] = useState(false)
  const { sentinelRef, stuck } = useStuck()

  const isAdmin = user.role === "ADMIN"
  const canWrite = user.role === "ADMIN" || user.role === "STAFF" || user.role === "LAWYER"
  const canSetStatus = user.role === "ADMIN" || user.role === "STAFF"
  const showInvoices = Array.isArray(detail?.invoices) && user.role !== "STAFF"

  if (!id) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={t("ui.noCaseSelected")}
        description={t("caseDetail.noCaseSelectedDesc")}
        action={
          <Button variant="outline" className="cursor-pointer" onClick={() => navigate("cases")}>
            <ArrowLeft className="h-4 w-4" /> {t("caseDetail.backToCases")}
          </Button>
        }
      />
    )
  }

  if (loading && !detail) return <LoadingBlock rows={6} />

  if (error && !detail) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t("caseDetail.errLoad")}
        description={error}
        action={
          <Button variant="outline" className="cursor-pointer" onClick={() => navigate("cases")}>
            <ArrowLeft className="h-4 w-4" /> {t("caseDetail.backToCases")}
          </Button>
        }
      />
    )
  }

  if (!detail) return <LoadingBlock rows={6} />

  const isClosed = detail.status === "RESOLVED" || detail.status === "CLOSED"
  const hearings = Array.isArray(detail.hearings) ? detail.hearings : []
  const documents = Array.isArray(detail.documents) ? detail.documents : []
  const updates = Array.isArray(detail.updates) ? detail.updates : []
  const invoices = Array.isArray(detail.invoices) ? detail.invoices : []

  /* --------------------------- derived case vitals --------------------------- */

  const nowMs = Date.now()
  const upcomingHearings = hearings
    .filter((h) => {
      const at = ts(h.hearingDate)
      return !Number.isNaN(at) && at >= nowMs
    })
    .sort((a, b) => ts(a.hearingDate) - ts(b.hearingDate))
  const pastHearings = hearings
    .filter((h) => {
      const at = ts(h.hearingDate)
      return Number.isNaN(at) || at < nowMs
    })
    .sort((a, b) => ts(b.hearingDate) - ts(a.hearingDate))
  const nextHearing = upcomingHearings[0] ?? null

  const sortedUpdates = [...updates].sort((a, b) => ts(b.createdAt) - ts(a.createdAt))
  const latestUpdate = sortedUpdates[0] ?? null
  const sharedDocs = documents.filter((d) => d.sharedWithClient).length

  const billed = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
  const collected = invoices.reduce((sum, inv) => sum + (Number(inv.paidAmount) || 0), 0)
  const outstanding = Math.max(billed - collected, 0)
  const collectedPct = billed > 0 ? Math.min(100, Math.round((collected / billed) * 100)) : 0

  const activeTab = tab === "invoices" && !showInvoices ? "overview" : tab
  const tabItems = [
    { value: "overview", label: t("caseDetail.tabOverview"), icon: FolderOpen, count: undefined as number | undefined },
    { value: "hearings", label: t("caseDetail.tabHearings"), icon: Gavel, count: hearings.length },
    { value: "documents", label: t("caseDetail.tabDocuments"), icon: FileText, count: documents.length },
    { value: "updates", label: t("caseDetail.tabUpdates"), icon: MessageSquarePlus, count: updates.length },
    ...(showInvoices
      ? [{ value: "invoices", label: t("caseDetail.tabInvoices"), icon: Receipt, count: invoices.length }]
      : []),
  ]

  /* -------------------------------- mutations -------------------------------- */

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
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("caseDetail.errUpdateAdd"))
    } finally {
      setUpdatePending(false)
    }
  }

  /* ------------------------------ shared fragments ------------------------------ */

  const statusMenuItems = (
    <>
      <DropdownMenuLabel>{t("caseDetail.setStatus")}</DropdownMenuLabel>
      <DropdownMenuItem className="cursor-pointer" onSelect={() => void patchStatus("ACTIVE")}>
        {t("caseDetail.setActive")}
      </DropdownMenuItem>
      <DropdownMenuItem className="cursor-pointer" onSelect={() => void patchStatus("PENDING")}>
        {t("caseDetail.setPending")}
      </DropdownMenuItem>
      <DropdownMenuItem className="cursor-pointer" onSelect={() => void patchStatus("ON_HOLD")}>
        {t("caseDetail.setOnHold")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="cursor-pointer" onSelect={() => setCloseStatus("RESOLVED")}>
        {t("caseDetail.markResolved")}
      </DropdownMenuItem>
      <DropdownMenuItem className="cursor-pointer" onSelect={() => setCloseStatus("CLOSED")}>
        {t("caseDetail.closeCase")}
      </DropdownMenuItem>
    </>
  )

  /** Download / share / delete cluster for one document. `big` sizes it for touch. */
  const documentActions = (doc: DocumentDTO, big?: boolean) => {
    const size = big ? "h-11 w-11" : "h-9 w-9"
    return (
      <div className="flex items-center gap-0.5">
        <Button asChild variant="ghost" size="icon" className={cn(size, "cursor-pointer")}>
          <a
            href={`/api/files/${doc.id}?download=1`}
            aria-label={t("documents.downloadAria", { name: doc.documentName })}
            title={t("common.download")}
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
            aria-label={doc.sharedWithClient ? t("documents.stopSharing") : t("documents.shareWithClient")}
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
            className={cn(size, "cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700")}
            onClick={() => setDocToDelete(doc)}
            aria-label={t("documents.deleteTitle")}
            title={t("documents.deleteTitle")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    )
  }

  /** One hearing card. */
  const hearingCard = (h: HearingDTO) => (
    <article
      key={h.id}
      className="group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-[3px]", HEARING_STRIPES[h.status] ?? "bg-border")}
      />
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex shrink-0 items-center gap-3 sm:block sm:text-center">
          <DateMedallion iso={h.hearingDate} />
          <p className="text-xs text-muted-foreground sm:mt-1.5">
            <span className="font-medium">{formatWeekday(h.hearingDate)}</span>
            <span aria-hidden> · </span>
            <span>{formatTime(h.hearingDate)}</span>
          </p>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge map={translatedStyles(hearingStatusStyles, t)} value={h.status} />
            {h.hearingType ? (
              <span className="text-sm font-semibold">{enumLabel("hearings.type", h.hearingType, t)}</span>
            ) : null}
            {h.nextHearingDate ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                <CalendarDays className="h-3 w-3" />
                {t("caseDetail.nextHearingBadge", { date: formatDate(h.nextHearingDate) })}
              </span>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {[h.judge, h.court].filter(Boolean).join(" · ") || "—"}
          </p>
          {h.notes ? (
            <p className="text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{h.notes}</p>
          ) : null}

          {h.summary || h.courtOrder || h.nextAction ? (
            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
              {h.summary ? (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="[overflow-wrap:anywhere]">{h.summary}</span>
                </p>
              ) : null}
              {h.courtOrder ? (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <Gavel className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="[overflow-wrap:anywhere]">{h.courtOrder}</span>
                </p>
              ) : null}
              {h.nextAction ? (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="[overflow-wrap:anywhere]">{h.nextAction}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {canWrite ? (
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 cursor-pointer self-start"
            onClick={() => setEditingHearing(h)}
          >
            {t("hearings.update")}
          </Button>
        ) : null}
      </div>
    </article>
  )

  /** Section label above a hearing group. */
  const groupLabel = (label: string, count: number) => (
    <div className="mb-2 flex items-center gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</h3>
      <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">{count}</span>
      <span aria-hidden className="h-px flex-1 bg-border/60" />
    </div>
  )

  return (
    <div className="pb-2">
      {/* ------------------------------ Case cover ------------------------------ */}
      <nav aria-label={t("caseDetail.breadcrumbAria")} className="mb-4">
        <ol className="flex items-center gap-1.5 text-xs">
          <li>
            <button
              type="button"
              onClick={() => navigate("cases")}
              className="cursor-pointer rounded font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {t("nav.cases")}
            </button>
          </li>
          <li aria-hidden>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
          </li>
          <li className="truncate font-mono font-semibold">{detail.caseNumber}</li>
        </ol>
      </nav>

      <div className="flex items-start gap-3 sm:gap-4">
        <CaseSeal className="h-12 w-12 sm:h-14 sm:w-14" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={detail.status} />
            <StatusBadge map={translatedStyles(priorityStyles, t)} value={detail.priority} />
            {detail.nextHearingDate ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <CalendarDays className="h-3 w-3" />
                {t("caseDetail.nextBadge", { date: relDay(formatRelativeDay(detail.nextHearingDate), t) })}
              </span>
            ) : null}
          </div>
          <h1 className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
            {detail.title}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground/80">{detail.caseNumber}</span>
            <span aria-hidden className="opacity-40">
              •
            </span>
            <span>{enumLabel("cases.type", detail.type, t)}</span>
            <span aria-hidden className="opacity-40">
              •
            </span>
            <span>{detail.court}</span>
          </p>
        </div>
      </div>

      {/* ----------------------------- Vital signs ----------------------------- */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <VitalTile
          icon={CalendarDays}
          tone={nextHearing ? "amber" : "stone"}
          label={t("caseDetail.metaNextHearing")}
          value={
            nextHearing
              ? relDay(formatRelativeDay(nextHearing.hearingDate), t)
              : t("caseDetail.notScheduled")
          }
          sub={
            nextHearing
              ? `${formatTime(nextHearing.hearingDate)} · ${nextHearing.court ?? detail.court}`
              : undefined
          }
          onClick={() => setTab("hearings")}
        />
        <VitalTile
          icon={Gavel}
          tone="emerald"
          label={t("caseDetail.tabHearings")}
          value={hearings.length}
          sub={t("caseDetail.upcomingCount", { count: upcomingHearings.length })}
          onClick={() => setTab("hearings")}
        />
        <VitalTile
          icon={FileText}
          tone="teal"
          label={t("caseDetail.tabDocuments")}
          value={documents.length}
          sub={t("caseDetail.sharedCount", { count: sharedDocs })}
          onClick={() => setTab("documents")}
        />
        {showInvoices ? (
          <VitalTile
            icon={Wallet}
            tone={outstanding > 0 ? "rose" : "emerald"}
            label={t("caseDetail.outstanding")}
            value={formatCurrency(outstanding)}
            sub={t("caseDetail.ofBilled", { amount: formatCurrency(billed) })}
            onClick={() => setTab("invoices")}
          />
        ) : (
          <VitalTile
            icon={Clock3}
            tone="stone"
            label={t("caseDetail.lastActivity")}
            value={
              latestUpdate
                ? relDay(formatRelativeDay(latestUpdate.createdAt), t)
                : t("caseDetail.noActivity")
            }
            sub={latestUpdate?.createdByName ?? undefined}
            onClick={() => setTab("updates")}
          />
        )}
      </div>

      {/* Sentinel for the sticky command bar's condensed state. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      <Tabs value={activeTab} onValueChange={setTab} className="gap-0">
        {/* --------------------------- Command bar --------------------------- */}
        <div
          className={cn(
            "sticky top-0 z-20 -mx-4 mt-3 border-b px-4 backdrop-blur-xl transition-shadow duration-200 md:-mx-6 md:px-6",
            "bg-paper/85 supports-[backdrop-filter]:bg-paper/70",
            "motion-reduce:transition-none",
            stuck ? "border-border shadow-[0_10px_30px_-22px_rgba(12,30,22,0.65)]" : "border-border/60"
          )}
        >
          <div className="flex items-center gap-2 py-2">
            {/* Condensed identity — slides in once the bar sticks (width only, no reflow). */}
            <div
              aria-hidden={!stuck}
              className={cn(
                "hidden min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap transition-all duration-300 md:flex",
                "motion-reduce:transition-none",
                stuck ? "max-w-[20rem] opacity-100" : "max-w-0 opacity-0"
              )}
            >
              <span
                aria-hidden
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gradient-to-br from-emerald-900 to-teal-700 text-emerald-50"
              >
                <Scale className="h-3.5 w-3.5" />
              </span>
              <span className="truncate font-mono text-xs font-bold">{detail.caseNumber}</span>
              <StatusBadge
                map={translatedStyles(caseStatusStyles, t)}
                value={detail.status}
                className="hidden lg:inline-flex"
              />
              <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            </div>

            {/* Section tabs — horizontally scrollable on narrow screens. */}
            <div className="relative min-w-0 flex-1">
              <TabsList
                aria-label={t("caseDetail.sectionNavAria")}
                className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {tabItems.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="group h-9 flex-none shrink-0 cursor-pointer gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {typeof item.count === "number" && item.count > 0 ? (
                      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-bold tracking-tight text-muted-foreground transition-colors group-data-[state=active]:bg-emerald-100 group-data-[state=active]:text-emerald-800">
                        {item.count}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper to-transparent md:hidden"
              />
            </div>

            {/* Case actions — full set on desktop, one menu on mobile. */}
            {canWrite ? (
              <>
                <div className="ml-auto hidden shrink-0 items-center gap-1.5 md:flex">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 cursor-pointer"
                    onClick={() => setEditOpen(true)}
                  >
                    <FileText className="h-4 w-4" /> {t("caseDetail.editCase")}
                  </Button>
                  {canSetStatus ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9 cursor-pointer">
                          {t("common.status")} <ChevronDown className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">{statusMenuItems}</DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                  {isAdmin ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setDeleteOpen(true)}
                      aria-label={t("common.delete")}
                      title={t("common.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="ml-auto h-9 w-9 shrink-0 cursor-pointer md:hidden"
                      aria-label={t("caseDetail.moreActions")}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="cursor-pointer" onSelect={() => setEditOpen(true)}>
                      <FileText className="h-4 w-4" /> {t("caseDetail.editCase")}
                    </DropdownMenuItem>
                    {canSetStatus ? (
                      <>
                        <DropdownMenuSeparator />
                        {statusMenuItems}
                      </>
                    ) : null}
                    {isAdmin ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                          onSelect={() => setDeleteOpen(true)}
                        >
                          <Trash2 className="h-4 w-4" /> {t("common.delete")}
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </div>
        </div>

        {/* ------------------------------ Overview ------------------------------ */}
        <TabsContent value="overview" className={cn("mt-4", PANEL_ANIM)}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {isClosed && detail.resolutionSummary ? (
                <Panel
                  title={t("caseDetail.resolutionCard")}
                  icon={Scale}
                  className="border-amber-200/80"
                  headerClassName="border-amber-200/60 bg-amber-50/70"
                  bodyClassName="space-y-2 bg-amber-50/30 p-4"
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {detail.resolutionSummary}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.outcome ? (
                      <span className="inline-flex items-center rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800">
                        {t("caseDetail.outcomeBadge", { outcome: detail.outcome })}
                      </span>
                    ) : null}
                    {detail.closedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t("caseDetail.closedAt", { datetime: formatDateTime(detail.closedAt) })}
                      </p>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              <Panel title={t("caseDetail.caseSummary")} icon={FileText}>
                {detail.description ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {detail.description}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">{t("caseDetail.noDescription")}</p>
                )}
              </Panel>

              {nextHearing ? (
                <Panel
                  title={t("caseDetail.metaNextHearing")}
                  icon={CalendarDays}
                  className="border-amber-200/80"
                  headerClassName="border-amber-200/60 bg-amber-50/70"
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 cursor-pointer text-xs"
                      onClick={() => setTab("hearings")}
                    >
                      {t("caseDetail.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  }
                >
                  <div className="flex items-center gap-4">
                    <DateMedallion iso={nextHearing.hearingDate} highlight />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold">
                        {relDay(formatRelativeDay(nextHearing.hearingDate), t)}
                        <span aria-hidden> · </span>
                        {formatTime(nextHearing.hearingDate)}
                      </p>
                      <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {[
                          nextHearing.hearingType
                            ? enumLabel("hearings.type", nextHearing.hearingType, t)
                            : null,
                          nextHearing.judge,
                          nextHearing.court ?? detail.court,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </div>
                </Panel>
              ) : null}

              <Panel
                title={t("caseDetail.recentActivity")}
                icon={MessageSquarePlus}
                action={
                  updates.length > 3 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 cursor-pointer text-xs"
                      onClick={() => setTab("updates")}
                    >
                      {t("caseDetail.viewAll")} <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  ) : null
                }
              >
                {sortedUpdates.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">{t("caseDetail.noUpdatesDesc")}</p>
                ) : (
                  <UpdateTimeline items={sortedUpdates.slice(0, 3)} />
                )}
              </Panel>
            </div>

            {/* Case rail — who is involved, and the filing record. */}
            <div className="space-y-4">
              <Panel title={t("caseDetail.parties")} icon={Users}>
                <ul className="divide-y divide-border/60">
                  <PartyRow
                    name={detail.client?.name ?? null}
                    role={t("caseDetail.metaClient")}
                    meta={detail.client?.phone}
                    tone="emerald"
                    icon={Users}
                    phone={detail.client?.phone}
                    phoneAria={t("caseDetail.callAria", { name: detail.client?.name ?? "" })}
                  />
                  <PartyRow
                    name={detail.lawyer?.name ?? null}
                    role={t("caseDetail.metaLawyer")}
                    meta={detail.lawyer ? null : t("cases.unassigned")}
                    tone="teal"
                    icon={UserCog}
                  />
                  <PartyRow
                    name={detail.oppositeParty ?? null}
                    role={t("caseDetail.metaOppositeParty")}
                    tone="stone"
                    icon={Building2}
                  />
                </ul>
              </Panel>

              <Panel title={t("caseDetail.filingDetails")} icon={FolderOpen}>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Field label={t("caseDetail.metaCaseNumber")}>
                    <span className="font-mono">{detail.caseNumber}</span>
                  </Field>
                  <Field label={t("caseDetail.metaType")}>{enumLabel("cases.type", detail.type, t)}</Field>
                  <Field label={t("caseDetail.metaCourt")}>{detail.court}</Field>
                  <Field label={t("caseDetail.metaDistrict")}>{detail.district ?? "—"}</Field>
                  <Field label={t("caseDetail.metaFiled")}>{formatDate(detail.filingDate)}</Field>
                  <Field label={t("caseDetail.metaCreated")}>{formatDateTime(detail.createdAt)}</Field>
                </dl>
              </Panel>
            </div>
          </div>
        </TabsContent>

        {/* ------------------------------ Hearings ------------------------------ */}
        <TabsContent value="hearings" className={cn("mt-4 space-y-4", PANEL_ANIM)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t(hearings.length === 1 ? "caseDetail.hearingCountOne" : "caseDetail.hearingCountOther", {
                count: hearings.length,
              })}
            </p>
            {canWrite ? (
              <Button size="sm" className="h-9 cursor-pointer" onClick={() => setHearingFormOpen(true)}>
                <CalendarPlus className="h-4 w-4" /> {t("hearings.scheduleHearing")}
              </Button>
            ) : null}
          </div>

          {hearings.length === 0 ? (
            <EmptyState icon={Gavel} title={t("caseDetail.noHearings")} description={t("caseDetail.noHearingsDesc")} />
          ) : (
            <div className="space-y-6">
              {upcomingHearings.length > 0 ? (
                <div>
                  {groupLabel(t("caseDetail.upcomingHearings"), upcomingHearings.length)}
                  <div className="space-y-3">{upcomingHearings.map(hearingCard)}</div>
                </div>
              ) : null}
              {pastHearings.length > 0 ? (
                <div>
                  {groupLabel(t("caseDetail.pastHearings"), pastHearings.length)}
                  <div className="space-y-3">{pastHearings.map(hearingCard)}</div>
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        {/* ------------------------------ Documents ------------------------------ */}
        <TabsContent value="documents" className={cn("mt-4 space-y-4", PANEL_ANIM)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t(documents.length === 1 ? "caseDetail.docCountOne" : "caseDetail.docCountOther", {
                count: documents.length,
              })}
            </p>
            {canWrite ? (
              <Button size="sm" className="h-9 cursor-pointer" onClick={() => setUploadOpen(true)}>
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
            <>
              {/* Mobile: one card per document — no horizontal scrolling. */}
              <ul className="space-y-2 md:hidden">
                {documents.map((doc) => {
                  const { Icon, tone } = fileVisual(doc.mimeType)
                  return (
                    <li
                      key={doc.id}
                      className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                            TONES[tone]
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
                            {doc.documentName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[
                              doc.documentType ? enumLabel("documents.type", doc.documentType, t) : null,
                              formatFileSize(doc.fileSize),
                              formatDate(doc.createdAt),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {doc.sharedWithClient ? (
                            <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                              <Users className="h-3 w-3" /> {t("documents.sharedBadge")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {doc.uploadedByName ?? "—"}
                        </span>
                        {documentActions(doc, true)}
                      </div>
                    </li>
                  )
                })}
              </ul>

              {/* Desktop: the full record table. */}
              <div className="hidden overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm md:block">
                <div className="overflow-x-auto">
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
                      {documents.map((doc) => {
                        const { Icon, tone } = fileVisual(doc.mimeType)
                        return (
                          <TableRow key={doc.id} className="transition-colors hover:bg-muted/40">
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-3">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset",
                                    TONES[tone]
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold [overflow-wrap:anywhere]">{doc.documentName}</p>
                                  {doc.sharedWithClient ? (
                                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-800">
                                      <Users className="h-3 w-3" /> {t("documents.sharedBadge")}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {doc.documentType ? enumLabel("documents.type", doc.documentType, t) : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {doc.category ? enumLabel("documents.cat", doc.category, t) : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatFileSize(doc.fileSize)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {doc.uploadedByName ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(doc.createdAt)}
                            </TableCell>
                            <TableCell className="pr-4">
                              <div className="flex items-center justify-end">{documentActions(doc)}</div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ------------------------------- Updates ------------------------------- */}
        <TabsContent value="updates" className={cn("mt-4 space-y-4", PANEL_ANIM)}>
          {canWrite ? (
            <Panel bodyClassName="p-3 sm:p-4">
              <div className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1 hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-100 sm:grid"
                >
                  {initials(user.name)}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="update-composer" className="sr-only">
                    {t("caseDetail.addUpdateTitle")}
                  </Label>
                  <Textarea
                    id="update-composer"
                    value={updateText}
                    onChange={(e) => setUpdateText(e.target.value)}
                    rows={3}
                    placeholder={t("caseDetail.composerPh")}
                    className="resize-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{t("caseDetail.addUpdateDesc")}</p>
                    <Button
                      size="sm"
                      className="h-9 shrink-0 cursor-pointer"
                      disabled={updatePending || !updateText.trim()}
                      onClick={() => void submitUpdate()}
                    >
                      {updatePending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      {t("caseDetail.postUpdate")}
                    </Button>
                  </div>
                </div>
              </div>
            </Panel>
          ) : null}

          {sortedUpdates.length === 0 ? (
            <EmptyState
              icon={MessageSquarePlus}
              title={t("caseDetail.noUpdates")}
              description={t("caseDetail.noUpdatesDesc")}
            />
          ) : (
            <Panel
              title={t(updates.length === 1 ? "caseDetail.updateCountOne" : "caseDetail.updateCountOther", {
                count: updates.length,
              })}
              icon={Clock3}
            >
              <UpdateTimeline items={sortedUpdates} />
            </Panel>
          )}
        </TabsContent>

        {/* ------------------------------- Invoices ------------------------------- */}
        {showInvoices ? (
          <TabsContent value="invoices" className={cn("mt-4 space-y-4", PANEL_ANIM)}>
            {invoices.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={t("caseDetail.noInvoices")}
                description={t("caseDetail.noInvoicesDesc")}
              />
            ) : (
              <>
                <Panel title={t("caseDetail.billingSummary")} icon={Receipt} bodyClassName="space-y-4 p-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t("caseDetail.totalBilled")}
                      </p>
                      <p className="truncate text-base font-semibold sm:text-lg">{formatCurrency(billed)}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t("caseDetail.totalPaid")}
                      </p>
                      <p className="truncate text-base font-semibold text-emerald-700 sm:text-lg">
                        {formatCurrency(collected)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {t("caseDetail.outstanding")}
                      </p>
                      <p
                        className={cn(
                          "truncate text-base font-semibold sm:text-lg",
                          outstanding > 0 && "text-rose-600"
                        )}
                      >
                        {formatCurrency(outstanding)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={collectedPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t("caseDetail.collected", { pct: collectedPct })}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-[width] duration-500 motion-reduce:transition-none"
                        style={{ width: `${collectedPct}%` }}
                      />
                    </div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Banknote className="h-3.5 w-3.5" />
                      {t("caseDetail.collected", { pct: collectedPct })}
                    </p>
                  </div>
                </Panel>

                {/* Mobile: card per invoice. */}
                <ul className="space-y-2 md:hidden">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold [overflow-wrap:anywhere]">{inv.invoiceNumber}</p>
                        <StatusBadge map={translatedStyles(invoiceStatusStyles, t)} value={inv.status} />
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/60 pt-2">
                        <Field label={t("common.amount")}>{formatCurrency(inv.amount)}</Field>
                        <Field label={t("billing.colPaid")}>{formatCurrency(inv.paidAmount)}</Field>
                        <Field label={t("billing.colBillingType")}>
                          {inv.billingType ? enumLabel("billing.type", inv.billingType, t) : "—"}
                        </Field>
                        <Field label={t("billing.colDue")}>
                          <span className={cn(inv.status === "OVERDUE" && "font-semibold text-rose-600")}>
                            {formatDate(inv.dueDate)}
                          </span>
                        </Field>
                      </dl>
                    </li>
                  ))}
                </ul>

                {/* Desktop: the ledger table. */}
                <div className="hidden overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm md:block">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="pl-4">{t("billing.colInvoice")}</TableHead>
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
                          <TableRow key={inv.id} className="transition-colors hover:bg-muted/40">
                            <TableCell className="pl-4 font-semibold">{inv.invoiceNumber}</TableCell>
                            <TableCell className="text-sm">{inv.clientName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {inv.billingType ? enumLabel("billing.type", inv.billingType, t) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatCurrency(inv.amount)}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatCurrency(inv.paidAmount)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-sm",
                                inv.status === "OVERDUE" && "font-medium text-rose-600"
                              )}
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
                  </div>
                </div>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              {user.role === "CLIENT" ? t("caseDetail.invoicesNoteClient") : t("caseDetail.invoicesNoteStaff")}
            </p>
          </TabsContent>
        ) : null}
      </Tabs>

      {/* -------------------------------- Dialogs -------------------------------- */}
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
      <UploadDialog caseId={detail.id} open={uploadOpen} onOpenChange={setUploadOpen} onSaved={refetch} />
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
    </div>
  )
}
