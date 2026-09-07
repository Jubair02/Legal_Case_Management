import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth, requireNumber } from "@/lib/api-helpers"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"

type InvoiceRow = {
  id: string
  invoiceNumber: string
  caseId: string | null
  clientId: string
  billingType: string | null
  description: string | null
  amount: number
  dueDate: Date | null
  status: string
  createdAt: Date
  case: { caseNumber: string; title: string; lawyer?: { userId: string } | null } | null
  client: { id: string; name: string }
  payments: {
    id: string
    invoiceId: string
    amount: number
    paymentMethod: string
    paymentDate: Date
    referenceNumber: string | null
    notes: string | null
    receivedByName: string | null
    createdAt: Date
  }[]
}

const invoiceInclude = {
  case: { select: { caseNumber: true, title: true, lawyer: { select: { userId: true } } } },
  client: { select: { id: true, name: true } },
  payments: true,
} as const

function paidOf(inv: Pick<InvoiceRow, "payments">): number {
  return inv.payments.reduce((s, p) => s + p.amount, 0)
}

function computeInvoiceStatus(
  status: string,
  amount: number,
  dueDate: Date | null,
  paid: number,
  todayStart: Date
): string {
  if (status === "CANCELLED") return "CANCELLED"
  if (paid >= amount - 0.005) return "PAID"
  if (paid > 0.005) return "PARTIAL"
  if (dueDate && dueDate.getTime() < todayStart.getTime()) return "OVERDUE"
  return "UNPAID"
}

function invoiceDTO(inv: InvoiceRow, status: string) {
  const paid = paidOf(inv)
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    caseId: inv.caseId,
    caseNumber: inv.case?.caseNumber ?? null,
    caseTitle: inv.case?.title ?? null,
    clientId: inv.clientId,
    clientName: inv.client.name,
    billingType: inv.billingType,
    description: inv.description,
    amount: inv.amount,
    paidAmount: paid,
    dueDate: inv.dueDate,
    status,
    payments: inv.payments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      caseNumber: inv.case?.caseNumber ?? null,
      clientName: inv.client.name,
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      paymentDate: p.paymentDate,
      referenceNumber: p.referenceNumber,
      notes: p.notes,
      receivedByName: p.receivedByName,
      createdAt: p.createdAt,
    })),
    createdAt: inv.createdAt,
  }
}

async function loadInvoice(id: string): Promise<InvoiceRow> {
  const inv = (await db.invoice.findUnique({
    where: { id },
    include: invoiceInclude,
  })) as unknown as InvoiceRow | null
  if (!inv) throw new ApiError("Invoice not found.", 404)
  return inv
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "LAWYER"])
    const { id } = await params
    const inv = await loadInvoice(id)
    // Lawyers may only manage invoices attached to their own cases.
    if (user.role === "LAWYER" && inv.case?.lawyer?.userId !== user.id) {
      throw new ApiError("You can only manage invoices for your own cases.", 403)
    }
    const body = await readJson<Record<string, unknown>>(request)

    const data: Record<string, unknown> = {}
    if (body.billingType !== undefined) data.billingType = optionalString(body.billingType)
    if (body.description !== undefined) data.description = optionalString(body.description)
    if (body.dueDate !== undefined) data.dueDate = parseDateOnly(body.dueDate)
    if (body.amount !== undefined) {
      const amount = requireNumber(body.amount, "amount")
      if (!(amount > 0)) throw new ApiError('"amount" must be greater than 0.', 422)
      data.amount = amount
    }

    let unCancel = false
    if (body.status !== undefined) {
      const s = typeof body.status === "string" ? body.status.trim() : ""
      if (s === "CANCELLED") {
        data.status = "CANCELLED"
      } else if (inv.status === "CANCELLED") {
        unCancel = true // restore: recompute from data
      } else {
        throw new ApiError("Only CANCELLED status can be set manually.", 422)
      }
    }

    await db.invoice.update({ where: { id }, data: data as never })
    const refreshed = await loadInvoice(id)
    const todayStart = dhakaDayRange(dhakaDayOffset(0)).start
    const effectiveStatus = unCancel
      ? computeInvoiceStatus(
          "UNPAID", // ignore stored CANCELLED while restoring
          refreshed.amount,
          refreshed.dueDate,
          paidOf(refreshed),
          todayStart
        )
      : computeInvoiceStatus(
          refreshed.status,
          refreshed.amount,
          refreshed.dueDate,
          paidOf(refreshed),
          todayStart
        )
    if (effectiveStatus !== refreshed.status) {
      await db.invoice.update({ where: { id }, data: { status: effectiveStatus } })
    }

    const final = await loadInvoice(id)
    return Response.json({ data: invoiceDTO(final, effectiveStatus) })
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const { id } = await params
    const inv = await db.invoice.findUnique({
      where: { id },
      select: { id: true, _count: { select: { payments: true } } },
    })
    if (!inv) throw new ApiError("Invoice not found.", 404)
    if (inv._count.payments > 0) {
      throw new ApiError("Invoices with payments cannot be deleted. Cancel it instead.", 409)
    }
    await db.invoice.delete({ where: { id } })
    return Response.json({ data: { ok: true } })
  })
}
