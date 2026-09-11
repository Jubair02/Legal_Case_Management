import type { SessionUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api-helpers"

/**
 * Per-record access rules and list scope filters.
 *
 * This module is one of the three enforcement layers — the others are the
 * middleware route gate (UX only) and `requireAuth([roles])` in each handler.
 * Nothing here describes the policy in the abstract: the authoritative,
 * human-readable capability matrix lives in ROLES-AND-PERMISSIONS.md at the
 * repo root. A duplicate map in code drifts from the routes that actually
 * enforce it, so there deliberately isn't one.
 */

export function isAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN"
}

export function isStaffOrAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "STAFF"
}

/** Can this user read the given case? Throws 404/403 otherwise. */
export async function assertCaseReadAccess(user: SessionUser, caseId: string) {
  const kase = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, clientId: true, lawyerId: true },
  })
  if (!kase) throw new ApiError("Case not found.", 404)
  if (user.role === "ADMIN" || user.role === "STAFF") return kase
  if (user.role === "LAWYER") {
    const lp = await db.lawyer.findUnique({ where: { userId: user.id } })
    if (lp && kase.lawyerId === lp.id) return kase
    throw new ApiError("This case is not assigned to you.", 403)
  }
  if (user.role === "CLIENT") {
    const cp = await db.client.findUnique({ where: { userId: user.id } })
    if (cp && kase.clientId === cp.id) return kase
    throw new ApiError("This case does not belong to you.", 403)
  }
  throw new ApiError("You do not have permission to view this case.", 403)
}

/** Can this user modify the given case (edit fields, hearings, docs, updates)? */
export async function assertCaseWriteAccess(user: SessionUser, caseId: string) {
  const kase = await db.case.findUnique({
    where: { id: caseId },
    select: { id: true, lawyerId: true },
  })
  if (!kase) throw new ApiError("Case not found.", 404)
  if (user.role === "ADMIN" || user.role === "STAFF") return kase
  if (user.role === "LAWYER") {
    const lp = await db.lawyer.findUnique({ where: { userId: user.id } })
    if (lp && kase.lawyerId === lp.id) return kase
    throw new ApiError("This case is not assigned to you.", 403)
  }
  throw new ApiError("You do not have permission to modify this case.", 403)
}

/** Scope filter for case list queries based on role. */
export function caseScopeWhere(user: SessionUser, extra: Record<string, unknown> = {}) {
  const where: Record<string, unknown> = { ...extra }
  if (user.role === "ADMIN" || user.role === "STAFF") return where
  if (user.role === "LAWYER") {
    return { ...where, lawyer: { userId: user.id } }
  }
  if (user.role === "CLIENT") {
    return { ...where, client: { userId: user.id } }
  }
  return where
}
