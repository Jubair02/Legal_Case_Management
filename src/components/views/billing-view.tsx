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
  ShieldAlert,
  Smartphone,
  Trash2,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DialogHead, FieldGroup } from "@/components/shared/dialog-chrome"
import { EmptyState } from "@/components/shared/empty-state"
import { LoadingBlock } from "@/components/shared/loading-block"
import { PageHeader } from "@/components/shared/page-header"
import { DetailField, SearchField, Toolbar } from "@/components/shared/toolbar"
import { StatusBadge } from "@/components/shared/status-badge"
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

/** Clamped whole-number percentage; 0 when the denominator is empty. */
function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)))
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

/* ------------------------------ Ledger maths ------------------------------ */

interface Ledger {
  invoiced: number
  collected: number
  outstanding: number
  /** Balance on invoices already past their due date. */
  overdueAmount: number
  overdueCount: number
  /** Outstanding that is not yet overdue. */
  dueAmount: number
  activeCount: number
  paidCount: number
  openCount: number
  /** Earliest upcoming due date across unsettled invoices. */
  nextDueDate: string | null
  /** Collected as a percentage of invoiced. */
  rate: number
}

/**
 * Cancelled invoices are excluded from every total — they are void, not owed.
 * Overdue is carved out of outstanding so the meter's three segments sum to
 * exactly the invoiced amount and never double-count a balance.
 */
function computeLedger(list: InvoiceDTO[]): Ledger {
  let invoiced = 0
  let collected = 0
  let overdueAmount = 0
  let overdueCount = 0
  let paidCount = 0
  let openCount = 0
  let nextDueDate: string | null = null
  let activeCount = 0

  for (const inv of list) {
    if (inv.status === "CANCELLED") continue
    activeCount += 1

    const amount = num(inv.amount)
    const paid = num(inv.paidAmount)
    const remaining = Math.max(0, amount - paid)

    invoiced += amount
    collected += paid

    if (inv.status === "PAID") {
      paidCount += 1
    } else if (remaining > 0) {
      openCount += 1
      // Overdue dates are in the past, so they would make "next due" read as a
      // date already gone by; the overdue notice covers them instead.
      if (inv.status !== "OVERDUE" && inv.dueDate && (!nextDueDate || inv.dueDate < nextDueDate)) {
        nextDueDate = inv.dueDate
      }
    }

    if (inv.status === "OVERDUE") {
      overdueAmount += remaining
      overdueCount += 1
    }
  }

  const outstanding = Math.max(0, invoiced - collected)
  const overdue = Math.min(overdueAmount, outstanding)

  return {
    invoiced,
    collected,
    outstanding,
    overdueAmount: overdue,
    overdueCount,
    dueAmount: Math.max(0, outstanding - overdue),
    activeCount,
    paidCount,
    openCount,
    nextDueDate,
    rate: pct(collected, invoiced),
  }
}

/* ------------------------------ Small pieces ------------------------------ */

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
    <button
      type="button"
      onClick={() => onOpen?.(caseId)}
      title={t("ui.openCaseFile")}
      className="inline-flex cursor-pointer rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Badge
        variant="outline"
        className="cursor-pointer border-emerald-200 bg-emerald-50 font-mono text-[11px] text-emerald-800 transition-colors hover:bg-emerald-100"
      >
        {caseNumber ?? t("billing.chipCase")}
      </Badge>
    </button>
  )
}

/**
 * Hairline paid-progress bar. The percentage is always written out beside it —
 * the bar alone would carry the value in colour and length only.
 */
function PaidMeter({
  paid,
  total,
  align = "right",
}: {
  paid: number
  total: number
  align?: "left" | "right"
}) {
  const { t } = useLanguage()
  const percent = pct(paid, total)
  return (
    <span
      className={cn("mt-1.5 flex items-center gap-1.5", align === "right" ? "justify-end" : "justify-start")}
      title={t("billing.paidPctShort", { percent })}
    >
      <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-[11px] tabular-nums text-muted-foreground">{percent}%</span>
    </span>
  )
}

const METHOD_META: Record<string, { icon: LucideIcon; className: string }> = {
  Cash: { icon: Banknote, className: "border-stone-200 bg-stone-50 text-stone-700" },
  "Bank Transfer": { icon: Landmark, className: "border-teal-200 bg-teal-50 text-teal-800" },
  bKash: { icon: Smartphone, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  Nagad: { icon: Smartphone, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  Rocket: { icon: Smartphone, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
}

function MethodChip({ method }: { method: string }) {
  const { t } = useLanguage()
  const meta = METHOD_META[method] ?? METHOD_META.Cash
  const Icon = meta.icon
  return (
    <Badge variant="outline" className={cn("gap-1 border whitespace-nowrap", meta.className)}>
      <Icon aria-hidden className="h-3 w-3" />
      {enumLabel("billing.method", method, t)}
    </Badge>
  )
}

/* ------------------------------ Ledger band ------------------------------ */

function LedgerMetric({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: string
}) {
  return (
    <div className="min-w-0 flex-1 px-5 py-4">
      <p className="u-eyebrow text-muted-foreground">{label}</p>
      <p className={cn("mt-2 truncate text-[1.6rem] leading-none font-semibold tracking-tight tabular-nums", tone)}>
        {value}
      </p>
      {sub ? <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function LegendItem({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-1.5 text-xs">
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-ink">{value}</span>
    </li>
  )
}

/**
 * The chamber's money at a glance: three totals over a single part-to-whole
 * meter. Rose is reserved strictly for overdue balances — outstanding money is
 * not itself a problem, so it carries the neutral brass.
 */
function LedgerBand({ ledger }: { ledger: Ledger }) {
  const { t } = useLanguage()
  const { invoiced, collected, outstanding, dueAmount, overdueAmount, overdueCount, rate } = ledger
  const share = (value: number) => (invoiced > 0 ? (value / invoiced) * 100 : 0)

  return (
    <section className="u-rise u-crest overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
      <div className="flex flex-col divide-y divide-border/70 sm:flex-row sm:divide-x sm:divide-y-0">
        <LedgerMetric
          label={t("billing.totalInvoiced")}
          value={formatCurrency(invoiced)}
          sub={t("billing.countInvoices", { count: ledger.activeCount })}
          tone="text-ink"
        />
        <LedgerMetric
          label={t("billing.totalCollected")}
          value={formatCurrency(collected)}
          sub={t("billing.fullyPaidSub", { count: ledger.paidCount })}
          tone="text-emerald-800"
        />
        <LedgerMetric
          label={t("billing.outstanding")}
          value={formatCurrency(outstanding)}
          sub={t("billing.unpaidPartialSub")}
          tone="text-brass-deep"
        />
      </div>

      <div className="border-t border-border/70 bg-paper-shade/40 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="u-eyebrow text-muted-foreground">{t("billing.ledgerLabel")}</p>
          <p className="flex items-baseline gap-1.5">
            <span className="font-serif text-2xl leading-none font-semibold tabular-nums text-ink">{rate}%</span>
            <span className="text-[11px] text-muted-foreground">{t("billing.collectionRate")}</span>
          </p>
        </div>

        <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-border/70">
          <span className="bg-emerald-600" style={{ width: `${share(collected)}%` }} />
          <span className="bg-brass" style={{ width: `${share(dueAmount)}%` }} />
          <span className="u-hatch bg-rose-500" style={{ width: `${share(overdueAmount)}%` }} />
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          <LegendItem dot="bg-emerald-600" label={t("billing.segCollected")} value={formatCurrency(collected)} />
          <LegendItem dot="bg-brass" label={t("billing.segDue")} value={formatCurrency(dueAmount)} />
          <LegendItem dot="u-hatch bg-rose-500" label={t("billing.segOverdue")} value={formatCurrency(overdueAmount)} />
        </ul>

        {overdueCount > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-rose-700">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
            {t("billing.overdueNotice", {
              count: overdueCount,
              amount: formatCurrency(overdueAmount),
            })}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/** Clients see one number — what they owe — rather than the chamber's books. */
function ClientDueBand({ ledger }: { ledger: Ledger }) {
  const { t } = useLanguage()
  const { outstanding, openCount, nextDueDate, overdueCount, overdueAmount } = ledger

  return (
    <section className="u-rise u-crest overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
      <div className="flex items-start justify-between gap-5 p-5">
        <div className="min-w-0">
          <p className="u-eyebrow text-muted-foreground">{t("billing.clientDueLabel")}</p>
          <p className="mt-2.5 font-serif text-[2.25rem] leading-none font-semibold tracking-tight text-ink">
            {formatCurrency(outstanding)}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            {openCount > 0 ? t("billing.clientOpenInvoices", { count: openCount }) : t("billing.clientSettled")}
            {nextDueDate && openCount > 0
              ? ` · ${t("billing.clientNextDue", { date: formatDate(nextDueDate) })}`
              : ""}
          </p>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brass-tint text-brass-deep ring-1 ring-brass/25">
          <Wallet className="h-5 w-5" />
        </span>
      </div>

      {overdueCount > 0 ? (
        <p className="flex items-center gap-1.5 border-t border-rose-200/70 bg-rose-50/60 px-5 py-2.5 text-xs font-medium text-rose-700">
          <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {t("billing.overdueNotice", { count: overdueCount, amount: formatCurrency(overdueAmount) })}
        </p>
      ) : null}
    </section>
  )
}

/* -------------------------------- Toolbar -------------------------------- */

/** Shell for the two list surfaces: hairline card that clips its own rows. */
function ListCard({ children, delay = 120 }: { children: ReactNode; delay?: number }) {
  return (
    <div
      className="u-rise overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

function HeadCell({ className, children }: { className?: string; children?: ReactNode }) {
  return <TableHead className={cn("u-eyebrow text-muted-foreground", className)}>{children}</TableHead>
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
        <DialogHead
          icon={Banknote}
          title={t("billing.recordPayment")}
          description={t("billing.recordPaymentDesc")}
        />

        {invoice ? (
          <div className="space-y-5">
            {/* What is being paid against */}
            <div className="overflow-hidden rounded-lg border border-border/70 bg-paper-shade/50">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <span className="truncate font-mono text-[0.8125rem] font-semibold text-ink">
                  {invoice.invoiceNumber}
                </span>
                <StatusBadge map={translatedStyles(invoiceStatusStyles, t)} value={invoice.status} />
              </div>
              <p className="truncate border-t border-border/60 px-3.5 py-2 text-xs text-muted-foreground">
                {invoice.clientName}
              </p>
              <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60 text-center">
                <div className="px-2 py-2.5">
                  <p className="u-eyebrow text-muted-foreground">{t("common.amount")}</p>
                  <p className="mt-1.5 text-xs font-semibold tabular-nums text-ink">
                    {formatCurrency(invoice.amount)}
                  </p>
                </div>
                <div className="px-2 py-2.5">
                  <p className="u-eyebrow text-muted-foreground">{t("billing.colPaid")}</p>
                  <p className="mt-1.5 text-xs font-semibold tabular-nums text-ink">
                    {formatCurrency(invoice.paidAmount)}
                  </p>
                </div>
                <div className="bg-brass-tint/60 px-2 py-2.5">
                  <p className="u-eyebrow text-brass-deep">{t("billing.remainingDue")}</p>
                  <p className="mt-1.5 text-xs font-bold tabular-nums text-brass-deep">
                    {formatCurrency(remaining)}
                  </p>
                </div>
              </div>
            </div>

            <FieldGroup label={t("billing.paymentLabel")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="payment-amount">{t("billing.amountTaka")}</Label>
                    <button
                      type="button"
                      onClick={() => setAmount(String(remaining))}
                      className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {t("billing.payFull")}
                    </button>
                  </div>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="tabular-nums"
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
            </FieldGroup>

            <FieldGroup label={t("billing.detailsLabel")}>
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
            </FieldGroup>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button className="cursor-pointer" onClick={() => void submit()} disabled={pending}>
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
  const { t } = useLanguage()
  const inv = invoice
  const amount = num(inv?.amount)
  const paid = num(inv?.paidAmount)
  const remaining = Math.max(0, amount - paid)
  const percent = pct(paid, amount)
  const payments = inv?.payments ?? []
  const styles = useMemo(() => translatedStyles(invoiceStatusStyles, t), [t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHead
          icon={Receipt}
          title={inv?.invoiceNumber ?? t("billing.invoiceWord")}
          description={t("billing.detailsDesc")}
        />

        {inv ? (
          <div className="space-y-5">
            {/* Money panel — the reason anyone opens this dialog */}
            <div className="overflow-hidden rounded-xl border border-border/70 bg-paper-shade/40">
              <div className="grid grid-cols-3 divide-x divide-border/60">
                <div className="px-3 py-3.5 text-center">
                  <p className="u-eyebrow text-muted-foreground">{t("common.amount")}</p>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-ink">{formatCurrency(amount)}</p>
                </div>
                <div className="px-3 py-3.5 text-center">
                  <p className="u-eyebrow text-muted-foreground">{t("billing.colPaid")}</p>
                  <p className="mt-2 text-sm font-semibold tabular-nums text-emerald-800">
                    {formatCurrency(paid)}
                  </p>
                </div>
                <div className="bg-brass-tint/60 px-3 py-3.5 text-center">
                  <p className="u-eyebrow text-brass-deep">{t("billing.remainingDue")}</p>
                  <p className="mt-2 text-sm font-bold tabular-nums text-brass-deep">
                    {formatCurrency(remaining)}
                  </p>
                </div>
              </div>
              <div className="border-t border-border/60 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t("billing.paidOf", { paid: formatCurrency(paid), total: formatCurrency(amount) })}
                  </span>
                  <span className="font-serif text-lg leading-none font-semibold tabular-nums text-ink">
                    {percent}%
                  </span>
                </div>
                <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>

            <FieldGroup label={t("billing.detailsLabel")}>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <DetailField label={t("billing.colClient")}>
                  <span className="truncate font-medium">{inv.clientName}</span>
                </DetailField>
                <DetailField label={t("billing.colCase")}>
                  <CaseChip
                    caseId={inv.caseId}
                    caseNumber={inv.caseNumber}
                    onOpen={(id) => navigate("case-detail", { id })}
                  />
                </DetailField>
                <DetailField label={t("billing.colBillingType")}>
                  {inv.billingType ? enumLabel("billing.type", inv.billingType, t) : "—"}
                </DetailField>
                <DetailField label={t("common.status")}>
                  <StatusBadge map={styles} value={inv.status} />
                </DetailField>
                <DetailField label={t("common.dueDate")}>
                  <span
                    className={cn(
                      "tabular-nums",
                      inv.status === "OVERDUE" && "font-semibold text-rose-700"
                    )}
                  >
                    {formatDate(inv.dueDate)}
                  </span>
                </DetailField>
                {inv.description ? (
                  <div className="sm:col-span-2">
                    <DetailField label={t("common.description")}>
                      <span className="block whitespace-pre-wrap leading-relaxed">{inv.description}</span>
                    </DetailField>
                  </div>
                ) : null}
              </div>
            </FieldGroup>

            <FieldGroup label={t("billing.historyLabel")}>
              {payments.length === 0 ? (
                <EmptyState variant="inline" icon={Banknote} title={t("billing.noPayments")} />
              ) : (
                <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {formatDate(p.paymentDate)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <MethodChip method={p.paymentMethod} />
                          {p.referenceNumber ? (
                            <span className="truncate font-mono text-[11px] text-muted-foreground">
                              {p.referenceNumber}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-emerald-800">
                          {formatCurrency(p.amount)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{p.receivedByName ?? "—"}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </FieldGroup>
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
        <DialogHead icon={Receipt} title={t("billing.newInvoice")} description={t("billing.newInvoiceDesc")} />

        <div className="space-y-5">
          <FieldGroup label={t("billing.invoiceLabel")}>
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
                    className="tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoice-due">{t("common.dueDate")}</Label>
                <Input
                  id="invoice-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </FieldGroup>

          <FieldGroup label={t("billing.detailsLabel")}>
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
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button className="cursor-pointer" onClick={() => void submit()} disabled={pending}>
            {pending ? t("ui.creating") : t("billing.createInvoice")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------ Invoices tab ------------------------------ */

interface InvoiceActionHandlers {
  onRecordPayment: (inv: InvoiceDTO) => void
  onViewDetails: (inv: InvoiceDTO) => void
  onCancel: (inv: InvoiceDTO) => void
  onDelete: (inv: InvoiceDTO) => void
}

/** Row overflow menu — shared by the desktop table and the mobile cards. */
function InvoiceActions({
  invoice,
  isAdmin,
  handlers,
}: {
  invoice: InvoiceDTO
  isAdmin: boolean
  handlers: InvoiceActionHandlers
}) {
  const { t } = useLanguage()
  const canCancel = invoice.status !== "CANCELLED" && invoice.status !== "PAID"
  const canDelete = (invoice.payments ?? []).length === 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 cursor-pointer text-muted-foreground hover:text-foreground"
          aria-label={t("billing.actionsAria")}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {invoice.status !== "PAID" && invoice.status !== "CANCELLED" ? (
          <DropdownMenuItem className="cursor-pointer" onSelect={() => handlers.onRecordPayment(invoice)}>
            <Banknote className="h-4 w-4" /> {t("billing.recordPayment")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="cursor-pointer" onSelect={() => handlers.onViewDetails(invoice)}>
          <Eye className="h-4 w-4" /> {t("billing.viewDetails")}
        </DropdownMenuItem>
        {canCancel || (canDelete && isAdmin) ? <DropdownMenuSeparator /> : null}
        {canCancel ? (
          <DropdownMenuItem className="cursor-pointer" onSelect={() => handlers.onCancel(invoice)}>
            <Ban className="h-4 w-4" /> {t("billing.cancelInvoice")}
          </DropdownMenuItem>
        ) : null}
        {canDelete && isAdmin ? (
          <DropdownMenuItem
            className="cursor-pointer text-rose-600 focus:text-rose-600"
            onSelect={() => handlers.onDelete(invoice)}
          >
            <Trash2 className="h-4 w-4" /> {t("billing.deleteInvoice")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InvoicesTab({
  invoices,
  loading,
  error,
  ledger,
  canManage,
  isAdmin,
  isClient,
  navigate,
  handlers,
  onRetry,
}: {
  invoices: InvoiceDTO[] | null
  loading: boolean
  error: string | null
  ledger: Ledger
  canManage: boolean
  isAdmin: boolean
  isClient: boolean
  navigate: NavigateFn
  handlers: InvoiceActionHandlers
  onRetry: () => void
}) {
  const { t } = useLanguage()
  const [status, setStatus] = useState(ALL)
  const [search, setSearch] = useState("")

  const list = invoices ?? []
  const styles = useMemo(() => translatedStyles(invoiceStatusStyles, t), [t])

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

  if (loading && !invoices) return <LoadingBlock rows={6} tiles={3} />

  if (error && !invoices) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t("billing.errLoad")}
        description={error}
        action={
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        }
      />
    )
  }

  const narrowed = status !== ALL || search.trim().length > 0
  const openDetails = (inv: InvoiceDTO) => handlers.onViewDetails(inv)

  return (
    <div className="space-y-4">
      {ledger.activeCount > 0 ? (
        isClient ? <ClientDueBand ledger={ledger} /> : <LedgerBand ledger={ledger} />
      ) : null}

      <Toolbar
        note={
          list.length > 0
            ? narrowed
              ? t("billing.matchCount", { shown: filtered.length, total: list.length })
              : t("billing.countInvoices", { count: list.length })
            : null
        }
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("billing.searchPh")}
          ariaLabel={t("billing.searchAria")}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full cursor-pointer lg:w-48">
            <SelectValue placeholder={t("billing.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("billing.allStatuses")}</SelectItem>
            {INVOICE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>

      <ListCard>
        {filtered.length === 0 ? (
          <EmptyState
            variant="inline"
            className="py-14"
            icon={Receipt}
            title={list.length === 0 ? t("billing.emptyTitle") : t("billing.noMatchTitle")}
            description={list.length === 0 ? t("billing.emptyDesc") : t("billing.noMatchDesc")}
          />
        ) : (
          <>
            {/* ---------- Desktop: full ledger table ---------- */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/70 bg-paper-shade/60 hover:bg-paper-shade/60">
                    <HeadCell>{t("billing.colInvoice")}</HeadCell>
                    <HeadCell className="hidden lg:table-cell">{t("billing.colCase")}</HeadCell>
                    <HeadCell>{t("billing.colClient")}</HeadCell>
                    <HeadCell className="hidden lg:table-cell">{t("billing.colType")}</HeadCell>
                    <HeadCell className="text-right">{t("common.amount")}</HeadCell>
                    <HeadCell className="text-right">{t("billing.colPaid")}</HeadCell>
                    <HeadCell>{t("billing.colDue")}</HeadCell>
                    <HeadCell>{t("common.status")}</HeadCell>
                    {canManage ? <TableHead className="w-12" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const overdue = inv.status === "OVERDUE"
                    const amount = num(inv.amount)
                    const paid = num(inv.paidAmount)
                    const partial = paid > 0 && paid < amount
                    return (
                      <TableRow
                        key={inv.id}
                        className={cn(
                          "border-border/60 transition-colors hover:bg-paper-shade/60",
                          overdue && "bg-rose-50/40"
                        )}
                      >
                        <TableCell
                          className={cn(
                            "relative",
                            overdue &&
                              "before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-rose-500"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => openDetails(inv)}
                            aria-label={t("billing.openInvoiceAria", { invoice: inv.invoiceNumber })}
                            className="cursor-pointer rounded font-mono text-[0.8125rem] font-semibold tracking-tight text-emerald-800 underline-offset-4 transition-colors hover:text-emerald-900 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {inv.invoiceNumber}
                          </button>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <CaseChip
                            caseId={inv.caseId}
                            caseNumber={inv.caseNumber}
                            onOpen={(id) => navigate("case-detail", { id })}
                          />
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-ink">{inv.clientName}</TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                          {inv.billingType ? enumLabel("billing.type", inv.billingType, t) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-ink">
                          {formatCurrency(amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="block tabular-nums text-muted-foreground">
                            {formatCurrency(paid)}
                          </span>
                          {partial ? <PaidMeter paid={paid} total={amount} /> : null}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "tabular-nums whitespace-nowrap",
                              overdue && "font-semibold text-rose-700"
                            )}
                          >
                            {formatDate(inv.dueDate)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge map={styles} value={inv.status} />
                        </TableCell>
                        {canManage ? (
                          <TableCell className="text-right">
                            <InvoiceActions invoice={inv} isAdmin={isAdmin} handlers={handlers} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* ---------- Mobile: card rows, since 8 columns cannot fit ---------- */}
            <ul className="divide-y divide-border/60 md:hidden">
              {filtered.map((inv) => {
                const overdue = inv.status === "OVERDUE"
                const amount = num(inv.amount)
                const paid = num(inv.paidAmount)
                const partial = paid > 0 && paid < amount
                return (
                  <li key={inv.id} className={cn("relative", overdue && "bg-rose-50/40")}>
                    {overdue ? (
                      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-rose-500" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openDetails(inv)}
                      aria-label={t("billing.openInvoiceAria", { invoice: inv.invoiceNumber })}
                      className={cn(
                        "w-full cursor-pointer px-4 py-3.5 text-left transition-colors hover:bg-paper-shade/60 focus-visible:bg-paper-shade/60 focus-visible:outline-none",
                        canManage && "pr-12"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[0.8125rem] font-semibold tracking-tight text-emerald-800">
                          {inv.invoiceNumber}
                        </span>
                        <StatusBadge map={styles} value={inv.status} />
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="min-w-0 truncate text-sm text-ink">{inv.clientName}</span>
                        {inv.caseNumber ? (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {inv.caseNumber}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-2.5 flex items-end justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-lg leading-none font-semibold tracking-tight tabular-nums text-ink">
                            {formatCurrency(amount)}
                          </span>
                          {partial ? <PaidMeter paid={paid} total={amount} align="left" /> : null}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="u-eyebrow block text-muted-foreground">{t("billing.colDue")}</span>
                          <span
                            className={cn(
                              "mt-1 block text-xs tabular-nums",
                              overdue ? "font-semibold text-rose-700" : "text-muted-foreground"
                            )}
                          >
                            {formatDate(inv.dueDate)}
                          </span>
                        </span>
                      </span>
                    </button>
                    {canManage ? (
                      <div className="absolute top-2.5 right-2">
                        <InvoiceActions invoice={inv} isAdmin={isAdmin} handlers={handlers} />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </ListCard>

      {isClient ? <p className="px-1 text-xs text-muted-foreground">{t("billing.clientNote")}</p> : null}
    </div>
  )
}

/* ------------------------------ Payments tab ------------------------------ */

function PaymentsTab({
  payments,
  loading,
  error,
  ledger,
  isClient,
  isAdmin,
  onDeletePayment,
  onRetry,
}: {
  payments: PaymentDTO[] | null
  loading: boolean
  error: string | null
  ledger: Ledger
  isClient: boolean
  isAdmin: boolean
  onDeletePayment: (p: PaymentDTO) => void
  onRetry: () => void
}) {
  const { t } = useLanguage()
  const [method, setMethod] = useState(ALL)
  const [search, setSearch] = useState("")

  const list = payments ?? []

  const filtered = useMemo(() => {
    let rows = list
    if (method !== ALL) rows = rows.filter((p) => p.paymentMethod === method)
    const q = search.trim().toLowerCase()
    if (q) {
      rows = rows.filter((p) =>
        [p.invoiceNumber, p.clientName, p.referenceNumber, p.caseNumber]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q))
      )
    }
    return rows
  }, [list, method, search])

  const shownTotal = useMemo(() => filtered.reduce((sum, p) => sum + num(p.amount), 0), [filtered])

  if (loading && !payments) return <LoadingBlock rows={6} tiles={3} />

  if (error && !payments) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t("billing.errLoadPayments")}
        description={error}
        action={
          <Button variant="outline" size="sm" className="cursor-pointer" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        }
      />
    )
  }

  const narrowed = method !== ALL || search.trim().length > 0

  return (
    <div className="space-y-4">
      {/* The ledger stays visible across both tabs — collections context should
          not disappear the moment you switch to the receipts. */}
      {ledger.activeCount > 0 ? (
        isClient ? <ClientDueBand ledger={ledger} /> : <LedgerBand ledger={ledger} />
      ) : null}

      <Toolbar
        note={
          list.length > 0 ? (
            <>
              {narrowed
                ? t("billing.matchCount", { shown: filtered.length, total: list.length })
                : t("billing.countPayments", { count: list.length })}
              {` · ${t("billing.receivedTotal", { amount: formatCurrency(shownTotal) })}`}
            </>
          ) : null
        }
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t("billing.searchPaymentsPh")}
          ariaLabel={t("billing.searchPaymentsAria")}
        />
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-full cursor-pointer lg:w-48">
            <SelectValue placeholder={t("billing.allMethods")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("billing.allMethods")}</SelectItem>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {enumLabel("billing.method", m, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Toolbar>

      <ListCard>
        {filtered.length === 0 ? (
          <EmptyState
            variant="inline"
            className="py-14"
            icon={Banknote}
            title={list.length === 0 ? t("billing.emptyPaymentsTitle") : t("billing.noPaymentsMatchTitle")}
            description={
              list.length === 0 ? t("billing.emptyPaymentsDesc") : t("billing.noPaymentsMatchDesc")
            }
          />
        ) : (
          <>
            {/* ---------- Desktop: receipt table ---------- */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/70 bg-paper-shade/60 hover:bg-paper-shade/60">
                    <HeadCell>{t("common.date")}</HeadCell>
                    <HeadCell>{t("billing.colInvoice")}</HeadCell>
                    <HeadCell className="hidden lg:table-cell">{t("billing.colCase")}</HeadCell>
                    <HeadCell>{t("billing.colClient")}</HeadCell>
                    <HeadCell className="text-right">{t("common.amount")}</HeadCell>
                    <HeadCell>{t("billing.colMethod")}</HeadCell>
                    <HeadCell className="hidden xl:table-cell">{t("billing.colReference")}</HeadCell>
                    <HeadCell className="hidden lg:table-cell">{t("billing.colReceivedBy")}</HeadCell>
                    {isAdmin ? <TableHead className="w-12" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="border-border/60 transition-colors hover:bg-paper-shade/60">
                      <TableCell className="tabular-nums whitespace-nowrap">
                        {formatDate(p.paymentDate)}
                      </TableCell>
                      <TableCell className="font-mono text-[0.8125rem] font-medium text-ink">
                        {p.invoiceNumber ?? "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {p.caseNumber ? (
                          <Badge
                            variant="outline"
                            className="border-border bg-paper-shade font-mono text-[11px] text-muted-foreground"
                          >
                            {p.caseNumber}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-ink">{p.clientName ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums text-emerald-800">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell>
                        <MethodChip method={p.paymentMethod} />
                      </TableCell>
                      <TableCell className="hidden max-w-[140px] truncate font-mono text-[11px] text-muted-foreground xl:table-cell">
                        {p.referenceNumber || "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {p.receivedByName ?? "—"}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 cursor-pointer text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                            aria-label={t("billing.deletePaymentAria", {
                              amount: formatCurrency(p.amount),
                              invoice: p.invoiceNumber ?? "",
                            })}
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
            </div>

            {/* ---------- Mobile: receipt cards ---------- */}
            <ul className="divide-y divide-border/60 md:hidden">
              {filtered.map((p) => (
                <li key={p.id} className="relative px-4 py-3.5">
                  <div className={cn("flex items-start justify-between gap-3", isAdmin && "pr-10")}>
                    <div className="min-w-0">
                      <p className="font-mono text-[0.8125rem] font-semibold text-ink">
                        {p.invoiceNumber ?? "—"}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{p.clientName ?? "—"}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <MethodChip method={p.paymentMethod} />
                        {p.referenceNumber ? (
                          <span className="truncate font-mono text-[11px] text-muted-foreground">
                            {p.referenceNumber}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base leading-none font-semibold tabular-nums text-emerald-800">
                        {formatCurrency(p.amount)}
                      </p>
                      <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                        {formatDate(p.paymentDate)}
                      </p>
                    </div>
                  </div>
                  {isAdmin ? (
                    <div className="absolute top-2.5 right-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 cursor-pointer text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                        aria-label={t("billing.deletePaymentAria", {
                          amount: formatCurrency(p.amount),
                          invoice: p.invoiceNumber ?? "",
                        })}
                        onClick={() => onDeletePayment(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </ListCard>

      {isClient ? <p className="px-1 text-xs text-muted-foreground">{t("billing.clientNote")}</p> : null}
    </div>
  )
}

/* --------------------------------- View --------------------------------- */

export default function BillingView({ user, navigate, params }: ViewProps) {
  const { t } = useLanguage()
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

  // Derived from invoices, so both tabs can show the same ledger band.
  const ledger = useMemo(() => computeLedger(invoicesQ.data ?? []), [invoicesQ.data])

  if (isStaff) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("billing.pageTitle")} description={t("billing.pageSubtitle")} />
        <EmptyState
          icon={ShieldAlert}
          title={t("billing.staffGuardTitle")}
          description={t("billing.staffGuardDesc")}
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
    toast.success(t("billing.toastCancelled"))
    refetchInvoices()
  }

  const deleteInvoice = async () => {
    if (!deleteFor) return
    await apiSend("DELETE", `/api/invoices/${deleteFor.id}`)
    toast.success(t("billing.toastDeleted"))
    refetchInvoices()
  }

  const deletePayment = async () => {
    if (!deletePaymentFor) return
    await apiSend<{ ok: boolean; invoiceStatus: string }>(
      "DELETE",
      `/api/payments/${deletePaymentFor.id}`
    )
    toast.success(t("billing.toastPaymentDeleted", { amount: formatCurrency(deletePaymentFor.amount) }))
    refetchBoth()
  }

  const handlers: InvoiceActionHandlers = {
    onRecordPayment: setPayFor,
    onViewDetails: setDetailsFor,
    onCancel: setCancelFor,
    onDelete: setDeleteFor,
  }

  const invoiceCount = invoicesQ.data?.length ?? 0
  const paymentCount = paymentsQ.data?.length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title={t("billing.pageTitle")} description={t("billing.pageSubtitleFull")}>
        {canManage ? (
          <Button className="cursor-pointer" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> {t("billing.newInvoice")}
          </Button>
        ) : null}
      </PageHeader>

      <Tabs value={tab} onValueChange={changeTab}>
        {/* Segmented control matching the hearings filter bar; Radix keeps the
            roving-tabindex keyboard behaviour that a row of buttons would lose. */}
        <TabsList className="u-rise h-auto w-fit gap-1 rounded-lg bg-paper-shade p-1 ring-1 ring-border/70">
          {(
            [
              { value: "invoices", label: t("billing.tabInvoices"), count: invoiceCount },
              { value: "payments", label: t("billing.tabPayments"), count: paymentCount },
            ] as const
          ).map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="h-auto cursor-pointer gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-soft"
            >
              {item.label}
              {item.count > 0 ? (
                <span className="text-xs tabular-nums opacity-75">{item.count}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab
            invoices={invoicesQ.data}
            loading={invoicesQ.loading}
            error={invoicesQ.error}
            ledger={ledger}
            canManage={canManage}
            isAdmin={isAdmin}
            isClient={isClient}
            navigate={navigate}
            handlers={handlers}
            onRetry={refetchInvoices}
          />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab
            payments={paymentsQ.data}
            loading={paymentsQ.loading}
            error={paymentsQ.error}
            ledger={ledger}
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
        title={t("billing.cancelConfirmTitle")}
        description={
          cancelFor
            ? t("billing.cancelConfirmDesc", {
                invoice: cancelFor.invoiceNumber,
                client: cancelFor.clientName,
              })
            : undefined
        }
        confirmLabel={t("billing.cancelInvoice")}
        onConfirm={cancelInvoice}
      />
      <ConfirmDialog
        open={!!deleteFor}
        onOpenChange={(o) => {
          if (!o) setDeleteFor(null)
        }}
        title={t("billing.deleteConfirmTitle")}
        description={
          deleteFor ? t("billing.deleteConfirmDesc", { invoice: deleteFor.invoiceNumber }) : undefined
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={deleteInvoice}
      />
      <ConfirmDialog
        open={!!deletePaymentFor}
        onOpenChange={(o) => {
          if (!o) setDeletePaymentFor(null)
        }}
        title={t("billing.deletePaymentConfirmTitle")}
        description={
          deletePaymentFor
            ? t("billing.deletePaymentConfirmDesc", {
                amount: formatCurrency(deletePaymentFor.amount),
                invoice: deletePaymentFor.invoiceNumber ?? "",
              })
            : undefined
        }
        confirmLabel={t("billing.deletePaymentBtn")}
        destructive
        onConfirm={deletePayment}
      />
    </div>
  )
}
