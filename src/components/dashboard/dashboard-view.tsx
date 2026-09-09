"use client"

import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  FileText,
  FolderKanban,
  Gavel,
  Inbox,
  Landmark,
  Receipt,
  ScrollText,
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
import { Button } from "@/components/ui/button"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import {
  caseStatusStyles,
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
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

const DHAKA_TZ = "Asia/Dhaka"

function num(v: unknown): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : 0
}

function dhakaPart(d: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: DHAKA_TZ, ...options }).format(d)
}

/** Dhaka-timezone "10:30 AM" for hearing timestamps. */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return dhakaPart(d, { hour: "numeric", minute: "2-digit", hour12: true })
}

/**
 * Compact, translated day label for the narrow time rail: "Today",
 * "Tomorrow" or "12 Feb". `formatRelativeDay` returns hardcoded English and a
 * full "12 Feb 2026", neither of which fits here.
 */
function shortDay(iso: string | null | undefined, t: TranslateFn): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const rel = formatRelativeDay(iso)
  if (rel === "Today") return t("common.today")
  if (rel === "Tomorrow") return t("common.tomorrow")
  if (rel === "Yesterday") return t("common.yesterday")
  return dhakaPart(d, { day: "2-digit", month: "short" })
}

/* ------------------------------ Shared pieces ------------------------------ */

/** Small "View all →" affordance for a panel header. */
function ViewAll({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-7 cursor-pointer gap-1 px-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
    >
      {label}
      <ArrowRight className="h-3.5 w-3.5" />
    </Button>
  )
}

/**
 * Row shell shared by the hearing and case lists: a hover-lit plate with a
 * chevron that only appears on hover/focus, so the resting state stays quiet.
 */
function RowButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="group relative flex w-full cursor-pointer items-center gap-3.5 rounded-lg px-3 py-3 text-left transition-colors duration-200 hover:bg-paper-shade focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  )
}

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
  const { t } = useLanguage()
  const list = hearings ?? []

  if (list.length === 0) {
    return <EmptyState variant="inline" icon={CalendarClock} title={emptyText} />
  }

  return (
    <ul className="-mx-3 divide-y divide-border/60">
      {list.map((h) => (
        <li key={h.id}>
          <RowButton
            onClick={() => navigate("case-detail", { id: h.caseId })}
            ariaLabel={`${t("dashboard.openCaseFile")}: ${h.caseNumber}`}
          >
            {/* time rail */}
            <span className="w-[4.75rem] shrink-0">
              <span className="block text-[0.8125rem] font-semibold leading-tight tracking-tight text-emerald-800">
                {showRelativeDay ? shortDay(h.hearingDate, t) : formatTime(h.hearingDate)}
              </span>
              {showRelativeDay ? (
                <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
                  {formatTime(h.hearingDate)}
                </span>
              ) : null}
            </span>
            <span aria-hidden className="h-10 w-px shrink-0 bg-border" />

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{h.caseNumber}</span>
                <StatusBadge map={hearingStatusStyles} value={h.status} />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{h.caseTitle}</span>
              <span className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Landmark aria-hidden className="h-3 w-3 shrink-0" />
                <span className="truncate">{h.court ?? "—"}</span>
              </span>
            </span>
          </RowButton>
        </li>
      ))}
    </ul>
  )
}

const ACTIVITY_STYLES: Record<string, { icon: LucideIcon; className: string }> = {
  CASE: { icon: FolderKanban, className: "bg-emerald-50 text-emerald-700 ring-emerald-600/15" },
  HEARING: { icon: CalendarDays, className: "bg-amber-50 text-amber-700 ring-amber-600/15" },
  PAYMENT: { icon: Receipt, className: "bg-teal-50 text-teal-700 ring-teal-600/15" },
  UPDATE: { icon: FileText, className: "bg-stone-100 text-stone-600 ring-stone-500/15" },
  DOCUMENT: { icon: FileText, className: "bg-teal-50 text-teal-700 ring-teal-600/15" },
}

/** Vertical timeline: tinted nodes joined by a hairline. */
function ActivityFeed({ activities, emptyText }: { activities?: RecentActivity[]; emptyText: string }) {
  const list = activities ?? []
  if (list.length === 0) {
    return <EmptyState variant="inline" icon={ScrollText} title={emptyText} />
  }
  return (
    <ol className="relative space-y-5">
      {list.map((a, i) => {
        const style = ACTIVITY_STYLES[a.kind] ?? ACTIVITY_STYLES.UPDATE
        const Icon = style.icon
        return (
          <li key={a.id} className="relative flex gap-3.5">
            {i < list.length - 1 ? (
              <span
                aria-hidden
                className="absolute left-[15.5px] top-9 h-[calc(100%-1.25rem)] w-px bg-border"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1",
                style.className
              )}
            >
              <Icon className="h-[0.9rem] w-[0.9rem]" />
            </span>
            <div className="min-w-0 flex-1 pb-0.5">
              <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
              {a.description ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {a.description}
                </p>
              ) : null}
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {formatDateTime(a.createdAt)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function CaseRows({
  cases,
  navigate,
  emptyText,
}: {
  cases?: CaseListDTO[]
  navigate: NavigateFn
  emptyText: string
}) {
  const { t } = useLanguage()
  const list = cases ?? []

  if (list.length === 0) {
    return <EmptyState variant="inline" icon={FolderKanban} title={emptyText} />
  }

  return (
    <ul className="-mx-3 divide-y divide-border/60">
      {list.map((c) => (
        <li key={c.id}>
          <RowButton
            onClick={() => navigate("case-detail", { id: c.id })}
            ariaLabel={`${t("dashboard.openCaseFile")}: ${c.caseNumber}`}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="shrink-0 font-mono text-xs font-semibold tracking-tight text-emerald-800">
                  {c.caseNumber}
                </span>
                <StatusBadge map={caseStatusStyles} value={c.status} />
              </span>
              <span className="mt-1 block truncate text-sm text-foreground">{c.title}</span>
              <span className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Users aria-hidden className="h-3 w-3 shrink-0" />
                <span className="truncate">{c.client?.name ?? "—"}</span>
              </span>
            </span>
            <StatusBadge map={priorityStyles} value={c.priority} className="shrink-0" />
          </RowButton>
        </li>
      ))}
    </ul>
  )
}

/* --------------------------------- Hero --------------------------------- */

function greetingKey(): string {
  const hour = Number(dhakaPart(new Date(), { hour: "2-digit", hourCycle: "h23" }))
  if (hour < 12) return "dashboard.goodMorning"
  if (hour < 17) return "dashboard.goodAfternoon"
  return "dashboard.goodEvening"
}

/**
 * Dark forest hero band. Deliberately the only dark surface inside the shell —
 * it carries the brand from the sign-in panel into the app and gives the
 * landing screen a focal point the list views do not need.
 */
function DashboardHero({
  name,
  role,
  todayCount,
}: {
  name: string
  role: string
  todayCount: number | null
}) {
  const { t } = useLanguage()
  const now = new Date()

  return (
    <header className="u-forest u-engrave u-bloom u-rise relative overflow-hidden rounded-2xl px-6 py-6 shadow-lift sm:px-8 sm:py-7">
      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="u-eyebrow text-brass">
            {statusLabel(role, t)} · {formatDate(now)}
          </p>
          <h1 className="mt-3 font-serif text-[1.75rem] font-semibold leading-tight tracking-tight text-white sm:text-[2rem]">
            {t("dashboard.greetingLine", { greeting: t(greetingKey()), name })}
          </h1>
          <p className="mt-2 text-sm text-emerald-100/65">{t("common.appTagline")}</p>
        </div>

        {/* Date + today's load */}
        <div className="flex shrink-0 items-center gap-4 self-start rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 sm:self-auto">
          <div className="text-center">
            <p className="u-eyebrow text-brass">{dhakaPart(now, { weekday: "short" })}</p>
            <p className="mt-1.5 font-serif text-[1.75rem] font-semibold leading-none tabular-nums text-white">
              {dhakaPart(now, { day: "2-digit" })}
            </p>
            <p className="mt-1 text-[11px] text-emerald-100/70">{dhakaPart(now, { month: "short" })}</p>
          </div>
          {todayCount !== null ? (
            <>
              <span aria-hidden className="h-14 w-px bg-white/10" />
              <div className="min-w-0">
                <p className="u-eyebrow text-emerald-100/65">{t("dashboard.todaysHearings")}</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {todayCount > 0
                    ? t("dashboard.hearingsScheduled", { count: todayCount })
                    : t("dashboard.noneScheduled")}
                </p>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}

/* ------------------------------ Role dashboards ------------------------------ */

/** Shared grid wrappers keep the stagger delays consistent across roles. */
const STAT_GRID = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"

function AdminDashboard({ data, navigate }: { data: DashboardDTO; navigate: NavigateFn }) {
  const { t } = useLanguage()
  const s = data.stats ?? {}
  return (
    <div className="space-y-6">
      <div className={STAT_GRID}>
        <StatCard
          icon={FolderKanban}
          label={t("dashboard.totalCases")}
          value={num(s.totalCases)}
          tone="emerald"
          delay={60}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.totalCases") })}
        />
        <StatCard
          icon={Gavel}
          label={t("dashboard.activeCases")}
          value={num(s.activeCases)}
          tone="amber"
          delay={110}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.activeCases") })}
        />
        <StatCard
          icon={CalendarDays}
          label={t("dashboard.upcomingHearings")}
          value={num(s.upcomingHearings)}
          tone="teal"
          delay={160}
          onClick={() => navigate("hearings")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.upcomingHearings") })}
        />
        <StatCard
          icon={Archive}
          label={t("dashboard.closedCases")}
          value={num(s.closedCases)}
          tone="stone"
          delay={210}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.closedCases") })}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label={t("dashboard.pendingPayments")}
          value={formatCurrency(num(s.pendingAmount))}
          sub={t("dashboard.invoicesDue", { count: num(s.pendingInvoiceCount) })}
          tone="rose"
          delay={260}
          onClick={() => navigate("billing", { tab: "invoices" })}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.pendingPayments") })}
        />
        <StatCard
          icon={Users}
          label={t("dashboard.totalClients")}
          value={num(s.totalClients)}
          tone="emerald"
          delay={300}
          onClick={() => navigate("clients")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.totalClients") })}
        />
        <StatCard
          icon={Gavel}
          label={t("dashboard.totalLawyers")}
          value={num(s.totalLawyers)}
          tone="gold"
          delay={340}
          onClick={() => navigate("lawyers")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.totalLawyers") })}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title={t("dashboard.todaysHearings")}
          description={formatDate(new Date())}
          icon={CalendarClock}
          accent
          delay={380}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("hearings")} />}
        >
          <HearingList
            hearings={data.todaysHearings}
            navigate={navigate}
            emptyText={t("dashboard.noHearingsToday")}
          />
        </SectionCard>
        <SectionCard
          title={t("dashboard.upcomingHearings")}
          description={t("dashboard.next7Days")}
          icon={CalendarDays}
          delay={420}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("hearings")} />}
        >
          <HearingList
            hearings={data.upcomingHearings}
            navigate={navigate}
            emptyText={t("dashboard.noUpcomingHearings")}
            showRelativeDay
          />
        </SectionCard>
        <SectionCard
          title={t("dashboard.recentActivities")}
          description={t("dashboard.latestEvents")}
          icon={ScrollText}
          delay={460}
        >
          <ActivityFeed activities={data.recentActivities} emptyText={t("dashboard.noActivity")} />
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
      <div className={STAT_GRID}>
        <StatCard
          icon={FolderKanban}
          label={t("dashboard.myActiveCases")}
          value={num(s.myActiveCases)}
          tone="emerald"
          delay={60}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.myActiveCases") })}
        />
        <StatCard
          icon={CalendarClock}
          label={t("dashboard.todaysHearings")}
          value={num(s.todaysHearings)}
          tone="amber"
          delay={110}
          onClick={() => navigate("hearings")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.todaysHearings") })}
        />
        <StatCard
          icon={CalendarDays}
          label={t("dashboard.upcomingHearings")}
          value={num(s.upcomingHearings)}
          tone="teal"
          delay={160}
          onClick={() => navigate("hearings")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.upcomingHearings") })}
        />
        <StatCard
          icon={Wallet}
          label={t("dashboard.pendingClientPayments")}
          value={formatCurrency(num(s.pendingClientPayments))}
          tone="rose"
          delay={210}
          onClick={() => navigate("billing", { tab: "invoices" })}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.pendingClientPayments") })}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.todaysHearings")}
          description={formatDate(new Date())}
          icon={CalendarClock}
          accent
          delay={260}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("hearings")} />}
        >
          <HearingList
            hearings={data.todaysHearings}
            navigate={navigate}
            emptyText={t("dashboard.noHearingsToday")}
          />
        </SectionCard>
        <SectionCard
          title={t("dashboard.upcomingHearings")}
          description={t("dashboard.next7Days")}
          icon={CalendarDays}
          delay={300}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("hearings")} />}
        >
          <HearingList
            hearings={data.upcomingHearings}
            navigate={navigate}
            emptyText={t("dashboard.noUpcomingHearings")}
            showRelativeDay
          />
        </SectionCard>
      </div>

      <SectionCard
        title={t("dashboard.myCases")}
        description={t("dashboard.recentAssignments")}
        icon={FolderKanban}
        delay={340}
        action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("cases")} />}
      >
        <CaseRows cases={data.myCases} navigate={navigate} emptyText={t("dashboard.noCasesAssigned")} />
      </SectionCard>
    </div>
  )
}

function StaffDashboard({ data, navigate }: { data: DashboardDTO; navigate: NavigateFn }) {
  const { t } = useLanguage()
  const s = data.stats ?? {}
  return (
    <div className="space-y-6">
      <div className={STAT_GRID}>
        <StatCard
          icon={FolderKanban}
          label={t("dashboard.totalCases")}
          value={num(s.totalCases)}
          tone="emerald"
          delay={60}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.totalCases") })}
        />
        <StatCard
          icon={Gavel}
          label={t("dashboard.activeCases")}
          value={num(s.activeCases)}
          tone="amber"
          delay={110}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.activeCases") })}
        />
        <StatCard
          icon={CalendarClock}
          label={t("dashboard.todaysHearings")}
          value={num(s.todaysHearings)}
          tone="teal"
          delay={160}
          onClick={() => navigate("hearings")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.todaysHearings") })}
        />
        <StatCard
          icon={Users}
          label={t("dashboard.totalClients")}
          value={num(s.totalClients)}
          tone="stone"
          delay={210}
          onClick={() => navigate("clients")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.totalClients") })}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.todaysHearings")}
          description={formatDate(new Date())}
          icon={CalendarClock}
          accent
          delay={260}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("hearings")} />}
        >
          <HearingList
            hearings={data.todaysHearings}
            navigate={navigate}
            emptyText={t("dashboard.noHearingsToday")}
          />
        </SectionCard>
        <SectionCard
          title={t("dashboard.upcomingHearings")}
          description={t("dashboard.next7Days")}
          icon={CalendarDays}
          delay={300}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("hearings")} />}
        >
          <HearingList
            hearings={data.upcomingHearings}
            navigate={navigate}
            emptyText={t("dashboard.noUpcomingHearings")}
            showRelativeDay
          />
        </SectionCard>
      </div>

      <SectionCard
        title={t("dashboard.recentCases")}
        description={t("dashboard.newestMatters")}
        icon={FolderKanban}
        delay={340}
        action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("cases")} />}
      >
        <CaseRows cases={data.recentCases} navigate={navigate} emptyText={t("dashboard.noCasesRegistered")} />
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
  const nextIso = nh?.hearingDate ?? nextDateRaw

  return (
    <div className="space-y-6">
      <div className={STAT_GRID}>
        <StatCard
          icon={FolderKanban}
          label={t("dashboard.myCases")}
          value={num(s.totalCases)}
          tone="emerald"
          delay={60}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.myCases") })}
        />
        <StatCard
          icon={Gavel}
          label={t("dashboard.activeCases")}
          value={num(s.activeCases)}
          tone="teal"
          delay={110}
          onClick={() => navigate("cases")}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.activeCases") })}
        />
        {/* Clients have no hearings view in the nav, so this tile stays inert. */}
        <StatCard
          icon={CalendarDays}
          label={t("dashboard.nextHearing")}
          value={nextIso ? shortDay(nextIso, t) : "—"}
          sub={nextIso ? formatDate(nextIso) : undefined}
          tone="amber"
          delay={160}
        />
        <StatCard
          icon={Wallet}
          label={t("dashboard.outstandingBills")}
          value={formatCurrency(num(s.outstandingAmount))}
          tone="rose"
          delay={210}
          onClick={() => navigate("billing", { tab: "invoices" })}
          actionLabel={t("dashboard.viewStat", { label: t("dashboard.outstandingBills") })}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.nextHearing")}
          description={nh?.court ?? undefined}
          icon={CalendarClock}
          accent
          delay={260}
          className={nextSoon ? "border-amber-300/80 bg-amber-50/40" : undefined}
        >
          {nh ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className="border border-amber-200 bg-amber-50 text-amber-800">
                  {nh.hearingType ?? t("dashboard.hearingFallback")}
                </Badge>
                <span className="text-sm font-semibold tabular-nums text-emerald-800">
                  {formatTime(nh.hearingDate)}
                </span>
              </div>

              {/* The date, given the weight it deserves on a client's landing screen */}
              <p className="font-serif text-2xl font-semibold leading-tight tracking-tight text-ink">
                {shortDay(nh.hearingDate, t)}
              </p>
              <p className="-mt-3 text-xs tabular-nums text-muted-foreground">
                {formatDate(nh.hearingDate)}
              </p>

              <div className="-mx-3">
                <RowButton
                  onClick={() => navigate("case-detail", { id: nh.caseId })}
                  ariaLabel={`${t("dashboard.openCaseFile")}: ${nh.caseNumber}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-xs font-semibold tracking-tight text-emerald-800">
                      {nh.caseNumber}
                    </span>
                    <span className="mt-1 block truncate text-sm text-foreground">{nh.caseTitle}</span>
                  </span>
                </RowButton>
              </div>
            </div>
          ) : (
            <EmptyState variant="inline" icon={CalendarClock} title={t("dashboard.noNextHearing")} />
          )}
        </SectionCard>

        <SectionCard
          title={t("dashboard.myCases")}
          description={t("dashboard.tapCase")}
          icon={FolderKanban}
          delay={300}
          action={<ViewAll label={t("common.viewAll")} onClick={() => navigate("cases")} />}
        >
          {cases.length === 0 ? (
            <EmptyState variant="inline" icon={FolderKanban} title={t("dashboard.noCases")} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate("case-detail", { id: c.id })}
                  aria-label={`${t("dashboard.openCaseFile")}: ${c.caseNumber}`}
                  className="group cursor-pointer rounded-lg border border-border/80 bg-card p-3.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-emerald-600/30 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs font-semibold tracking-tight text-emerald-800">
                      {c.caseNumber}
                    </p>
                    <StatusBadge map={caseStatusStyles} value={c.status} />
                  </div>
                  <p className="mt-1.5 truncate text-sm text-foreground">{c.title}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t("dashboard.nextHearingLabel", {
                      date: c.nextHearingDate ? shortDay(c.nextHearingDate, t) : "—",
                    })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("dashboard.recentUpdates")}
          description={t("dashboard.progressNotes")}
          icon={FileText}
          delay={340}
        >
          {updates.length === 0 ? (
            <EmptyState variant="inline" icon={FileText} title={t("dashboard.noUpdates")} />
          ) : (
            <ol className="relative space-y-5">
              {updates.map((u, i) => (
                <li key={u.id} className="relative flex gap-3.5">
                  {i < updates.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute left-[15.5px] top-9 h-[calc(100%-1.25rem)] w-px bg-border"
                    />
                  ) : null}
                  <span className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                    <FileText className="h-[0.9rem] w-[0.9rem]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border border-emerald-200 bg-emerald-50 font-mono text-[11px] text-emerald-800"
                      >
                        {u.caseNumber}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {u.createdByName ?? "—"} · {formatDateTime(u.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-foreground">{u.update}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard
          title={t("dashboard.outstandingInvoices")}
          description={t("dashboard.unpaidOverdue")}
          icon={Receipt}
          delay={380}
          action={
            <ViewAll
              label={t("common.viewAll")}
              onClick={() => navigate("billing", { tab: "invoices" })}
            />
          }
        >
          {invoices.length === 0 ? (
            <EmptyState variant="inline" icon={Inbox} title={t("dashboard.noOutstandingInvoices")} />
          ) : (
            <ul className="divide-y divide-border/60">
              {invoices.map((inv: InvoiceDTO) => (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold tracking-tight text-emerald-800">
                      {inv.invoiceNumber}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-muted-foreground">
                      {inv.caseNumber ? `${inv.caseNumber} · ` : ""}
                      {t("dashboard.due", { date: formatDate(inv.dueDate) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="text-sm font-semibold tabular-nums text-ink">
                      {formatCurrency(num(inv.amount) - num(inv.paidAmount))}
                    </span>
                    <StatusBadge map={invoiceStatusStyles} value={inv.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

/* --------------------------------- View --------------------------------- */

export function DashboardView({ user, navigate }: ViewProps) {
  const { t } = useLanguage()
  const { data, loading, error } = useApiData<DashboardDTO>("/api/dashboard")

  if (loading && !data) return <LoadingBlock header tiles={4} panels={2} rows={3} />
  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("nav.dashboard")}
          description={`${statusLabel(user.role, t)} · ${formatDate(new Date())}`}
        />
        <EmptyState icon={AlertTriangle} title={t("dashboard.loadFailed")} description={error} />
      </div>
    )
  }
  if (!data) return <LoadingBlock header tiles={4} panels={2} rows={3} />

  const role = data.role || user.role
  const s = data.stats ?? {}

  // Admin/staff/lawyer dashboards all know today's load; clients do not.
  const todayCount =
    role === "CLIENT"
      ? null
      : data.todaysHearings
        ? data.todaysHearings.length
        : num(s.todaysHearings)

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
      <DashboardHero
        name={user.name.replace(/^Adv\.\s*/i, "")}
        role={role}
        todayCount={todayCount}
      />
      {content}
    </div>
  )
}

export default DashboardView
