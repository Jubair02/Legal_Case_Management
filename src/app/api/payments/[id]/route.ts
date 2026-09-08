import { db } from "@/lib/db"
import { ApiError, handle, ok, requireAuth } from "@/lib/api-helpers"
import { dhakaDayOffset, dhakaDayRange } from "@/lib/dates"
import { audit } from "@/lib/audit"

/**
 * DELETE /api/payments/[id] — ADMIN only.
 * Removes a mis-recorded payment and recomputes the invoice status
 * (CANCELLED invoices stay CANCELLED).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN"])
    const { id } = await params

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            payments: { select: { id: true, amount: true } },
            case: { select: { caseNumber: true } },
          },
        },
      },
    })
    if (!payment) throw new ApiError("Payment not found.", 404)

    const invoiceStatus = await db.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id } })

      const inv = payment.invoice
      let status: string
      if (inv.status === "CANCELLED") {
        status = "CANCELLED"
      } else {
        const paid = inv.payments
          .filter((p) => p.id !== payment.id)
          .reduce((s, p) => s + p.amount, 0)
        const todayStart = dhakaDayRange(dhakaDayOffset(0)).start
        if (paid >= inv.amount - 0.005) status = "PAID"
        else if (paid > 0.005) status = "PARTIAL"
        else if (inv.dueDate && inv.dueDate.getTime() < todayStart.getTime()) status = "OVERDUE"
        else status = "UNPAID"
      }

      if (status !== inv.status) {
        await tx.invoice.update({ where: { id: inv.id }, data: { status } })
      }
      return status
    })

    await audit(user, "PAYMENT_DELETE", "Payment", payment.id, payment.invoice.invoiceNumber,
      `Deleted payment of ৳${payment.amount.toLocaleString("en-US")} from ${payment.invoice.invoiceNumber}`)

    return ok({
      ok: true,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoice.invoiceNumber,
      invoiceStatus,
    })
  })
}
