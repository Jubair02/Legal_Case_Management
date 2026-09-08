import { handle, readJson, requireAuth } from "@/lib/api-helpers"
import { audit, diffFields } from "@/lib/audit"
import { getOutboundSettings, saveOutboundSettings } from "@/lib/settings"

/** GET /api/settings/outbound — ADMIN: read the SMS/Email bridge settings + provider status. */
export async function GET() {
  return handle(async () => {
    await requireAuth(["ADMIN"])
    const settings = await getOutboundSettings()
    return Response.json({
      data: {
        settings,
        providers: {
          sms: process.env.SMS_API_URL?.trim() ? "live" : "simulated",
          email: process.env.EMAIL_WEBHOOK_URL?.trim() ? "live" : "simulated",
        },
      },
    })
  })
}

/** PATCH /api/settings/outbound — ADMIN: update bridge toggles (audited). */
export async function PATCH(request: Request) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN"])
    const body = await readJson<Record<string, unknown>>(request)

    const before = await getOutboundSettings()
    const after = await saveOutboundSettings(body, user.id)

    const meta = diffFields(
      { ...before, events: JSON.stringify(before.events) },
      { ...after, events: JSON.stringify(after.events) },
      ["smsEnabled", "emailEnabled", "events"]
    )

    await audit(
      user,
      "SETTINGS_UPDATE",
      "Settings",
      "outbound",
      "SMS/Email bridge",
      `Updated outbound bridge settings`,
      Object.keys(meta).length > 0 ? meta : null
    )

    return Response.json({ data: after })
  })
}
