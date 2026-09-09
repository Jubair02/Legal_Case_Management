import { NextResponse } from "next/server"
import { getSessionUser, type SessionUser } from "@/lib/auth"

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ data }, { status: init ?? 200 })
}

export function err(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: { message, code: code ?? "ERROR" } }, { status })
}

/**
 * List pagination.
 *
 * Every list endpoint is bounded so a large chamber can never make the server
 * materialise an entire table. Callers may page explicitly with `?limit=&
 * offset=`; without them the ceiling below applies and `meta.hasMore` tells
 * the caller the response was cut short.
 */
export const DEFAULT_PAGE_SIZE = 1000
export const MAX_PAGE_SIZE = 1000

export interface PageParams {
  take: number
  skip: number
}

export function parsePagination(searchParams: URLSearchParams): PageParams {
  const rawLimit = Number(searchParams.get("limit"))
  const rawOffset = Number(searchParams.get("offset"))
  const take =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE
  const skip = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0
  return { take, skip }
}

/**
 * `{ data, meta }` — `data` keeps the shape every existing client already
 * reads, so adding pagination does not break them.
 */
export function okPaged<T>(rows: T[], total: number, page: PageParams) {
  return NextResponse.json({
    data: rows,
    meta: {
      total,
      limit: page.take,
      offset: page.skip,
      hasMore: page.skip + rows.length < total,
    },
  })
}

export class ApiError extends Error {
  status: number
  /** Machine-readable code surfaced to the client (e.g. RATE_LIMITED). */
  code?: string
  constructor(message: string, status = 400, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** Wrap a route handler with unified error handling. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status, e.code)
    console.error("[api-error]", e)
    return err("Something went wrong. Please try again.", 500, "INTERNAL")
  }
}

/**
 * Map a Prisma unique-constraint violation (P2002) to a friendly 409.
 * Usage: wrap any create/update that can race past a pre-check.
 */
export function throwConflictIfUniqueViolation(e: unknown, message: string): void {
  if ((e as { code?: string })?.code === "P2002") {
    throw new ApiError(message, 409)
  }
}

/**
 * Require an authenticated user. Optionally restrict to given roles.
 * Throws ApiError (401/403) when not allowed.
 */
export async function requireAuth(roles?: string[]): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new ApiError("You must be signed in to continue.", 401)
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw new ApiError("You do not have permission to perform this action.", 403)
  }
  return user
}

/** Parse a JSON body safely. */
export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new ApiError("Invalid JSON body.", 400)
  }
}

/** Require a non-empty string field. */
export function requireString(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new ApiError(`"${field}" is required.`, 422)
  }
  return v.trim()
}

/**
 * Validate against a fixed set AND narrow to that set's member type.
 *
 * Replaces the `allowed.includes(x as never)` pattern, which checked the value
 * but left it typed `string` — fine when the column was text, not once the
 * column is a Postgres enum. The single cast here is guarded by the check
 * immediately above it.
 */
export function requireEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  const s = requireString(v, field)
  if (!(allowed as readonly string[]).includes(s)) {
    throw new ApiError(`"${field}" must be one of: ${allowed.join(", ")}.`, 422)
  }
  return s as T
}

/** As requireEnum, but absent/empty values yield null instead of throwing. */
export function optionalEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): T | null {
  const s = optionalString(v)
  if (s === null) return null
  if (!(allowed as readonly string[]).includes(s)) {
    throw new ApiError(`"${field}" must be one of: ${allowed.join(", ")}.`, 422)
  }
  return s as T
}

export function optionalString(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

export function requireNumber(v: unknown, field: string): number {
  if (typeof v === "string" && v.trim().length === 0) {
    throw new ApiError(`"${field}" must be a number.`, 422)
  }
  const n = typeof v === "string" ? Number(v) : (v as number)
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new ApiError(`"${field}" must be a number.`, 422)
  }
  return n
}

/** Parse "YYYY-MM-DD" date input at noon Dhaka time so display matches input. */
export function parseDateOnly(v: unknown): Date | null {
  const s = optionalString(v)
  if (!s) return null
  const d = new Date(`${s}T06:00:00.000Z`) // 06:00 UTC = 12:00 Asia/Dhaka
  if (Number.isNaN(d.getTime())) throw new ApiError(`Invalid date value.`, 422)
  return d
}
