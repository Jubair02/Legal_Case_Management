import { NextResponse } from "next/server"

import { db } from "@/lib/db"

/**
 * Deployment diagnostic for the one failure the UI cannot explain.
 *
 * Every unhandled API error reaches the client as "Something went wrong" (the
 * 500 catch-all in `handle()`); the real cause only ever reaches the server
 * log. This endpoint answers the two questions that actually decide whether a
 * deployment can serve a sign-in: did the runtime receive its environment, and
 * can it reach the database.
 *
 * It deliberately leaks nothing. Environment variables are reported as
 * presence booleans, never values, and a database failure returns Prisma's
 * error code (P1001 unreachable, P1000 rejected credentials, P2021 missing
 * table) rather than the message, which carries the connection host.
 */
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface DatabaseStatus {
  ok: boolean
  code?: string
  name?: string
}

export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    NODE_ENV: process.env.NODE_ENV ?? null,
    onVercel: Boolean(process.env.VERCEL),
  }

  let database: DatabaseStatus
  try {
    await db.$queryRaw`select 1`
    database = { ok: true }
  } catch (e) {
    console.error("[health] database unreachable", e)
    database = {
      ok: false,
      code: (e as { code?: string })?.code ?? "UNKNOWN",
      name: (e as Error)?.constructor?.name ?? "Error",
    }
  }

  const healthy = database.ok && env.DATABASE_URL && env.AUTH_SECRET
  return NextResponse.json({ data: { env, database } }, { status: healthy ? 200 : 503 })
}
