"use client"

import { Fragment, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  FileText,
  Gavel,
  GitCompare,
  History,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { useApiData } from "@/hooks/use-api-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { AuditEntry, AuditListDTO, ViewProps } from "@/lib/types"
import { cn, formatDate, formatDateTime, formatRelativeDay } from "@/lib/utils"

const ALL = "ALL"
const PAGE_SIZE = 25
const DHAKA_TZ = "Asia/Dhaka"

/** Entity types surfaced in the filter dropdown (mirrors the API's entityType values). */
const ENTITY_TYPES = [
  "Case",
  "Hearing",
  "Invoice",
  "Payment",
  "Client",
  "Lawyer",
  "User",
  "Document",
  "Auth",
  "Settings",
  "OutboundMessage",
] as const

/** Action prefix filters (prefix match server-side, e.g. CASE_ → CASE_UPDATE). */
const ACTION_PREFIXES = [
  "CASE_",
  "HEARING_",
  "INVOICE_",
  "PAYMENT_",
  "AUTH_",
  "CLIENT_",
  "LAWYER_",
  "USER_",
  "DOCUMENT_",
  "SETTINGS_",
  "OUTBOUND_",
] as const

/**
 * A glyph per entity type. The domain is carried by shape rather than hue so
 * colour stays free to mean severity (below) — and so the register is still
 * scannable without colour vision.
 */
const ENTITY_GLYPHS: Record<string, LucideIcon> = {
  Case: Gavel,
  Hearing: CalendarDays,
  Invoice: Receipt,
  Payment: Banknote,
  Client: Users,
  Lawyer: UserCog,
  User: UserCog,
  Document: FileText,
  Auth: ShieldCheck,
  Settings: SlidersHorizontal,
  OutboundMessage: Send,
}

/**
 * Severity, not domain.
 *
 * The previous version tinted by domain, which painted every routine sign-in
 * rose — a page of red for nothing being wrong, while a deleted payment got
 * the same weight. Colour now says what happened to the record: something was
 * created, something was removed or failed, or something changed.
 */
type Severity = "created" | "removed" | "changed"

function severityOf(action: string): Severity {
  if (action.endsWith("_DELETE") || action.endsWith("_FAILED") || action.endsWith("_CANCEL")) {
    return "removed"
  }
  if (action.endsWith("_CREATE") || action.endsWith("_UPLOAD") || action.endsWith("_RECORD")) {
    return "created"
  }
  return "changed"
}

const SEVERITY_STYLES: Record<Severity, string> = {
  created: "border-emerald-600/20 bg-emerald-50 text-emerald-800",
  removed: "border-rose-600/20 bg-rose-50 text-rose-800",
  changed: "border-border bg-paper-shade text-ink",
}

/** Tick colour for the row's leading rule — the quietest possible severity cue. */
const SEVERITY_TICKS: Record<Severity, string> = {
  created: "bg-emerald-500/70",
  removed: "bg-rose-500/70",
  changed: "bg-transparent",
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: "border-brass/40 bg-brass-tint text-brass-deep",
  LAWYER: "border-border bg-paper-shade text-ink/60",
  CLIENT: "border-border bg-paper-shade text-ink/60",
  STAFF: "border-border bg-paper-shade text-ink/60",
}

interface AuditFilters {
  q: string
  entityType: string
  action: string
  from: string
  to: string
}

const EMPTY_FILTERS: AuditFilters = { q: "", entityType: ALL, action: ALL, from: "", to: "" }

/** Render an audit meta diff value — JSON-stringify everything non-primitive. */
function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "string") return value === "" ? "—" : value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/* -------------------------------- Time helpers ------------------------------- */

/** "5:52 pm" in Asia/Dhaka — the date lives on the day divider instead. */
function dhakaTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d)
}

/** Stable Dhaka day key, so entries group by the chamber's calendar day. */
function dhakaDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/** "Today", "Yesterday" or "10 Sept 2026", translated. */
function dayLabel(iso: string, t: TranslateFn): string {
  const rel = formatRelativeDay(iso)
  if (rel === "Today") return t("common.today")
  if (rel === "Yesterday") return t("common.yesterday")
  return rel
}

/** Consecutive entries sharing a Dhaka day, in the order the API returned them. */
function groupByDay(entries: AuditEntry[]): { key: string; iso: string; entries: AuditEntry[] }[] {
  const out: { key: string; iso: string; entries: AuditEntry[] }[] = []
  for (const entry of entries) {
    const key = dhakaDayKey(entry.createdAt)
    const last = out[out.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else out.push({ key, iso: entry.createdAt, entries: [entry] })
  }
  return out
}

/* ------------------------------ Meta diff dialog ------------------------------ */

function MetaDiffDialog({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const { t } = useLanguage()
  const rows = useMemo(() => Object.entries(entry?.meta ?? {}), [entry])

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg tracking-tight">{t("audit.diffTitle")}</DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.action}${entry.entityLabel ? ` · ${entry.entityLabel}` : ""} · ${formatDateTime(entry.createdAt)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("audit.diffEmpty")}</p>
          ) : (
            rows.map(([field, change]) => (
              <div key={field} className="rounded-lg border border-border/70 bg-paper-shade/60 px-3 py-2">
                <p className="u-eyebrow text-muted-foreground">{field}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="max-w-full break-all rounded bg-rose-50 px-1.5 py-0.5 font-mono text-xs text-rose-800 line-through decoration-rose-400/70">
                    {formatDiffValue(change?.from)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brass-deep/60" aria-hidden="true" />
                  <span className="max-w-full break-all rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs text-emerald-800">
                    {formatDiffValue(change?.to)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------- View --------------------------------- */

export default function AuditView({ user }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"

  const [draft, setDraft] = useState<AuditFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [diffEntry, setDiffEntry] = useState<AuditEntry | null>(null)

  const path = useMemo(() => {
    if (!isAdmin) return null // avoids a guaranteed 403 for other roles
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (applied.q.trim()) params.set("q", applied.q.trim())
    if (applied.entityType !== ALL) params.set("entityType", applied.entityType)
    if (applied.action !== ALL) params.set("action", applied.action)
    if (applied.from) params.set("from", applied.from)
    if (applied.to) params.set("to", applied.to)
    return `/api/audit?${params.toString()}`
  }, [isAdmin, applied, page])

  const { data, loading, error, refetch } = useApiData<AuditListDTO>(path)

  const items = useMemo(() => data?.items ?? [], [data])
  const days = useMemo(() => groupByDay(items), [items])
  const total = data?.total ?? 0
  const serverPage = data?.page ?? page
  const serverPageSize = data?.pageSize ?? PAGE_SIZE
  const rangeFrom = total === 0 ? 0 : (serverPage - 1) * serverPageSize + 1
  const rangeTo = total === 0 ? 0 : (serverPage - 1) * serverPageSize + items.length
  const hasPrev = serverPage > 1
  const hasNext = serverPage * serverPageSize < total

  const filtersDirty =
    applied.q !== "" || applied.entityType !== ALL || applied.action !== ALL || applied.from !== "" || applied.to !== ""

  const applyFilters = () => {
    setApplied({ ...draft, q: draft.q.trim() })
    setPage(1)
  }

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("audit.pageTitle")} description={t("audit.pageSubtitle")} />
        <EmptyState icon={ShieldAlert} title={t("audit.guardTitle")} description={t("audit.guardDesc")} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("audit.pageTitle")} description={t("audit.pageSubtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          {t("common.refresh")}
        </Button>
      </PageHeader>

      {/* Filter bar */}
      <div
        style={{ "--d": "0ms" } as React.CSSProperties}
        className="u-rise u-crest rounded-xl border border-border/80 bg-card p-4 shadow-soft"
      >
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_10rem_10rem_auto] lg:items-end">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={draft.q}
              onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder={t("audit.searchPlaceholder")}
              aria-label={t("audit.searchPlaceholder")}
              className="pl-8"
            />
          </div>

          <Select value={draft.entityType} onValueChange={(v) => setDraft((d) => ({ ...d, entityType: v }))}>
            <SelectTrigger aria-label={t("audit.allEntities")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.allEntities")}</SelectItem>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={draft.action} onValueChange={(v) => setDraft((d) => ({ ...d, action: v }))}>
            <SelectTrigger aria-label={t("audit.allActions")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("audit.allActions")}</SelectItem>
              {ACTION_PREFIXES.map((a) => (
                <SelectItem key={a} value={a}>
                  <span className="font-mono text-xs">{a}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
            aria-label={t("common.from")}
          />
          <Input
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
            aria-label={t("common.to")}
          />

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={applyFilters}>
              {t("audit.apply")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={resetFilters}
              disabled={!filtersDirty && draft === EMPTY_FILTERS}
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("audit.reset")}
            </Button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <LoadingBlock rows={8} />
      ) : error && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("audit.errLoad")}
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <>
          {/* The register itself. A brass hairline seals the top edge, the way
              the bound ledger this replaces would have been ruled. */}
          <section
            style={{ "--d": "70ms" } as React.CSSProperties}
            className="u-rise u-crest relative overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft"
          >
            <hr aria-hidden className="u-rule absolute inset-x-0 top-0 z-30" />
            <div>
              {items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={History}
                    title={total === 0 ? t("audit.empty") : t("audit.emptyFiltered")}
                    description={total === 0 ? t("audit.emptyDesc") : t("audit.emptyFilteredDesc")}
                  />
                </div>
              ) : (
                <Table containerClassName="max-h-[70vh] overflow-auto">
                  {/* Opaque on purpose: rows scroll beneath this. */}
                  <TableHeader className="sticky top-0 z-20 bg-paper-shade [&_tr]:border-b [&_tr]:border-border">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-24 whitespace-nowrap text-right">{t("audit.colTime")}</TableHead>
                      <TableHead className="w-56">{t("audit.colActor")}</TableHead>
                      <TableHead className="w-52">{t("audit.colAction")}</TableHead>
                      <TableHead className="w-56">{t("audit.colEntity")}</TableHead>
                      <TableHead className="min-w-48">{t("audit.colSummary")}</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">{t("audit.colChanges")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {days.map((day) => (
                      <Fragment key={day.key}>
                        {/* Day divider: the date is written once here instead of
                            being repeated on all 25 rows of the page. */}
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={6} className="border-b border-border/70 bg-paper-shade/50 py-2">
                            <div className="flex items-baseline gap-2.5">
                              <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-brass" />
                              <span className="u-eyebrow text-ink">{dayLabel(day.iso, t)}</span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {formatDate(day.iso)}
                              </span>
                              <span aria-hidden className="h-px flex-1 bg-border/70" />
                            </div>
                          </TableCell>
                        </TableRow>

                        {day.entries.map((entry) => {
                          const severity = severityOf(entry.action)
                          const Glyph = ENTITY_GLYPHS[entry.entityType ?? ""] ?? History
                          const hasDiff = !!entry.meta && Object.keys(entry.meta).length > 0
                          return (
                            <TableRow key={entry.id} className="group align-top">
                              <TableCell className="relative whitespace-nowrap py-2.5 pl-4 text-right align-middle">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "absolute inset-y-2 left-0 w-0.5 rounded-full",
                                    SEVERITY_TICKS[severity]
                                  )}
                                />
                                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                                  {dhakaTime(entry.createdAt)}
                                </span>
                              </TableCell>

                              <TableCell className="py-2.5 align-middle">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-sm font-medium text-ink">
                                    {entry.actorName ?? t("status.system")}
                                  </span>
                                  {entry.actorRole ? (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "border px-1.5 py-0 text-[10px] font-medium",
                                        ROLE_BADGE_CLASSES[entry.actorRole] ?? ROLE_BADGE_CLASSES.STAFF
                                      )}
                                    >
                                      {statusLabel(entry.actorRole, t)}
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>

                              <TableCell className="py-2.5 align-middle">
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] leading-none",
                                    SEVERITY_STYLES[severity]
                                  )}
                                >
                                  <Glyph className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                                  {entry.action}
                                </span>
                              </TableCell>

                              <TableCell className="py-2.5 align-middle">
                                <p className="u-eyebrow text-muted-foreground">{entry.entityType ?? "—"}</p>
                                <p className="mt-0.5 truncate text-sm font-medium text-ink">
                                  {entry.entityLabel ?? entry.entityId ?? "—"}
                                </p>
                              </TableCell>

                              <TableCell className="max-w-xs py-2.5 align-middle">
                                <p className="line-clamp-2 text-sm text-muted-foreground">{entry.summary ?? "—"}</p>
                              </TableCell>

                              <TableCell className="py-2.5 pr-3 text-right align-middle">
                                {hasDiff ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground opacity-60 transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                                    onClick={() => setDiffEntry(entry)}
                                    title={t("audit.viewDiff")}
                                    aria-label={t("audit.viewDiff")}
                                  >
                                    <GitCompare className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          {/* Pagination footer */}
          {items.length > 0 ? (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs tabular-nums text-muted-foreground">
                {t("audit.showing", { from: rangeFrom, to: rangeTo, total })}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t("audit.prev")}
                </Button>
                <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
                  {t("audit.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <MetaDiffDialog entry={diffEntry} onClose={() => setDiffEntry(null)} />

      {/* Append-only: this view intentionally exposes no edit/delete actions. */}
    </div>
  )
}
