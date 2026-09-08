import { handle, ApiError, requireAuth } from "@/lib/api-helpers"
import { audit } from "@/lib/audit"
import { retryOutbound } from "@/lib/outbound"

/** POST /api/outbound/[id]/retry — ADMIN: re-dispatch a failed/simulated outbox message. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN"])
    const { id } = await params

    const result = await retryOutbound(id)
    if (result.status === "NOT_FOUND") throw new ApiError("Message not found.", 404)

    await audit(
      user,
      "OUTBOUND_RETRY",
      "OutboundMessage",
      id,
      null,
      `Retried ${result.ok ? "successfully" : "unsuccessfully"} (${result.status})`,
      result.error ? { error: result.error } : null
    )

    return Response.json({ data: result })
  })
}
