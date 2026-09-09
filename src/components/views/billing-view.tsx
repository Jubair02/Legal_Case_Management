"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Ban,
  Banknote,
  Eye,
  Landmark,
  MoreHorizontal,
  Plus,
  Receipt,
  Search,
  ShieldAlert,
  Smartphone,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useApiData } from "@/hooks/use-api-data"
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
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { apiSend } from "@/lib/api-client"
import { BILLING_TYPES, INVOICE_STATUSES, PAYMENT_METHODS } from "@/lib/constants"
import { statusLabel, useLanguage, type TranslateFn } from "@/lib/i18n/language"
import type { CaseListDTO, ClientDTO, InvoiceDTO, PaymentDTO, ViewKey, ViewParams, ViewProps } from "@/lib/types"
import { useResetOnOpen } from "@/lib/use-reset-on-open"
import { cn, formatCurrency, formatDate, invoiceStatusStyles, toDateInputValue } from "@/lib/utils"

type NavigateFn = (view: ViewKey, params?: ViewParams) => void

const ALL = "ALL"
const NO_CASE = "NONE"

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0
}

/**
 * Builds a derived enum dictionary key: enumTKey("billing.method", "bKash")
 * → "billing.methodBkash". Non-alphanumeric runs split words.
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

/** Translates a domain enum value (billing types, payment methods), falling back to the raw value. */
function enumLabel(prefix: string, value: string | null | undefined, t: TranslateFn): string {
  if (!value) return "—"
  const key = enumTKey(prefix, value)
  const translated = t(key)
  return translated === key ? value : translated
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

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

/** Case number chip that opens the case file when clicked. */
function CaseChip({
  caseId,
  caseNumber,
  onOpen,
}: {
  caseId: string | null
  caseNumber?: string | null
  onOpen?: (id: string) => void
}) {
  const { t } = useLanguage()
  if (!caseId) return <span className="text-sm text-muted-foreground">—</span>
  return (
    <button type="button" onClick={() => onOpen?.(caseId)} className="inline-flex" title={t("ui.openCaseFile")}>
      <Badge
        variant="outline"
        className="cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        {caseNumber ?? t("billing.chipCase")}
      </Badge>
    </button>
  )
}

/* --------------------------- Record payment dialog --------------------------- */

function RecordPaymentDialog({
  invoice,
  open,
  onOpenChange,
  onSaved,
}: {
  invoice: InvoiceDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0])
  const [paymentDate, setPaymentDate] = useState(toDateInputValue(new Date()))
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, setPending] = useState(false)
  const { t } = useLanguage()

  const remaining = invoice ? Math.max(0, num(invoice.amount) - num(invoice.paidAmount)) : 0

  useResetOnOpen(open && invoice ? invoice.id : null, () => {
    setAmount(String(Math.max(0, num(invoice!.amount) - num(invoice!.paidAmount))))
    setMethod(PAYMENT_METHODS[0])
    setPaymentDate(toDateInputValue(new Date()))
    setReference("")
    setNotes("")
  })

  const submit = async () => {
    if (!invoice) return
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("billing.errAmountPos"))
      return
    }
    if (amt > remaining + 0.005) {
      toast.error(t("billing.errExceeds", { amount: formatCurrency(remaining) }))
      return
    }
    setPending(true)
    try {
      await apiSend("POST", "/api/payments", {
        invoiceId: invoice.id,
        amount: amt,
        paymentMethod: method,
        paymentDate: paymentDate || undefined,
        referenceNumber: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success(t("billing.toastPaymentRecorded"))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e, t("billing.errGeneric")))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("billing.recordPayment")}</DialogTitle>
          <DialogDescription>{t("billing.recordPaymentDesc")}</DialogDescription>
        </DialogHeader>

        {invoice ? (
          <div className="space-y-4">
            <div className="space-y-1 rounded-lg border border-stone-200/80 bg-stone-50/60 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold">{invoice.invoiceNumber}</span>
                <StatusBadge map={translatedStyles(invoiceStatusStyles, t)} value={invoice.status} />
              </div>
              <p className="text-muted-foreground">{invoice.clientName}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                <span>
                  {t("billing.amountLabel")} <span className="font-semibold text-foreground">{formatCurrency(invoice.amount)}</span>
                </span>
                <span>
                  {t("billing.paidLabel")} <span className="font-semibold text-foreground">{formatCurrency(invoice.paidAmount)}</span>
                </span>
                <span>
                  {t("billing.remainingLabel")} <span className="font-bold text-emerald-700">{formatCurrency(remaining)}</span>
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment-amount">{t("billing.amountTaka")}</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("billing.paymentMethodReq")}</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("billing.selectMethod")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {enumLabel("billing.method", m, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-date">{t("billing.paymentDate")}</Label>
                <Input
                  id="payment-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-reference">{t("billing.referenceNumber")}</Label>
                <Input
                  id="payment-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={t("billing.referencePh")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-notes">{t("common.notes")}</Label>
              <Textarea
                id="payment-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("billing.notesPh")}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending ? t("common.saving") : t("billing.recordPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------- Invoice details dialog --------------------------- */

function InvoiceDetailsDialog({
  invoice,
  open,
  onOpenChange,
  navigate,
}: {
  invoice: InvoiceDTO | null
  open: boolean
  onOpenChange: (open: boolean) => void
  navigate: NavigateFn
}) {
  const inv = invoice
  const paid = num(inv?.paidAmount)
  const amount = num(inv?.amount)
  const percent = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0
  const payments = inv?.payments ?? []
  const { t } = useLanguage()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{inv?.invoiceNumber ?? t("billing.invoiceWord")}</DialogTitle>
          <DialogDescription>{t("billing.detailsDesc")}</DialogDescription>
        </DialogHeader>

        {inv ? (
          <div className="space-y-5">
            <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">{t("billing.colClient")}</p>
                <p className="font-medium">{inv.clientName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("billing.colCase")}</p>
                <CaseChip
                  caseId={inv.caseId}
                  caseNumber={inv.caseNumber}
                  onOpen={(id) => navigate("case-detail", { id })}
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("billing.colBillingType")}</p>
                <p className="font-medium">{inv.billingType ? enumLabel("billing.type", inv.billingType, t) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("common.status")}</p>
                <StatusBadge map={translatedStyles(invoiceStatusStyles, t)} value={inv.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("common.amount")}</p>
                <p className="font-bold">{formatCurrency(amount)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t("common.dueDate")}</p>
                <p className={cn("font-medium", inv.status === "OVERDUE" && "text-rose-600")}>
                  {formatDate(inv.dueDate)}
                </p>
              </div>
              {inv.description ? (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">{t("common.description")}</p>
                  <p className="whitespace-pre-wrap text-sm">{inv.description}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200/80 bg-stone-50/60 p-4">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {t("billing.paidOf", { paid: formatCurrency(paid), total: formatCurrency(amount) })}
                </span>
                <span className="text-muted-foreground">{percent}%</span>
              </div>
              <Progress value={percent} />
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">{t("billing.paymentsTitle")}</p>
              {payments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-stone-200 py-6 text-center text-sm text-muted-foreground">
                  {t("billing.noPayments")}
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-stone-200/80">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t("common.date")}</TableHead>
                        <TableHead>{t("billing.colMethod")}</TableHead>
                        <TableHead className="text-right">{t("common.amount")}</TableHead>
                        <TableHead>{t("billing.colReference")}</TableHead>
                        <TableHead>{t("billing.colReceivedBy")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{formatDate(p.paymentDate)}</TableCell>
                          <TableCell>{enumLabel("billing.method", p.paymentMethod, t)}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate text-muted-foreground">
                            {p.referenceNumber || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{p.receivedByName ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ New invoice dialog ------------------------------ */

function NewInvoiceDialog({
  open,
  onOpenChange,
  onSaved,
  requireCase = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  /** Lawyers must attach the invoice to one of their own cases (server-enforced too). */
  requireCase?: boolean
}) {
  const clientsQ = useApiData<ClientDTO[]>(open ? "/api/clients" : null)
  const casesQ = useApiData<CaseListDTO[]>(open ? "/api/cases" : null)

  const [clientId, setClientId] = useState("")
  const [caseId, setCaseId] = useState(NO_CASE)
  const [billingType, setBillingType] = useState<string>(BILLING_TYPES[0])
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [pending, setPending] = useState(false)
  const { t } = useLanguage()

  useResetOnOpen(open ? "new" : null, () => {
    setClientId("")
    setCaseId(NO_CASE)
    setBillingType(BILLING_TYPES[0])
    setDescription("")
    setAmount("")
    setDueDate("")
  })

  const onCaseChange = (value: string) => {
    setCaseId(value)
    if (value !== NO_CASE && casesQ.data) {
      const kase = casesQ.data.find((c) => c.id === value)
      if (kase?.client?.id) setClientId(kase.client.id)
    }
  }

  const submit = async () => {
    if (!clientId) {
      toast.error(t("cases.errSelectClient"))
      return
    }
    if (requireCase && (!caseId || caseId === NO_CASE)) {
      toast.error(t("billing.errSelectCase"))
      return
    }
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("billing.errAmountNew"))
      return
    }
    setPending(true)
    try {
      await apiSend("POST", "/api/invoices", {
        clientId,
        caseId: caseId !== NO_CASE && caseId ? caseId : undefined,
        billingType,
        description: description.trim() || undefined,
        amount: amt,
        dueDate: dueDate || undefined,
      })
      toast.success(t("billing.toastCreated"))
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e, t("billing.errGeneric")))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("billing.newInvoice")}</DialogTitle>
          <DialogDescription>{t("billing.newInvoiceDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("billing.clientReq")}</Label>
            <Select value={clientId || undefined} onValueChange={setClientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={clientsQ.loading ? t("ui.loadingClients") : t("ui.selectClient")} />
              </SelectTrigger>
              <SelectContent>
                {(clientsQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("billing.caseOptional")}</Label>
            <Select value={caseId} onValueChange={onCaseChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={casesQ.loading ? t("ui.loadingCases") : t("billing.noCasePh")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CASE}>{t("billing.noCaseOption")}</SelectItem>
                {(casesQ.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.caseNumber} — {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("billing.caseAutoClient")}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("billing.colBillingType")}</Label>
              <Select value={billingType} onValueChange={setBillingType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BILLING_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {enumLabel("billing.type", bt, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-amount">{t("billing.amountTaka")}</Label>
              <Input
                id="invoice-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-due">{t("common.dueDate")}</Label>
            <Input id="invoice-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-description">{t("common.description")}</Label>
            <Textarea
              id="invoice-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("billing.descriptionPh")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={pending}>
            {pending ? t("ui.creating") : t("billing.createInvoice")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ Invoices tab ------------------------------ */

function InvoicesTab({
  invoices,
  loading,
  error,
  canManage,
  isAdmin,
  isClient,
  navigate,
  onRecordPayment,
  onViewDetails,
  onCancel,
  onDelete,
  onRetry,
}: {
  invoices: InvoiceDTO[] | null
  loading: boolean
  error: string | null
  canManage: boolean
  isAdmin: boolean
  isClient: boolean
  navigate: NavigateFn
  onRecordPayment: (inv: InvoiceDTO) => void
  onViewDetails: (inv: InvoiceDTO) => void
  onCancel: (inv: InvoiceDTO) => void
  onDelete: (inv: InvoiceDTO) => void
  onRetry: () => void
}) {
  const [status, setStatus] = useState(ALL)
  const [search, setSearch] = useState("")

  const list = invoices ?? []
  const active = useMemo(() => list.filter((i) => i.status !== "CANCELLED"), [list])
  const totalInvoiced = active.reduce((s, i) => s + num(i.amount), 0)
  const totalCollected = active.reduce((s, i) => s + num(i.paidAmount), 0)
  const outstanding = active.reduce((s, i) => s + (num(i.amount) - num(i.paidAmount)), 0)

  const filtered = useMemo(() => {
    let rows = list
    if (status !== ALL) rows = rows.filter((i) => i.status === status)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter(
        (i) => i.invoiceNumber.toLowerCase().includes(q) || i.clientName.toLowerCase().includes(q)
      )
    }
    return rows
  }, [list, status, search])

  if (loading && !invoices) return <LoadingBlock rows={6} />

  if (error && !invoices) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load invoices"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {isClient ? (
        <StatCard icon={Wallet} label="Outstanding Balance" value={formatCurrency(Math.max(0, outstanding))} tone="rose" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={Wallet}
            label="Total Invoiced"
            value={formatCurrency(totalInvoiced)}
            sub={`${active.length} active invoices`}
            tone="emerald"
          />
          <StatCard
            icon={Banknote}
            label="Total Collected"
            value={formatCurrency(totalCollected)}
            sub={`${list.filter((i) => i.status === "PAID").length} fully paid`}
            tone="teal"
          />
          <StatCard
            icon={TrendingUp}
            label="Outstanding"
            value={formatCurrency(Math.max(0, outstanding))}
            sub="Unpaid & partial balances"
            tone="rose"
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number or client…"
            aria-label="Search invoices"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {invoiceStatusStyles[s]?.label ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Receipt}
              title={list.length === 0 ? "No invoices yet" : "No invoices match your filters"}
              description={
                list.length === 0
                  ? "Invoices you create will appear here."
                  : "Try a different search term or status filter."
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Invoice</TableHead>
                <TableHead>Case</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const payments = inv.payments ?? []
                const canCancel = inv.status !== "CANCELLED" && inv.status !== "PAID"
                const canDelete = payments.length === 0
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono font-semibold">{inv.invoiceNumber}</TableCell>
                    <TableCell>
                      <CaseChip
                        caseId={inv.caseId}
                        caseNumber={inv.caseNumber}
                        onOpen={(id) => navigate("case-detail", { id })}
                      />
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">{inv.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.billingType ?? "—"}</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(inv.amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.paidAmount)}</TableCell>
                    <TableCell>
                      <span className={cn(inv.status === "OVERDUE" && "font-medium text-rose-600")}>
                        {formatDate(inv.dueDate)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge map={invoiceStatusStyles} value={inv.status} />
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Invoice actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {inv.status !== "PAID" && inv.status !== "CANCELLED" ? (
                              <DropdownMenuItem onSelect={() => onRecordPayment(inv)}>
                                <Banknote className="h-4 w-4" /> Record Payment
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem onSelect={() => onViewDetails(inv)}>
                              <Eye className="h-4 w-4" /> View Details
                            </DropdownMenuItem>
                            {canCancel || (canDelete && isAdmin) ? <DropdownMenuSeparator /> : null}
                            {canCancel ? (
                              <DropdownMenuItem onSelect={() => onCancel(inv)}>
                                <Ban className="h-4 w-4" /> Cancel Invoice
                              </DropdownMenuItem>
                            ) : null}
                            {canDelete && isAdmin ? (
                              <DropdownMenuItem
                                className="text-rose-600 focus:text-rose-600"
                                onSelect={() => onDelete(inv)}
                              >
                                <Trash2 className="h-4 w-4" /> Delete Invoice
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {isClient ? (
        <p className="text-xs text-muted-foreground">Contact your chamber for payment receipts.</p>
      ) : null}
    </div>
  )
}

/* ------------------------------ Payments tab ------------------------------ */

const METHOD_META: Record<string, { icon: LucideIcon; className: string }> = {
  Cash: { icon: Banknote, className: "border-stone-200 bg-stone-50 text-stone-700" },
  "Bank Transfer": { icon: Landmark, className: "border-teal-200 bg-teal-50 text-teal-700" },
  bKash: { icon: Smartphone, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  Nagad: { icon: Smartphone, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  Rocket: { icon: Smartphone, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
}

function MethodChip({ method }: { method: string }) {
  const meta = METHOD_META[method] ?? METHOD_META.Cash
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn("gap-1 border", meta.className)}>
      <Icon className="h-3 w-3" />
      {method}
    </Badge>
  )
}

function PaymentsTab({
  payments,
  loading,
  error,
  isClient,
  isAdmin,
  onDeletePayment,
  onRetry,
}: {
  payments: PaymentDTO[] | null
  loading: boolean
  error: string | null
  isClient: boolean
  isAdmin: boolean
  onDeletePayment: (p: PaymentDTO) => void
  onRetry: () => void
}) {
  const [method, setMethod] = useState(ALL)

  const list = payments ?? []
  const filtered = useMemo(
    () => (method === ALL ? list : list.filter((p) => p.paymentMethod === method)),
    [list, method]
  )

  if (loading && !payments) return <LoadingBlock rows={6} />

  if (error && !payments) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Could not load payments"
        description={error}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All methods" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All methods</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Banknote}
              title={list.length === 0 ? "No payments yet" : "No payments match this filter"}
              description={
                list.length === 0
                  ? "Payments recorded against invoices will appear here."
                  : "Try a different payment method."
              }
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Case</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Received By</TableHead>
                {isAdmin ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.paymentDate)}</TableCell>
                  <TableCell className="font-mono font-medium">{p.invoiceNumber ?? "—"}</TableCell>
                  <TableCell>
                    {p.caseNumber ? (
                      <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
                        {p.caseNumber}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{p.clientName ?? "—"}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-700">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell>
                    <MethodChip method={p.paymentMethod} />
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate text-muted-foreground">
                    {p.referenceNumber || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.receivedByName ?? "—"}</TableCell>
                  {isAdmin ? (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-600 hover:text-rose-700"
                        aria-label={`Delete payment of ${formatCurrency(p.amount)} on invoice ${p.invoiceNumber ?? ""}`}
                        onClick={() => onDeletePayment(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {isClient ? (
        <p className="text-xs text-muted-foreground">Contact your chamber for payment receipts.</p>
      ) : null}
    </div>
  )
}

/* --------------------------------- View --------------------------------- */

export default function BillingView({ user, navigate, params }: ViewProps) {
  const isStaff = user.role === "STAFF"
  const isAdmin = user.role === "ADMIN"
  const isLawyer = user.role === "LAWYER"
  const isClient = user.role === "CLIENT"
  // ADMIN + LAWYER manage billing (per PRD); STAFF/CLIENT are read-only.
  const canManage = isAdmin || isLawyer

  // Tab is fully driven by params so the sidebar Invoices/Payments entries and
  // the in-view Tabs stay in sync (no stale local override).
  const tab: "invoices" | "payments" = params.tab === "payments" ? "payments" : "invoices"
  const [payFor, setPayFor] = useState<InvoiceDTO | null>(null)
  const [detailsFor, setDetailsFor] = useState<InvoiceDTO | null>(null)
  const [cancelFor, setCancelFor] = useState<InvoiceDTO | null>(null)
  const [deleteFor, setDeleteFor] = useState<InvoiceDTO | null>(null)
  const [deletePaymentFor, setDeletePaymentFor] = useState<PaymentDTO | null>(null)
  const [newOpen, setNewOpen] = useState(false)

  // STAFF: no financial access — keep fetches idle (null path) and show a guard.
  const invoicesQ = useApiData<InvoiceDTO[]>(isStaff ? null : "/api/invoices")
  const paymentsQ = useApiData<PaymentDTO[]>(isStaff ? null : "/api/payments")

  if (isStaff) {
    return (
      <div className="space-y-6">
        <PageHeader title="Billing & Invoices" description="Invoices, payments and collections" />
        <EmptyState
          icon={ShieldAlert}
          title="Financial data is restricted"
          description="Staff accounts do not have access to billing, invoices or payments."
        />
      </div>
    )
  }

  const refetchInvoices = () => invoicesQ.refetch()
  const refetchBoth = () => {
    invoicesQ.refetch()
    paymentsQ.refetch()
  }

  const changeTab = (value: string) => {
    const next = value === "payments" ? "payments" : "invoices"
    navigate("billing", { tab: next }) // single source of truth — keeps sidebar in sync
  }

  const cancelInvoice = async () => {
    if (!cancelFor) return
    await apiSend("PATCH", `/api/invoices/${cancelFor.id}`, { status: "CANCELLED" })
    toast.success("Invoice cancelled")
    refetchInvoices()
  }

  const deleteInvoice = async () => {
    if (!deleteFor) return
    await apiSend("DELETE", `/api/invoices/${deleteFor.id}`)
    toast.success("Invoice deleted")
    refetchInvoices()
  }

  const deletePayment = async () => {
    if (!deletePaymentFor) return
    await apiSend<{ ok: boolean; invoiceStatus: string }>(
      "DELETE",
      `/api/payments/${deletePaymentFor.id}`
    )
    toast.success(
      `Payment of ${formatCurrency(deletePaymentFor.amount)} removed — invoice status updated.`
    )
    refetchBoth()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Invoices"
        description="Invoices, payments & collections — bKash / Nagad / Rocket supported"
      >
        {canManage ? (
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        ) : null}
      </PageHeader>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab
            invoices={invoicesQ.data}
            loading={invoicesQ.loading}
            error={invoicesQ.error}
            canManage={canManage}
            isAdmin={isAdmin}
            isClient={isClient}
            navigate={navigate}
            onRecordPayment={setPayFor}
            onViewDetails={setDetailsFor}
            onCancel={setCancelFor}
            onDelete={setDeleteFor}
            onRetry={refetchInvoices}
          />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab
            payments={paymentsQ.data}
            loading={paymentsQ.loading}
            error={paymentsQ.error}
            isClient={isClient}
            isAdmin={isAdmin}
            onDeletePayment={setDeletePaymentFor}
            onRetry={paymentsQ.refetch}
          />
        </TabsContent>
      </Tabs>

      <RecordPaymentDialog
        invoice={payFor}
        open={!!payFor}
        onOpenChange={(o) => {
          if (!o) setPayFor(null)
        }}
        onSaved={refetchBoth}
      />
      <InvoiceDetailsDialog
        invoice={detailsFor}
        open={!!detailsFor}
        onOpenChange={(o) => {
          if (!o) setDetailsFor(null)
        }}
        navigate={navigate}
      />
      <NewInvoiceDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onSaved={refetchBoth}
        requireCase={isLawyer}
      />

      <ConfirmDialog
        open={!!cancelFor}
        onOpenChange={(o) => {
          if (!o) setCancelFor(null)
        }}
        title="Cancel this invoice?"
        description={
          cancelFor
            ? `Invoice ${cancelFor.invoiceNumber} for ${cancelFor.clientName} will be marked as cancelled and excluded from outstanding totals.`
            : undefined
        }
        confirmLabel="Cancel Invoice"
        onConfirm={cancelInvoice}
      />
      <ConfirmDialog
        open={!!deleteFor}
        onOpenChange={(o) => {
          if (!o) setDeleteFor(null)
        }}
        title="Delete this invoice?"
        description={
          deleteFor
            ? `Invoice ${deleteFor.invoiceNumber} will be permanently deleted. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={deleteInvoice}
      />
      <ConfirmDialog
        open={!!deletePaymentFor}
        onOpenChange={(o) => {
          if (!o) setDeletePaymentFor(null)
        }}
        title="Delete this payment record?"
        description={
          deletePaymentFor
            ? `The ${formatCurrency(deletePaymentFor.amount)} payment on invoice ${
                deletePaymentFor.invoiceNumber ?? ""
              } will be removed and the invoice balance restored. This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete Payment"
        destructive
        onConfirm={deletePayment}
      />
    </div>
  )
}
