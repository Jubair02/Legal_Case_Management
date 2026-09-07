import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth, requireNumber, requireString } from "@/lib/api-helpers"
import { PAYMENT_METHODS } from "@/lib/constants"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { adminIds, clientUserId, notifyUsers } from "@/lib/notify"

const paymentInclude = {
  invoice: {
    include: {
      case: { select: { caseNumber: true, title: true } },
      client: { select: { id: true, name: true } },
    },
  },
} as const

function paymentDTO(p: {
  id: string
  invoiceId: string
  amount: number
  paymentMethod: string
  paymentDate: Date
  referenceNumber: string | null
  notes: string | null
  receivedByName: string | null
  createdAt: Date
  invoice: {
    invoiceNumber: string
    clientId: string
    case: { caseNumber: string } | null
    client: { name: string }
  }
}) {
  return {
    id: p.id,
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoice.invoiceNumber,
    caseNumber: p.invoice.case?.caseNumber ?? null,
    clientName: p.invoice.client.name,
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    paymentDate: p.paymentDate,
    referenceNumber: p.referenceNumber,
    notes: p.notes,
    receivedByName: p.receivedByName,
    createdAt: p.createdAt,
  }
}

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    if (user.role === "STAFF") {
      throw new ApiError("You do not have access to financial data.", 403)
    }

    const { searchParams } = new URL(request.url)
    const invoiceId = optionalString(searchParams.get("invoiceId"))
    const clientId = optionalString(searchParams.get("clientId"))
    const caseId = optionalString(searchParams.get("caseId"))

    const where: Record<string, unknown> = {}
    if (user.role === "LAWYER") {
      const invoiceFilter: Record<string, unknown> = { case: { lawyer: { userId: user.id } } }
      if (clientId) invoiceFilter.clientId = clientId
      if (caseId) invoiceFilter.caseId = caseId
      where.invoice = invoiceFilter
    } else if (user.role === "CLIENT") {
      if (!user.clientProfile) return Response.json({ data: [] })
      // Clients are always locked to their own profile — never honour clientId param.
      const invoiceFilter: Record<string, unknown> = { clientId: user.clientProfile.id }
      if (caseId) invoiceFilter.caseId = caseId
      where.invoice = invoiceFilter
    } else {
      // ADMIN: optional filters.
      if (invoiceId) where.invoiceId = invoiceId
      if (caseId) where.invoice = { caseId }
      if (clientId) where.invoice = { clientId }
    }

    const rows = await db.payment.findMany({
      where: where as never,
      include: paymentInclude,
      orderBy: { paymentDate: "desc" },
    })

    return Response.json({ data: rows.map(paymentDTO) })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "LAWYER"])
    const body = await readJson<Record<string, unknown>>(request)

    const invoiceId = requireString(body.invoiceId, "invoiceId")
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        case: {
          select: { caseNumber: true, title: true, lawyer: { select: { userId: true } } },
        },
        client: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
      },
    })
    if (!invoice) throw new ApiError("Invoice not found.", 404)

    // Lawyers can only record payments on invoices of their own cases.
    if (user.role === "LAWYER" && invoice.case?.lawyer?.userId !== user.id) {
      throw new ApiError("You can only record payments for your own cases.", 403)
    }

    if (invoice.status === "CANCELLED") {
      throw new ApiError("This invoice has been cancelled — payments cannot be recorded against it.", 409)
    }

    const amount = requireNumber(body.amount, "amount")
    if (!(amount > 0)) throw new ApiError('"amount" must be greater than 0.', 422)

    const paymentMethod = requireString(body.paymentMethod, "paymentMethod")
    if (!PAYMENT_METHODS.includes(paymentMethod as never)) {
      throw new ApiError("Invalid payment method.", 422)
    }

    const paid = invoice.payments.reduce((s, p) => s + p.amount, 0)
    const remaining = Math.max(0, Math.round((invoice.amount - paid) * 100) / 100)
    if (amount > remaining + 0.005) {
      throw new ApiError(
        `Payment exceeds remaining due of ৳${remaining.toLocaleString("en-US")}`,
        422
      )
    }

    const paymentDate = parseDateOnly(body.paymentDate) ?? new Date()
    const referenceNumber = optionalString(body.referenceNumber)
    const notes = optionalString(body.notes)

    const created = await db.payment.create({
      data: {
        invoiceId,
        amount,
        paymentMethod,
        paymentDate,
        referenceNumber,
        notes,
        receivedById: user.id,
        receivedByName: user.name,
      },
      include: paymentInclude,
    })

    // recompute + persist invoice status
    const newPaid = paid + amount
    const todayStart = dhakaDayRange(dhakaDayOffset(0)).start
    let status: string
    if (newPaid >= invoice.amount - 0.005) {
      status = "PAID"
    } else if (newPaid > 0.005) {
      status = "PARTIAL"
    } else if (invoice.dueDate && invoice.dueDate.getTime() < todayStart.getTime()) {
      status = "OVERDUE"
    } else {
      status = "UNPAID"
    }
    if (status !== invoice.status) {
      await db.invoice.update({ where: { id: invoiceId }, data: { status } })
    }

    const [clientPortalUserId, admins] = await Promise.all([
      clientUserId(invoice.clientId),
      adminIds(),
    ])
    await notifyUsers([clientPortalUserId, ...admins.filter((uid) => uid !== user.id)], {
      title: `Payment Received — ৳${amount.toLocaleString("en-US")}`,
      message: `${paymentMethod} payment received for invoice ${invoice.invoiceNumber}.${
        invoice.case ? ` Case ${invoice.case.caseNumber}.` : ""
      }`,
      type: "BILLING",
      caseId: invoice.caseId ?? undefined,
      link: invoice.caseId ? `case-detail:${invoice.caseId}` : "billing",
    })

    return Response.json({ data: paymentDTO(created) }, { status: 201 })
  })
}
