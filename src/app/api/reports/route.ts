import { db } from "@/lib/db"
import { handle, requireAuth } from "@/lib/api-helpers"
import { dhakaDayOffset, dhakaDayRange, dhakaDayStart, dhakaDateKey } from "@/lib/dates"

const CLOSED_STATUSES = ["RESOLVED", "CLOSED"]

export async function GET() {
  return handle(async () => {
    await requireAuth(["ADMIN"])

    const todayRange = dhakaDayRange(dhakaDayOffset(0))
    const plus7Range = dhakaDayRange(dhakaDayOffset(7))

    const [cases, invoices, payments, hearings] = await Promise.all([
      db.case.findMany({
        select: { id: true, type: true, status: true, lawyerId: true, lawyer: { select: { name: true } } },
      }),
      db.invoice.findMany({
        select: { amount: true, status: true },
      }),
      db.payment.findMany({ select: { amount: true, paymentMethod: true } }),
      db.hearing.findMany({ select: { hearingDate: true, status: true } }),
    ])

    // ---------- case reports ----------
    const byTypeMap = new Map<string, number>()
    const byStatusMap = new Map<string, number>()
    const byLawyerMap = new Map<
      string,
      { lawyerId: string; lawyerName: string; total: number; active: number; closed: number }
    >()
    let active = 0
    let pending = 0
    let onHold = 0
    let resolved = 0
    let closed = 0

    for (const c of cases) {
      byTypeMap.set(c.type, (byTypeMap.get(c.type) ?? 0) + 1)
      byStatusMap.set(c.status, (byStatusMap.get(c.status) ?? 0) + 1)
      if (c.status === "ACTIVE") active += 1
      if (c.status === "PENDING") pending += 1
      if (c.status === "ON_HOLD") onHold += 1
      if (c.status === "RESOLVED") resolved += 1
      if (c.status === "CLOSED") closed += 1
      if (c.lawyerId) {
        const entry = byLawyerMap.get(c.lawyerId) ?? {
          lawyerId: c.lawyerId,
          lawyerName: c.lawyer?.name ?? "Unknown",
          total: 0,
          active: 0,
          closed: 0,
        }
        entry.total += 1
        if (CLOSED_STATUSES.includes(c.status)) entry.closed += 1
        else entry.active += 1
        byLawyerMap.set(c.lawyerId, entry)
      }
    }

    const caseReports = {
      total: cases.length,
      active,
      pending,
      onHold,
      resolved,
      closed,
      byType: Array.from(byTypeMap.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      byStatus: Array.from(byStatusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      byLawyer: Array.from(byLawyerMap.values()).sort((a, b) => b.total - a.total),
    }

    // ---------- financial reports ----------
    let totalInvoiced = 0
    for (const inv of invoices) {
      if (inv.status !== "CANCELLED") totalInvoiced += inv.amount
    }
    const byMethodMap = new Map<string, number>()
    let totalCollected = 0
    for (const p of payments) {
      totalCollected += p.amount
      byMethodMap.set(p.paymentMethod, (byMethodMap.get(p.paymentMethod) ?? 0) + p.amount)
    }
    const financial = {
      totalInvoiced,
      totalCollected,
      outstanding: totalInvoiced - totalCollected,
      invoiceCount: invoices.length,
      paymentCount: payments.length,
      byMethod: Array.from(byMethodMap.entries())
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount),
    }

    // ---------- hearing reports ----------
    let todays = 0
    let upcoming7 = 0
    let completed = 0
    let adjourned = 0
    let thisMonth = 0
    const monthKey = dhakaDateKey(new Date()).slice(0, 7) // "YYYY-MM" in Dhaka
    const [year, month] = monthKey.split("-").map(Number)
    const monthStart = dhakaDayStart(`${year}-${String(month).padStart(2, "0")}-01`)
    const nextMonthStart =
      month === 12
        ? dhakaDayStart(`${year + 1}-01-01`)
        : dhakaDayStart(`${year}-${String(month + 1).padStart(2, "0")}-01`)

    for (const h of hearings) {
      const t = h.hearingDate.getTime()
      if (t >= todayRange.start.getTime() && t < todayRange.end.getTime()) todays += 1
      if (
        h.status === "UPCOMING" &&
        t >= todayRange.start.getTime() &&
        t < plus7Range.start.getTime()
      )
        upcoming7 += 1
      if (h.status === "COMPLETED") completed += 1
      if (h.status === "ADJOURNED") adjourned += 1
      if (t >= monthStart.getTime() && t < nextMonthStart.getTime()) thisMonth += 1
    }

    const hearingReports = { todays, upcoming7, completed, adjourned, thisMonth }

    return Response.json({ data: { caseReports, financial, hearingReports } })
  })
}
