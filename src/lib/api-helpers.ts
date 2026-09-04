import { NextResponse } from "next/server"
import { getSessionUser, type SessionUser } from "@/lib/auth"

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ data }, { status: init ?? 200 })
}

export function err(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: { message, code: code ?? "ERROR" } }, { status })
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** Wrap a route handler with unified error handling. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status)
    console.error("[api-error]", e)
    return err("Something went wrong. Please try again.", 500, "INTERNAL")
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

export function optionalString(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

export function requireNumber(v: unknown, field: string): number {
  const n = typeof v === "string" ? Number(v) : (v as number)
  if (typeof n !== "number" || Number.isNaN(n)) {
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
