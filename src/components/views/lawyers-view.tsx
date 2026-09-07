"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Building2,
  Gavel,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
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
import { apiSend } from "@/lib/api-client"
import { SPECIALIZATIONS } from "@/lib/constants"
import type {
  CaseListDTO,
  LawyerDTO,
  SessionUser,
  ViewKey,
  ViewParams,
  ViewProps,
} from "@/lib/types"
import { caseStatusStyles, formatRelativeDay, type StatusStyle } from "@/lib/utils"
import { isValidEmail } from "@/lib/validation"

type NavigateFn = (view: ViewKey, params?: ViewParams) => void

/** GET /api/lawyers/[id] payload: LawyerDTO + their (role-scoped) cases. */
interface LawyerDetailResponse extends LawyerDTO {
  cases: CaseListDTO[]
}

const lawyerStatusStyles: Record<string, StatusStyle> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  INACTIVE: { label: "Inactive", className: "bg-stone-100 text-stone-600 border-stone-200" },
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
    toast.success(`${lawyer.name} deleted.`)
    onChanged()
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Lawyer details</DialogTitle>
            <DialogDescription>Bar Council credentials, chamber and case load.</DialogDescription>
          </DialogHeader>

          {loading && !lawyer ? (
            <div className="space-y-3 py-4" aria-busy="true">
              <div className="h-14 w-full animate-pulse rounded-lg bg-stone-100" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-stone-100" />
            </div>
          ) : error && !lawyer ? (
            <div className="py-4">
              <EmptyState
                icon={Gavel}
                title="Could not load this lawyer"
                description={error}
                action={
                  <Button variant="outline" size="sm" onClick={refetch}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : lawyer ? (
            <div className="space-y-5">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700">
                    <Gavel className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-lg font-semibold tracking-tight">{lawyer.name}</p>
                    <StatusBadge map={lawyerStatusStyles} value={lawyer.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {lawyer.barCouncilId ? (
                      <Badge variant="outline" className="font-mono text-xs text-stone-600">
                        {lawyer.barCouncilId}
                      </Badge>
                    ) : null}
                    {lawyer.specialization ? (
                      <Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                        {lawyer.specialization}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200/80 p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
                  <p className="mt-0.5 text-sm">{lawyer.phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="mt-0.5 truncate text-sm">{lawyer.email ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chamber</p>
                  <p className="mt-0.5 truncate text-sm">{lawyer.chamberName ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Experience</p>
                  <p className="mt-0.5 text-sm">{lawyer.experience ?? 0} yrs</p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">
                  Cases <span className="font-normal text-muted-foreground">({cases.length})</span>
                </p>
                {cases.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-stone-200 py-4 text-center text-xs text-muted-foreground">
                    No cases assigned to this lawyer.
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
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            {lawyer && isAdmin ? (
              <Button
                variant="ghost"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
            {lawyer && isAdmin ? (
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
        title="Delete this lawyer?"
        description={`${lawyer?.name ?? "This lawyer"} will be removed permanently. Lawyers with assigned cases cannot be deleted.`}
        confirmLabel="Delete lawyer"
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
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [barCouncilId, setBarCouncilId] = useState("")
  const [specialization, setSpecialization] = useState("__none__")
  const [chamberName, setChamberName] = useState("")
  const [experience, setExperience] = useState("")
  const [status, setStatus] = useState("ACTIVE")
  const [portal, setPortal] = useState(false)
  const [password, setPassword] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(lawyer?.name ?? "")
    setPhone(lawyer?.phone ?? "")
    setEmail(lawyer?.email ?? "")
    setBarCouncilId(lawyer?.barCouncilId ?? "")
    setSpecialization(lawyer?.specialization && SPECIALIZATIONS.includes(lawyer.specialization as (typeof SPECIALIZATIONS)[number]) ? lawyer.specialization : "__none__")
    setChamberName(lawyer?.chamberName ?? "")
    setExperience(lawyer?.experience != null ? String(lawyer.experience) : "")
    setStatus(lawyer?.status === "INACTIVE" ? "INACTIVE" : "ACTIVE")
    setPortal(false)
    setPassword("")
    setPending(false)
  }, [open, lawyer])

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Lawyer name is required.")
      return
    }
    const expNum = experience.trim() === "" ? null : Number(experience)
    if (expNum !== null && (Number.isNaN(expNum) || expNum < 0)) {
      toast.error("Experience must be a non-negative number.")
      return
    }
    if (!isEdit && portal) {
      if (!email.trim() || !isValidEmail(email)) {
        toast.error("Please enter a valid email address.")
        return
      }
      if (password.length < 6) {
        toast.error("Portal password must be at least 6 characters.")
        return
      }
    }
    const base = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      barCouncilId: barCouncilId.trim() || null,
      specialization: specialization === "__none__" ? null : specialization,
      chamberName: chamberName.trim() || null,
      experience: expNum,
    }
    try {
      setPending(true)
      if (isEdit && lawyer) {
        await apiSend<LawyerDTO>("PATCH", `/api/lawyers/${lawyer.id}`, { ...base, status })
        toast.success("Lawyer updated.")
      } else {
        await apiSend<LawyerDTO>("POST", "/api/lawyers", {
          ...base,
          ...(portal ? { createPortalAccess: true, password } : {}),
        })
        toast.success(portal ? "Lawyer created with portal access." : "Lawyer created.")
      }
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the lawyer.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit lawyer" : "Add lawyer"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the advocate's credentials and status." : "Register an advocate of the chamber."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lawyer-name">
              Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="lawyer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Kamal Hossain"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lawyer-phone">Phone</Label>
              <Input id="lawyer-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+8801XXXXXXXXX" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lawyer-email">Email</Label>
              <Input id="lawyer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lawyer@chamber.bd" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lawyer-bar">Bar Council ID</Label>
              <Input id="lawyer-bar" value={barCouncilId} onChange={(e) => setBarCouncilId(e.target.value)} placeholder="e.g. D-12345" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lawyer-specialization">Specialization</Label>
              <Select value={specialization} onValueChange={setSpecialization}>
                <SelectTrigger id="lawyer-specialization" className="w-full">
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not specified</SelectItem>
                  {SPECIALIZATIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lawyer-chamber">Chamber name</Label>
              <Input id="lawyer-chamber" value={chamberName} onChange={(e) => setChamberName(e.target.value)} placeholder="e.g. Hossain & Associates" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lawyer-experience">Experience (years)</Label>
              <Input
                id="lawyer-experience"
                type="number"
                min={0}
                value={experience}
                onChange={(e) => setExperience(e.target.value)}
                placeholder="e.g. 12"
              />
            </div>
            {isEdit ? (
              <div className="space-y-1.5">
                <Label htmlFor="lawyer-status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="lawyer-status" className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor="lawyer-portal">Create lawyer portal account</Label>
                  <p className="text-xs text-muted-foreground">Lawyer signs in with their email + this password</p>
                </div>
                <Switch id="lawyer-portal" checked={portal} onCheckedChange={setPortal} />
              </div>
              {portal ? (
                <div className="space-y-1.5">
                  <Label htmlFor="lawyer-portal-password">Portal password</Label>
                  <Input
                    id="lawyer-portal-password"
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
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create lawyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------------------------- View ---------------------------------- */

export default function LawyersView({ user, navigate }: ViewProps) {
  const isAdmin = user.role === "ADMIN"
  const { data, loading, error, refetch } = useApiData<LawyerDTO[]>("/api/lawyers")

  const [search, setSearch] = useState("")
  const [specFilter, setSpecFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [detailId, setDetailId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const lawyers = useMemo(() => data ?? [], [data])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lawyers.filter((l) => {
      if (specFilter !== "ALL" && (l.specialization ?? "__none__") !== specFilter) return false
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false
      if (!q) return true
      return [l.name, l.email, l.phone, l.barCouncilId, l.chamberName].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      )
    })
  }, [lawyers, search, specFilter, statusFilter])

  return (
    <div className="space-y-6">
      <PageHeader title="Lawyers / Advocates" description="Bar Council credentials, specializations and case loads.">
        {isAdmin ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Add Lawyer
          </Button>
        ) : null}
      </PageHeader>

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, Bar Council ID…"
            className="pl-8"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={specFilter} onValueChange={setSpecFilter}>
            <SelectTrigger className="w-full md:w-[190px]">
              <SelectValue placeholder="All specializations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All specializations</SelectItem>
              {SPECIALIZATIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && !data ? (
        <LoadingBlock />
      ) : error && !data ? (
        <EmptyState
          icon={Gavel}
          title="Could not load lawyers"
          description={error}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              Try again
            </Button>
          }
        />
      ) : lawyers.length === 0 ? (
        <EmptyState icon={Gavel} title="No lawyers yet" description="Add advocates to assign them to cases." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No lawyers match" description="Try a different search or filter." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <Card
              key={l.id}
              role="button"
              tabIndex={0}
              aria-label={`Open lawyer ${l.name}`}
              onClick={() => setDetailId(l.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setDetailId(l.id)
                }
              }}
              className="cursor-pointer gap-3 border-stone-200/80 py-4 transition-colors hover:border-emerald-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <CardHeader className="px-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700">
                      <Gavel className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold leading-tight">{l.name}</p>
                    {l.barCouncilId ? (
                      <Badge variant="outline" className="mt-1.5 font-mono text-[11px] text-stone-600">
                        {l.barCouncilId}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5 px-4 text-sm">
                {l.specialization ? (
                  <div>
                    <Badge variant="outline" className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                      {l.specialization}
                    </Badge>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate text-muted-foreground">{l.chamberName ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate text-muted-foreground">{l.phone ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span className="truncate text-muted-foreground">{l.email ?? "—"}</span>
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-2 border-t border-stone-100 px-4 pt-3 text-xs text-muted-foreground">
                <span>
                  {l.activeCases} active / {l.totalCases} total cases
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span>{l.experience ?? 0} yrs experience</span>
                  <StatusBadge map={lawyerStatusStyles} value={l.status} />
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
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
