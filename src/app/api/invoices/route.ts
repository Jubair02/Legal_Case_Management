import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth, requireNumber, requireString } from "@/lib/api-helpers"
import { dhakaDateKey, dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { clientUserId, notifyUsers } from "@/lib/notify"
import { audit } from "@/lib/audit"
import { enqueueOutbound } from "@/lib/outbound"

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
  case: { caseNumber: string; title: string } | null
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

function paidOf(inv: Pick<InvoiceRow, "payments">): number {
  return inv.payments.reduce((s, p) => s + p.amount, 0)
}

function computeInvoiceStatus(
  inv: Pick<InvoiceRow, "status" | "amount" | "dueDate">,
  paid: number,
  todayStart: Date
): string {
  if (inv.status === "CANCELLED") return "CANCELLED"
  if (paid >= inv.amount - 0.005) return "PAID"
  if (paid > 0.005) return "PARTIAL"
  if (inv.dueDate && inv.dueDate.getTime() < todayStart.getTime()) return "OVERDUE"
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

const invoiceInclude = {
  case: { select: { caseNumber: true, title: true } },
  client: { select: { id: true, name: true } },
  payments: true,
} as const

export async function GET(request: Request) {
  return handle(async () => {
    const user = await requireAuth()
    if (user.role === "STAFF") {
      throw new ApiError("You do not have access to financial data.", 403)
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = optionalString(searchParams.get("status"))
    const clientId = optionalString(searchParams.get("clientId"))
    const caseId = optionalString(searchParams.get("caseId"))
    const search = optionalString(searchParams.get("search"))

    const where: Record<string, unknown> = {}
    if (user.role === "LAWYER") {
      where.case = { lawyer: { userId: user.id } }
      // Lawyers may additionally narrow to one of their own clients.
      if (clientId) where.clientId = clientId
    } else if (user.role === "CLIENT") {
      if (!user.clientProfile) return Response.json({ data: [] })
      // Clients are always locked to their own profile — never honour clientId param.
      where.clientId = user.clientProfile.id
      if (caseId) where.caseId = caseId
    } else {
      // ADMIN: optional filters.
      if (clientId) where.clientId = clientId
      if (caseId) where.caseId = caseId
    }

    const todayRange = dhakaDayRange(dhakaDayOffset(0))
    const rows = (await db.invoice.findMany({
      where: where as never,
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    })) as InvoiceRow[]

    const result = []
    for (const inv of rows) {
      const paid = paidOf(inv)
      const computed = computeInvoiceStatus(inv, paid, todayRange.start)
      if (computed !== inv.status) {
        try {
          await db.invoice.update({ where: { id: inv.id }, data: { status: computed } })
        } catch {
          // keep going even if persisting the refreshed status fails
        }
        inv.status = computed
      }
      if (statusFilter && inv.status !== statusFilter) continue
      if (search) {
        const q = search.toLowerCase()
        const match =
          inv.invoiceNumber.toLowerCase().includes(q) || inv.client.name.toLowerCase().includes(q)
        if (!match) continue
      }
      result.push(invoiceDTO(inv, inv.status))
    }

    return Response.json({ data: result })
  })
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "LAWYER"])
    const body = await readJson<Record<string, unknown>>(request)

    const clientId = requireString(body.clientId, "clientId")
    const client = await db.client.findUnique({
      where: { id: clientId },
      select: { id: true, name: true, phone: true, email: true, userId: true },
    })
    if (!client) throw new ApiError("Client not found.", 422)

    const amount = requireNumber(body.amount, "amount")
    if (!(amount > 0)) throw new ApiError('"amount" must be greater than 0.', 422)

    const caseId = optionalString(body.caseId)
    if (caseId) {
      const kase = await db.case.findUnique({
        where: { id: caseId },
        select: { id: true, clientId: true, lawyer: { select: { userId: true } } },
      })
      if (!kase) throw new ApiError("Case not found.", 422)
      // The invoice's client must match the case's client.
      if (kase.clientId !== clientId) {
        throw new ApiError("The selected case does not belong to the selected client.", 422)
      }
      // Lawyers may only invoice clients/cases assigned to them.
      if (user.role === "LAWYER" && kase.lawyer?.userId !== user.id) {
        throw new ApiError("You can only create invoices for your own cases.", 403)
      }
    } else if (user.role === "LAWYER") {
      // Without a case there is no lawyer scoping — require one from lawyers.
      throw new ApiError("Please select a case for the invoice.", 422)
    }

    const billingType = optionalString(body.billingType)
    const description = optionalString(body.description)
    const dueDate = parseDateOnly(body.dueDate)

    const yearKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
    }).format(new Date())
    const prefix = `INV-${yearKey}-`
    const existingCount = await db.invoice.count({
      where: { invoiceNumber: { startsWith: prefix } },
    })

    let created: InvoiceRow | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const candidate = `${prefix}${String(existingCount + 1 + attempt).padStart(4, "0")}`
      try {
        created = (await db.invoice.create({
          data: {
            invoiceNumber: candidate,
            caseId: caseId ?? null,
            clientId,
            billingType,
            description,
            amount,
            dueDate,
            createdById: user.id,
          },
          include: invoiceInclude,
        })) as unknown as InvoiceRow
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2002") throw e
      }
    }
    if (!created) throw new ApiError("Could not generate a unique invoice number.", 500)

    const clientPortalUserId = await clientUserId(clientId)
    await notifyUsers([clientPortalUserId], {
      title: `New Invoice — ${created.invoiceNumber}`,
      message: `An invoice of ৳${created.amount.toLocaleString("en-US")} has been issued for you.`,
      type: "BILLING",
      caseId: created.caseId ?? undefined,
      link: created.caseId ? `case-detail:${created.caseId}` : "billing",
    })

    // SMS/Email bridge + audit trail — client profile carries phone/email/userId.
    const dueLabel = created.dueDate ? dhakaDateKey(created.dueDate) : "on receipt"
    await enqueueOutbound({
      event: "INVOICE_ISSUED",
      recipients: [
        { phone: client.phone, email: client.email, name: client.name, userId: client.userId },
      ],
      subject: `Invoice ${created.invoiceNumber} — AinSheba`,
      smsBody: `AinSheba: Invoice ${created.invoiceNumber} of ৳${created.amount.toLocaleString("en-US")} issued${
        created.case ? ` for case ${created.case.caseNumber}` : ""
      }. Due ${dueLabel}.`,
      caseId: created.caseId,
      caseNumber: created.case?.caseNumber ?? null,
      dedupeKey: `invoice-issued:${created.id}`,
    })

    await audit(user, "INVOICE_CREATE", "Invoice", created.id, created.invoiceNumber,
      `Issued invoice ${created.invoiceNumber} of ৳${created.amount.toLocaleString("en-US")} for ${client.name}`)

    return Response.json(
      {
        data: invoiceDTO(
          created,
          computeInvoiceStatus(created, paidOf(created), dhakaDayRange(dhakaDayOffset(0)).start)
        ),
      },
      { status: 201 }
    )
  })
}
