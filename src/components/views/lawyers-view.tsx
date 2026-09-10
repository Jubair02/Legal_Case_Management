"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  Gavel,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DialogHead, FieldGroup, RequiredMark } from "@/components/shared/dialog-chrome"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
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
import { apiSend } from "@/lib/api-client"
import { ACCOUNT_STATUSES, SPECIALIZATIONS } from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import { hrefFor } from "@/lib/routes"
import type {
  CaseListDTO,
  LawyerDTO,
  SessionUser,
  ViewKey,
  ViewParams,
  ViewProps,
} from "@/lib/types"
import { caseStatusStyles, cn, formatRelativeDay, initials, type StatusStyle } from "@/lib/utils"
import { isValidEmail } from "@/lib/validation"
import { useResetOnOpen } from "@/lib/use-reset-on-open"

type NavigateFn = (view: ViewKey, params?: ViewParams) => void

/** GET /api/lawyers/[id] payload: LawyerDTO + their (role-scoped) cases. */
interface LawyerDetailResponse extends LawyerDTO {
  cases: CaseListDTO[]
}

const ALL = "ALL"
/** Sentinel for "no specialization recorded" — used by both the filter and the form. */
const NONE = "__none__"

const PASSWORD_MIN = 6

const lawyerStatusStyles: Record<string, StatusStyle> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  INACTIVE: { label: "Inactive", className: "bg-stone-100 text-stone-600 border-stone-200" },
}

/**
 * Builds a derived enum dictionary key: enumTKey("lawyers.spec", "Criminal Law")
 * → "lawyers.specCriminalLaw". Non-alphanumeric runs split words.
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

/** Translates a domain enum value (specializations), falling back to the raw value. */
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
  map: Record<string, StatusStyle>,
  t: TranslateFn
): Record<string, StatusStyle> {
  return Object.fromEntries(
    Object.entries(map).map(([value, style]) => [value, { ...style, label: statusLabel(value, t) }])
  )
}

/* ------------------------------ shared pieces ------------------------------ */

/** Initials plate. Every advocate used to get the same gavel glyph — this gives each one an identity. */
function AdvocatePlate({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-emerald-50 font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/15",
        size === "lg" ? "h-14 w-14 text-base" : "h-11 w-11 text-xs"
      )}
    >
      {initials(name) || <Gavel className="h-5 w-5" />}
    </span>
  )
}

/** Small specialization chip — the one place emerald is used as a category tint. */
function SpecChip({ value, t }: { value: string; t: TranslateFn }) {
  return (
    <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
      {enumLabel("lawyers.spec", value, t)}
    </span>
  )
}

/** Bar Council ID chip — monospaced, because it is a reference number. */
function BarChip({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-paper-shade px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground ring-1 ring-border/70">
      {value}
    </span>
  )
}

/**
 * Active-vs-total case load as a labelled meter. The number alone never showed
 * whether an advocate was carrying a heavy share of the chamber's work.
 */
function CaseLoadMeter({
  active,
  total,
  t,
}: {
  active: number
  total: number
  t: TranslateFn
}) {
  const pct = total > 0 ? Math.min(100, Math.round((active / total) * 100)) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="u-eyebrow text-muted-foreground">{t("lawyers.caseLoad")}</span>
        <span className="text-xs font-semibold tabular-nums text-ink">
          {t("lawyers.activeOfTotal", { active, total })}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-paper-shade ring-1 ring-inset ring-border/60"
        role="progressbar"
        aria-valuenow={active}
        aria-valuemin={0}
        aria-valuemax={Math.max(total, 1)}
        aria-label={t("lawyers.caseLoad")}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** Micro-caps label over a value — the detail dialog's fact grid. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="u-eyebrow text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium text-ink">{children}</p>
    </div>
  )
}

/* ------------------------------ Lawyer detail ------------------------------ */

function LawyerDetailDialog({
  lawyerId,
  open,
  onOpenChange,
  user,
  navigate,
  onChanged,
}: {
  lawyerId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  user: SessionUser
  navigate: NavigateFn
  onChanged: () => void
}) {
  const isAdmin = user.role === "ADMIN"
  const { t } = useLanguage()
  const { data, loading, error, refetch } = useApiData<LawyerDetailResponse>(
    open && lawyerId ? `/api/lawyers/${lawyerId}` : null
  )
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const lawyer = data
  const cases = lawyer?.cases ?? []

  const handleDelete = async () => {
    if (!lawyer) return
    await apiSend("DELETE", `/api/lawyers/${lawyer.id}`)
    toast.success(t("lawyers.toastDeletedFor", { name: lawyer.name }))
    onChanged()
    onOpenChange(false)
  }

  /** Case rows are real links, so a case can be opened in a new tab from here. */
  const openCase = (id: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onOpenChange(false)
    navigate("case-detail", { id })
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHead icon={Gavel} title={t("lawyers.detailsTitle")} description={t("lawyers.detailsDesc")} />

          {loading && !lawyer ? (
            <div className="space-y-4 py-2" aria-busy="true" aria-live="polite">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : error && !lawyer ? (
            <div className="py-2">
              <EmptyState
                icon={Gavel}
                title={t("lawyers.errLoadOne")}
                description={error}
                action={
                  <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
                    {t("common.retry")}
                  </Button>
                }
              />
            </div>
          ) : lawyer ? (
            <div className="space-y-5">
              {/* Identity */}
              <div className="flex items-start gap-4 rounded-xl border border-border/70 bg-paper-shade/50 p-4">
                <AdvocatePlate name={lawyer.name} size="lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-serif text-lg font-semibold leading-tight text-ink">
                      {lawyer.name}
                    </p>
                    <StatusBadge map={translatedStyles(lawyerStatusStyles, t)} value={lawyer.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lawyer.barCouncilId ? <BarChip value={lawyer.barCouncilId} /> : null}
                    {lawyer.specialization ? <SpecChip value={lawyer.specialization} t={t} /> : null}
                  </div>
                </div>
              </div>

              {/* Facts */}
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-border/70 p-4 sm:grid-cols-2">
                <Fact label={t("common.phone")}>{lawyer.phone ?? "—"}</Fact>
                <Fact label={t("common.email")}>{lawyer.email ?? "—"}</Fact>
                <Fact label={t("lawyers.chamber")}>{lawyer.chamberName ?? "—"}</Fact>
                <Fact label={t("lawyers.experience")}>
                  {t("lawyers.yrsCount", { count: lawyer.experience ?? 0 })}
                </Fact>
                <div className="sm:col-span-2">
                  <CaseLoadMeter active={lawyer.activeCases} total={lawyer.totalCases} t={t} />
                </div>
              </div>

              {/* Assigned cases */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <h3 className="u-eyebrow shrink-0 text-brass-deep">
                    {t("lawyers.casesCount", { count: cases.length })}
                  </h3>
                  <span aria-hidden className="u-rule flex-1" />
                </div>

                {cases.length === 0 ? (
                  <EmptyState variant="inline" icon={Briefcase} title={t("lawyers.noCases")} />
                ) : (
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                    {cases.map((c) => (
                      <li key={c.id}>
                        <a
                          href={hrefFor("case-detail", { id: c.id })}
                          onClick={openCase(c.id)}
                          className="group flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-paper-shade/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-mono text-[0.8125rem] font-semibold text-ink">
                              {c.caseNumber}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="flex flex-col items-end gap-1">
                              <StatusBadge map={translatedStyles(caseStatusStyles, t)} value={c.status} />
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {c.nextHearingDate
                                  ? t("ui.hearingRel", {
                                      rel: relDay(formatRelativeDay(c.nextHearingDate), t),
                                    })
                                  : t("ui.noHearingSet")}
                              </span>
                            </div>
                            <ArrowUpRight
                              aria-hidden
                              className="h-4 w-4 text-muted-foreground/40 transition-colors group-hover:text-brass-deep"
                            />
                          </div>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {lawyer && isAdmin ? (
              <Button
                variant="ghost"
                className="cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </Button>
            ) : null}
            {lawyer && isAdmin ? (
              <Button variant="outline" className="cursor-pointer" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> {t("common.edit")}
              </Button>
            ) : null}
            <Button variant="secondary" className="cursor-pointer" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lawyer ? (
        <LawyerFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          lawyer={lawyer}
          onSaved={() => {
            refetch()
            onChanged()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("lawyers.deleteConfirmTitle")}
        description={t("lawyers.deleteConfirmDesc", { name: lawyer?.name ?? t("lawyers.detailsTitle") })}
        confirmLabel={t("lawyers.deleteConfirmBtn")}
        destructive
        onConfirm={handleDelete}
      />
    </>
  )
}

/* ------------------------------- Lawyer form ------------------------------- */

export interface LawyerFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set the dialog edits this lawyer; otherwise it creates a new one. */
  lawyer?: LawyerDTO | null
  onSaved: () => void
}

export function LawyerFormDialog({ open, onOpenChange, lawyer, onSaved }: LawyerFormDialogProps) {
  const isEdit = Boolean(lawyer)
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [barCouncilId, setBarCouncilId] = useState("")
  const [specialization, setSpecialization] = useState(NONE)
  const [chamberName, setChamberName] = useState("")
  const [experience, setExperience] = useState("")
  const [status, setStatus] = useState("ACTIVE")
  const [portal, setPortal] = useState(false)
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)

  useResetOnOpen(open ? (lawyer?.id ?? "new") : null, () => {
    setName(lawyer?.name ?? "")
    setPhone(lawyer?.phone ?? "")
    setEmail(lawyer?.email ?? "")
    setBarCouncilId(lawyer?.barCouncilId ?? "")
    setSpecialization(
      lawyer?.specialization &&
        SPECIALIZATIONS.includes(lawyer.specialization as (typeof SPECIALIZATIONS)[number])
        ? lawyer.specialization
        : NONE
    )
    setChamberName(lawyer?.chamberName ?? "")
    setExperience(lawyer?.experience != null ? String(lawyer.experience) : "")
    setStatus(lawyer?.status === "INACTIVE" ? "INACTIVE" : "ACTIVE")
    setPortal(false)
    setPassword("")
    setPending(false)
  })

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("lawyers.errNameRequired"))
      return
    }
    const expNum = experience.trim() === "" ? null : Number(experience)
    if (expNum !== null && (Number.isNaN(expNum) || expNum < 0)) {
      toast.error(t("lawyers.errExperience"))
      return
    }
    if (!isEdit && portal) {
      if (!email.trim() || !isValidEmail(email)) {
        toast.error(t("ui.errEmail"))
        return
      }
      if (password.length < PASSWORD_MIN) {
        toast.error(t("ui.errPassword"))
        return
      }
    }
    const base = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      barCouncilId: barCouncilId.trim() || null,
      specialization: specialization === NONE ? null : specialization,
      chamberName: chamberName.trim() || null,
      experience: expNum,
    }
    try {
      setPending(true)
      if (isEdit && lawyer) {
        await apiSend<LawyerDTO>("PATCH", `/api/lawyers/${lawyer.id}`, { ...base, status })
        toast.success(t("lawyers.toastUpdated"))
      } else {
        await apiSend<LawyerDTO>("POST", "/api/lawyers", {
          ...base,
          ...(portal ? { createPortalAccess: true, password } : {}),
        })
        toast.success(portal ? t("lawyers.toastCreatedPortal") : t("lawyers.toastCreated"))
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("lawyers.errSave"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHead
          icon={isEdit ? Pencil : Plus}
          title={isEdit ? t("lawyers.editLawyer") : t("lawyers.newLawyer")}
          description={isEdit ? t("lawyers.editDesc") : t("lawyers.newDesc")}
        />

        <div className="space-y-5">
          <FieldGroup label={t("lawyers.groupIdentity")}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="lawyer-name">
                  {t("common.name")} <RequiredMark />
                </Label>
                <Input
                  id="lawyer-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("lawyers.namePh")}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lawyer-phone">{t("common.phone")}</Label>
                  <Input
                    id="lawyer-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+8801XXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lawyer-email">{t("common.email")}</Label>
                  <Input
                    id="lawyer-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="lawyer@chamber.bd"
                  />
                </div>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("lawyers.groupCredentials")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lawyer-bar">{t("lawyers.barCouncilId")}</Label>
                <Input
                  id="lawyer-bar"
                  value={barCouncilId}
                  onChange={(e) => setBarCouncilId(e.target.value)}
                  placeholder={t("lawyers.barPh")}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lawyer-experience">{t("lawyers.experienceYears")}</Label>
                <Input
                  id="lawyer-experience"
                  type="number"
                  min={0}
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder={t("lawyers.experiencePh")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="lawyer-specialization">{t("lawyers.specialization")}</Label>
                <Select value={specialization} onValueChange={setSpecialization}>
                  <SelectTrigger id="lawyer-specialization" className="w-full">
                    <SelectValue placeholder={t("ui.notSpecified")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("ui.notSpecified")}</SelectItem>
                    {SPECIALIZATIONS.map((sp) => (
                      <SelectItem key={sp} value={sp}>
                        {enumLabel("lawyers.spec", sp, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("lawyers.chamber")}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className={cn("space-y-2", !isEdit && "sm:col-span-2")}>
                <Label htmlFor="lawyer-chamber">{t("lawyers.chamberName")}</Label>
                <Input
                  id="lawyer-chamber"
                  value={chamberName}
                  onChange={(e) => setChamberName(e.target.value)}
                  placeholder={t("lawyers.chamberPh")}
                />
              </div>
              {isEdit ? (
                <div className="space-y-2">
                  <Label htmlFor="lawyer-status">{t("common.status")}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger id="lawyer-status" className="w-full">
                      <SelectValue placeholder={t("ui.selectStatus")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </FieldGroup>

          {!isEdit ? (
            <FieldGroup label={t("lawyers.groupPortal")}>
              <div className="space-y-3 rounded-lg border border-border/70 bg-paper-shade/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="lawyer-portal" className="cursor-pointer">
                      {t("lawyers.createPortal")}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t("lawyers.portalHint")}</p>
                  </div>
                  <Switch
                    id="lawyer-portal"
                    checked={portal}
                    onCheckedChange={setPortal}
                    className="cursor-pointer"
                  />
                </div>
                {portal ? (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <Label htmlFor="lawyer-portal-password">{t("ui.portalPassword")}</Label>
                    <Input
                      id="lawyer-portal-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("ui.minCharsPh")}
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground">{t("ui.minChars")}</p>
                  </div>
                ) : null}
              </div>
            </FieldGroup>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="cursor-pointer"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
          <Button className="cursor-pointer" onClick={() => void submit()} disabled={pending}>
            {pending ? t("common.saving") : isEdit ? t("ui.saveChanges") : t("lawyers.createBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function LawyersView({ user, navigate, params }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"
  const { data, loading, error, refetch } = useApiData<LawyerDTO[]>("/api/lawyers")

  const [search, setSearch] = useState("")
  const [specFilter, setSpecFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  // Open lawyer comes from the path (/lawyers/:id) — linkable, refreshable,
  // and Back closes the panel.
  const detailId = params.id ?? null
  const setDetailId = (id: string | null) => navigate("lawyers", id ? { id } : {})
  const [createOpen, setCreateOpen] = useState(false)

  const lawyers = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lawyers.filter((l) => {
      if (specFilter !== ALL && (l.specialization ?? NONE) !== specFilter) return false
      if (statusFilter !== ALL && l.status !== statusFilter) return false
      if (!q) return true
      return [l.name, l.email, l.phone, l.barCouncilId, l.chamberName].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      )
    })
  }, [lawyers, search, specFilter, statusFilter])

  /** Counts describe the whole roster, not the filtered slice. */
  const metrics = useMemo(() => {
    let active = 0
    let caseLoad = 0
    let available = 0
    for (const l of lawyers) {
      if (l.status === "ACTIVE") active += 1
      caseLoad += l.activeCases
      if (l.activeCases === 0 && l.status === "ACTIVE") available += 1
    }
    return { total: lawyers.length, active, caseLoad, available }
  }, [lawyers])

  const hasFilters = specFilter !== ALL || statusFilter !== ALL || search.trim() !== ""
  const searching = search.trim().length > 0
  const loadingFirst = loading && !data
  const hasData = !loadingFirst && !(error && !data) && lawyers.length > 0

  const clearFilters = () => {
    setSpecFilter(ALL)
    setStatusFilter(ALL)
    setSearch("")
  }

  /** Roster cards are real links now that every advocate owns a URL. */
  const lawyerLink = (id: string) => ({
    href: hrefFor("lawyers", { id }),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return // let the browser take it
      e.preventDefault()
      setDetailId(id)
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader title={t("lawyers.pageTitle")} description={t("lawyers.pageSubtitle")}>
        {isAdmin ? (
          <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t("lawyers.addBtn")}
          </Button>
        ) : null}
      </PageHeader>

      {/* ------------------------------ Toolbar ------------------------------ */}
      <div className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
          <div className="relative lg:flex-1">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("lawyers.searchPh")}
              aria-label={t("lawyers.searchPh")}
              className="pl-9 pr-9"
            />
            {searching ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label={t("common.clearSearch")}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <Select value={specFilter} onValueChange={setSpecFilter}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("lawyers.allSpecs")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("lawyers.allSpecs")}</SelectItem>
                {SPECIALIZATIONS.map((sp) => (
                  <SelectItem key={sp} value={sp}>
                    {enumLabel("lawyers.spec", sp, t)}
                  </SelectItem>
                ))}
                {/* The filter already understood "no specialization"; nothing offered it. */}
                <SelectItem value={NONE}>{t("ui.notSpecified")}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36" aria-label={t("ui.allStatuses")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("ui.allStatuses")}</SelectItem>
                {ACCOUNT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {hasData || hasFilters ? (
          <div className="flex items-center justify-between gap-2 border-t border-border/70 px-4 py-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t(filtered.length === 1 ? "lawyers.countOne" : "lawyers.countOther", {
                count: filtered.length,
              })}
            </p>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 cursor-pointer"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5" /> {t("lawyers.clearFilters")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------- Vitals ------------------------------- */}
      {hasData ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Gavel} label={t("lawyers.statTotal")} value={metrics.total} tone="emerald" delay={0} />
          <StatCard
            icon={BadgeCheck}
            label={t("status.active")}
            value={metrics.active}
            tone="teal"
            delay={60}
          />
          <StatCard
            icon={Briefcase}
            label={t("lawyers.statCaseLoad")}
            value={metrics.caseLoad}
            tone="gold"
            delay={120}
          />
          <StatCard
            icon={UserRoundCheck}
            label={t("lawyers.statAvailable")}
            value={metrics.available}
            sub={t("lawyers.statAvailableSub")}
            tone="stone"
            delay={180}
          />
        </div>
      ) : null}

      {/* ------------------------------- Roster ------------------------------- */}
      {loadingFirst ? (
        <LoadingBlock rows={3} tiles={4} panels={2} />
      ) : error && !data ? (
        <EmptyState
          icon={Gavel}
          title={t("lawyers.errLoad")}
          description={error}
          action={
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : lawyers.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title={t("lawyers.emptyTitle")}
          description={t("lawyers.emptyDesc")}
          action={
            isAdmin ? (
              <Button size="sm" className="cursor-pointer" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> {t("lawyers.addBtn")}
              </Button>
            ) : undefined
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("lawyers.noMatchTitle")}
          description={t("lawyers.noMatchDesc")}
          action={
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={clearFilters}>
              {t("lawyers.clearFilters")}
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l, i) => {
            const contacts = [
              l.chamberName ? { icon: Building2, value: l.chamberName } : null,
              l.email ? { icon: Mail, value: l.email } : null,
              l.phone ? { icon: Phone, value: l.phone } : null,
            ].filter(Boolean) as { icon: typeof Mail; value: string }[]

            return (
              <li key={l.id} style={{ "--d": `${Math.min(i, 8) * 45}ms` } as React.CSSProperties}>
                <a
                  {...lawyerLink(l.id)}
                  aria-label={t("lawyers.openAria", { name: l.name })}
                  className={cn(
                    "group u-rise relative flex h-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-4 shadow-soft",
                    "transition-[box-shadow,border-color,transform] duration-200 motion-reduce:transition-none",
                    "hover:-translate-y-0.5 hover:border-emerald-600/25 hover:shadow-lift motion-reduce:hover:translate-y-0",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  )}
                >
                  {/* milled top edge, same crest as the metric tiles */}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
                  />

                  <div className="flex items-start gap-3">
                    <AdvocatePlate name={l.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight text-ink">{l.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        {l.barCouncilId ? <BarChip value={l.barCouncilId} /> : null}
                        {l.experience != null ? (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {t("lawyers.yrsCount", { count: l.experience })}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        l.status === "ACTIVE"
                          ? "bg-emerald-500 ring-2 ring-emerald-500/20"
                          : "bg-stone-300"
                      )}
                      title={statusLabel(l.status, t)}
                    />
                  </div>

                  {l.specialization ? (
                    <div className="mt-3">
                      <SpecChip value={l.specialization} t={t} />
                    </div>
                  ) : null}

                  {/* Empty contact rows are omitted rather than rendered as em dashes. */}
                  {contacts.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {contacts.map((c) => (
                        <li key={c.value} className="flex items-center gap-2 text-xs">
                          <c.icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-600/70" />
                          <span className="truncate text-muted-foreground">{c.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="mt-auto border-t border-border/60 pt-3">
                    <CaseLoadMeter active={l.activeCases} total={l.totalCases} t={t} />
                  </div>

                  <ArrowUpRight
                    aria-hidden
                    className="absolute right-3.5 top-3.5 h-4 w-4 text-brass-deep opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                  />
                </a>
              </li>
            )
          })}
        </ul>
      )}

      <LawyerDetailDialog
        lawyerId={detailId}
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        user={user}
        navigate={navigate}
        onChanged={refetch}
      />

      <LawyerFormDialog open={createOpen} onOpenChange={setCreateOpen} lawyer={null} onSaved={refetch} />
    </div>
  )
}
