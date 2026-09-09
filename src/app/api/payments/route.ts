import type { $Enums } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, okPaged, optionalString, parseDateOnly, parsePagination, readJson, requireAuth, requireNumber, requireString } from "@/lib/api-helpers"
import { PAYMENT_METHODS } from "@/lib/constants"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { adminIds, clientUserId, notifyUsers } from "@/lib/notify"
import { audit } from "@/lib/audit"
import { enqueueOutbound } from "@/lib/outbound"

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
      // ADMIN: optional filters (all combine when supplied together).
      if (invoiceId) where.invoiceId = invoiceId
      if (caseId || clientId) {
        where.invoice = {
          ...(caseId ? { caseId } : {}),
          ...(clientId ? { clientId } : {}),
        }
      }
    }

    const page = parsePagination(searchParams)
    const [rows, total] = await Promise.all([
      db.payment.findMany({
        where: where as never,
        include: paymentInclude,
        orderBy: { paymentDate: "desc" },
        take: page.take,
        skip: page.skip,
      }),
      db.payment.count({ where: where as never }),
    ])

    return okPaged(rows.map(paymentDTO), total, page)
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "LAWYER"])
    const body = await readJson<Record<string, unknown>>(request)

    const invoiceId = requireString(body.invoiceId, "invoiceId")

    // Read-check-create-recompute runs inside one transaction so two concurrent
    // payments can never both pass the remaining-balance check (TOCTOU).
    const { created, invoice } = await db.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          case: {
            select: { caseNumber: true, title: true, lawyer: { select: { userId: true } } },
          },
          client: { select: { id: true, name: true, phone: true, email: true, userId: true } },
          payments: { select: { amount: true } },
        },
      })
      if (!inv) throw new ApiError("Invoice not found.", 404)

      // Lawyers can only record payments on invoices of their own cases.
      if (user.role === "LAWYER" && inv.case?.lawyer?.userId !== user.id) {
        throw new ApiError("You can only record payments for your own cases.", 403)
      }

      if (inv.status === "CANCELLED") {
        throw new ApiError("This invoice has been cancelled — payments cannot be recorded against it.", 409)
      }

      const amount = requireNumber(body.amount, "amount")
      if (!(amount > 0)) throw new ApiError('"amount" must be greater than 0.', 422)

      const paymentMethod = requireString(body.paymentMethod, "paymentMethod")
      if (!PAYMENT_METHODS.includes(paymentMethod as never)) {
        throw new ApiError("Invalid payment method.", 422)
      }

      const paid = inv.payments.reduce((s, p) => s + p.amount, 0)
      const remaining = Math.max(0, Math.round((inv.amount - paid) * 100) / 100)
      if (amount > remaining + 0.005) {
        throw new ApiError(
          `Payment exceeds remaining due of ৳${remaining.toLocaleString("en-US")}`,
          422
        )
      }

      const paymentDate = parseDateOnly(body.paymentDate) ?? new Date()
      const referenceNumber = optionalString(body.referenceNumber)
      const notes = optionalString(body.notes)

      const createdPayment = await tx.payment.create({
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
      let status: $Enums.InvoiceStatus
      if (newPaid >= inv.amount - 0.005) {
        status = "PAID"
      } else if (newPaid > 0.005) {
        status = "PARTIAL"
      } else if (inv.dueDate && inv.dueDate.getTime() < todayStart.getTime()) {
        status = "OVERDUE"
      } else {
        status = "UNPAID"
      }
      if (status !== inv.status) {
        await tx.invoice.update({ where: { id: invoiceId }, data: { status } })
      }

      return { created: createdPayment, invoice: inv }
    })

    const [clientPortalUserId, admins] = await Promise.all([
      clientUserId(invoice.clientId),
      adminIds(),
    ])
    await notifyUsers([clientPortalUserId, ...admins.filter((uid) => uid !== user.id)], {
      title: `Payment Received — ৳${created.amount.toLocaleString("en-US")}`,
      message: `${created.paymentMethod} payment received for invoice ${invoice.invoiceNumber}.${
        invoice.case ? ` Case ${invoice.case.caseNumber}.` : ""
      }`,
      type: "BILLING",
      caseId: invoice.caseId ?? undefined,
      link: invoice.caseId ? `case-detail:${invoice.caseId}` : "billing",
    })

    // SMS/Email bridge + audit trail — strictly after the transaction commits.
    // invoice.payments was read inside the tx before the insert, so the new
    // total paid is that sum plus the payment just created.
    const paidNow = invoice.payments.reduce((s, p) => s + p.amount, 0) + created.amount
    const remaining = Math.max(0, Math.round((invoice.amount - paidNow) * 100) / 100)
    await enqueueOutbound({
      event: "PAYMENT_RECEIVED",
      recipients: [
        {
          phone: invoice.client.phone,
          email: invoice.client.email,
          name: invoice.client.name,
          userId: invoice.client.userId,
        },
      ],
      subject: "Payment received — AinSheba",
      smsBody: `AinSheba: Payment of ৳${created.amount.toLocaleString("en-US")} received for invoice ${invoice.invoiceNumber}. Total paid ৳${paidNow.toLocaleString("en-US")}, remaining ৳${remaining.toLocaleString("en-US")}.`,
      caseId: invoice.caseId,
      caseNumber: invoice.case?.caseNumber ?? null,
      dedupeKey: `payment-received:${created.id}`,
    })

    await audit(user, "PAYMENT_RECORD", "Payment", created.id, invoice.invoiceNumber,
      `Received ৳${created.amount.toLocaleString("en-US")} (${created.paymentMethod}) toward ${invoice.invoiceNumber}`)

    return Response.json({ data: paymentDTO(created) }, { status: 201 })
  })
}
