"use client"

import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { useLanguage } from "@/lib/i18n/language"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ReportsDTO, ViewProps } from "@/lib/types"
import { caseStatusStyles, cn, formatCurrency } from "@/lib/utils"

const GRID_COLOR = "#e7e5e4" // stone-200
const TICK_STYLE = { fill: "#78716c", fontSize: 11 } // stone-500

function MiniStat({
  label,
  value,
  valueClassName,
}: {
  label: string
  value: number
  valueClassName?: string
}) {
  return (
    <div className="rounded-lg border border-stone-200/80 bg-stone-50/60 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums", valueClassName)}>{value}</p>
    </div>
  )
}

export default function ReportsView({ user }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"
  // Only fetch when actually allowed — avoids a guaranteed 403 for other roles.
  const { data, loading, error, refetch } = useApiData<ReportsDTO>(isAdmin ? "/api/reports" : null)

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("reports.pageTitle")} description={t("reports.pageSubtitle")} />
        <EmptyState
          icon={ShieldAlert}
          title={t("reports.guardTitle")}
          description={t("reports.guardDesc")}
        />
      </div>
    )
  }

  if (loading && !data) return <LoadingBlock rows={5} />

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
  if (!data) return <LoadingBlock rows={5} />

  const cr = data.caseReports
  const fin = data.financial
  const hr = data.hearingReports

  const typeData = cr.byType.map((t) => ({ type: t.type, cases: t.count }))
  const methodData = fin.byMethod.map((m) => ({ method: m.method, amount: m.amount }))

  return (
    <div className="space-y-6">
      <PageHeader title={t("reports.pageTitle")} description={t("reports.pageSubtitleFull")} />

      {/* 1 — Case Reports */}
      <SectionCard title={t("reports.caseReports")} description={t("reports.caseReportsDesc")}>
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <MiniStat label={t("reports.total")} value={cr.total} valueClassName="text-emerald-700" />
            <MiniStat label={t("status.active")} value={cr.active} valueClassName="text-emerald-700" />
            <MiniStat label={t("status.pending")} value={cr.pending} valueClassName="text-amber-700" />
            <MiniStat label={t("status.onHold")} value={cr.onHold} valueClassName="text-orange-700" />
            <MiniStat label={t("status.resolved")} value={cr.resolved} valueClassName="text-teal-700" />
            <MiniStat label={t("status.closed")} value={cr.closed} valueClassName="text-stone-600" />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <p className="mb-2 text-sm font-semibold">{t("reports.byType")}</p>
              {typeData.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-200 py-16 text-center text-sm text-muted-foreground">
                  {t("reports.noCases")}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={typeData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="type"
                      angle={-15}
                      textAnchor="end"
                      height={64}
                      interval={0}
                      tick={TICK_STYLE}
                      tickLine={false}
                      axisLine={{ stroke: GRID_COLOR }}
                    />
                    <YAxis allowDecimals={false} tick={TICK_STYLE} tickLine={false} axisLine={false} width={32} />
                    <Tooltip
                      cursor={{ fill: "rgba(5, 150, 105, 0.06)" }}
                      formatter={(value) => [String(value), t("reports.tooltipCases")]}
                    />
                    <Bar dataKey="cases" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-semibold">{t("reports.byStatus")}</p>
              {cr.byStatus.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("reports.noStatuses")}</p>
              ) : (
                <div className="divide-y divide-stone-100 rounded-lg border border-stone-200/80">
                  {cr.byStatus.map((s) => (
                    <div key={s.status} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <StatusBadge map={caseStatusStyles} value={s.status} />
                      <span className="text-sm font-semibold tabular-nums">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">{t("reports.byLawyer")}</p>
            {cr.byLawyer.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("reports.noLawyers")}</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-stone-200/80">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("reports.lawyer")}</TableHead>
                      <TableHead className="text-right">{t("reports.total")}</TableHead>
                      <TableHead className="text-right">{t("status.active")}</TableHead>
                      <TableHead className="text-right">{t("status.closed")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cr.byLawyer.map((l) => (
                      <TableRow key={l.lawyerId}>
                        <TableCell className="font-medium">{l.lawyerName}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.total}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">{l.active}</TableCell>
                        <TableCell className="text-right tabular-nums text-stone-600">{l.closed}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 2 — Financial Reports */}
      <SectionCard title={t("reports.financialReports")} description={t("reports.financialReportsDesc")}>
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Wallet}
              label={t("reports.totalInvoiced")}
              value={formatCurrency(fin.totalInvoiced)}
              sub={t("reports.invoiceCountSub", { count: fin.invoiceCount })}
              tone="emerald"
            />
            <StatCard
              icon={Banknote}
              label={t("reports.totalCollected")}
              value={formatCurrency(fin.totalCollected)}
              sub={t("reports.paymentCountSub", { count: fin.paymentCount })}
              tone="teal"
            />
            <StatCard
              icon={TrendingUp}
              label={t("reports.outstanding")}
              value={formatCurrency(fin.outstanding)}
              sub={t("reports.outstandingSub")}
              tone="rose"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">{t("reports.byMethod")}</p>
            {methodData.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-200 py-16 text-center text-sm text-muted-foreground">
                {t("reports.noPayments")}
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={methodData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="method"
                    angle={-15}
                    textAnchor="end"
                    height={56}
                    interval={0}
                    tick={TICK_STYLE}
                    tickLine={false}
                    axisLine={{ stroke: GRID_COLOR }}
                  />
                  <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={72} />
                  <Tooltip
                    cursor={{ fill: "rgba(217, 119, 6, 0.06)" }}
                    formatter={(value) => [formatCurrency(Number(value)), t("reports.tooltipCollected")]}
                  />
                  <Bar dataKey="amount" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 3 — Hearing Reports */}
      <SectionCard title={t("reports.hearingReports")} description={t("reports.hearingReportsDesc")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={CalendarDays} label={t("reports.todaysHearings")} value={hr.todays} tone="amber" />
          <StatCard icon={CalendarDays} label={t("reports.upcoming7")} value={hr.upcoming7} tone="teal" />
          <StatCard icon={CheckCircle2} label={t("status.completed")} value={hr.completed} tone="emerald" />
          <StatCard icon={Clock} label={t("status.adjourned")} value={hr.adjourned} tone="stone" />
          <StatCard icon={CalendarDays} label={t("reports.thisMonth")} value={hr.thisMonth} tone="gold" />
        </div>
      </SectionCard>
    </div>
  )
}
