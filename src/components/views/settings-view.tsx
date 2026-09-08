"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Phone,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { useApiData } from "@/hooks/use-api-data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { apiGet, apiSend } from "@/lib/api-client"
import { ROLES, ROLE_LABELS } from "@/lib/constants"
import { statusLabel, useLanguage } from "@/lib/i18n/language"
import type {
  OutboundEventKey,
  OutboundListDTO,
  OutboundMessageDTO,
  OutboundRetryResult,
  OutboundSettingsDTO,
  ReminderSweepResult,
  UserDTO,
  ViewProps,
} from "@/lib/types"
import { cn, formatDate, formatDateTime, initials } from "@/lib/utils"
import { isValidEmail } from "@/lib/validation"

const ALL = "ALL"

const ROLE_BADGE_CLASSES: Record<string, string> = {
  ADMIN: "border-emerald-200 bg-emerald-50 text-emerald-700",
  LAWYER: "border-stone-200 bg-stone-50 text-stone-600",
  CLIENT: "border-stone-200 bg-stone-50 text-stone-600",
  STAFF: "border-stone-200 bg-stone-50 text-stone-600",
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
        className={cn("h-2 w-2 rounded-full", active ? "bg-emerald-500" : "bg-stone-400")}
        aria-hidden="true"
      />
      <span className={active ? "text-emerald-700" : "text-stone-500"}>
        {active ? t("status.active") : t("status.inactive")}
      </span>
    </span>
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

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "")
      setEmail(editing?.email ?? "")
      setPassword("")
      setPhone(editing?.phone ?? "")
      setRole(editing?.role ?? "CLIENT")
      setStatus(editing?.status ?? "ACTIVE")
    }
  }, [open, editing])

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t("settings.nameRequired"))
      return
    }
    if (!isEdit) {
      if (!isValidEmail(email)) {
        toast.error(t("settings.emailInvalid"))
        return
      }
      if (password.length < 6) {
        toast.error(t("settings.passwordMinToast"))
        return
      }
    }
    if (isEdit && password && password.length < 6) {
      toast.error(t("settings.newPasswordMinToast"))
      return
    }
    setPending(true)
    try {
      if (isEdit && editing) {
        await apiSend("PATCH", `/api/users/${editing.id}`, {
          name: name.trim(),
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("settings.editUser") : t("settings.addUser")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("settings.editUserDesc") : t("settings.addUserDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">{t("common.name")} *</Label>
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("common.name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-email">{t("common.email")} *</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                disabled={isEdit}
              />
              {isEdit ? <p className="text-xs text-muted-foreground">{t("settings.emailFixed")}</p> : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-password">{isEdit ? t("settings.newPassword") : `${t("settings.password")} *`}</Label>
              <Input
                id="user-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("settings.role")} *</Label>
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
                    <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                    <SelectItem value="INACTIVE">{t("status.inactive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
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
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserDTO | null>(null)
  const [deleting, setDeleting] = useState<UserDTO | null>(null)

  const list = useMemo(() => data ?? [], [data])
  const filtered = useMemo(() => {
    let rows = list
    if (roleFilter !== ALL) rows = rows.filter((u) => u.role === roleFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.phone ?? "").includes(q)
      )
    }
    return rows
  }, [list, roleFilter, search])

  const deleteUser = async () => {
    if (!deleting) return
    await apiSend("DELETE", `/api/users/${deleting.id}`)
    toast.success(t("settings.userDeleted"))
    refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("settings.searchUsers")}
            aria-label={t("settings.searchUsers")}
            className="pl-8"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t("settings.allRoles")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("settings.allRoles")}</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <UserPlus className="h-4 w-4" /> {t("settings.addUser")}
        </Button>
      </div>

      {loading && !data ? (
        <LoadingBlock rows={5} />
      ) : error && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("settings.loadFailed")}
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm">
          {filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title={list.length === 0 ? t("settings.noUsers") : t("settings.noUsersFiltered")}
                description={
                  list.length === 0
                    ? t("settings.noUsersDesc")
                    : t("settings.noUsersFilteredDesc")
                }
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("settings.user")}</TableHead>
                  <TableHead>{t("common.email")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead>{t("settings.role")}</TableHead>
                  <TableHead>{t("settings.linkedProfile")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("settings.created")}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-700">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        {u.email}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          {u.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.linkedName ?? "—"}</TableCell>
                    <TableCell>
                      <StatusDot status={u.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="User actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(u)
                              setFormOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-rose-600 focus:text-rose-600"
                            onSelect={() => setDeleting(u)}
                          >
                            <Trash2 className="h-4 w-4" /> {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} onSaved={refetch} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) setDeleting(null)
        }}
        title={t("settings.deleteUserTitle")}
        description={
          deleting
            ? t("settings.deleteUserDesc", {
                name: deleting.name,
                email: deleting.email,
              })
            : undefined
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={deleteUser}
      />
    </div>
  )
}

/* ------------------------------ System info tab ------------------------------ */

const TECH_STACK = [
  "Next.js 16",
  "TypeScript",
  "Tailwind CSS",
  "shadcn/ui",
  "Prisma + SQLite",
  "JWT session auth",
  "Local file storage",
]

const BD_MODULES = [
  "Bangladesh case types & courts",
  "Vakalatnama & legal documents",
  "Hearing reminders (in-app)",
  "bKash/Nagad/Rocket payments",
  "৳ BDT billing",
  "Role-based access: Admin/Lawyer/Staff/Client",
]

function SystemInfoTab({ user }: { user: ViewProps["user"] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="About">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Scale className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <p className="font-semibold tracking-tight">
              AinSheba <span className="text-muted-foreground">আইনসেবা</span> — MVP v1.0
            </p>
            <p className="text-sm text-muted-foreground">
              Legal Case Management for Bangladesh. Manage cases, hearings, documents, billing and client
              communication in one place — built for chambers in Dhaka and beyond.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Your Session" description="Currently signed-in portal account">
        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{user.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="inline-flex items-center gap-1.5 font-medium">
              <Mail className="h-3.5 w-3.5" /> {user.email}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <RoleBadge role={user.role} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="inline-flex items-center gap-1.5 font-medium">
              <Phone className="h-3.5 w-3.5" /> {user.phone ?? "—"}
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Technology" description="Built on a modern, type-safe stack">
        <div className="flex flex-wrap gap-2">
          {TECH_STACK.map((t) => (
            <Badge key={t} variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
              {t}
            </Badge>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Bangladesh Modules" description="Localised for chambers in Bangladesh">
        <ul className="space-y-2.5">
          {BD_MODULES.map((m) => (
            <li key={m} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check className="h-3 w-3" />
              </span>
              {m}
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  )
}

/* ---------------------------- Change password ---------------------------- */

function ChangePasswordCard() {
  const { t } = useLanguage()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [pending, setPending] = useState(false)

  const submit = async () => {
    if (!current || !next) {
      toast.error(t("settings.fillBoth"))
      return
    }
    if (next.length < 6) {
      toast.error(t("settings.newPasswordMinToast"))
      return
    }
    if (next !== confirm) {
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
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionCard title="Change Password" description="Update the password for your own account.">
      <div className="max-w-md space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pw-current">Current password</Label>
          <div className="relative">
            <Input
              id="pw-current"
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-new">New password</Label>
          <div className="relative">
            <Input
              id="pw-new"
              type={show ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide passwords" : "Show passwords"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">At least 6 characters, maximum 128.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-confirm">Confirm new password</Label>
          <Input
            id="pw-confirm"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button onClick={submit} disabled={pending} className="gap-2">
          <KeyRound className="h-4 w-4" />
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </SectionCard>
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
    <Badge variant="outline" className={cn("border", OUTBOUND_STATUS_CLASSES[status] ?? OUTBOUND_STATUS_CLASSES.PENDING)}>
      {statusLabel(status, t)}
    </Badge>
  )
}

function OutboxChannelBadge({ channel }: { channel: string }) {
  const { t } = useLanguage()
  return (
    <Badge variant="outline" className={cn("border text-[10px]", CHANNEL_CLASSES[channel] ?? CHANNEL_CLASSES.SMS)}>
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
        mode === "live" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"
      )}
    >
      {mode === "live" ? t("settings.outbox.live") : t("settings.outbox.simulated")}
    </Badge>
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
  const [override, setOverride] = useState<{ value: OutboundSettingsDTO; base: OutboundSettingsDTO | null } | null>(null)
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
        t("settings.outbox.sweepToast", { today: res?.today?.hearings ?? 0, tomorrow: res?.tomorrow?.hearings ?? 0 })
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

  const providerHint = (kind: "sms" | "email") => {
    const live = data?.providers?.[kind] === "live"
    return live
      ? t("settings.outbox.liveHint")
      : t(kind === "sms" ? "settings.outbox.simulatedHintSms" : "settings.outbox.simulatedHintEmail")
  }

  return (
    <div className="space-y-6">
      {/* Provider status + master toggles */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={t("settings.outbox.smsGateway")}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <MessageSquareText className="h-4.5 w-4.5" />
              </span>
              <ProviderStatusBadge mode={data?.providers?.sms ?? "simulated"} />
            </div>
            <p className="text-sm text-muted-foreground">{providerHint("sms")}</p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200/80 px-3 py-2.5">
              <Label htmlFor="outbound-sms-enabled" className="text-sm font-medium">
                {t("settings.outbox.smsEnabled")}
              </Label>
              <Switch
                id="outbound-sms-enabled"
                checked={settings?.smsEnabled ?? false}
                disabled={!settings}
                onCheckedChange={(v) => settings && void patchSettings({ ...settings, smsEnabled: v })}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("settings.outbox.emailGateway")}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                <Mail className="h-4.5 w-4.5" />
              </span>
              <ProviderStatusBadge mode={data?.providers?.email ?? "simulated"} />
            </div>
            <p className="text-sm text-muted-foreground">{providerHint("email")}</p>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-200/80 px-3 py-2.5">
              <Label htmlFor="outbound-email-enabled" className="text-sm font-medium">
                {t("settings.outbox.emailEnabled")}
              </Label>
              <Switch
                id="outbound-email-enabled"
                checked={settings?.emailEnabled ?? false}
                disabled={!settings}
                onCheckedChange={(v) => settings && void patchSettings({ ...settings, emailEnabled: v })}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Event toggles */}
      <SectionCard title={t("settings.outbox.eventsTitle")} description={t("settings.outbox.eventsDesc")}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {OUTBOUND_EVENTS.map((event) => (
            <div
              key={event}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200/80 px-3 py-2.5"
            >
              <Label htmlFor={`outbound-event-${event}`} className="text-sm font-normal">
                {t(`settings.outbox.event.${event}`)}
              </Label>
              <Switch
                id={`outbound-event-${event}`}
                checked={settings?.events?.[event] ?? false}
                disabled={!settings}
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
        action={
          <Button size="sm" onClick={() => void runSweep()} disabled={sweeping} className="gap-1.5">
            <RefreshCw className={cn("h-4 w-4", sweeping && "animate-spin")} />
            {sweeping ? t("common.loading") : t("settings.outbox.sweep")}
          </Button>
        }
      >
        <div className="space-y-4">
          {/* Per-status counters */}
          <div className="flex flex-wrap gap-2">
            {(["PENDING", "SENT", "SIMULATED", "FAILED"] as const).map((s) => (
              <Badge key={s} variant="outline" className={cn("gap-1.5 border", OUTBOUND_STATUS_CLASSES[s])}>
                {statusLabel(s, t)}
                <span className="font-semibold tabular-nums">{stats[s] ?? 0}</span>
              </Badge>
            ))}
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
                {(["PENDING", "SENT", "SIMULATED", "FAILED"] as const).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusLabel(s, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("settings.outbox.searchPlaceholder")}
                aria-label={t("settings.outbox.searchPlaceholder")}
                className="pl-8"
              />
            </div>
          </div>

          {loading && !data ? (
            <LoadingBlock rows={4} />
          ) : error && !data ? (
            <EmptyState
              icon={AlertTriangle}
              title={t("settings.outbox.errLoad")}
              description={error}
              action={
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-stone-200/80">
              <div className="max-h-96 overflow-auto">
                {messages.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={MessageSquareText}
                      title={hasActiveFilters ? t("settings.outbox.emptyFiltered") : t("settings.outbox.empty")}
                      description={
                        hasActiveFilters ? t("settings.outbox.emptyFilteredDesc") : t("settings.outbox.emptyDesc")
                      }
                    />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="whitespace-nowrap">{t("settings.outbox.colTime")}</TableHead>
                        <TableHead>{t("settings.outbox.colChannel")}</TableHead>
                        <TableHead>{t("settings.outbox.colRecipient")}</TableHead>
                        <TableHead>{t("settings.outbox.colEvent")}</TableHead>
                        <TableHead>{t("settings.outbox.colCase")}</TableHead>
                        <TableHead>{t("settings.outbox.colStatus")}</TableHead>
                        <TableHead className="min-w-32">{t("settings.outbox.colError")}</TableHead>
                        <TableHead className="w-20 text-right">{t("common.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {formatDateTime(m.createdAt)}
                          </TableCell>
                          <TableCell>
                            <OutboxChannelBadge channel={m.channel} />
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{m.recipientName ?? m.recipient}</p>
                            {m.recipientName ? (
                              <p className="text-xs text-muted-foreground">{m.recipient}</p>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="border-stone-200 bg-stone-50 font-mono text-[10px] text-stone-600">
                              {m.event}
                            </Badge>
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
                          <TableCell className="text-right">
                            {m.status === "FAILED" || m.status === "SIMULATED" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                disabled={retryingId === m.id}
                                onClick={() => void retryMessage(m)}
                              >
                                <RotateCcw className="h-3 w-3" />
                                {t("settings.outbox.retry")}
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
          )}
        </div>
      </SectionCard>
    </div>
  )
}

/* --------------------------------- View --------------------------------- */

export default function SettingsView({ user }: ViewProps) {
  const { t } = useLanguage()
  const isAdmin = user.role === "ADMIN"

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Tabs defaultValue={isAdmin ? "users" : "account"}>
        <TabsList>
          {isAdmin ? <TabsTrigger value="users">{t("settings.userManagement")}</TabsTrigger> : null}
          <TabsTrigger value="account">{t("settings.myAccount")}</TabsTrigger>
          <TabsTrigger value="system">{t("settings.systemInfo")}</TabsTrigger>
          {isAdmin ? <TabsTrigger value="bridge">{t("settings.outbox.tab")}</TabsTrigger> : null}
        </TabsList>

        {isAdmin ? (
          <TabsContent value="users" className="mt-4">
            <UsersPanel />
          </TabsContent>
        ) : null}

        <TabsContent value="account" className="mt-4">
          <ChangePasswordCard />
        </TabsContent>

        <TabsContent value="system" className="mt-4">
          <SystemInfoTab user={user} />
        </TabsContent>

        {isAdmin ? (
          <TabsContent value="bridge" className="mt-4">
            <OutbridgePanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  )
}
