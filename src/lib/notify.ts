import { db } from "@/lib/db"

export interface NotifyPayload {
  title: string
  message?: string
  type?: string
  caseId?: string
  link?: string
}

const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000 // 20 hours

/**
 * Create notifications for the given users (best-effort, never throws).
 * - Filters out null/undefined/empty ids and duplicates.
 * - Skips a user when they already have an UNREAD notification with the
 *   identical title AND caseId created within the last 20 hours.
 */
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  payload: NotifyPayload
): Promise<void> {
  const ids = Array.from(
    new Set(
      userIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    )
  )
  if (ids.length === 0) return

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS)

  for (const userId of ids) {
    try {
      const existing = await db.notification.findFirst({
        where: {
          userId,
          isRead: false,
          title: payload.title,
          caseId: payload.caseId ?? null,
          createdAt: { gte: since },
        },
        select: { id: true },
      })
      if (existing) continue
      await db.notification.create({
        data: {
          userId,
          title: payload.title,
          message: payload.message ?? null,
          type: payload.type ?? "INFO",
          caseId: payload.caseId ?? null,
          link: payload.link ?? null,
        },
      })
    } catch {
      // best-effort: notification failures must never break the main flow
    }
  }
}

/** Ids of active ADMIN users (for "notify all admins" flows). */
export async function adminIds(): Promise<string[]> {
  try {
    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    })
    return admins.map((a) => a.id)
  } catch {
    return []
  }
}

/** Portal userId linked to a Lawyer profile (null when none). */
export async function lawyerUserId(
  lawyerId: string | null | undefined
): Promise<string | null> {
  if (!lawyerId) return null
  try {
    const lp = await db.lawyer.findUnique({
      where: { id: lawyerId },
      select: { userId: true },
    })
    return lp?.userId ?? null
  } catch {
    return null
  }
}

/** Portal userId linked to a Client profile (null when none). */
export async function clientUserId(
  clientId: string | null | undefined
): Promise<string | null> {
  if (!clientId) return null
  try {
    const cp = await db.client.findUnique({
      where: { id: clientId },
      select: { userId: true },
    })
    return cp?.userId ?? null
  } catch {
    return null
  }
}
