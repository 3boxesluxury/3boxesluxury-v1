/**
 * db.ts — Auto-Seeding PrismaClient for Vercel Serverless
 *
 * Uses Prisma $extends() to automatically call ensureDBReady()
 * before EVERY database query. ALL routes are protected.
 *
 * KEY DESIGN: ensureDBReady() has a 15-second timeout.
 * If seeding takes too long, it skips and lets the query fail gracefully.
 * The API routes should catch Prisma errors and return empty data.
 *
 * On Vercel, each cold start gets an empty /tmp database.
 * This extension ensures the schema + seed data exist before any query runs.
 */

import { PrismaClient } from '@prisma/client'

// On Vercel, the serverless filesystem is read-only.
// SQLite needs a writable location, so we use /tmp for the database.
if (process.env.VERCEL === '1') {
  process.env.DATABASE_URL = 'file:/tmp/3boxes-dev.db';
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  _dbSeeded: boolean | undefined
  _dbSeeding: boolean | undefined
}

// ── Auto-seed logic with timeout ──────────────────────────────
let seedPromise: Promise<void> | null = null

async function ensureDBReady(): Promise<void> {
  // If already seeded, skip immediately (nearly instant)
  if (globalForPrisma._dbSeeded) return

  // If currently seeding, wait for it (with timeout)
  if (seedPromise) {
    try {
      await seedPromise
    } catch {
      // Seed failed, but we continue — the query may fail
    }
    return
  }

  // Start seeding
  seedPromise = (async () => {
    const seedTimeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Seed timeout')), 15000)
    )

    try {
      await Promise.race([
        (async () => {
          const { ensureSeeded } = await import('@/lib/auto-seed')
          await ensureSeeded()
          globalForPrisma._dbSeeded = true
          console.log('[db] Database ready (seeded)')
        })(),
        seedTimeout,
      ])
    } catch (err) {
      seedPromise = null // Allow retry on next request
      console.error('[db] Auto-seed failed or timed out:', (err as Error).message?.substring(0, 300))
      // Don't throw — let individual queries handle the missing tables
    }
  })()

  try {
    await seedPromise
  } catch {
    // Already logged above
  }
}

// ── Create base PrismaClient (cached in globalThis for dev) ──────
const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

// ── Auto-seed extension ──────────────────────────────────────────
// Intercepts EVERY database query and ensures the DB is seeded first.
// The check is nearly instant after the first successful seed.
export const db = basePrisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      try {
        await ensureDBReady()
      } catch {
        // Seed may have timed out — try the query anyway
      }
      return query(args)
    },
  },
})

export { ensureDBReady }
