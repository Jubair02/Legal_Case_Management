import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError, handle, ok, optionalString, readJson, requireAuth, requireString } from "@/lib/api-helpers"
import { CLIENT_TYPES } from "@/lib/constants"
import { caseScopeWhere } from "@/lib/permissions"
import { dhakaDateKey } from "@/lib/dates"

const ACTIVE_CASE_STATUSES = ["ACTIVE", "PENDING", "ON_HOLD"]

function clientDTO(
  c: {
    id: string
    userId: string | null
    name: string
    phone: string | null
    email: string | null
    nid: string | null
    address: string | null
    clientType: string
    createdAt: Date
  },
  caseCount: number,
  activeCaseCount: number,
  portalEmail: string | null
) {
  return {
    id: c.id,
    userId: c.userId,
    name: c.name,
    phone: c.phone,
    email: c.email,
    nid: c.nid,
    address: c.address,
    clientType: c.clientType,
    caseCount,
    activeCaseCount,
    portalEmail,
    createdAt: c.createdAt.toISOString(),
  }
}

/** Earliest future UPCOMING hearing date per caseId (ISO string). */
async function nextHearingMap(caseIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (caseIds.length === 0) return map
  const hearings = await db.hearing.findMany({
    where: { caseId: { in: caseIds }, status: "UPCOMING", hearingDate: { gte: new Date() } },
    select: { caseId: true, hearingDate: true },
    orderBy: { hearingDate: "asc" },
  })
  for (const h of hearings) {
    if (!map.has(h.caseId)) map.set(h.caseId, h.hearingDate.toISOString())
  }
  return map
}

/** GET /api/clients/[id] — ADMIN/STAFF any, LAWYER if client has a case assigned to them, CLIENT own profile. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth()
    const { id } = await params

    const client = await db.client.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, _count: { select: { cases: true } } },
    })
    if (!client) throw new ApiError("Client not found.", 404)

    if (user.role === "LAWYER") {
      const linked = await db.case.findFirst({
        where: { clientId: id, lawyer: { userId: user.id } },
        select: { id: true },
      })
      if (!linked) throw new ApiError("You do not have access to this client.", 403)
    } else if (user.role === "CLIENT" && client.userId !== user.id) {
      throw new ApiError("You do not have access to this client.", 403)
    }

    const activeCases = await db.case.count({
      where: { clientId: id, status: { in: ACTIVE_CASE_STATUSES } },
    })

    const cases = await db.case.findMany({
      where: caseScopeWhere(user, { clientId: id }) as Prisma.CaseWhereInput,
      select: {
        id: true,
        caseNumber: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        court: true,
      },
      orderBy: { createdAt: "desc" },
    })
    const nextMap = await nextHearingMap(cases.map((c) => c.id))

    const base = {
      ...clientDTO(client, client._count.cases, activeCases, client.user?.email ?? null),
      cases: cases.map((c) => ({ ...c, nextHearingDate: nextMap.get(c.id) ?? null })),
    }

    // Invoices (with computed paidAmount + payments) are visible to ADMIN only.
    if (user.role === "ADMIN") {
      const invoices = await db.invoice.findMany({
        where: { clientId: id },
        include: {
          case: { select: { caseNumber: true, title: true } },
          payments: { orderBy: { paymentDate: "desc" } },
        },
        orderBy: { createdAt: "desc" },
      })
      const todayKey = dhakaDateKey()
      const invoiceDTOs = invoices.map((inv) => {
        const paidAmount = inv.payments.reduce((sum, p) => sum + p.amount, 0)
        let status = inv.status
        if (status !== "CANCELLED") {
          if (paidAmount >= inv.amount) status = "PAID"
          else if (paidAmount > 0) status = "PARTIAL"
          else status = inv.dueDate && dhakaDateKey(inv.dueDate) < todayKey ? "OVERDUE" : "UNPAID"
        }
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          caseId: inv.caseId,
          caseNumber: inv.case?.caseNumber ?? null,
          caseTitle: inv.case?.title ?? null,
          clientId: inv.clientId,
          clientName: client.name,
          billingType: inv.billingType,
          description: inv.description,
          amount: inv.amount,
          paidAmount,
          dueDate: inv.dueDate?.toISOString() ?? null,
          status,
          payments: inv.payments.map((p) => ({
            id: p.id,
            invoiceId: p.invoiceId,
            amount: p.amount,
            paymentMethod: p.paymentMethod,
            paymentDate: p.paymentDate.toISOString(),
            referenceNumber: p.referenceNumber,
            notes: p.notes,
            receivedByName: p.receivedByName,
            createdAt: p.createdAt.toISOString(),
          })),
          createdAt: inv.createdAt.toISOString(),
        }
      })
      return ok({ ...base, invoices: invoiceDTOs })
    }

    return ok(base)
  })
}

/** PATCH /api/clients/[id] — ADMIN, STAFF. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAuth(["ADMIN", "STAFF"])
    const { id } = await params
    const body = await readJson<Record<string, unknown>>(request)

    const client = await db.client.findUnique({ where: { id } })
    if (!client) throw new ApiError("Client not found.", 404)

    const data: Prisma.ClientUpdateInput = {}
    if (body.name !== undefined) data.name = requireString(body.name, "name")
    if (body.phone !== undefined) data.phone = optionalString(body.phone)
    if (body.email !== undefined) {
      const emailRaw = optionalString(body.email)
      data.email = emailRaw ? emailRaw.toLowerCase() : null
    }
    if (body.nid !== undefined) data.nid = optionalString(body.nid)
    if (body.address !== undefined) data.address = optionalString(body.address)
    if (body.clientType !== undefined) {
      const clientType = requireString(body.clientType, "clientType")
      if (!(CLIENT_TYPES as readonly string[]).includes(clientType)) {
        throw new ApiError(`"clientType" must be one of: ${CLIENT_TYPES.join(", ")}.`, 422)
      }
      data.clientType = clientType
    }

    const nameChanged = typeof data.name === "string" && data.name !== client.name

    // Sync a changed email to the linked portal account (its email is the login).
    let portalEmail: string | null = null
    if (body.email !== undefined && client.userId) {
      const emailRaw = optionalString(body.email)
      portalEmail = emailRaw ? emailRaw.toLowerCase() : null
      if (portalEmail) {
        const dup = await db.user.findFirst({
          where: { email: portalEmail, NOT: { id: client.userId } },
        })
        if (dup) throw new ApiError("A portal account with this email already exists.", 409)
      } else {
        // Portal accounts require an email — refuse to clear it there.
        throw new ApiError(
          "This client has a portal account — the email cannot be removed. Set a different email instead.",
          422
        )
      }
    }

    await db.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data })
      // Keep portal user name/email in sync.
      if (client.userId && (nameChanged || portalEmail)) {
        await tx.user.update({
          where: { id: client.userId },
          data: {
            ...(nameChanged ? { name: data.name as string } : {}),
            ...(portalEmail ? { email: portalEmail } : {}),
          },
        })
      }
    })

    const updated = await db.client.findUnique({
      where: { id },
      include: { user: { select: { email: true } }, _count: { select: { cases: true } } },
    })
    const activeCases = await db.case.count({
      where: { clientId: id, status: { in: ACTIVE_CASE_STATUSES } },
    })

    return ok(clientDTO(updated!, updated!._count.cases, activeCases, updated!.user?.email ?? null))
  })
}

/** DELETE /api/clients/[id] — ADMIN only. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const { id } = await params

    const client = await db.client.findUnique({
      where: { id },
      include: { _count: { select: { cases: true, invoices: true } } },
    })
    if (!client) throw new ApiError("Client not found.", 404)
    if (client._count.cases > 0 || client._count.invoices > 0) {
      throw new ApiError("This client has linked cases/invoices and cannot be deleted.", 409)
    }

    await db.$transaction(async (tx) => {
      if (client.userId) {
        await tx.notification.deleteMany({ where: { userId: client.userId } })
      }
      await tx.client.delete({ where: { id } })
      if (client.userId) {
        await tx.user.delete({ where: { id: client.userId } })
      }
    })

    return ok({ ok: true })
  })
}
