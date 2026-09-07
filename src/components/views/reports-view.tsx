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
  const isAdmin = user.role === "ADMIN"
  // Only fetch when actually allowed — avoids a guaranteed 403 for other roles.
  const { data, loading, error, refetch } = useApiData<ReportsDTO>(isAdmin ? "/api/reports" : null)

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Case & financial reports" />
        <EmptyState
          icon={ShieldAlert}
          title="Reports are available to administrators only."
          description="Ask an administrator if you need an overview of chamber performance."
        />
      </div>
    )
  }

  if (loading && !data) return <LoadingBlock rows={5} />

  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Case, financial & hearing analytics" />
        <EmptyState
          icon={AlertTriangle}
          title="Could not load reports"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
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
      <PageHeader title="Reports" description="Case, financial & hearing analytics for the chamber" />

      {/* 1 — Case Reports */}
      <SectionCard title="Case Reports" description="Distribution of all cases by type, status and lawyer">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <MiniStat label="Total" value={cr.total} valueClassName="text-emerald-700" />
            <MiniStat label="Active" value={cr.active} valueClassName="text-emerald-700" />
            <MiniStat label="Pending" value={cr.pending} valueClassName="text-amber-700" />
            <MiniStat label="On Hold" value={cr.onHold} valueClassName="text-orange-700" />
            <MiniStat label="Resolved" value={cr.resolved} valueClassName="text-teal-700" />
            <MiniStat label="Closed" value={cr.closed} valueClassName="text-stone-600" />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <p className="mb-2 text-sm font-semibold">Cases by Type</p>
              {typeData.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-200 py-16 text-center text-sm text-muted-foreground">
                  No cases registered yet.
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
                      formatter={(value) => [String(value), "Cases"]}
                    />
                    <Bar dataKey="cases" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="lg:col-span-2">
              <p className="mb-2 text-sm font-semibold">Cases by Status</p>
              {cr.byStatus.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No case statuses to show.</p>
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
            <p className="mb-2 text-sm font-semibold">Cases by Lawyer</p>
            {cr.byLawyer.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No lawyer assignments yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-stone-200/80">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Lawyer</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                      <TableHead className="text-right">Closed</TableHead>
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
      <SectionCard title="Financial Reports" description="Invoicing vs collections across the chamber">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Wallet}
              label="Total Invoiced"
              value={formatCurrency(fin.totalInvoiced)}
              sub={`${fin.invoiceCount} invoices`}
              tone="emerald"
            />
            <StatCard
              icon={Banknote}
              label="Total Collected"
              value={formatCurrency(fin.totalCollected)}
              sub={`${fin.paymentCount} payments`}
              tone="teal"
            />
            <StatCard
              icon={TrendingUp}
              label="Outstanding"
              value={formatCurrency(fin.outstanding)}
              sub="Unpaid & partial balances"
              tone="rose"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Collections by Payment Method</p>
            {methodData.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-200 py-16 text-center text-sm text-muted-foreground">
                No payments recorded yet.
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
                    formatter={(value) => [formatCurrency(Number(value)), "Collected"]}
                  />
                  <Bar dataKey="amount" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </SectionCard>

      {/* 3 — Hearing Reports */}
      <SectionCard title="Hearing Reports" description="Hearing volume & outcomes">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={CalendarDays} label="Today's Hearings" value={hr.todays} tone="amber" />
          <StatCard icon={CalendarDays} label="Upcoming (7 days)" value={hr.upcoming7} tone="teal" />
          <StatCard icon={CheckCircle2} label="Completed" value={hr.completed} tone="emerald" />
          <StatCard icon={Clock} label="Adjourned" value={hr.adjourned} tone="stone" />
          <StatCard icon={CalendarDays} label="This Month" value={hr.thisMonth} tone="gold" />
        </div>
      </SectionCard>
    </div>
  )
}
