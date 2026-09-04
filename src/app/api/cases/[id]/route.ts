import { unlinkSync } from "fs"
import { db } from "@/lib/db"
import { ApiError, handle, optionalString, parseDateOnly, readJson, requireAuth, requireString } from "@/lib/api-helpers"
import { assertCaseReadAccess, assertCaseWriteAccess } from "@/lib/permissions"
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES } from "@/lib/constants"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { clientUserId, lawyerUserId, notifyUsers } from "@/lib/notify"

// ---------- shared DTO builders ----------

type DocumentRow = {
  id: string
  caseId: string
  documentName: string
  documentType: string | null
  category: string | null
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  sharedWithClient: boolean
  uploadedByName: string | null
  createdAt: Date
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

function documentDTO(d: DocumentRow) {
  return {
    id: d.id,
    caseId: d.caseId,
    documentName: d.documentName,
    documentType: d.documentType,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    sharedWithClient: d.sharedWithClient,
    uploadedByName: d.uploadedByName,
    createdAt: d.createdAt,
  }
}

function hearingDTO(h: HearingRow, caseNumber: string, caseTitle: string, forClient = false) {
  const base = {
    id: h.id,
    caseId: h.caseId,
    caseNumber,
    caseTitle,
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

/** Full CaseDetailDTO (documents & hearing internals scoped for CLIENT; invoices hidden from STAFF). */
async function buildCaseDetail(role: string, caseId: string) {
  const kase = await db.case.findUnique({
    where: { id: caseId },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      lawyer: { select: { id: true, name: true } },
    },
  })
  if (!kase) throw new ApiError("Case not found.", 404)

  const [documents, hearings, updates] = await Promise.all([
    db.caseDocument.findMany({
      where: { caseId, ...(role === "CLIENT" ? { sharedWithClient: true } : {}) },
      orderBy: { createdAt: "desc" },
    }),
    db.hearing.findMany({ where: { caseId }, orderBy: { hearingDate: "desc" } }),
    db.caseUpdate.findMany({ where: { caseId }, orderBy: { createdAt: "desc" } }),
  ])

  let invoiceRows: InvoiceRow[] = []
  if (role !== "STAFF") {
    invoiceRows = (await db.invoice.findMany({
      where: { caseId },
      include: {
        case: { select: { caseNumber: true, title: true } },
        client: { select: { id: true, name: true } },
        payments: true,
      },
      orderBy: { createdAt: "desc" },
    })) as InvoiceRow[]
  }

  const todayRange = dhakaDayRange(dhakaDayOffset(0))
  const now = new Date()
  const nextHearingDate =
    hearings
      .filter((h) => h.status === "UPCOMING" && h.hearingDate.getTime() >= now.getTime())
      .map((h) => h.hearingDate)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  const lastUpdate = updates.length ? updates[0].update.slice(0, 90) : null

  return {
    id: kase.id,
    caseNumber: kase.caseNumber,
    title: kase.title,
    type: kase.type,
    status: kase.status,
    priority: kase.priority,
    court: kase.court,
    district: kase.district,
    filingDate: kase.filingDate,
    oppositeParty: kase.oppositeParty,
    client: kase.client,
    lawyer: kase.lawyer,
    nextHearingDate,
    lastUpdate,
    createdAt: kase.createdAt,
    description: kase.description,
    resolutionSummary: kase.resolutionSummary,
    outcome: kase.outcome,
    closedAt: kase.closedAt,
    documents: documents.map((d) => documentDTO(d as DocumentRow)),
    hearings: hearings.map((h) =>
      hearingDTO(h as HearingRow, kase.caseNumber, kase.title, role === "CLIENT")
    ),
    updates: updates.map((u) => ({
      id: u.id,
      caseId: u.caseId,
      update: u.update,
      createdByName: u.createdByName,
      createdAt: u.createdAt,
    })),
    invoices: invoiceRows.map((inv) =>
      invoiceDTO(inv, computeInvoiceStatus(inv, paidOf(inv), todayRange.start))
    ),
  }
}

// ---------- GET ----------

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth()
    const { id } = await params
    await assertCaseReadAccess(user, id)
    return Response.json({ data: await buildCaseDetail(user.role, id) })
  })
}

// ---------- PATCH ----------

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params
    await assertCaseWriteAccess(user, id)
    const kase = await db.case.findUnique({ where: { id } })
    if (!kase) throw new ApiError("Case not found.", 404)
    const body = await readJson<Record<string, unknown>>(request)

    // LAWYER cannot change assignment
    if (user.role === "LAWYER" && (body.clientId !== undefined || body.lawyerId !== undefined)) {
      throw new ApiError("You cannot change the client or lawyer assignment of a case.", 403)
    }

    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = requireString(body.title, "title")
    if (body.type !== undefined) {
      const type = requireString(body.type, "type")
      if (!CASE_TYPES.includes(type as never)) throw new ApiError("Invalid case type.", 422)
      data.type = type
    }
    if (body.court !== undefined) data.court = requireString(body.court, "court")
    if (body.district !== undefined) data.district = optionalString(body.district)
    if (body.filingDate !== undefined) data.filingDate = parseDateOnly(body.filingDate)
    if (body.oppositeParty !== undefined) data.oppositeParty = optionalString(body.oppositeParty)
    if (body.description !== undefined) data.description = optionalString(body.description)
    if (body.resolutionSummary !== undefined) data.resolutionSummary = optionalString(body.resolutionSummary)
    if (body.outcome !== undefined) data.outcome = optionalString(body.outcome)

    if (body.priority !== undefined) {
      const priority = requireString(body.priority, "priority")
      if (!CASE_PRIORITIES.includes(priority as never)) throw new ApiError("Invalid case priority.", 422)
      data.priority = priority
    }

    let newStatus: string | null = null
    if (body.status !== undefined) {
      const status = requireString(body.status, "status")
      if (!CASE_STATUSES.includes(status as never)) throw new ApiError("Invalid case status.", 422)
      data.status = status
      newStatus = status
    }

    if (body.clientId !== undefined) {
      const clientId = requireString(body.clientId, "clientId")
      const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true } })
      if (!client) throw new ApiError("Client not found.", 422)
      data.clientId = clientId
    }

    let lawyerChanged = false
    if (body.lawyerId !== undefined) {
      const lawyerId = optionalString(body.lawyerId)
      if (lawyerId) {
        const lawyer = await db.lawyer.findUnique({ where: { id: lawyerId }, select: { id: true } })
        if (!lawyer) throw new ApiError("Lawyer not found.", 422)
      }
      data.lawyerId = lawyerId
      lawyerChanged = (lawyerId ?? null) !== (kase.lawyerId ?? null)
    }

    // Status transition rules
    if (newStatus && newStatus !== kase.status) {
      if (newStatus === "RESOLVED" || newStatus === "CLOSED") {
        // Effective summary = explicitly-sent value, else the stored one.
        const effectiveSummary =
          data.resolutionSummary !== undefined ? (data.resolutionSummary as string | null) : kase.resolutionSummary
        if (!effectiveSummary || effectiveSummary.trim().length === 0) {
          throw new ApiError("Resolution summary is required to close a case.", 422)
        }
        data.resolutionSummary = effectiveSummary
        data.closedAt = new Date()
      } else if (kase.status === "RESOLVED" || kase.status === "CLOSED") {
        data.closedAt = null
      }
    }

    await db.case.update({ where: { id }, data: data as never })

    // Notifications
    if (lawyerChanged && data.lawyerId) {
      const newLawyerUserId = await lawyerUserId(data.lawyerId as string)
      await notifyUsers([newLawyerUserId], {
        title: `Case Assigned — ${kase.caseNumber}`,
        message: `${kase.title} has been assigned to you.`,
        type: "CASE",
        caseId: kase.id,
        link: `case-detail:${kase.id}`,
      })
    }
    if (newStatus && newStatus !== kase.status && (newStatus === "CLOSED" || newStatus === "RESOLVED")) {
      const [clientPortalUserId, caseLawyerUserId] = await Promise.all([
        clientUserId(kase.clientId),
        lawyerUserId(data.lawyerId !== undefined ? (data.lawyerId as string | null) : kase.lawyerId),
      ])
      await notifyUsers([clientPortalUserId, caseLawyerUserId], {
        title: `${newStatus === "CLOSED" ? "Case Closed" : "Case Resolved"} — ${kase.caseNumber}`,
        message: `${kase.title} has been marked ${newStatus === "CLOSED" ? "closed" : "resolved"}.`,
        type: "CASE",
        caseId: kase.id,
        link: `case-detail:${kase.id}`,
      })
    }

    return Response.json({ data: await buildCaseDetail(user.role, id) })
  })
}

// ---------- DELETE ----------

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN"])
    const { id } = await params
    const kase = await db.case.findUnique({ where: { id }, select: { id: true } })
    if (!kase) throw new ApiError("Case not found.", 404)

    const invoiceCount = await db.invoice.count({ where: { caseId: id } })
    if (invoiceCount > 0) throw new ApiError("Delete invoices first.", 409)

    const docs = await db.caseDocument.findMany({ where: { caseId: id }, select: { filePath: true } })

    // Delete all DB rows atomically; unlink files afterwards (best-effort).
    await db.$transaction(async (tx) => {
      await tx.caseDocument.deleteMany({ where: { caseId: id } })
      await tx.hearing.deleteMany({ where: { caseId: id } })
      await tx.caseUpdate.deleteMany({ where: { caseId: id } })
      await tx.notification.deleteMany({ where: { caseId: id } })
      await tx.case.delete({ where: { id } })
    })

    for (const d of docs) {
      if (!d.filePath) continue
      try {
        unlinkSync(d.filePath)
      } catch {
        // best-effort file removal
      }
    }

    return Response.json({ data: { ok: true } })
  })
}
