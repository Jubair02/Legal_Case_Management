"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Building2,
  ChevronRight,
  Cloud,
  FolderKanban,
  IdCard,
  Landmark,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DialogHead, FieldGroup, RequiredMark } from "@/components/shared/dialog-chrome"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { DetailField, SearchField, Toolbar } from "@/components/shared/toolbar"
import { useApiData } from "@/hooks/use-api-data"
import { Badge } from "@/components/ui/badge"
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
import { Textarea } from "@/components/ui/textarea"
import { apiSend } from "@/lib/api-client"
import { CLIENT_TYPES, CLIENT_TYPE_LABELS } from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { CaseListDTO, ClientDTO, InvoiceDTO, SessionUser, ViewKey, ViewParams, ViewProps } from "@/lib/types"
import {
  caseStatusStyles,
  clientTypeStyles,
  cn,
  formatCurrency,
  formatDate,
  formatRelativeDay,
  initials,
  invoiceStatusStyles,
} from "@/lib/utils"
import { isValidEmail } from "@/lib/validation"
import { useResetOnOpen } from "@/lib/use-reset-on-open"

type NavigateFn = (view: ViewKey, params?: ViewParams) => void

const ALL = "ALL"

/** GET /api/clients/[id] payload: ClientDTO + cases (+ invoices for ADMIN). */
interface ClientDetailResponse extends ClientDTO {
  cases: CaseListDTO[]
  invoices?: InvoiceDTO[]
}

/**
 * Per-type identity: avatar plate tint, roster glyph and the colour the type
 * takes in the distribution meter. Individuals stay neutral so the two
 * organisation kinds are the ones that stand out in a mixed book.
 */
const TYPE_META: Record<string, { plate: string; icon: LucideIcon; bar: string; dot: string }> = {
  INDIVIDUAL: {
    plate: "bg-paper-shade text-ink ring-border/70",
    icon: User,
    bar: "bg-stone-400",
    dot: "bg-stone-400",
  },
  COMPANY: {
    plate: "bg-emerald-50 text-emerald-800 ring-emerald-600/15",
    icon: Building2,
    bar: "bg-emerald-600",
    dot: "bg-emerald-600",
  },
  ORGANIZATION: {
    plate: "bg-teal-50 text-teal-800 ring-teal-600/15",
    icon: Landmark,
    bar: "bg-teal-600",
    dot: "bg-teal-600",
  },
}

function typeMeta(clientType: string | null | undefined) {
  return TYPE_META[clientType ?? "INDIVIDUAL"] ?? TYPE_META.INDIVIDUAL
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

/* ------------------------------ Shared pieces ------------------------------ */

/** Initials plate; the ring keeps it legible against both card and paper grounds. */
function AvatarPlate({
  name,
  clientType,
  className,
}: {
  name: string
  clientType: string | null | undefined
  className?: string
}) {
  const meta = typeMeta(clientType)
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold ring-1",
        meta.plate,
        className ?? "h-10 w-10 text-sm"
      )}
    >
      {initials(name)}
    </span>
  )
}

function PortalBadge({ label }: { label: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-emerald-200 bg-emerald-50 text-[11px] text-emerald-800"
    >
      <Cloud aria-hidden className="h-3 w-3" /> {label}
    </Badge>
  )
}

/**
 * One contact line. Rendered only when there is a value — the previous design
 * printed an em dash for every empty field, so a sparse client showed a column
 * of dashes that read as broken rather than simply unknown.
 */
function ContactRow({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-start gap-2">
      <Icon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{children}</span>
    </span>
  )
}

/** Case row shared by the detail dialog's case list. */
function CaseRow({
  kase,
  onOpen,
  styles,
}: {
  kase: CaseListDTO
  onOpen: () => void
  styles: Record<string, { label: string; className: string }>
}) {
  const { t } = useLanguage()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-paper-shade/70 focus-visible:bg-paper-shade/70 focus-visible:outline-none"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-xs font-semibold tracking-tight text-emerald-800">
          {kase.caseNumber}
        </span>
        <span className="mt-1 block truncate text-sm text-ink">{kase.title}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge map={styles} value={kase.status} />
        <span className="text-[11px] text-muted-foreground">
          {kase.nextHearingDate
            ? t("ui.hearingRel", { rel: relDay(formatRelativeDay(kase.nextHearingDate), t) })
            : t("ui.noHearingSet")}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  )
}

/* ------------------------------- Roster band ------------------------------- */

interface Roster {
  total: number
  activeCases: number
  portalCount: number
  /** Client count per CLIENT_TYPES entry, in declaration order. */
  byType: { type: string; count: number }[]
}

function computeRoster(clients: ClientDTO[]): Roster {
  let activeCases = 0
  let portalCount = 0
  const counts = new Map<string, number>(CLIENT_TYPES.map((ct) => [ct, 0]))

  for (const c of clients) {
    activeCases += c.activeCaseCount ?? 0
    if (c.portalEmail) portalCount += 1
    const key = c.clientType && counts.has(c.clientType) ? c.clientType : "INDIVIDUAL"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return {
    total: clients.length,
    activeCases,
    portalCount,
    byType: CLIENT_TYPES.map((ct) => ({ type: ct, count: counts.get(ct) ?? 0 })),
  }
}

function RosterMetric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="min-w-0 flex-1 px-5 py-4">
      <p className="u-eyebrow text-muted-foreground">{label}</p>
      <p className={cn("mt-2 truncate text-[1.6rem] leading-none font-semibold tracking-tight tabular-nums", tone)}>
        {value}
      </p>
    </div>
  )
}

/**
 * Roster summary: three counts over a part-to-whole meter of the book by
 * client type. The legend doubles as the type filter — the distribution is the
 * natural place to act on it from.
 */
function RosterBand({
  roster,
  activeType,
  onPickType,
}: {
  roster: Roster
  activeType: string
  onPickType: (type: string) => void
}) {
  const { t } = useLanguage()
  const { total, activeCases, portalCount, byType } = roster
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0)

  return (
    <section className="u-rise u-crest overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
      <div className="flex flex-col divide-y divide-border/70 sm:flex-row sm:divide-x sm:divide-y-0">
        <RosterMetric label={t("clients.totalClients")} value={String(total)} tone="text-ink" />
        <RosterMetric
          label={t("clients.activeCasesLabel")}
          value={String(activeCases)}
          tone="text-emerald-800"
        />
        <RosterMetric
          label={t("clients.portalAccounts")}
          value={String(portalCount)}
          tone="text-brass-deep"
        />
      </div>

      <div className="border-t border-border/70 bg-paper-shade/40 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="u-eyebrow text-muted-foreground">{t("clients.rosterLabel")}</p>
          <p className="text-[11px] text-muted-foreground">{t("clients.byType")}</p>
        </div>

        <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-border/70">
          {byType.map((entry) => (
            <span
              key={entry.type}
              className={typeMeta(entry.type).bar}
              style={{ width: `${share(entry.count)}%` }}
            />
          ))}
        </div>

        {/* Legend entries are the type filter: clicking one narrows the grid. */}
        <ul className="mt-3 flex flex-wrap gap-2">
          {byType.map((entry) => {
            const active = activeType === entry.type
            const label = statusLabel(entry.type, t)
            return (
              <li key={entry.type}>
                <button
                  type="button"
                  onClick={() => onPickType(active ? ALL : entry.type)}
                  aria-pressed={active}
                  aria-label={t("clients.filterByType", { type: label })}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-200",
                    "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                    active
                      ? "border-primary/30 bg-primary/10 text-ink"
                      : "border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", typeMeta(entry.type).dot)} />
                  {label}
                  <span className="font-medium tabular-nums text-ink">{entry.count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------ Roster skeleton ------------------------------ */

/** Matches the card grid so the first paint does not reflow once data lands. */
function RosterSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-soft">
        <div className="flex flex-col gap-6 sm:flex-row">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="mt-5 h-2 w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-4 rounded-xl border border-border/80 bg-card p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ Client detail ------------------------------ */

function DetailSkeleton() {
  return (
    <div className="space-y-5 py-2" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  )
}

function ClientDetailDialog({
  clientId,
  open,
  onOpenChange,
  user,
  navigate,
  onChanged,
}: {
  clientId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  user: SessionUser
  navigate: NavigateFn
  onChanged: () => void
}) {
  const isAdmin = user.role === "ADMIN"
  const canManage = isAdmin || user.role === "STAFF"
  const { t } = useLanguage()

  const { data, loading, error, refetch } = useApiData<ClientDetailResponse>(
    open && clientId ? `/api/clients/${clientId}` : null
  )
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const client = data
  const cases = client?.cases ?? []
  const invoices = client?.invoices ?? []

  const caseStyles = useMemo(() => translatedStyles(caseStatusStyles, t), [t])
  const typeStyles = useMemo(() => translatedStyles(clientTypeStyles, t), [t])
  const invStyles = useMemo(() => translatedStyles(invoiceStatusStyles, t), [t])

  const handleDelete = async () => {
    if (!client) return
    await apiSend("DELETE", `/api/clients/${client.id}`)
    toast.success(t("clients.toastDeletedFor", { name: client.name }))
    onChanged()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHead
            icon={Users}
            title={t("clients.detailsTitle")}
            description={t("clients.detailsDesc")}
          />

          {loading && !client ? (
            <DetailSkeleton />
          ) : error && !client ? (
            <div className="py-2">
              <EmptyState
                variant="inline"
                icon={Users}
                title={t("clients.errLoadOne")}
                description={error}
                action={
                  <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
                    {t("common.retry")}
                  </Button>
                }
              />
            </div>
          ) : client ? (
            <div className="space-y-5">
              {/* Identity header */}
              <div className="flex items-start gap-3.5">
                <AvatarPlate
                  name={client.name}
                  clientType={client.clientType}
                  className="h-12 w-12 text-base"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-serif text-xl leading-tight font-semibold tracking-tight text-ink">
                      {client.name}
                    </p>
                    <StatusBadge map={typeStyles} value={client.clientType} />
                    {client.portalEmail ? <PortalBadge label={t("ui.portal")} /> : null}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t("clients.clientSince", { date: formatDate(client.createdAt) })}
                  </p>
                </div>
              </div>

              <FieldGroup label={t("clients.contactLabel")}>
                <div className="grid gap-x-6 gap-y-4 rounded-xl border border-border/70 bg-paper-shade/40 p-4 sm:grid-cols-2">
                  <DetailField label={t("common.phone")}>
                    <span className="tabular-nums">{client.phone ?? "—"}</span>
                  </DetailField>
                  <DetailField label={t("common.email")}>
                    <span className="block truncate">{client.email ?? "—"}</span>
                  </DetailField>
                  <DetailField label={t("clients.nid")}>
                    <span className="font-mono text-[0.8125rem]">{client.nid ?? "—"}</span>
                  </DetailField>
                  <DetailField label={t("clients.portalAccount")}>
                    <span className="block truncate">
                      {client.portalEmail ?? (
                        <span className="text-muted-foreground">{t("clients.noPortalAccess")}</span>
                      )}
                    </span>
                  </DetailField>
                  <div className="sm:col-span-2">
                    <DetailField label={t("clients.address")}>
                      <span className="block leading-relaxed">{client.address ?? "—"}</span>
                    </DetailField>
                  </div>
                </div>
              </FieldGroup>

              <FieldGroup label={t("clients.casesCount", { count: cases.length })}>
                {cases.length === 0 ? (
                  <EmptyState variant="inline" icon={FolderKanban} title={t("clients.noCases")} />
                ) : (
                  <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                    {cases.map((c) => (
                      <CaseRow
                        key={c.id}
                        kase={c}
                        styles={caseStyles}
                        onOpen={() => {
                          onOpenChange(false)
                          navigate("case-detail", { id: c.id })
                        }}
                      />
                    ))}
                  </div>
                )}
              </FieldGroup>

              {isAdmin ? (
                <FieldGroup label={t("clients.invoicesCount", { count: invoices.length })}>
                  {invoices.length === 0 ? (
                    <EmptyState variant="inline" icon={Receipt} title={t("clients.noInvoices")} />
                  ) : (
                    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                      {invoices.map((inv) => (
                        <li key={inv.id} className="flex items-center justify-between gap-3 px-3.5 py-3">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-semibold tracking-tight text-ink">
                              {inv.invoiceNumber}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {inv.caseNumber ? `${inv.caseNumber} · ` : ""}
                              {t("clients.dueBy", { date: formatDate(inv.dueDate) })}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            <span className="text-sm font-semibold tabular-nums text-ink">
                              {formatCurrency(inv.amount)}
                            </span>
                            <StatusBadge map={invStyles} value={inv.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </FieldGroup>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {client && isAdmin ? (
              <Button
                variant="ghost"
                className="cursor-pointer text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </Button>
            ) : null}
            {client && canManage ? (
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

      {client ? (
        <ClientFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          client={client}
          onSaved={() => {
            refetch()
            onChanged()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("clients.deleteConfirmTitle")}
        description={t("clients.deleteConfirmDesc", { name: client?.name ?? t("clients.detailsTitle") })}
        confirmLabel={t("clients.deleteConfirmBtn")}
        destructive
        onConfirm={handleDelete}
      />
    </>
  )
}

/* ------------------------------- Client form ------------------------------- */

export interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set the dialog edits this client; otherwise it creates a new one. */
  client?: ClientDTO | null
  onSaved: () => void
}

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: ClientFormDialogProps) {
  const isEdit = Boolean(client)
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [nid, setNid] = useState("")
  const [address, setAddress] = useState("")
  const [clientType, setClientType] = useState("INDIVIDUAL")
  const [portal, setPortal] = useState(false)
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)

  useResetOnOpen(open ? (client?.id ?? "new") : null, () => {
    setName(client?.name ?? "")
    setPhone(client?.phone ?? "")
    setEmail(client?.email ?? "")
    setNid(client?.nid ?? "")
    setAddress(client?.address ?? "")
    setClientType(client?.clientType && CLIENT_TYPE_LABELS[client.clientType] ? client.clientType : "INDIVIDUAL")
    setPortal(false)
    setPassword("")
    setPending(false)
  })

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("clients.errNameRequired"))
      return
    }
    if (!isEdit && portal) {
      if (!email.trim() || !isValidEmail(email)) {
        toast.error(t("ui.errEmail"))
        return
      }
      if (password.length < 6) {
        toast.error(t("ui.errPassword"))
        return
      }
    }
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      nid: nid.trim() || null,
      address: address.trim() || null,
      clientType,
    }
    try {
      setPending(true)
      if (isEdit && client) {
        await apiSend<ClientDTO>("PATCH", `/api/clients/${client.id}`, payload)
        toast.success(t("clients.toastUpdated"))
      } else {
        await apiSend<ClientDTO>("POST", "/api/clients", {
          ...payload,
          ...(portal ? { createPortalAccess: true, password } : {}),
        })
        toast.success(portal ? t("clients.toastCreatedPortal") : t("clients.toastCreated"))
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("clients.errSave"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHead
          icon={isEdit ? Pencil : UserPlus}
          title={isEdit ? t("clients.editClient") : t("clients.newClient")}
          description={isEdit ? t("clients.editDesc") : t("clients.newDesc")}
        />

        <div className="space-y-5">
          <FieldGroup label={t("clients.identityLabel")}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-name">
                  {t("common.name")} <RequiredMark />
                </Label>
                <Input
                  id="client-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("clients.namePh")}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="client-type">{t("clients.clientType")}</Label>
                  <Select value={clientType} onValueChange={setClientType}>
                    <SelectTrigger id="client-type" className="w-full cursor-pointer">
                      <SelectValue placeholder={t("ui.selectType")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((ct) => (
                        <SelectItem key={ct} value={ct}>
                          {statusLabel(ct, t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-nid">{t("clients.nid")}</Label>
                  <Input
                    id="client-nid"
                    value={nid}
                    onChange={(e) => setNid(e.target.value)}
                    placeholder={t("clients.nidPh")}
                    className="font-mono"
                  />
                </div>
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("clients.contactLabel")}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="client-phone">{t("common.phone")}</Label>
                  <Input
                    id="client-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+8801XXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client-email">{t("common.email")}</Label>
                  <Input
                    id="client-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-address">{t("clients.address")}</Label>
                <Textarea
                  id="client-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("clients.addressPh")}
                  rows={2}
                />
              </div>
            </div>
          </FieldGroup>

          {!isEdit ? (
            <FieldGroup label={t("clients.portalLabel")}>
              <div className="space-y-3 rounded-xl border border-border/70 bg-paper-shade/50 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Label htmlFor="client-portal" className="cursor-pointer">
                      {t("clients.createPortal")}
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">{t("clients.portalHint")}</p>
                  </div>
                  <Switch
                    id="client-portal"
                    checked={portal}
                    onCheckedChange={setPortal}
                    className="cursor-pointer"
                  />
                </div>
                {portal ? (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    <Label htmlFor="client-portal-password">{t("ui.portalPassword")}</Label>
                    <Input
                      id="client-portal-password"
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
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button className="cursor-pointer" onClick={submit} disabled={pending}>
            {pending ? t("common.saving") : isEdit ? t("ui.saveChanges") : t("clients.createBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------- Roster card ------------------------------- */

/**
 * The whole card is one button. The previous version put `role="button"` on a
 * div and hand-rolled Enter/Space handling; a real button gets that, the focus
 * ring and the accessible name for free. Every child is a span so the markup
 * stays valid.
 */
function ClientCard({
  client,
  onOpen,
  typeStyles,
  delay,
}: {
  client: ClientDTO
  onOpen: () => void
  typeStyles: Record<string, { label: string; className: string }>
  delay: number
}) {
  const { t } = useLanguage()
  const meta = typeMeta(client.clientType)
  const TypeIcon = meta.icon
  const hasContact = Boolean(client.phone || client.email || client.nid || client.address)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("clients.openAria", { name: client.name })}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={cn(
        "group u-rise flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-left shadow-soft",
        "transition-[box-shadow,border-color,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-emerald-600/25 hover:shadow-lift",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      )}
    >
      {/* Identity */}
      <span className="flex items-start gap-3 p-4">
        <AvatarPlate name={client.name} clientType={client.clientType} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-tight font-semibold text-ink">{client.name}</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <TypeIcon aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
            <StatusBadge map={typeStyles} value={client.clientType} />
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100"
        />
      </span>

      {/* Contact — only the fields that actually have a value */}
      <span className="flex flex-1 flex-col gap-1.5 border-t border-border/60 px-4 py-3">
        {hasContact ? (
          <>
            {client.phone ? (
              <ContactRow icon={Phone}>
                <span className="tabular-nums">{client.phone}</span>
              </ContactRow>
            ) : null}
            {client.email ? <ContactRow icon={Mail}>{client.email}</ContactRow> : null}
            {client.nid ? (
              <ContactRow icon={IdCard}>
                <span className="font-mono">{client.nid}</span>
              </ContactRow>
            ) : null}
            {client.address ? (
              <ContactRow icon={MapPin}>
                <span className="line-clamp-1">{client.address}</span>
              </ContactRow>
            ) : null}
          </>
        ) : (
          <span className="text-xs text-muted-foreground/80 italic">{t("clients.noContact")}</span>
        )}
      </span>

      {/* Caseload + portal */}
      <span className="flex items-center justify-between gap-2 border-t border-border/60 bg-paper-shade/40 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <FolderKanban aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {t(client.caseCount === 1 ? "clients.caseStatOne" : "clients.caseStatOther", {
              cases: client.caseCount,
              active: client.activeCaseCount,
            })}
          </span>
        </span>
        {client.portalEmail ? <PortalBadge label={t("ui.portal")} /> : null}
      </span>
    </button>
  )
}

/* ---------------------------------- View ---------------------------------- */

type SortKey = "name" | "cases" | "newest"

export default function ClientsView({ user, navigate, params }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"
  const canManage = isAdmin || user.role === "STAFF"

  const { data, loading, error, refetch } = useApiData<ClientDTO[]>("/api/clients")

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState(ALL)
  const [sort, setSort] = useState<SortKey>("name")
  // Which client is open is derived from the path (/clients/:id) rather than
  // held in state, so the panel survives a refresh, can be linked, and
  // Back closes it instead of leaving the app.
  const detailId = params.id ?? null
  const setDetailId = (id: string | null) => navigate("clients", id ? { id } : {})
  const [createOpen, setCreateOpen] = useState(false)

  const clients = useMemo(() => data ?? [], [data])
  const roster = useMemo(() => computeRoster(clients), [clients])
  const typeStyles = useMemo(() => translatedStyles(clientTypeStyles, t), [t])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = clients.filter((c) => {
      if (typeFilter !== ALL && (c.clientType ?? "INDIVIDUAL") !== typeFilter) return false
      if (!q) return true
      return [c.name, c.phone, c.email, c.nid, c.address].some((v) => (v ?? "").toLowerCase().includes(q))
    })

    const sorted = [...rows]
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sort === "cases") {
      sorted.sort((a, b) => (b.caseCount ?? 0) - (a.caseCount ?? 0) || a.name.localeCompare(b.name))
    } else {
      sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    }
    return sorted
  }, [clients, search, typeFilter, sort])

  const narrowed = typeFilter !== ALL || search.trim().length > 0

  return (
    <div className="space-y-6">
      <PageHeader title={t("clients.pageTitle")} description={t("clients.pageSubtitle")}>
        {canManage ? (
          <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t("clients.addBtn")}
          </Button>
        ) : null}
      </PageHeader>

      {loading && !data ? (
        <RosterSkeleton />
      ) : error && !data ? (
        <EmptyState
          icon={Users}
          title={t("clients.errLoad")}
          description={error}
          action={
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : clients.length === 0 ? (
        <EmptyState icon={Users} title={t("clients.emptyTitle")} description={t("clients.emptyDesc")} />
      ) : (
        <>
          <RosterBand roster={roster} activeType={typeFilter} onPickType={setTypeFilter} />

          <Toolbar
            note={
              narrowed
                ? t("clients.matchCount", { shown: filtered.length, total: clients.length })
                : t("clients.countClients", { count: clients.length })
            }
          >
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder={t("clients.searchPh")}
              ariaLabel={t("clients.searchPh")}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full cursor-pointer sm:w-[170px]">
                  <SelectValue placeholder={t("ui.allTypes")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("ui.allTypes")}</SelectItem>
                  {CLIENT_TYPES.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {statusLabel(ct, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="w-full cursor-pointer sm:w-[170px]" aria-label={t("clients.sortAria")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">{t("clients.sortName")}</SelectItem>
                  <SelectItem value="cases">{t("clients.sortCases")}</SelectItem>
                  <SelectItem value="newest">{t("clients.sortNewest")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Toolbar>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} title={t("clients.noMatchTitle")} description={t("clients.noMatchDesc")} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((c, i) => (
                <ClientCard
                  key={c.id}
                  client={c}
                  typeStyles={typeStyles}
                  delay={Math.min(i, 8) * 40}
                  onOpen={() => setDetailId(c.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <ClientDetailDialog
        clientId={detailId}
        open={detailId !== null}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        user={user}
        navigate={navigate}
        onChanged={refetch}
      />

      <ClientFormDialog open={createOpen} onOpenChange={setCreateOpen} client={null} onSaved={refetch} />
    </div>
  )
}
