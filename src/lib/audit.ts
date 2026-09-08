import { db } from "@/lib/db"

/**
 * Append-only audit trail.
 *
 * Every business mutation and auth event calls audit() after it succeeds.
 * The helper is best-effort by contract: a failed audit write is logged
 * server-side but NEVER breaks or rolls back the business operation.
 *
 * `meta` carries field-level diffs as { field: { from, to } }. Secrets
 * (passwords, tokens, hashes) must never be passed in — use the MASK constant.
 */
export const AUDIT_MASK = "•••"

export interface AuditActor {
  id: string
  name: string
  role: string
}

type ActorLike = AuditActor | { id: string; name: string; role: string } | null | undefined

/**
 * Record an audit entry. Safe to call with anything actor-shaped; enriches
 * nothing (callers pass the session user they already have).
 */
export async function audit(
  actor: ActorLike,
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  entityLabel: string | null | undefined,
  summary?: string | null,
  meta?: Record<string, unknown> | null
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? "System",
        actorRole: actor?.role ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        entityLabel: entityLabel ?? null,
        summary: summary ?? null,
        meta: meta && Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
      },
    })
  } catch (e) {
    console.error("[audit] failed to record entry", action, e)
  }
}

/**
 * Build a { field: { from, to } } diff from a whitelist of scalar fields.
 * Values that are undefined on both sides are skipped; null vs value is kept.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {}
  for (const f of fields) {
    const b = before[f]
    const a = after[f]
    if (b === undefined && a === undefined) continue
    const bs = b instanceof Date ? b.toISOString() : b
    const as2 = a instanceof Date ? a.toISOString() : a
    if (JSON.stringify(bs ?? null) !== JSON.stringify(as2 ?? null)) {
      out[f] = { from: bs ?? null, to: as2 ?? null }
    }
  }
  return out
}
