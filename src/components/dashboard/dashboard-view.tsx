"use client"

import {
  AlertTriangle,
  Archive,
  CalendarDays,
  FileText,
  FolderKanban,
  Gavel,
  Receipt,
  Users,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { Badge } from "@/components/ui/badge"
import { statusLabel, useLanguage } from "@/lib/i18n/language"
import {
  caseStatusStyles,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDayLabel,
  formatRelativeDay,
  hearingStatusStyles,
  invoiceStatusStyles,
  priorityStyles,
} from "@/lib/utils"
import type {
  CaseListDTO,
  DashboardDTO,
  HearingDTO,
  InvoiceDTO,
  RecentActivity,
  ViewKey,
  ViewParams,
  ViewProps,
} from "@/lib/types"

type NavigateFn = (view: ViewKey, params?: ViewParams) => void

function num(v: number | null | undefined): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0
}

/** Dhaka-timezone "10:30 AM" for hearing timestamps. */
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

/* ------------------------------- Small lists ------------------------------- */

function HearingList({
  hearings,
  navigate,
  emptyText,
  showRelativeDay = false,
}: {
  hearings?: HearingDTO[]
  navigate: NavigateFn
  emptyText: string
  showRelativeDay?: boolean
}) {
  const list = hearings ?? []
  if (list.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="-mx-2 space-y-0.5">
      {list.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => navigate("case-detail", { id: h.caseId })}
          className="w-full rounded-lg p-2 text-left transition-colors hover:bg-stone-100"
        >
          <div className="flex items-center justify-between gap-2">
            {showRelativeDay ? (
              <span className="text-xs font-semibold text-emerald-700">
                {formatDayLabel(h.hearingDate)}
              </span>
            ) : (
              <span className="text-xs font-semibold text-emerald-700">{formatTime(h.hearingDate)}</span>
            )}
            <StatusBadge map={hearingStatusStyles} value={h.status} />
          </div>
          <p className="mt-1 truncate text-sm font-medium">
            {h.caseNumber}
            <span className="font-normal text-muted-foreground"> · {h.caseTitle}</span>
          </p>
          <p className="truncate text-xs text-muted-foreground">{h.court ?? "—"}</p>
        </button>
      ))}
    </div>
  )
}

const ACTIVITY_STYLES: Record<string, { icon: LucideIcon; className: string }> = {
  CASE: { icon: FolderKanban, className: "bg-emerald-100 text-emerald-700" },
  HEARING: { icon: CalendarDays, className: "bg-amber-100 text-amber-700" },
  PAYMENT: { icon: Receipt, className: "bg-teal-100 text-teal-700" },
  UPDATE: { icon: FileText, className: "bg-stone-100 text-stone-600" },
  DOCUMENT: { icon: FileText, className: "bg-teal-100 text-teal-700" },
}

function ActivityFeed({ activities }: { activities?: RecentActivity[] }) {
  const list = activities ?? []
  if (list.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">—</p>
  }
  return (
    <div className="space-y-4">
      {list.map((a) => {
        const style = ACTIVITY_STYLES[a.kind] ?? ACTIVITY_STYLES.UPDATE
        const Icon = style.icon
        return (
          <div key={a.id} className="flex gap-3">
            <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", style.className)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{a.title}</p>
              {a.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{a.description}</p> : null}
              <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDateTime(a.createdAt)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CaseRows({ cases, navigate, emptyText = "—" }: { cases?: CaseListDTO[]; navigate: NavigateFn; emptyText?: string }) {
  const list = cases ?? []
  if (list.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="-mx-2 space-y-0.5">
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => navigate("case-detail", { id: c.id })}
          className="w-full rounded-lg p-2 text-left transition-colors hover:bg-stone-100"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">
              {c.caseNumber} · {c.title}
            </p>
            <StatusBadge map={caseStatusStyles} value={c.status} />
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">{c.client?.name ?? "—"}</p>
            <StatusBadge map={priorityStyles} value={c.priority} />
          </div>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------ Role dashboards ------------------------------ */

function AdminDashboard({ data, navigate }: { data: DashboardDTO; navigate: NavigateFn }) {
  const { t } = useLanguage()
  const s = data.stats ?? {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label={t("dashboard.totalCases")} value={num(s.totalCases)} tone="emerald" />
        <StatCard icon={Gavel} label={t("dashboard.activeCases")} value={num(s.activeCases)} tone="amber" />
        <StatCard icon={CalendarDays} label={t("dashboard.upcomingHearings")} value={num(s.upcomingHearings)} tone="teal" />
        <StatCard icon={Archive} label={t("dashboard.closedCases")} value={num(s.closedCases)} tone="stone" />
        <StatCard
          icon={Wallet}
          label={t("dashboard.pendingPayments")}
          value={formatCurrency(s.pendingAmount ?? 0)}
          sub={t("dashboard.invoicesDue", { count: num(s.pendingInvoiceCount) })}
          tone="rose"
        />
        <StatCard icon={Users} label={t("dashboard.totalClients")} value={num(s.totalClients)} tone="emerald" />
        <StatCard icon={Gavel} label={t("dashboard.totalLawyers")} value={num(s.totalLawyers)} tone="gold" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title={t("dashboard.todaysHearings")} description={formatDate(new Date())}>
          <HearingList hearings={data.todaysHearings} navigate={navigate} emptyText={t("dashboard.noHearingsToday")} />
        </SectionCard>
        <SectionCard title={t("dashboard.upcomingHearings")} description={t("dashboard.next7Days")}>
          <HearingList hearings={data.upcomingHearings} navigate={navigate} emptyText={t("dashboard.noUpcomingHearings")} showRelativeDay />
        </SectionCard>
        <SectionCard title={t("dashboard.recentActivities")} description={t("dashboard.latestEvents")}>
          <ActivityFeed activities={data.recentActivities} />
        </SectionCard>
      </div>
    </div>
  )
}

function LawyerDashboard({ data, navigate }: { data: DashboardDTO; navigate: NavigateFn }) {
  const { t } = useLanguage()
  const s = data.stats ?? {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label={t("dashboard.myActiveCases")} value={num(s.myActiveCases)} tone="emerald" />
        <StatCard icon={CalendarDays} label={t("dashboard.todaysHearings")} value={num(s.todaysHearings)} tone="amber" />
        <StatCard icon={Gavel} label={t("dashboard.upcomingHearings")} value={num(s.upcomingHearings)} tone="teal" />
        <StatCard
          icon={Wallet}
          label={t("dashboard.pendingClientPayments")}
          value={formatCurrency(s.pendingClientPayments ?? 0)}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t("dashboard.todaysHearings")} description={formatDate(new Date())}>
          <HearingList hearings={data.todaysHearings} navigate={navigate} emptyText={t("dashboard.noHearingsToday")} />
        </SectionCard>
        <SectionCard title={t("dashboard.upcomingHearings")} description={t("dashboard.next7Days")}>
          <HearingList hearings={data.upcomingHearings} navigate={navigate} emptyText={t("dashboard.noUpcomingHearings")} showRelativeDay />
        </SectionCard>
      </div>

      <SectionCard title={t("dashboard.myCases")} description={t("dashboard.recentAssignments")}>
        <CaseRows cases={data.myCases} navigate={navigate} emptyText={t("dashboard.noCasesAssigned")} />
      </SectionCard>
    </div>
  )
}

function ClientDashboard({ data, navigate }: { data: DashboardDTO; navigate: NavigateFn }) {
  const { t } = useLanguage()
  const s = data.stats ?? {}
  const cases = data.myCases ?? []
  const invoices = data.outstandingInvoices ?? []
  const updates = data.recentUpdates ?? []
  const nh = data.nextHearing ?? null
  // stats is a loose Record<string, number|null>; nextHearingDate is actually an ISO string
  const nextDateRaw = typeof s.nextHearingDate === "string" ? s.nextHearingDate : null
  const nextRel = nh ? formatRelativeDay(nh.hearingDate) : nextDateRaw ? formatRelativeDay(nextDateRaw) : null
  const nextSoon = nextRel === "Today" || nextRel === "Tomorrow"

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label={t("dashboard.myCases")} value={num(s.totalCases)} tone="emerald" />
        <StatCard icon={Gavel} label={t("dashboard.activeCases")} value={num(s.activeCases)} tone="teal" />
        <StatCard
          icon={CalendarDays}
          label={t("dashboard.nextHearing")}
          value={nextRel ?? "—"}
          sub={nextDateRaw ? formatDate(nextDateRaw) : undefined}
          tone="amber"
        />
        <StatCard icon={Wallet} label={t("dashboard.outstandingBills")} value={formatCurrency(s.outstandingAmount ?? 0)} tone="rose" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.nextHearing")}
          description={nh?.court ?? undefined}
          className={nextSoon ? "border-amber-300 bg-amber-50/50" : undefined}
        >
          {nh ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="border border-amber-200 bg-amber-50 text-amber-800">
                  {nh.hearingType ?? t("dashboard.hearingFallback")}
                </Badge>
                <span className="text-sm font-semibold text-emerald-700">{formatTime(nh.hearingDate)}</span>
              </div>
              <button type="button" onClick={() => navigate("case-detail", { id: nh.caseId })} className="block w-full text-left">
                <p className="text-base font-semibold tracking-tight">{nh.caseNumber}</p>
                <p className="truncate text-sm text-muted-foreground">{nh.caseTitle}</p>
              </button>
              <p className="text-xs text-muted-foreground">
                {formatDayLabel(nh.hearingDate)}
              </p>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.noNextHearing")}</p>
          )}
        </SectionCard>

        <SectionCard title={t("dashboard.myCases")} description={t("dashboard.tapCase")}>
          {cases.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">—</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate("case-detail", { id: c.id })}
                  className="rounded-lg border border-stone-200/80 bg-white p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-emerald-800">{c.caseNumber}</p>
                    <StatusBadge map={caseStatusStyles} value={c.status} />
                  </div>
                  <p className="mt-1 truncate text-sm">{c.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dashboard.nextHearingLabel", { date: c.nextHearingDate ? formatRelativeDay(c.nextHearingDate) : "—" })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t("dashboard.recentUpdates")} description={t("dashboard.progressNotes")}>
          {updates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">—</p>
          ) : (
            <div className="space-y-4">
              {updates.map((u) => (
                <div key={u.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-800">
                        {u.caseNumber}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {u.createdByName ?? "—"} · {formatDateTime(u.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{u.update}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={t("dashboard.outstandingInvoices")} description={t("dashboard.unpaidOverdue")}>
          {invoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.noOutstandingInvoices")}</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv: InvoiceDTO) => (
                <div key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200/80 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{inv.invoiceNumber}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {inv.caseNumber ? `${inv.caseNumber} · ` : ""}
                      {t("dashboard.due", { date: formatDate(inv.dueDate) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(num(inv.amount) - num(inv.paidAmount))}</span>
                    <StatusBadge map={invoiceStatusStyles} value={inv.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function StaffDashboard({ data, navigate }: { data: DashboardDTO; navigate: NavigateFn }) {
  const { t } = useLanguage()
  const s = data.stats ?? {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={FolderKanban} label={t("dashboard.totalCases")} value={num(s.totalCases)} tone="emerald" />
        <StatCard icon={Gavel} label={t("dashboard.activeCases")} value={num(s.activeCases)} tone="amber" />
        <StatCard icon={CalendarDays} label={t("dashboard.todaysHearings")} value={num(s.todaysHearings)} tone="teal" />
        <StatCard icon={CalendarDays} label={t("dashboard.upcomingHearings")} value={num(s.upcomingHearings)} tone="emerald" />
        <StatCard icon={Users} label={t("dashboard.totalClients")} value={num(s.totalClients)} tone="stone" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={t("dashboard.todaysHearings")} description={formatDate(new Date())}>
          <HearingList hearings={data.todaysHearings} navigate={navigate} emptyText={t("dashboard.noHearingsToday")} />
        </SectionCard>
        <SectionCard title={t("dashboard.upcomingHearings")} description={t("dashboard.next7Days")}>
          <HearingList hearings={data.upcomingHearings} navigate={navigate} emptyText={t("dashboard.noUpcomingHearings")} showRelativeDay />
        </SectionCard>
      </div>

      <SectionCard title={t("dashboard.recentCases")} description={t("dashboard.newestMatters")}>
        <CaseRows cases={data.recentCases} navigate={navigate} emptyText={t("dashboard.noCasesRegistered")} />
      </SectionCard>
    </div>
  )
}

/* --------------------------------- View --------------------------------- */

export function DashboardView({ user, navigate }: ViewProps) {
  const { t } = useLanguage()
  const { data, loading, error } = useApiData<DashboardDTO>("/api/dashboard")

  if (loading && !data) return <LoadingBlock />
  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("nav.dashboard")} description={`${statusLabel(user.role, t)} · ${formatDate(new Date())}`} />
        <EmptyState icon={AlertTriangle} title={t("dashboard.loadFailed")} description={error} />
      </div>
    )
  }
  if (!data) return <LoadingBlock />

  const role = data.role || user.role

  let content: React.ReactNode
  switch (role) {
    case "ADMIN":
      content = <AdminDashboard data={data} navigate={navigate} />
      break
    case "LAWYER":
      content = <LawyerDashboard data={data} navigate={navigate} />
      break
    case "CLIENT":
      content = <ClientDashboard data={data} navigate={navigate} />
      break
    case "STAFF":
      content = <StaffDashboard data={data} navigate={navigate} />
      break
    default:
      content = (
        <EmptyState
          icon={AlertTriangle}
          title={t("dashboard.unknownRole")}
          description={t("dashboard.unknownRoleDesc", { role })}
        />
      )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.welcome", { name: user.name.replace(/^Adv\.\s*/i, "") })}
        description={t("dashboard.roleDashboard", {
          role: statusLabel(user.role, t),
          date: formatDate(new Date()),
        })}
      />
      {content}
    </div>
  )
}

export default DashboardView
