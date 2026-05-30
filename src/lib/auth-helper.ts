import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionAsync } from '@/lib/sessions'
import { db } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || '3b0x3s-s3cr3t-k3y-pr0duct10n-2024-xy7z'

// Re-export sessions for backward compatibility
export { sessions } from './sessions'
export type { SessionUser } from './sessions'

/**
 * Verify auth using JWT first, then session fallback.
 * When DB lookup fails (cold start), uses JWT payload directly.
 */
export async function verifyAuth(
  request: NextRequest
): Promise<{ id: string; email: string; name: string; role: string } | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  if (!token) return null

  // Strategy 1: JWT verification
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any

    // Try DB lookup
    try {
      const dbUser = await db.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, name: true, role: true, isActive: true },
      })
      if (dbUser && dbUser.isActive) {
        return { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role }
      }
    } catch {
      // DB failed — use JWT payload
    }

    // JWT valid but DB empty (cold start) — trust the JWT
    if (decoded.userId && decoded.email && decoded.role) {
      return {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name || decoded.email,
        role: decoded.role,
      }
    }
  } catch {
    // JWT failed — try session
  }

  // Strategy 2: Session fallback
  try {
    const session = await getSessionAsync(token)
    if (session) {
      return { id: session.id, email: session.email, name: session.name, role: session.role }
    }
  } catch {
    // session lookup failed
  }

  return null
}