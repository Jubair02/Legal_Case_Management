"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Circle,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Layers,
  Mail,
  MapPin,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Phone,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DialogHead, FieldGroup, RequiredMark } from "@/components/shared/dialog-chrome"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { StatCard } from "@/components/shared/stat-card"
import { SearchField, Toolbar } from "@/components/shared/toolbar"
import { useApiData } from "@/hooks/use-api-data"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiSend } from "@/lib/api-client"
import { ACCOUNT_STATUSES, ROLES } from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type {
  OutboundEventKey,
  OutboundListDTO,
  OutboundMessageDTO,
  OutboundRetryResult,
  OutboundSettingsDTO,
  ReminderSweepResult,
  SessionUser,
  UserDTO,
  ViewProps,
} from "@/lib/types"
import { cn, formatDate, formatDateTime, initials } from "@/lib/utils"
import { isValidEmail } from "@/lib/validation"
import { useResetOnOpen } from "@/lib/use-reset-on-open"

const ALL = "ALL"

/** Minimum accepted by POST /api/auth/change-password. */
const PASSWORD_MIN = 6

/** Every role gets its own tint — the old map made three of the four identical. */
const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  LAWYER: "border-teal-200 bg-teal-50 text-teal-700",
  STAFF: "border-stone-200 bg-stone-50 text-stone-600",
  CLIENT: "border-amber-200 bg-amber-50 text-amber-700",
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

function RoleBadge({ role }: { role: string }) {
  const { t } = useLanguage()
  return (
    <Badge variant="outline" className={cn("border", ROLE_BADGE_CLASSES[role] ?? ROLE_BADGE_CLASSES.STAFF)}>
      {statusLabel(role, t)}
    </Badge>
  )
}

function StatusDot({ status }: { status: string }) {
  const { t } = useLanguage()
  const active = status === "ACTIVE"
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className={cn(
          "h-2 w-2 rounded-full",
          active ? "bg-emerald-500 ring-2 ring-emerald-500/20" : "bg-stone-400"
        )}
      />
      <span className={active ? "text-emerald-700" : "text-muted-foreground"}>
        {active ? t("status.active") : t("status.inactive")}
      </span>
    </span>
  )
}

/** Micro-caps label + value row, used down the account credential card. */
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
        <Icon className="h-4 w-4" />
      </span>
      <dt className="u-eyebrow shrink-0 text-muted-foreground">{label}</dt>
      <dd className="ml-auto min-w-0 truncate text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

/* ------------------------------ User form dialog ------------------------------ */

function UserFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: UserDTO | null
  onSaved: () => void
}) {
  const { t } = useLanguage()
  const isEdit = !!editing
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<string>("CLIENT")
  const [status, setStatus] = useState("ACTIVE")
  const [pending, setPending] = useState(false)

  useResetOnOpen(open ? (editing?.id ?? "new") : null, () => {
    setName(editing?.name ?? "")
    setEmail(editing?.email ?? "")
    setPassword("")
    setPhone(editing?.phone ?? "")
    setRole(editing?.role ?? "CLIENT")
    setStatus(editing?.status ?? "ACTIVE")
  })

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("settings.nameRequired"))
      return
    }
    // The email is the login identity in both modes, so it is validated in both.
    if (!isValidEmail(email)) {
      toast.error(t("settings.emailInvalid"))
      return
    }
    if (!isEdit) {
      if (password.length < PASSWORD_MIN) {
        toast.error(t("settings.passwordMinToast"))
        return
      }
    }
    if (isEdit && password && password.length < PASSWORD_MIN) {
      toast.error(t("settings.newPasswordMinToast"))
      return
    }
    setPending(true)
    try {
      if (isEdit && editing) {
        await apiSend("PATCH", `/api/users/${editing.id}`, {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          role,
          status,
          ...(password ? { password } : {}),
        })
        toast.success(t("settings.userUpdated"))
      } else {
        await apiSend("POST", "/api/users", {
          name: name.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          role,
        })
        toast.success(t("settings.userCreated"))
      }
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e, t("settings.genericError")))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHead
          icon={isEdit ? Pencil : UserPlus}
          title={isEdit ? t("settings.editUser") : t("settings.addUser")}
          description={isEdit ? t("settings.editUserDesc") : t("settings.addUserDesc")}
        />

        <div className="space-y-5">
          <FieldGroup label={t("settings.groupCredentials")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="user-name">
                  {t("common.name")} <RequiredMark />
                </Label>
                <Input
                  id="user-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("common.name")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">
                  {t("common.email")} <RequiredMark />
                </Label>
                <Input
                  id="user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                />
                {isEdit ? (
                  <p className="text-xs text-muted-foreground">{t("settings.emailSignInHint")}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">
                  {isEdit ? t("settings.newPassword") : t("settings.password")}
                  {isEdit ? null : (
                    <>
                      {" "}
                      <RequiredMark />
                    </>
                  )}
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={isEdit ? t("settings.passwordKeepShort") : t("settings.passwordMinShort")}
                />
                <p className="text-xs text-muted-foreground">
                  {isEdit ? t("settings.passwordKeepHint") : t("settings.passwordMinHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-phone">{t("common.phone")}</Label>
                <Input
                  id="user-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+8801XXXXXXXXX"
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("settings.groupAccess")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>
                  {t("settings.role")} <RequiredMark />
                </Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {statusLabel(r, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isEdit ? (
                <div className="space-y-2">
                  <Label>{t("common.status")}</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
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
            {pending ? t("common.saving") : isEdit ? t("settings.saveChanges") : t("settings.createUser")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ User management ------------------------------ */

function UsersPanel() {
  const { t } = useLanguage()
  const { data, loading, error, refetch } = useApiData<UserDTO[]>("/api/users")
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserDTO | null>(null)
  const [deleting, setDeleting] = useState<UserDTO | null>(null)

  const list = useMemo(() => data ?? [], [data])

  const filtered = useMemo(() => {
    let rows = list
    if (roleFilter !== ALL) rows = rows.filter((u) => u.role === roleFilter)
    if (statusFilter !== ALL) rows = rows.filter((u) => u.status === statusFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? "").includes(q)
      )
    }
    return rows
  }, [list, roleFilter, statusFilter, search])

  /** Counts describe the whole directory, not the filtered slice. */
  const metrics = useMemo(() => {
    let active = 0
    let admins = 0
    for (const u of list) {
      if (u.status === "ACTIVE") active += 1
      if (u.role === "ADMIN") admins += 1
    }
    return { total: list.length, active, inactive: list.length - active, admins }
  }, [list])

  const deleteUser = async () => {
    if (!deleting) return
    await apiSend("DELETE", `/api/users/${deleting.id}`)
    toast.success(t("settings.userDeleted"))
    refetch()
  }

  const openEdit = (u: UserDTO | null) => {
    setEditing(u)
    setFormOpen(true)
  }

  const clearAll = () => {
    setRoleFilter(ALL)
    setStatusFilter(ALL)
    setSearch("")
  }

  const hasFilters = roleFilter !== ALL || statusFilter !== ALL || search.trim() !== ""
  const searching = search.trim().length > 0
  const loadingFirst = loading && !data
  const hasData = !loadingFirst && !(error && !data) && list.length > 0

  /** Edit / delete menu for one account — shared by the table and the cards. */
  const rowMenu = (u: UserDTO) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 cursor-pointer"
          aria-label={t("settings.userActions")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem className="cursor-pointer" onSelect={() => openEdit(u)}>
          <Pencil className="h-4 w-4" /> {t("common.edit")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-rose-600 focus:bg-rose-50 focus:text-rose-700"
          onSelect={() => setDeleting(u)}
        >
          <Trash2 className="h-4 w-4" /> {t("common.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="space-y-6">
      {/* ------------------------------ Toolbar ------------------------------ */}
      <Toolbar
        note={
          hasData || hasFilters
            ? t(filtered.length === 1 ? "settings.userCountOne" : "settings.userCountOther", {
                count: filtered.length,
              })
            : undefined
        }
        action={
          hasFilters ? (
            <Button variant="ghost" size="sm" className="h-7 cursor-pointer" onClick={clearAll}>
              <X className="h-3.5 w-3.5" /> {t("settings.clearFilters")}
            </Button>
          ) : undefined
        }
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("settings.searchUsers")}
          ariaLabel={t("settings.searchUsers")}
          className="lg:flex-1"
        />

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-44" aria-label={t("settings.allRoles")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("settings.allRoles")}</SelectItem>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {statusLabel(r, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-36" aria-label={t("settings.allStatuses")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("settings.allStatuses")}</SelectItem>
              {ACCOUNT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button className="col-span-2 cursor-pointer sm:col-span-1 sm:shrink-0" onClick={() => openEdit(null)}>
            <UserPlus className="h-4 w-4" /> {t("settings.addUser")}
          </Button>
        </div>
      </Toolbar>


      {/* ------------------------------- Vitals ------------------------------- */}
      {hasData ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label={t("settings.statTotal")} value={metrics.total} tone="emerald" delay={0} />
          <StatCard
            icon={BadgeCheck}
            label={t("status.active")}
            value={metrics.active}
            tone="teal"
            delay={60}
          />
          <StatCard
            icon={Circle}
            label={t("status.inactive")}
            value={metrics.inactive}
            tone="stone"
            delay={120}
            onClick={
              statusFilter === "INACTIVE" || metrics.inactive === 0
                ? undefined
                : () => setStatusFilter("INACTIVE")
            }
            actionLabel={t("settings.gotoInactive")}
          />
          <StatCard
            icon={ShieldCheck}
            label={t("settings.statAdmins")}
            value={metrics.admins}
            tone="gold"
            delay={180}
          />
        </div>
      ) : null}

      {/* ------------------------------ Directory ------------------------------ */}
      {loadingFirst ? (
        <LoadingBlock rows={5} tiles={4} panels={1} />
      ) : error && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("settings.loadFailed")}
          description={error}
          action={
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={hasFilters ? Search : Users}
          title={list.length === 0 ? t("settings.noUsers") : t("settings.noUsersFiltered")}
          description={list.length === 0 ? t("settings.noUsersDesc") : t("settings.noUsersFilteredDesc")}
          action={
            list.length === 0 ? (
              <Button size="sm" className="cursor-pointer" onClick={() => openEdit(null)}>
                <UserPlus className="h-4 w-4" /> {t("settings.addUser")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={clearAll}
              >
                {t("settings.clearFilters")}
              </Button>
            )
          }
        />
      ) : (
        <section className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
          {/* Desktop: the directory table. */}
          <div className="hidden overflow-x-auto lg:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">{t("settings.user")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead>{t("settings.role")}</TableHead>
                  <TableHead>{t("settings.linkedProfile")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("settings.created")}</TableHead>
                  <TableHead className="w-12 pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id} className="border-border/60 transition-colors hover:bg-paper-shade/70">
                    <TableCell className="py-3 pl-5">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
                        >
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{u.name}</p>
                          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <Mail aria-hidden className="h-3 w-3 shrink-0" />
                            {u.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone aria-hidden className="h-3.5 w-3.5" />
                          {u.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="max-w-[10rem] truncate text-sm text-muted-foreground">
                      {u.linkedName ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusDot status={u.status} />
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell className="pr-5 text-right">{rowMenu(u)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile / tablet: one card per account. */}
          <ul className="divide-y divide-border/60 lg:hidden">
            {filtered.map((u) => (
              <li key={u.id} className="flex items-start gap-3 p-4">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/15"
                >
                  {initials(u.name)}
                </span>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{u.name}</p>
                    <RoleBadge role={u.role} />
                  </div>
                  <p className="flex items-center gap-1.5 break-all text-xs text-muted-foreground">
                    <Mail aria-hidden className="h-3 w-3 shrink-0" />
                    {u.email}
                  </p>
                  {u.phone ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone aria-hidden className="h-3 w-3 shrink-0" />
                      {u.phone}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                    <StatusDot status={u.status} />
                    {u.linkedName ? (
                      <span className="text-xs text-muted-foreground">
                        {t("settings.linkedProfile")}: {u.linkedName}
                      </span>
                    ) : null}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t("settings.created")}: {formatDate(u.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0">{rowMenu(u)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={refetch} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        title={t("settings.deleteUserTitle")}
        description={
          deleting ? t("settings.deleteUserDesc", { name: deleting.name, email: deleting.email }) : undefined
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={deleteUser}
      />
    </div>
  )
}

/* --------------------------------- Account --------------------------------- */

/** One password input with its own visibility toggle, all wired to one flag. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggleShow,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  show: boolean
  onToggleShow: () => void
  hint?: string
}) {
  const { t } = useLanguage()
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? t("settings.hidePasswords") : t("settings.showPasswords")}
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** Live requirement checklist — replaces validating only on submit. */
function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      <span
        aria-hidden
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors",
          ok ? "bg-emerald-100 text-emerald-700" : "bg-paper-shade text-muted-foreground/60"
        )}
      >
        {ok ? <Check className="h-2.5 w-2.5" /> : <Circle className="h-1.5 w-1.5 fill-current" />}
      </span>
      <span className={ok ? "text-emerald-700" : "text-muted-foreground"}>{label}</span>
    </li>
  )
}

function ChangePasswordCard({ t }: { t: TranslateFn }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [pending, setPending] = useState(false)

  const longEnough = next.length >= PASSWORD_MIN
  const matches = next.length > 0 && next === confirm
  const canSubmit = current.length > 0 && longEnough && matches && !pending

  const submit = async () => {
    if (!current || !next) {
      toast.error(t("settings.fillBoth"))
      return
    }
    if (!longEnough) {
      toast.error(t("settings.newPasswordMinToast"))
      return
    }
    if (!matches) {
      toast.error(t("settings.mismatch"))
      return
    }
    setPending(true)
    try {
      await apiSend("POST", "/api/auth/change-password", {
        currentPassword: current,
        newPassword: next,
      })
      toast.success(t("settings.passwordChanged"))
      setCurrent("")
      setNext("")
      setConfirm("")
      setShow(false)
    } catch (e) {
      toast.error(errorMessage(e, t("settings.genericError")))
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionCard
      title={t("settings.changePassword")}
      description={t("settings.changePasswordDesc")}
      icon={KeyRound}
      delay={60}
    >
      <div className="space-y-4">
        <PasswordField
          id="pw-current"
          label={t("settings.currentPassword")}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          show={show}
          onToggleShow={() => setShow((s) => !s)}
        />
        <PasswordField
          id="pw-new"
          label={t("settings.newPassword")}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          show={show}
          onToggleShow={() => setShow((s) => !s)}
          hint={t("settings.passwordRule")}
        />
        <PasswordField
          id="pw-confirm"
          label={t("settings.confirmPassword")}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          show={show}
          onToggleShow={() => setShow((s) => !s)}
        />

        {/* Only appears once there is something to check. */}
        {next.length > 0 ? (
          <ul className="space-y-1.5 rounded-lg bg-paper-shade/60 p-3 ring-1 ring-border/60">
            <Requirement ok={longEnough} label={t("settings.passwordMinShort")} />
            <Requirement ok={matches} label={t("settings.reqMatch")} />
          </ul>
        ) : null}

        <Button className="cursor-pointer" onClick={() => void submit()} disabled={!canSubmit}>
          <KeyRound className="h-4 w-4" />
          {pending ? t("common.saving") : t("settings.updatePassword")}
        </Button>
      </div>
    </SectionCard>
  )
}

function AccountTab({ user, t }: { user: SessionUser; t: TranslateFn }) {
  const linked = user.lawyerProfile?.name ?? user.clientProfile?.name ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Credential card — the chamber's own ID for the signed-in account. */}
      <section className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
        <div className="u-forest u-engrave u-bloom relative px-5 pb-6 pt-6">
          <div className="relative flex items-center gap-4">
            <span
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold text-emerald-50 ring-1 ring-inset ring-white/25"
            >
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="u-eyebrow text-brass">{statusLabel(user.role, t)}</p>
              <p className="mt-1.5 truncate font-serif text-xl font-semibold leading-tight text-white">
                {user.name}
              </p>
            </div>
          </div>
        </div>

        <span aria-hidden className="u-rule block" />

        <dl className="divide-y divide-border/60">
          <InfoRow icon={Mail} label={t("common.email")}>
            {user.email}
          </InfoRow>
          <InfoRow icon={Phone} label={t("common.phone")}>
            {user.phone ?? "—"}
          </InfoRow>
          <InfoRow icon={IdCard} label={t("settings.role")}>
            <RoleBadge role={user.role} />
          </InfoRow>
          <InfoRow icon={ShieldCheck} label={t("common.status")}>
            <StatusDot status={user.status} />
          </InfoRow>
          {linked ? (
            <InfoRow icon={Users} label={t("settings.linkedProfile")}>
              {linked}
            </InfoRow>
          ) : null}
        </dl>
      </section>

      <ChangePasswordCard t={t} />
    </div>
  )
}

/* ------------------------------ System info tab ------------------------------ */

/** Product names — deliberately not translated. */
const TECH_STACK = [
  "Next.js 16",
  "TypeScript",
  "Tailwind CSS",
  "shadcn/ui",
  "Prisma + PostgreSQL",
  "JWT session auth",
  "Local file storage",
]

const BD_MODULE_KEYS = [
  "settings.moduleCourts",
  "settings.moduleDocuments",
  "settings.moduleReminders",
  "settings.modulePayments",
  "settings.moduleBilling",
  "settings.moduleRoles",
]

function SystemInfoTab({ t }: { t: TranslateFn }) {
  return (
    <div className="space-y-6">
      {/* Brand panel — the same forest/engrave treatment as the sign-in screen. */}
      <section className="u-rise u-forest u-engrave u-bloom relative overflow-hidden rounded-xl border border-forest-deep/40 p-6 shadow-lift">
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-50 ring-1 ring-inset ring-white/25"
          >
            <Scale className="h-6 w-6" />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="u-eyebrow text-brass">{t("settings.about")}</p>
            <p className="font-serif text-xl font-semibold leading-tight text-white">
              <span className="u-wordmark">AinSheba</span>{" "}
              <span className="text-emerald-100/70">আইনসেবা</span>
            </p>
            <p className="max-w-prose text-sm leading-relaxed text-emerald-50/80">
              {t("settings.aboutDesc")}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-50 ring-1 ring-inset ring-white/20">
              MVP v1.0
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title={t("settings.technology")}
          description={t("settings.techDesc")}
          icon={Layers}
          delay={60}
        >
          <ul className="flex flex-wrap gap-2">
            {TECH_STACK.map((item) => (
              <li
                key={item}
                className="rounded-md bg-paper-shade px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/70"
              >
                {item}
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          title={t("settings.bdModules")}
          description={t("settings.bdModulesDesc")}
          icon={MapPin}
          accent
          delay={120}
        >
          <ul className="space-y-2.5">
            {BD_MODULE_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15"
                >
                  <Check className="h-3 w-3" />
                </span>
                {t(key)}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  )
}

/* ---------------------------- SMS/Email bridge (ADMIN) ---------------------------- */

const OUTBOUND_EVENTS: OutboundEventKey[] = [
  "HEARING_TODAY",
  "HEARING_TOMORROW",
  "HEARING_SCHEDULED",
  "HEARING_UPDATED",
  "INVOICE_ISSUED",
  "INVOICE_OVERDUE",
  "PAYMENT_RECEIVED",
]

const OUTBOUND_STATUSES = ["PENDING", "SENT", "SIMULATED", "FAILED"] as const

const OUTBOUND_STATUS_CLASSES: Record<string, string> = {
  SENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SIMULATED: "border-amber-200 bg-amber-50 text-amber-700",
  FAILED: "border-rose-200 bg-rose-50 text-rose-700",
  PENDING: "border-stone-200 bg-stone-50 text-stone-600",
}

const CHANNEL_CLASSES: Record<string, string> = {
  SMS: "border-emerald-200 bg-emerald-50 text-emerald-700",
  EMAIL: "border-teal-200 bg-teal-50 text-teal-700",
}

function OutboxStatusBadge({ status }: { status: string }) {
  const { t } = useLanguage()
  return (
    <Badge
      variant="outline"
      className={cn("border", OUTBOUND_STATUS_CLASSES[status] ?? OUTBOUND_STATUS_CLASSES.PENDING)}
    >
      {statusLabel(status, t)}
    </Badge>
  )
}

function OutboxChannelBadge({ channel }: { channel: string }) {
  const { t } = useLanguage()
  return (
    <Badge
      variant="outline"
      className={cn("border text-[10px]", CHANNEL_CLASSES[channel] ?? CHANNEL_CLASSES.SMS)}
    >
      {t(`settings.outbox.channel.${channel}`)}
    </Badge>
  )
}

function ProviderStatusBadge({ mode }: { mode: "live" | "simulated" }) {
  const { t } = useLanguage()
  return (
    <Badge
      variant="outline"
      className={cn(
        "border",
        mode === "live"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      )}
    >
      {mode === "live" ? t("settings.outbox.live") : t("settings.outbox.simulated")}
    </Badge>
  )
}

/** Gateway panel: provider mode, what that means, and the master switch. */
function GatewayCard({
  title,
  icon: Icon,
  tone,
  mode,
  hint,
  switchId,
  switchLabel,
  checked,
  disabled,
  onCheckedChange,
  delay,
}: {
  title: string
  icon: typeof Mail
  tone: string
  mode: "live" | "simulated"
  hint: string
  switchId: string
  switchLabel: string
  checked: boolean
  disabled: boolean
  onCheckedChange: (v: boolean) => void
  delay: number
}) {
  return (
    <SectionCard title={title} icon={Icon} delay={delay}>
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg ring-1", tone)}>
            <Icon className="h-[1.15rem] w-[1.15rem]" />
          </span>
          <ProviderStatusBadge mode={mode} />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{hint}</p>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-paper-shade/40 px-3 py-2.5">
          <Label htmlFor={switchId} className="cursor-pointer text-sm font-medium">
            {switchLabel}
          </Label>
          <Switch
            id={switchId}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onCheckedChange}
            className="cursor-pointer"
          />
        </div>
      </div>
    </SectionCard>
  )
}

function OutbridgePanel() {
  const { t } = useLanguage()

  // Outbox filters — every change re-queries GET /api/outbound with query params.
  const [channel, setChannel] = useState("ALL")
  const [status, setStatus] = useState("ALL")
  const [search, setSearch] = useState("")

  const path = useMemo(() => {
    const params = new URLSearchParams()
    if (channel !== "ALL") params.set("channel", channel)
    if (status !== "ALL") params.set("status", status)
    if (search.trim()) params.set("q", search.trim())
    const qs = params.toString()
    return `/api/outbound${qs ? `?${qs}` : ""}`
  }, [channel, status, search])

  const { data, loading, error, refetch } = useApiData<OutboundListDTO>(path)

  // Optimistic bridge settings: the override is displayed until fresh server
  // data (by reference) replaces it — no state sync needed.
  const [override, setOverride] = useState<{ value: OutboundSettingsDTO; base: OutboundSettingsDTO | null } | null>(
    null
  )
  const serverSettings = data?.settings ?? null
  const settings = override && override.base === serverSettings ? override.value : serverSettings

  const [sweeping, setSweeping] = useState(false)
  const [retryingId, setRetryId] = useState<string | null>(null)

  const patchSettings = async (next: OutboundSettingsDTO) => {
    if (!settings) return
    setOverride({ value: next, base: serverSettings }) // optimistic
    try {
      await apiSend<OutboundSettingsDTO>("PATCH", "/api/settings/outbound", next)
      toast.success(t("settings.outbox.savedToast"))
      refetch() // confirm with server truth
    } catch (e) {
      setOverride(null) // revert to server state
      toast.error(errorMessage(e, t("settings.outbox.saveFailedToast")))
    }
  }

  const runSweep = async () => {
    setSweeping(true)
    try {
      const res = await apiSend<ReminderSweepResult>("POST", "/api/outbound/sweep")
      toast.success(
        t("settings.outbox.sweepToast", {
          today: res?.today?.hearings ?? 0,
          tomorrow: res?.tomorrow?.hearings ?? 0,
        })
      )
      refetch()
    } catch (e) {
      toast.error(errorMessage(e, t("settings.outbox.sweepFailed")))
    } finally {
      setSweeping(false)
    }
  }

  const retryMessage = async (m: OutboundMessageDTO) => {
    setRetryId(m.id)
    try {
      const res = await apiSend<OutboundRetryResult>("POST", `/api/outbound/${m.id}/retry`)
      if (res?.ok) {
        toast.success(t("settings.outbox.retryQueued", { status: statusLabel(res.status ?? "SENT", t) }))
      } else {
        toast.error(res?.error || t("settings.outbox.retryFailed"))
      }
      refetch()
    } catch (e) {
      toast.error(errorMessage(e, t("settings.outbox.retryFailed")))
    } finally {
      setRetryId(null)
    }
  }

  const messages = data?.items ?? []
  const stats = data?.stats ?? {}
  const hasActiveFilters = channel !== "ALL" || status !== "ALL" || search.trim() !== ""
  const searching = search.trim().length > 0

  const providerHint = (kind: "sms" | "email") => {
    const live = data?.providers?.[kind] === "live"
    return live
      ? t("settings.outbox.liveHint")
      : t(kind === "sms" ? "settings.outbox.simulatedHintSms" : "settings.outbox.simulatedHintEmail")
  }

  const retryable = (m: OutboundMessageDTO) => m.status === "FAILED" || m.status === "SIMULATED"

  const retryButton = (m: OutboundMessageDTO) =>
    retryable(m) ? (
      <Button
        variant="outline"
        size="sm"
        className="h-8 cursor-pointer gap-1 px-2 text-xs"
        disabled={retryingId === m.id}
        onClick={() => void retryMessage(m)}
      >
        <RotateCcw className={cn("h-3 w-3", retryingId === m.id && "animate-spin")} />
        {t("settings.outbox.retry")}
      </Button>
    ) : null

  return (
    <div className="space-y-6">
      {/* Provider status + master toggles */}
      <div className="grid gap-6 lg:grid-cols-2">
        <GatewayCard
          title={t("settings.outbox.smsGateway")}
          icon={MessageSquareText}
          tone="bg-emerald-50 text-emerald-700 ring-emerald-600/15"
          mode={data?.providers?.sms ?? "simulated"}
          hint={providerHint("sms")}
          switchId="outbound-sms-enabled"
          switchLabel={t("settings.outbox.smsEnabled")}
          checked={settings?.smsEnabled ?? false}
          disabled={!settings}
          onCheckedChange={(v) => settings && void patchSettings({ ...settings, smsEnabled: v })}
          delay={0}
        />
        <GatewayCard
          title={t("settings.outbox.emailGateway")}
          icon={Mail}
          tone="bg-teal-50 text-teal-700 ring-teal-600/15"
          mode={data?.providers?.email ?? "simulated"}
          hint={providerHint("email")}
          switchId="outbound-email-enabled"
          switchLabel={t("settings.outbox.emailEnabled")}
          checked={settings?.emailEnabled ?? false}
          disabled={!settings}
          onCheckedChange={(v) => settings && void patchSettings({ ...settings, emailEnabled: v })}
          delay={60}
        />
      </div>

      {/* Event toggles */}
      <SectionCard
        title={t("settings.outbox.eventsTitle")}
        description={t("settings.outbox.eventsDesc")}
        icon={Settings2}
        delay={120}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OUTBOUND_EVENTS.map((event) => (
            <div
              key={event}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-paper-shade/40 px-3 py-2.5 transition-colors hover:border-emerald-600/25"
            >
              <Label htmlFor={`outbound-event-${event}`} className="cursor-pointer text-sm font-normal">
                {t(`settings.outbox.event.${event}`)}
              </Label>
              <Switch
                id={`outbound-event-${event}`}
                checked={settings?.events?.[event] ?? false}
                disabled={!settings}
                className="cursor-pointer"
                onCheckedChange={(v) =>
                  settings && void patchSettings({ ...settings, events: { ...settings.events, [event]: v } })
                }
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Outbox */}
      <SectionCard
        title={t("settings.outbox.outboxTitle")}
        description={t("settings.outbox.outboxDesc")}
        icon={MessageSquareText}
        delay={180}
        action={
          <Button
            size="sm"
            className="cursor-pointer gap-1.5"
            onClick={() => void runSweep()}
            disabled={sweeping}
          >
            <RefreshCw className={cn("h-4 w-4", sweeping && "animate-spin")} />
            <span className="hidden sm:inline">
              {sweeping ? t("common.loading") : t("settings.outbox.sweep")}
            </span>
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Per-status counters double as the status filter. */}
          <div
            role="group"
            aria-label={t("settings.outbox.statsAria")}
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5"
          >
            {OUTBOUND_STATUSES.map((s) => {
              const active = status === s
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatus(active ? "ALL" : s)}
                  className={cn(
                    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    OUTBOUND_STATUS_CLASSES[s],
                    active ? "ring-2 ring-ring/40" : "opacity-80 hover:opacity-100"
                  )}
                >
                  {statusLabel(s, t)}
                  <span className="font-bold tabular-nums">{stats[s] ?? 0}</span>
                </button>
              )
            })}
          </div>

          {/* Outbox filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-full sm:w-40" aria-label={t("settings.outbox.channelAll")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("settings.outbox.channelAll")}</SelectItem>
                <SelectItem value="SMS">{t("settings.outbox.channel.SMS")}</SelectItem>
                <SelectItem value="EMAIL">{t("settings.outbox.channel.EMAIL")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-40" aria-label={t("settings.outbox.statusAll")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("settings.outbox.statusAll")}</SelectItem>
                {OUTBOUND_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search
                aria-hidden
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("settings.outbox.searchPlaceholder")}
                aria-label={t("settings.outbox.searchPlaceholder")}
                className="pl-9 pr-9"
              />
              {searching ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label={t("settings.clearSearch")}
                  className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {loading && !data ? (
            <LoadingBlock rows={4} tiles={0} panels={1} />
          ) : error && !data ? (
            <EmptyState
              icon={AlertTriangle}
              title={t("settings.outbox.errLoad")}
              description={error}
              action={
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : messages.length === 0 ? (
            <EmptyState
              variant="inline"
              icon={MessageSquareText}
              title={hasActiveFilters ? t("settings.outbox.emptyFiltered") : t("settings.outbox.empty")}
              description={
                hasActiveFilters ? t("settings.outbox.emptyFilteredDesc") : t("settings.outbox.emptyDesc")
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70">
              {/* Desktop: the delivery log, header pinned while scanning. */}
              <div className="hidden max-h-[30rem] overflow-auto lg:block">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--color-border)]">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-nowrap pl-4">{t("settings.outbox.colTime")}</TableHead>
                      <TableHead>{t("settings.outbox.colChannel")}</TableHead>
                      <TableHead>{t("settings.outbox.colRecipient")}</TableHead>
                      <TableHead>{t("settings.outbox.colEvent")}</TableHead>
                      <TableHead>{t("settings.outbox.colCase")}</TableHead>
                      <TableHead>{t("settings.outbox.colStatus")}</TableHead>
                      <TableHead className="min-w-32">{t("settings.outbox.colError")}</TableHead>
                      <TableHead className="w-24 pr-4 text-right">{t("common.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map((m) => (
                      <TableRow
                        key={m.id}
                        className="border-border/60 transition-colors hover:bg-paper-shade/70"
                      >
                        <TableCell className="whitespace-nowrap pl-4 text-sm tabular-nums text-muted-foreground">
                          {formatDateTime(m.createdAt)}
                        </TableCell>
                        <TableCell>
                          <OutboxChannelBadge channel={m.channel} />
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-ink">{m.recipientName ?? m.recipient}</p>
                          {m.recipientName ? (
                            <p className="text-xs text-muted-foreground">{m.recipient}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <span className="rounded-md bg-paper-shade px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border/70">
                            {m.event}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{m.caseNumber ?? "—"}</TableCell>
                        <TableCell>
                          <OutboxStatusBadge status={m.status} />
                        </TableCell>
                        <TableCell className="max-w-40">
                          {m.error ? (
                            <p className="truncate text-xs text-rose-600" title={m.error}>
                              {m.error}
                            </p>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 text-right">{retryButton(m)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile / tablet: one card per message. */}
              <ul className="divide-y divide-border/60 lg:hidden">
                {messages.map((m) => (
                  <li key={m.id} className="space-y-2 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <OutboxChannelBadge channel={m.channel} />
                      <OutboxStatusBadge status={m.status} />
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(m.createdAt)}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {m.recipientName ?? m.recipient}
                      </p>
                      {m.recipientName ? (
                        <p className="break-all text-xs text-muted-foreground">{m.recipient}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-paper-shade px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border/70">
                        {m.event}
                      </span>
                      {m.caseNumber ? (
                        <span className="text-xs text-muted-foreground">{m.caseNumber}</span>
                      ) : null}
                    </div>

                    {m.error ? <p className="text-xs leading-relaxed text-rose-600">{m.error}</p> : null}

                    {retryable(m) ? <div>{retryButton(m)}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

/* --------------------------------- View --------------------------------- */

export default function SettingsView({ user, navigate, params }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"

  // The open tab lives in the URL (/users, /profile, /settings?tab=system)
  // so it survives a refresh and can be linked to.
  const tabs = useMemo(
    () =>
      [
        ...(isAdmin
          ? [{ value: "users", label: t("settings.userManagement"), icon: Users }]
          : []),
        { value: "account", label: t("settings.myAccount"), icon: IdCard },
        { value: "system", label: t("settings.systemInfo"), icon: Scale },
        ...(isAdmin ? [{ value: "bridge", label: t("settings.outbox.tab"), icon: MessageSquareText }] : []),
      ],
    [isAdmin, t]
  )

  const fallbackTab = isAdmin ? "users" : "account"
  const requested = params.tab ?? ""
  const tab = tabs.some((it) => it.value === requested) ? requested : fallbackTab
  const changeTab = (value: string) => navigate("settings", { tab: value })

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs value={tab} onValueChange={changeTab} className="gap-0">
        <div
          role="group"
          aria-label={t("settings.tabsAria")}
          className="-mx-1 flex overflow-x-auto px-1 pb-0.5"
        >
          <TabsList className="inline-flex h-auto w-fit gap-1 rounded-lg bg-paper-shade p-1 ring-1 ring-border/70">
            {tabs.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  "flex flex-none shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
                  "text-muted-foreground hover:bg-card hover:text-foreground",
                  "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-soft"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {isAdmin ? (
          <TabsContent value="users" className="mt-5">
            <UsersPanel />
          </TabsContent>
        ) : null}

        <TabsContent value="account" className="mt-5">
          <AccountTab user={user} t={t} />
        </TabsContent>

        <TabsContent value="system" className="mt-5">
          <SystemInfoTab t={t} />
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="bridge" className="mt-5">
            <OutbridgePanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
