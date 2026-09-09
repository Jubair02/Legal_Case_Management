import { PrismaClient } from '@prisma/client'

/**
 * Money is stored as `Decimal(12,2)` so the database holds exact values —
 * binary floats cannot represent 0.10 and accumulate error across sums, which
 * is not acceptable for invoicing.
 *
 * Prisma hands Decimal columns back as Decimal objects, which do not survive
 * `JSON.stringify` as numbers and break plain JS arithmetic. This result
 * extension normalises them to `number` on every read, so the exactness lives
 * where it matters (storage and SQL) while every consumer keeps the numeric
 * shape it already expects. Amounts here are far inside the range a double
 * represents exactly to two decimal places.
 */
const decimalToNumber = {
  needs: { amount: true },
  compute(row: { amount: unknown }): number {
    return Number(row.amount)
  },
}

function createClient() {
  return new PrismaClient({
    // Query logging is very noisy; keep it to development only.
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query'],
  }).$extends({
    result: {
      invoice: { amount: decimalToNumber },
      payment: { amount: decimalToNumber },
    },
  })
}

type ExtendedPrismaClient = ReturnType<typeof createClient>

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
