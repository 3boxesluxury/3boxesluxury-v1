/**
 * db.ts — Auto-Seeding PrismaClient for Vercel Serverless
 *
 * KEY FIX: Uses Prisma $extends() to automatically call ensureDBReady()
 * before EVERY database query. This means ALL routes are protected,
 * not just the try-on route.
 *
 * On Vercel, each cold start gets an empty /tmp database.
 * This extension ensures the schema + seed data exist before any query runs.
 *
 * No other files need to be changed — all routes that import { db } are
 * automatically protected.
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
}

// ── Auto-seed logic ──────────────────────────────────────────────
let seedPromise: Promise<void> | null = null

async function ensureDBReady(): Promise<void> {
  // If already seeded in this instance, skip immediately
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
      seedPromise = null // Allow retry on next query
      console.error('[db] Auto-seed failed:', (err as Error).message?.substring(0, 300))
    }
  })()

  return seedPromise
}

// ── Create base PrismaClient (cached in globalThis for dev) ──────
const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

// ── Auto-seed extension ──────────────────────────────────────────
// This intercepts EVERY database query and ensures the DB is seeded
// before it executes. The check is nearly instant after first seed.
export const db = basePrisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      await ensureDBReady()
      return query(args)
    },
  },
})

export { ensureDBReady }
