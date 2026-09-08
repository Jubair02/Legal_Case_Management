"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  GitCompare,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react"

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
import { statusLabel, useLanguage } from "@/lib/i18n/language"
import type { AuditEntry, AuditListDTO, ViewProps } from "@/lib/types"
import { cn, formatDateTime } from "@/lib/utils"

const ALL = "ALL"
const PAGE_SIZE = 25

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

/** Color mapping for action badges by prefix. */
function actionBadgeClass(action: string): string {
  if (action.startsWith("CASE_")) return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (action.startsWith("HEARING_")) return "border-amber-200 bg-amber-50 text-amber-700"
  if (action.startsWith("INVOICE_") || action.startsWith("PAYMENT_"))
    return "border-teal-200 bg-teal-50 text-teal-700"
  if (action.startsWith("AUTH_")) return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-stone-200 bg-stone-50 text-stone-600"
}

const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  LAWYER: "border-stone-200 bg-stone-50 text-stone-600",
  CLIENT: "border-stone-200 bg-stone-50 text-stone-600",
  STAFF: "border-stone-200 bg-stone-50 text-stone-600",
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

/* ------------------------------ Meta diff dialog ------------------------------ */

function MetaDiffDialog({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const { t } = useLanguage()
  const rows = useMemo(() => Object.entries(entry?.meta ?? {}), [entry])

  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("audit.diffTitle")}</DialogTitle>
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
              <div key={field} className="rounded-lg border border-stone-200/80 bg-stone-50/60 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{field}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="max-w-full break-all rounded bg-rose-50 px-1.5 py-0.5 font-mono text-xs text-rose-700 line-through decoration-rose-300">
                    {formatDiffValue(change?.from)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden="true" />
                  <span className="max-w-full break-all rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs text-emerald-700">
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

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const serverPage = data?.page ?? page
  const serverPageSize = data?.pageSize ?? PAGE_SIZE
  const rangeFrom = total === 0 ? 0 : (serverPage - 1) * serverPageSize + 1
  const rangeTo = total === 0 ? 0 : (serverPage - 1) * serverPageSize + items.length
  const hasPrev = serverPage > 1
  const hasNext = serverPage * serverPageSize < total

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
      <div className="rounded-xl border border-stone-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_10rem_10rem_auto] lg:items-end">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
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
            <Button size="sm" variant="outline" onClick={resetFilters} className="gap-1.5">
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
          <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm">
            <div className="max-h-[70vh] overflow-auto">
              {items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={History}
                    title={total === 0 ? t("audit.empty") : t("audit.emptyFiltered")}
                    description={
                      total === 0 ? t("audit.emptyDesc") : t("audit.emptyFilteredDesc")
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_theme(colors.stone.200)]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap">{t("audit.colTime")}</TableHead>
                      <TableHead>{t("audit.colActor")}</TableHead>
                      <TableHead>{t("audit.colAction")}</TableHead>
                      <TableHead>{t("audit.colEntity")}</TableHead>
                      <TableHead className="min-w-48">{t("audit.colSummary")}</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">{t("audit.colChanges")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{entry.actorName ?? t("status.system")}</span>
                            {entry.actorRole ? (
                              <Badge
                                variant="outline"
                                className={cn("border text-[10px]", ROLE_BADGE_CLASSES[entry.actorRole] ?? ROLE_BADGE_CLASSES.STAFF)}
                              >
                                {statusLabel(entry.actorRole, t)}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("border font-mono text-[10px]", actionBadgeClass(entry.action))}>
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {entry.entityType ?? "—"}
                          </p>
                          <p className="text-sm font-semibold">{entry.entityLabel ?? entry.entityId ?? "—"}</p>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="line-clamp-2 text-sm text-muted-foreground">{entry.summary ?? "—"}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.meta && Object.keys(entry.meta).length > 0 ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setDiffEntry(entry)}
                              title={t("audit.viewDiff")}
                              aria-label={t("audit.viewDiff")}
                            >
                              <GitCompare className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          {/* Pagination footer */}
          {items.length > 0 ? (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-xs text-muted-foreground">
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
