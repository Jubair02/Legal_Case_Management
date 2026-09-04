"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Cloud,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Trash2,
  Users,
} from "lucide-react"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { apiSend } from "@/lib/api-client"
import { CLIENT_TYPES, CLIENT_TYPE_LABELS } from "@/lib/constants"
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

type NavigateFn = (view: ViewKey, params?: ViewParams) => void

/** GET /api/clients/[id] payload: ClientDTO + cases (+ invoices for ADMIN). */
interface ClientDetailResponse extends ClientDTO {
  cases: CaseListDTO[]
  invoices?: InvoiceDTO[]
}

const AVATAR_TINT: Record<string, string> = {
  INDIVIDUAL: "bg-stone-200 text-stone-700",
  COMPANY: "bg-emerald-100 text-emerald-700",
  ORGANIZATION: "bg-teal-100 text-teal-700",
}

/* ------------------------------ Client detail ------------------------------ */

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

  const { data, loading, error, refetch } = useApiData<ClientDetailResponse>(
    open && clientId ? `/api/clients/${clientId}` : null
  )
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const client = data
  const cases = client?.cases ?? []
  const invoices = client?.invoices ?? []

  const handleDelete = async () => {
    if (!client) return
    await apiSend("DELETE", `/api/clients/${client.id}`)
    toast.success(`${client.name} deleted.`)
    onChanged()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Client details</DialogTitle>
            <DialogDescription>Profile, cases and portal information.</DialogDescription>
          </DialogHeader>

          {loading && !client ? (
            <div className="space-y-3 py-4" aria-busy="true">
              <div className="h-14 w-full animate-pulse rounded-lg bg-stone-100" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-stone-100" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-stone-100" />
            </div>
          ) : error && !client ? (
            <div className="py-4">
              <EmptyState
                icon={Users}
                title="Could not load this client"
                description={error}
                action={
                  <Button variant="outline" size="sm" onClick={refetch}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : client ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className={cn("text-base font-semibold", AVATAR_TINT[client.clientType ?? "INDIVIDUAL"] ?? AVATAR_TINT.INDIVIDUAL)}>
                    {initials(client.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold tracking-tight">{client.name}</p>
                    <StatusBadge map={clientTypeStyles} value={client.clientType} />
                    {client.portalEmail ? (
                      <Badge variant="outline" className="gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Cloud className="h-3 w-3" /> Portal
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Client since {formatDate(client.createdAt)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200/80 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                  <p className="mt-0.5 text-sm">{client.phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="mt-0.5 truncate text-sm">{client.email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">NID</p>
                  <p className="mt-0.5 font-mono text-sm">{client.nid ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Portal account</p>
                  <p className="mt-0.5 truncate text-sm">{client.portalEmail ?? "No portal access"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</p>
                  <p className="mt-0.5 text-sm">{client.address ?? "—"}</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">
                  Cases <span className="font-normal text-muted-foreground">({cases.length})</span>
                </p>
                {cases.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-200 py-4 text-center text-xs text-muted-foreground">
                    No cases for this client yet.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/80">
                    {cases.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          onOpenChange(false)
                          navigate("case-detail", { id: c.id })
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-emerald-50/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{c.caseNumber}</p>
                          <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge map={caseStatusStyles} value={c.status} />
                          <span className="text-[11px] text-muted-foreground">
                            {c.nextHearingDate ? `Hearing ${formatRelativeDay(c.nextHearingDate)}` : "No hearing set"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isAdmin ? (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                    <Receipt className="h-4 w-4 text-emerald-600" /> Invoices{" "}
                    <span className="font-normal text-muted-foreground">({invoices.length})</span>
                  </p>
                  {invoices.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-stone-200 py-4 text-center text-xs text-muted-foreground">
                      No invoices for this client.
                    </p>
                  ) : (
                    <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/80">
                      {invoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{inv.invoiceNumber}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {inv.caseNumber ? `${inv.caseNumber} · ` : ""}Due {formatDate(inv.dueDate)}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-sm font-semibold">{formatCurrency(inv.amount)}</span>
                            <StatusBadge map={invoiceStatusStyles} value={inv.status} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {client && isAdmin ? (
              <Button
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
            {client && canManage ? (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
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
        title="Delete this client?"
        description={`${client?.name ?? "This client"} will be removed permanently. Clients with linked cases or invoices cannot be deleted.`}
        confirmLabel="Delete client"
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
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [nid, setNid] = useState("")
  const [address, setAddress] = useState("")
  const [clientType, setClientType] = useState("INDIVIDUAL")
  const [portal, setPortal] = useState(false)
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(client?.name ?? "")
    setPhone(client?.phone ?? "")
    setEmail(client?.email ?? "")
    setNid(client?.nid ?? "")
    setAddress(client?.address ?? "")
    setClientType(client?.clientType && CLIENT_TYPE_LABELS[client.clientType] ? client.clientType : "INDIVIDUAL")
    setPortal(false)
    setPassword("")
    setPending(false)
  }, [open, client])

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Client name is required.")
      return
    }
    if (!isEdit && portal) {
      if (!email.trim()) {
        toast.error("Email is required to create a portal account.")
        return
      }
      if (password.length < 6) {
        toast.error("Portal password must be at least 6 characters.")
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
        toast.success("Client updated.")
      } else {
        await apiSend<ClientDTO>("POST", "/api/clients", {
          ...payload,
          ...(portal ? { createPortalAccess: true, password } : {}),
        })
        toast.success(portal ? "Client created with portal access." : "Client created.")
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the client.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit client" : "Add client"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the client's contact details." : "Register an individual, company or organization you represent."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-name">
              Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="client-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Abdul Karim or Karim Traders Ltd."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Phone</Label>
              <Input id="client-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input id="client-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-nid">NID</Label>
              <Input id="client-nid" value={nid} onChange={(e) => setNid(e.target.value)} placeholder="National ID number" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-type">Client type</Label>
              <Select value={clientType} onValueChange={setClientType}>
                <SelectTrigger id="client-type" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CLIENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-address">Address</Label>
            <Textarea
              id="client-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="House, road, area, district"
              rows={2}
            />
          </div>

          {!isEdit ? (
            <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="client-portal">Create client portal account</Label>
                  <p className="text-xs text-muted-foreground">Client signs in with their email + this password</p>
                </div>
                <Switch id="client-portal" checked={portal} onCheckedChange={setPortal} />
              </div>
              {portal ? (
                <div className="space-y-1.5">
                  <Label htmlFor="client-portal-password">Portal password</Label>
                  <Input
                    id="client-portal-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">Minimum 6 characters.</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function ClientsView({ user, navigate }: ViewProps) {
  const isAdmin = user.role === "ADMIN"
  const canManage = isAdmin || user.role === "STAFF"

  const { data, loading, error, refetch } = useApiData<ClientDTO[]>("/api/clients")

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const clients = useMemo(() => data ?? [], [data])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (typeFilter !== "ALL" && (c.clientType ?? "INDIVIDUAL") !== typeFilter) return false
      if (!q) return true
      return [c.name, c.phone, c.email, c.nid, c.address].some((v) => (v ?? "").toLowerCase().includes(q))
    })
  }, [clients, search, typeFilter])

  return (
    <div className="space-y-6">
      <PageHeader title="Clients" description="Manage individuals, companies and organizations you represent.">
        {canManage ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add Client
          </Button>
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, NID…"
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {CLIENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {CLIENT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <EmptyState
          icon={Users}
          title="Could not load clients"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : clients.length === 0 ? (
        <EmptyState icon={Users} title="No clients yet" description="Add your first client to start opening cases." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No clients match" description="Try a different search term or type filter." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card
              key={c.id}
              onClick={() => setDetailId(c.id)}
              className="cursor-pointer gap-3 border-stone-200/80 py-4 transition-colors hover:border-emerald-300 hover:shadow-sm"
            >
              <CardHeader className="px-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback
                      className={cn("text-sm font-semibold", AVATAR_TINT[c.clientType ?? "INDIVIDUAL"] ?? AVATAR_TINT.INDIVIDUAL)}
                    >
                      {initials(c.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{c.name}</p>
                    <div className="mt-1.5">
                      <StatusBadge map={clientTypeStyles} value={c.clientType} />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 px-4 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate text-muted-foreground">{c.phone ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate text-muted-foreground">{c.email ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <IdCard className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate text-muted-foreground">NID: {c.nid ?? "—"}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="line-clamp-2 text-xs text-muted-foreground">{c.address ?? "—"}</span>
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-2 border-t border-stone-100 px-4 pt-3 text-xs text-muted-foreground">
                <span>
                  {c.caseCount} case{c.caseCount === 1 ? "" : "s"} · {c.activeCaseCount} active
                </span>
                {c.portalEmail ? (
                  <Badge variant="outline" className="gap-1 border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <Cloud className="h-3 w-3" /> Portal
                  </Badge>
                ) : null}
              </CardFooter>
            </Card>
          ))}
        </div>
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
