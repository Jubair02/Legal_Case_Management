"use client"

import {
  AlertTriangle,
  Banknote,
  CalendarCheck2,
  CalendarDays,
  Clock,
  FolderKanban,
  Gavel,
  Landmark,
  ShieldAlert,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
import { useApiData } from "@/hooks/use-api-data"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CASE_STATUSES } from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { ReportsDTO, ViewProps } from "@/lib/types"
import { cn, formatCurrency } from "@/lib/utils"

/* ------------------------------- Chart palette -------------------------------
 * Marks are drawn in brand tokens rather than chart-library defaults, so the
 * page reads as one system with the dashboard and the billing ledger.
 *
 * Two deliberate constraints, both measured rather than eyeballed:
 *  - `brass` (oklch 0.735 0.092 80) sits at 2.3:1 against paper — fine for the
 *    hairlines and eyebrows it was designed for, too weak for a solid mark. Bars
 *    that must hold their own therefore use `brass-deep` (7.4:1), and brass is
 *    kept for the thin meter segment, where a legend and a printed amount carry
 *    the value regardless of the fill.
 *  - Every token in this palette is deliberately low-chroma, so none of them
 *    clears a categorical chroma floor. That only matters when hue alone has to
 *    separate one series from another; here each bar list is a single series and
 *    every meter segment is named in its legend, so identity never rests on
 *    colour. Adjacent-pair separation still passes (ΔE 13.7 deutan for the bar
 *    fills, 9.1 protan for the meter).
 * ---------------------------------------------------------------------------- */

/** Solid fills for the case-status meter, matching each status badge's hue. */
const STATUS_FILLS: Record<string, string> = {
  DRAFT: "bg-stone-400",
  ACTIVE: "bg-emerald-600",
  PENDING: "bg-amber-500",
  ON_HOLD: "bg-orange-500",
  RESOLVED: "bg-teal-600",
  CLOSED: "bg-slate-400",
}

const STATUS_ORDER: readonly string[] = CASE_STATUSES

/* --------------------------------- Helpers --------------------------------- */

/**
 * Builds a derived enum dictionary key: enumTKey("cases.type", "Bail Matter")
 * → "cases.typeBailMatter". Non-alphanumeric runs split words.
 */
function enumTKey(prefix: string, value: string): string {
  return (
    prefix +
    value
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("")
  )
}

/** Translates a domain enum value, falling back to the raw stored string. */
function enumLabel(prefix: string, value: string | null | undefined, t: TranslateFn): string {
  if (!value) return "—"
  const key = enumTKey(prefix, value)
  const translated = t(key)
  return translated === key ? value : translated
}

function share(value: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.round((value / total) * 100)
}

/* ------------------------------- Primitives ------------------------------- */

/**
 * Flat metric cell. Deliberately not a StatCard: these sit *inside* a section
 * panel, where a second bordered card would stack card chrome on card chrome.
 * Numerals stay in the sans face, the same rule StatCard follows — the serif is
 * the heading voice, so data reads as data.
 */
function Metric({
  icon: Icon,
  label,
  value,
  sub,
  tone = "text-ink",
}: {
  icon?: LucideIcon
  label: string
  value: ReactNode
  sub?: string
  tone?: string
}) {
  return (
    <div className="min-w-0 flex-1 px-4 py-3.5 md:px-5">
      <p className="u-eyebrow flex items-center gap-1.5 text-muted-foreground">
        {Icon ? <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
        {label}
      </p>
      <p className={cn("mt-2 truncate text-[1.45rem] leading-none font-semibold tracking-tight tabular-nums", tone)}>
        {value}
      </p>
      {sub ? <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

/** Colour key for a meter segment — the channel that carries identity. */
function LegendItem({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-1.5 text-xs">
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </li>
  )
}

/**
 * Part-to-whole meter. Segments are sized with flex-grow rather than percentage
 * widths so the 2px surface gaps between them come out of the track instead of
 * overflowing it — a percentage stack plus gaps clips its last segment.
 */
function Meter({ segments }: { segments: { key: string; value: number; fill: string }[] }) {
  const drawn = segments.filter((s) => s.value > 0)
  return (
    <div aria-hidden className="flex h-2.5 gap-[2px] overflow-hidden rounded-r-[4px] bg-border/60">
      {drawn.map((s) => (
        <span key={s.key} className={cn("h-full first:rounded-l-[1px] last:rounded-r-[4px]", s.fill)} style={{ flexGrow: s.value, flexBasis: 0 }} />
      ))}
    </div>
  )
}

/**
 * One row of a horizontal bar list: name, value, then a thin mark under both.
 *
 * Horizontal because these labels are long phrases ("Company / Commercial
 * Case", "Bank Transfer"). The previous vertical columns rotated them −15° to
 * fit, which is the readability problem this form avoids entirely. The value
 * sits in its own aligned column rather than riding the bar tip, so no label
 * can ever be clipped by a short mark.
 *
 * The mark is scaled to share of total, not to the largest row. Scaling to the
 * largest row makes the top bar fill the track whatever it is worth — real data
 * had "Bank Transfer" drawn full-width beside the label "41%", the mark
 * contradicting the number printed next to it. Share scaling keeps the two
 * saying the same thing, and these lists are compositions rather than rankings.
 */
function BarRow({
  label,
  value,
  pct,
  fill,
}: {
  label: string
  value: string
  /** Share of the list's total, in percent — both the label and the bar width. */
  pct: number
  fill: string
}) {
  return (
    <li className="group py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-ink">{label}</p>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-r-[4px] bg-border/50">
          <div
            aria-hidden
            className={cn("h-full rounded-r-[4px] transition-[width] duration-500 ease-out", fill)}
            style={{ width: `${pct > 0 ? Math.max(pct, 1.5) : 0}%` }}
          />
        </div>
        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
      </div>
    </li>
  )
}

/** Bar list with its own inline empty state. */
function BarList({
  rows,
  fill,
  emptyIcon,
  emptyTitle,
}: {
  rows: { key: string; label: string; value: string; raw: number }[]
  fill: string
  emptyIcon: LucideIcon
  emptyTitle: string
}) {
  if (rows.length === 0) {
    return <EmptyState variant="inline" icon={emptyIcon} title={emptyTitle} />
  }
  const total = rows.reduce((sum, r) => sum + r.raw, 0)
  return (
    <ol className="divide-y divide-border/50">
      {rows.map((r) => (
        <BarRow key={r.key} label={r.label} value={r.value} pct={share(r.raw, total)} fill={fill} />
      ))}
    </ol>
  )
}

/** Table head in the micro-caps voice the migrated tables use. */
function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <TableHead className={cn("u-eyebrow text-muted-foreground", className)}>{children}</TableHead>
}

/* ---------------------------------- View ---------------------------------- */

export default function ReportsView({ user }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"
  // Only fetch when actually allowed — avoids a guaranteed 403 for other roles.
  const { data, loading, error, refetch } = useApiData<ReportsDTO>(isAdmin ? "/api/reports" : null)

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("reports.pageTitle")} description={t("reports.pageSubtitle")} />
        <EmptyState icon={ShieldAlert} title={t("reports.guardTitle")} description={t("reports.guardDesc")} />
      </div>
    )
  }

  if (loading && !data) return <LoadingBlock rows={4} tiles={4} panels={2} />

  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("reports.pageTitle")} description={t("reports.pageSubtitleError")} />
        <EmptyState
          icon={AlertTriangle}
          title={t("reports.errLoad")}
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    )
  }
  if (!data) return <LoadingBlock rows={4} tiles={4} panels={2} />

  const cr = data.caseReports
  const fin = data.financial
  const hr = data.hearingReports

  /*
   * The composition meter is built from `byStatus`, not from the five named
   * counters beside it: CaseStatus has six values and those counters skip
   * DRAFT, so they do not sum to `total`. `byStatus` counts every status, which
   * is what a part-to-whole mark requires.
   */
  const statusRows = [...cr.byStatus].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
  )
  const statusSegments = statusRows.map((s) => ({
    key: s.status,
    value: s.count,
    fill: STATUS_FILLS[s.status] ?? "bg-stone-400",
  }))

  const typeRows = cr.byType.map((row) => ({
    key: row.type,
    label: enumLabel("cases.type", row.type, t),
    value: String(row.count),
    raw: row.count,
  }))

  const methodRows = fin.byMethod.map((row) => ({
    key: row.method,
    label: enumLabel("billing.method", row.method, t),
    value: formatCurrency(row.amount),
    raw: row.amount,
  }))

  const collectionRate = share(fin.totalCollected, fin.totalInvoiced)

  return (
    <div className="space-y-6">
      <PageHeader title={t("reports.pageTitle")} description={t("reports.pageSubtitleFull")} />

      {/* Headline figures — the four numbers a chamber acts on. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label={t("reports.totalCases")} value={cr.total} tone="emerald" delay={0} />
        <StatCard icon={Gavel} label={t("status.active")} value={cr.active} tone="teal" delay={60} />
        <StatCard
          icon={Wallet}
          label={t("reports.outstanding")}
          value={formatCurrency(fin.outstanding)}
          sub={t("reports.outstandingSub")}
          tone="gold"
          delay={120}
        />
        <StatCard
          icon={CalendarDays}
          label={t("reports.hearingsThisMonth")}
          value={hr.thisMonth}
          tone="amber"
          delay={180}
        />
      </div>

      {/* 1 — Case reports */}
      <SectionCard
        title={t("reports.caseReports")}
        description={t("reports.caseReportsDesc")}
        icon={FolderKanban}
        accent
        delay={220}
      >
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Composition */}
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="u-eyebrow text-muted-foreground">{t("reports.byStatus")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("reports.caseCount", { count: cr.total })}
                </p>
              </div>
              {cr.total === 0 || statusSegments.length === 0 ? (
                <EmptyState variant="inline" icon={FolderKanban} title={t("reports.noStatuses")} />
              ) : (
                <>
                  <div className="mt-3">
                    <Meter segments={statusSegments} />
                  </div>
                  <ul className="mt-3.5 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                    {statusRows.map((s) => (
                      <LegendItem
                        key={s.status}
                        dot={STATUS_FILLS[s.status] ?? "bg-stone-400"}
                        label={statusLabel(s.status, t)}
                        value={`${s.count} · ${share(s.count, cr.total)}%`}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* By type */}
            <div className="min-w-0">
              <p className="u-eyebrow text-muted-foreground">{t("reports.byType")}</p>
              <div className="mt-1.5">
                <BarList
                  rows={typeRows}
                  fill="bg-emerald-600"
                  emptyIcon={FolderKanban}
                  emptyTitle={t("reports.noCases")}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <p className="u-eyebrow shrink-0 text-muted-foreground">{t("reports.byLawyer")}</p>
              <span aria-hidden className="u-rule flex-1" />
            </div>
            {cr.byLawyer.length === 0 ? (
              <EmptyState variant="inline" icon={Users} title={t("reports.noLawyers")} />
            ) : (
              <div className="relative mt-2">
                <div className="overflow-x-auto rounded-lg border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <Th>{t("reports.lawyer")}</Th>
                        <Th className="text-right">{t("reports.total")}</Th>
                        <Th className="text-right">{t("status.active")}</Th>
                        <Th className="text-right">{t("status.closed")}</Th>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cr.byLawyer.map((l) => (
                        <TableRow key={l.lawyerId}>
                          <TableCell className="font-medium text-ink">{l.lawyerName}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-ink">{l.total}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{l.active}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{l.closed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Four columns of counts scroll rather than stack — cards for
                    three numbers per row would read worse. The fade is the
                    affordance that there is more to the right. */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-px right-px w-8 rounded-r-lg bg-gradient-to-l from-card to-transparent sm:hidden"
                />
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 2 — Financial reports */}
      <SectionCard
        title={t("reports.financialReports")}
        description={t("reports.financialReportsDesc")}
        icon={Banknote}
        delay={280}
      >
        <div className="space-y-6">
          <div className="-mx-4 overflow-hidden rounded-xl border border-border/70 bg-paper-shade/40 md:-mx-1">
            <div className="flex flex-col divide-y divide-border/70 sm:flex-row sm:divide-x sm:divide-y-0">
              <Metric
                icon={Wallet}
                label={t("reports.totalInvoiced")}
                value={formatCurrency(fin.totalInvoiced)}
                sub={t("reports.invoiceCountSub", { count: fin.invoiceCount })}
              />
              <Metric
                icon={Banknote}
                label={t("reports.totalCollected")}
                value={formatCurrency(fin.totalCollected)}
                sub={t("reports.paymentCountSub", { count: fin.paymentCount })}
                tone="text-emerald-800"
              />
              <Metric
                icon={Landmark}
                label={t("reports.outstanding")}
                value={formatCurrency(fin.outstanding)}
                sub={t("reports.outstandingSub")}
                tone="text-brass-deep"
              />
            </div>

            <div className="border-t border-border/70 px-4 py-4 md:px-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="u-eyebrow text-muted-foreground">{t("reports.ledgerLabel")}</p>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-2xl leading-none font-semibold tabular-nums text-ink">{collectionRate}%</span>
                  <span className="text-[11px] text-muted-foreground">{t("reports.collectionRate")}</span>
                </p>
              </div>

              {fin.totalInvoiced <= 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">{t("reports.noInvoices")}</p>
              ) : (
                <>
                  <div className="mt-3">
                    <Meter
                      segments={[
                        { key: "collected", value: fin.totalCollected, fill: "bg-emerald-600" },
                        { key: "outstanding", value: Math.max(fin.outstanding, 0), fill: "bg-brass" },
                      ]}
                    />
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                    <LegendItem
                      dot="bg-emerald-600"
                      label={t("reports.totalCollected")}
                      value={formatCurrency(fin.totalCollected)}
                    />
                    <LegendItem
                      dot="bg-brass"
                      label={t("reports.outstanding")}
                      value={formatCurrency(fin.outstanding)}
                    />
                  </ul>
                </>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <p className="u-eyebrow shrink-0 text-muted-foreground">{t("reports.byMethod")}</p>
              <span aria-hidden className="u-rule flex-1" />
            </div>
            <div className="mt-1.5">
              <BarList
                rows={methodRows}
                fill="bg-brass-deep"
                emptyIcon={Banknote}
                emptyTitle={t("reports.noPayments")}
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 3 — Hearing reports */}
      <SectionCard
        title={t("reports.hearingReports")}
        description={t("reports.hearingReportsDesc")}
        icon={CalendarDays}
        delay={340}
      >
        <div className="-mx-4 overflow-hidden rounded-xl border border-border/70 bg-paper-shade/40 md:-mx-1">
          <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x lg:grid-cols-5 lg:divide-y-0">
            <Metric icon={CalendarDays} label={t("reports.todaysHearings")} value={hr.todays} />
            <Metric icon={CalendarCheck2} label={t("reports.upcoming7")} value={hr.upcoming7} />
            <Metric icon={CalendarCheck2} label={t("status.completed")} value={hr.completed} tone="text-emerald-800" />
            <Metric icon={Clock} label={t("status.adjourned")} value={hr.adjourned} tone="text-brass-deep" />
            <Metric icon={CalendarDays} label={t("reports.thisMonth")} value={hr.thisMonth} />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
