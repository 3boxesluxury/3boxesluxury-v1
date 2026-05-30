import { PrismaClient } from '@prisma/client'

// On Vercel, the serverless filesystem is read-only.
// SQLite needs a writable location, so we use /tmp for the database.
// The auto-seed module will create the schema and seed data on first request.
if (process.env.VERCEL === '1') {
  process.env.DATABASE_URL = 'file:/tmp/3boxes-dev.db';
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  _dbSeeded: boolean | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ── AUTO-SEED: Ensure DB tables and data exist on every cold start ──
// On Vercel, each serverless instance starts with empty /tmp database.
// This ensures the schema and seed data are ready before any query runs.
// It runs ONCE per cold start (the promise is cached in globalThis).

let seedPromise: Promise<void> | null = null

export async function ensureDBReady(): Promise<void> {
  // If already seeded in this instance, skip
  if (globalForPrisma._dbSeeded) return

  // If a seed is already in progress, wait for it
  if (seedPromise) return seedPromise

  seedPromise = (async () => {
    try {
      const { ensureSeeded } = await import('@/lib/auto-seed')
      await ensureSeeded()
      globalForPrisma._dbSeeded = true
      console.log('[db] Database ready (seeded)')
    } catch (err) {
      seedPromise = null // Allow retry
      console.error('[db] Auto-seed failed:', (err as Error).message?.substring(0, 300))
      // Don't throw — let individual queries fail with clear error
    }
  })()

  return seedPromise
}
