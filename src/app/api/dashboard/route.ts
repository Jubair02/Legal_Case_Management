import { db } from "@/lib/db"
import { handle, requireAuth } from "@/lib/api-helpers"
import { dhakaDateKey, dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { CURRENCY_SYMBOL } from "@/lib/constants"

const ACTIVE_STATUSES = ["ACTIVE", "PENDING", "ON_HOLD"]
const CLOSED_STATUSES = ["RESOLVED", "CLOSED"]

type CaseRow = {
  id: string
  caseNumber: string
  title: string
  type: string
  status: string
  priority: string
  court: string
  district: string | null
  filingDate: Date | null
  oppositeParty: string | null
  createdAt: Date
  client: { id: string; name: string; phone: string | null }
  lawyer: { id: string; name: string } | null
}

type HearingRow = {
  id: string
  caseId: string
  hearingDate: Date
  court: string | null
  judge: string | null
  hearingType: string | null
  status: string
  notes: string | null
  summary: string | null
  courtOrder: string | null
  nextAction: string | null
  nextHearingDate: Date | null
  createdAt: Date
  case: { caseNumber: string; title: string }
}

function hearingDTO(h: HearingRow, forClient = false) {
  const base = {
    id: h.id,
    caseId: h.caseId,
    caseNumber: h.case.caseNumber,
    caseTitle: h.case.title,
    hearingDate: h.hearingDate,
    court: h.court,
    hearingType: h.hearingType,
    status: h.status,
    nextHearingDate: h.nextHearingDate,
    createdAt: h.createdAt,
  }
  if (forClient) {
    // Internal work-product (judge, notes, orders, strategy) is not exposed to clients.
    return base
  }
  return {
    ...base,
    judge: h.judge,
    notes: h.notes,
    summary: h.summary,
    courtOrder: h.courtOrder,
    nextAction: h.nextAction,
  }
}

function caseListDTO(c: CaseRow, nextHearingDate: Date | null, lastUpdate: string | null) {
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    type: c.type,
    status: c.status,
    priority: c.priority,
    court: c.court,
    district: c.district,
    filingDate: c.filingDate,
    oppositeParty: c.oppositeParty,
    client: { id: c.client.id, name: c.client.name, phone: c.client.phone },
    lawyer: c.lawyer ? { id: c.lawyer.id, name: c.lawyer.name } : null,
    nextHearingDate,
    lastUpdate,
    createdAt: c.createdAt,
  }
}

/** Attach nextHearingDate (earliest future UPCOMING) + lastUpdate (latest update, 90 chars) to cases. */
async function buildCaseListDTOs(cases: CaseRow[]) {
  const ids = cases.map((c) => c.id)
  const now = new Date()
  const [upcoming, updates] = await Promise.all([
    ids.length
      ? db.hearing.findMany({
          where: { caseId: { in: ids }, status: "UPCOMING", hearingDate: { gte: now } },
          select: { caseId: true, hearingDate: true },
          orderBy: { hearingDate: "asc" },
        })
      : Promise.resolve([] as { caseId: string; hearingDate: Date }[]),
    ids.length
      ? db.caseUpdate.findMany({
          where: { caseId: { in: ids } },
          select: { caseId: true, update: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([] as { caseId: string; update: string }[]),
  ])
  const nextByCase = new Map<string, Date>()
  for (const h of upcoming) if (!nextByCase.has(h.caseId)) nextByCase.set(h.caseId, h.hearingDate)
  const lastByCase = new Map<string, string>()
  for (const u of updates) if (!lastByCase.has(u.caseId)) lastByCase.set(u.caseId, u.update.slice(0, 90))
  return cases.map((c) => caseListDTO(c, nextByCase.get(c.id) ?? null, lastByCase.get(c.id) ?? null))
}

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
  client: { id: string; name: string; phone: string | null; email: string | null }
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

function paidOf(inv: InvoiceRow): number {
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

function formatMoney(n: number): string {
  return n.toLocaleString("en-US")
}

export async function GET() {
  return handle(async () => {
    const user = await requireAuth()
    const now = new Date()
    const todayRange = dhakaDayRange(dhakaDayOffset(0))
    const plus7Range = dhakaDayRange(dhakaDayOffset(7))

    const todaysHearings = async (caseWhere: Record<string, unknown> = {}) =>
      (
        await db.hearing.findMany({
          where: { hearingDate: { gte: todayRange.start, lt: todayRange.end }, case: caseWhere },
          include: { case: { select: { caseNumber: true, title: true } } },
          orderBy: { hearingDate: "asc" },
        })
      ).map(hearingDTO)

    const upcoming7 = async (caseWhere: Record<string, unknown> = {}) =>
      (
        await db.hearing.findMany({
          where: {
            status: "UPCOMING",
            hearingDate: { gte: todayRange.start, lt: plus7Range.start },
            case: caseWhere,
          },
          include: { case: { select: { caseNumber: true, title: true } } },
          orderBy: { hearingDate: "asc" },
          take: 6,
        })
      ).map(hearingDTO)

    // ---------- ADMIN ----------
    if (user.role === "ADMIN") {
      const [
        totalCases,
        activeCases,
        upcomingCount,
        closedCases,
        totalClients,
        totalLawyers,
        allInvoices,
        updates,
        payments,
        newCases,
        docs,
        recentHearings,
      ] = await Promise.all([
        db.case.count(),
        db.case.count({ where: { status: { in: ACTIVE_STATUSES } } }),
        db.hearing.count({ where: { status: "UPCOMING", hearingDate: { gte: now } } }),
        db.case.count({ where: { status: { in: CLOSED_STATUSES } } }),
        db.client.count(),
        db.lawyer.count(),
        db.invoice.findMany({ include: { case: { select: { caseNumber: true, title: true } }, client: { select: { id: true, name: true, phone: true, email: true } }, payments: true } }),
        db.caseUpdate.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { case: { select: { caseNumber: true } } } }),
        db.payment.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { invoice: { select: { invoiceNumber: true } } } }),
        db.case.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, caseNumber: true, title: true, createdAt: true } }),
        db.caseDocument.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { case: { select: { caseNumber: true } } } }),
        db.hearing.findMany({
          where: { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { case: { select: { caseNumber: true, title: true } } },
        }),
      ])

      let pendingAmount = 0
      let pendingInvoiceCount = 0
      for (const inv of allInvoices) {
        const status = computeInvoiceStatus(inv, paidOf(inv), todayRange.start)
        if (status === "UNPAID" || status === "PARTIAL" || status === "OVERDUE") {
          pendingAmount += inv.amount - paidOf(inv)
          pendingInvoiceCount += 1
        }
      }

      const recentActivities = [
        ...updates.map((u) => ({
          id: u.id,
          kind: "UPDATE",
          title: u.case.caseNumber,
          description: u.update.length > 120 ? `${u.update.slice(0, 120)}…` : u.update,
          createdAt: u.createdAt,
        })),
        ...payments.map((p) => ({
          id: p.id,
          kind: "PAYMENT",
          title: `${"Payment received — " + CURRENCY_SYMBOL}${formatMoney(p.amount)}`,
          description: p.invoice ? `Invoice ${p.invoice.invoiceNumber} · ${p.paymentMethod}` : p.paymentMethod,
          createdAt: p.createdAt,
        })),
        ...newCases.map((c) => ({
          id: c.id,
          kind: "CASE",
          title: `Case registered — ${c.caseNumber}`,
          description: c.title,
          createdAt: c.createdAt,
        })),
        ...docs.map((d) => ({
          id: d.id,
          kind: "DOCUMENT",
          title: `Document uploaded — ${d.documentName}`,
          description: `Case ${d.case.caseNumber}`,
          createdAt: d.createdAt,
        })),
        ...recentHearings.map((h) => ({
          id: h.id,
          kind: "HEARING",
          title: `Hearing Scheduled — ${h.case.caseNumber}`,
          description: `${h.hearingType ?? "Hearing"} on ${dhakaDateKey(h.hearingDate)}`,
          createdAt: h.createdAt,
        })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 8)

      return Response.json({
        data: {
          role: "ADMIN",
          stats: {
            totalCases,
            activeCases,
            upcomingHearings: upcomingCount,
            closedCases,
            pendingAmount,
            pendingInvoiceCount,
            totalClients,
            totalLawyers,
          },
          todaysHearings: await todaysHearings(),
          upcomingHearings: await upcoming7(),
          recentActivities,
        },
      })
    }

    // ---------- LAWYER ----------
    if (user.role === "LAWYER") {
      const lp = user.lawyerProfile
      const caseWhere = { lawyerId: lp?.id ?? "none" }
      const [myActiveCases, todays, upcomingList, upcomingCount, lawyerInvoices, myCasesRows] =
        await Promise.all([
          db.case.count({ where: { ...caseWhere, status: { in: ACTIVE_STATUSES } } }),
          todaysHearings(caseWhere),
          upcoming7(caseWhere),
          db.hearing.count({ where: { status: "UPCOMING", hearingDate: { gte: now }, case: caseWhere } }),
          db.invoice.findMany({
            where: { case: caseWhere },
            include: { case: { select: { caseNumber: true, title: true } }, client: { select: { id: true, name: true, phone: true, email: true } }, payments: true },
          }),
          db.case.findMany({
            where: caseWhere,
            include: { client: { select: { id: true, name: true, phone: true } }, lawyer: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
        ])

      let pendingClientPayments = 0
      for (const inv of lawyerInvoices) {
        const status = computeInvoiceStatus(inv, paidOf(inv), todayRange.start)
        if (status === "UNPAID" || status === "PARTIAL" || status === "OVERDUE") {
          pendingClientPayments += inv.amount - paidOf(inv)
        }
      }

      return Response.json({
        data: {
          role: "LAWYER",
          stats: {
            myActiveCases,
            todaysHearings: todays.length,
            upcomingHearings: upcomingCount,
            pendingClientPayments,
          },
          todaysHearings: todays,
          upcomingHearings: upcomingList,
          myCases: await buildCaseListDTOs(myCasesRows as CaseRow[]),
        },
      })
    }

    // ---------- CLIENT ----------
    if (user.role === "CLIENT") {
      const cp = user.clientProfile
      const caseWhere = { clientId: cp?.id ?? "none" }
      const [totalCases, activeCases, myCasesRows, nextHearingRows, ownUpdates, clientInvoices] =
        await Promise.all([
          db.case.count({ where: caseWhere }),
          db.case.count({ where: { ...caseWhere, status: { in: ACTIVE_STATUSES } } }),
          db.case.findMany({
            where: caseWhere,
            include: { client: { select: { id: true, name: true, phone: true } }, lawyer: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          }),
          db.hearing.findMany({
            where: { status: "UPCOMING", hearingDate: { gte: now }, case: caseWhere },
            include: { case: { select: { caseNumber: true, title: true } } },
            orderBy: { hearingDate: "asc" },
            take: 1,
          }),
          db.caseUpdate.findMany({
            where: { case: caseWhere },
            include: { case: { select: { id: true, caseNumber: true, title: true } } },
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
          db.invoice.findMany({
            where: { clientId: cp?.id ?? "none" },
            include: { case: { select: { caseNumber: true, title: true } }, client: { select: { id: true, name: true, phone: true, email: true } }, payments: true },
          }),
        ])

      const nextHearing = nextHearingRows.length ? hearingDTO(nextHearingRows[0], true) : null
      const outstandingInvoices = clientInvoices
        .map((inv) => invoiceDTO(inv, computeInvoiceStatus(inv, paidOf(inv), todayRange.start)))
        .filter((dto) => dto.status === "UNPAID" || dto.status === "PARTIAL" || dto.status === "OVERDUE")
      const outstandingAmount = outstandingInvoices.reduce((s, dto) => s + (dto.amount - dto.paidAmount), 0)

      return Response.json({
        data: {
          role: "CLIENT",
          stats: {
            totalCases,
            activeCases,
            nextHearingDate: nextHearing ? nextHearing.hearingDate : null,
            outstandingAmount,
          },
          myCases: await buildCaseListDTOs(myCasesRows as CaseRow[]),
          nextHearing,
          recentUpdates: ownUpdates.map((u) => ({
            id: u.id,
            caseId: u.case.id,
            caseNumber: u.case.caseNumber,
            caseTitle: u.case.title,
            update: u.update,
            createdByName: u.createdByName,
            createdAt: u.createdAt,
          })),
          outstandingInvoices,
        },
      })
    }

    // ---------- STAFF ----------
    const [totalCases, activeCases, todays, upcomingList, upcomingCount, totalClients, recentCasesRows] =
      await Promise.all([
        db.case.count(),
        db.case.count({ where: { status: { in: ACTIVE_STATUSES } } }),
        todaysHearings(),
        upcoming7(),
        db.hearing.count({ where: { status: "UPCOMING", hearingDate: { gte: now } } }),
        db.client.count(),
        db.case.findMany({
          include: { client: { select: { id: true, name: true, phone: true } }, lawyer: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ])

    return Response.json({
      data: {
        role: "STAFF",
        stats: {
          totalCases,
          activeCases,
          todaysHearings: todays.length,
          upcomingHearings: upcomingCount,
          totalClients,
        },
        todaysHearings: todays,
        upcomingHearings: upcomingList,
        recentCases: await buildCaseListDTOs(recentCasesRows as CaseRow[]),
      },
    })
  })
}
