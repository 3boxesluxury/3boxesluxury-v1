/**
 * Auth Helper — FIXED for Vercel Serverless
 *
 * PROBLEM: The old auth-helper.ts only checked DB sessions (getSessionAsync).
 * On Vercel cold starts, the SQLite DB in /tmp is wiped → Session table gone → 401 → logout.
 *
 * FIX: This new version checks JWT tokens FIRST (survive cold starts),
 * then falls back to DB sessions (for backwards compatibility).
 *
 * All admin routes import from this file: requireAdmin, authenticate, etc.
 * By replacing this file, ALL admin routes get JWT support automatically.
 */

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || '3boxes-secret-key-change-in-production'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  avatar?: string | null
  isActive: boolean
  approvalStatus: string
  emailVerified: boolean
  phoneVerified: boolean
  twoFactorEnabled: boolean
}

/**
 * Authenticate a request — JWT-first, session fallback
 * Used by ALL protected API routes
 */
export async function authenticate(request: NextRequest): Promise<{
  user: AuthUser | null
  error: NextResponse | null
}> {
  // Get token from Authorization header
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (!token) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    }
  }

  // ── Strategy 1: JWT token (PRIMARY — survives Vercel cold starts) ──
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: '3boxes-luxury',
    }) as any

    if (decoded && decoded.userId) {
      // JWT is valid — try to get fresh user data from DB
      try {
        const { db } = await import('@/lib/db')
        const dbUser = await db.user.findUnique({
          where: { id: decoded.userId },
        })

        if (dbUser) {
          if (!dbUser.isActive) {
            return {
              user: null,
              error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }),
            }
          }
          return {
            user: {
              id: dbUser.id,
              email: dbUser.email,
              name: dbUser.name,
              role: dbUser.role,
              avatar: dbUser.avatar,
              isActive: dbUser.isActive,
              approvalStatus: dbUser.approvalStatus,
              emailVerified: dbUser.emailVerified,
              phoneVerified: dbUser.phoneVerified,
              twoFactorEnabled: dbUser.twoFactorEnabled,
            },
            error: null,
          }
        }
      } catch {
        // DB lookup failed (cold start, table doesn't exist yet)
        // Use the JWT payload as the user data (it's still valid)
        return {
          user: {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name || decoded.email?.split('@')[0] || 'User',
            role: decoded.role || 'user',
            avatar: decoded.avatar || null,
            isActive: true,
            approvalStatus: 'approved',
            emailVerified: decoded.emailVerified || false,
            phoneVerified: false,
            twoFactorEnabled: false,
          },
          error: null,
        }
      }
    }
  } catch (jwtErr: any) {
    // JWT verification failed — token expired or invalid
    if (jwtErr.name === 'TokenExpiredError') {
      return {
        user: null,
        error: NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 }),
      }
    }
    // Not a JWT token, try session fallback
  }

  // ── Strategy 2: Database session (FALLBACK — may not survive cold starts) ──
  try {
    const { getSessionAsync } = await import('@/lib/sessions')
    const session = await getSessionAsync(token)
    if (session) {
      return { user: session, error: null }
    }
  } catch {
    // Session lookup failed
  }

  return {
    user: null,
    error: NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 }),
  }
}

/**
 * Verify auth — simple version that returns user or null
 * Used by routes like checkout, cart, wishlist
 */
export async function verifyAuth(
  request: NextRequest
): Promise<AuthUser | null> {
  const { user } = await authenticate(request)
  return user
}

/**
 * Get session info from request (lightweight)
 * Used by non-critical routes
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<AuthUser | null> {
  return verifyAuth(request)
}

/**
 * Require admin role — returns user or error response
 * Used by ALL admin API routes
 */
export async function requireAdmin(request: NextRequest): Promise<{
  user: AuthUser | null
  error: NextResponse | null
}> {
  const { user, error } = await authenticate(request)

  if (!user) {
    return { user: null, error }
  }

  if (user.role !== 'admin' && user.role !== 'superadmin') {
    return {
      user: null,
      error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }),
    }
  }

  return { user, error: null }
}

/**
 * Require a specific permission — returns user or error response
 */
export async function requirePermission(
  request: NextRequest,
  permission?: string
): Promise<{
  user: AuthUser | null
  error: NextResponse | null
}> {
  const { user, error } = await authenticate(request)

  if (!user) {
    return { user: null, error }
  }

  // Admin has all permissions
  if (user.role === 'admin' || user.role === 'superadmin') {
    return { user, error: null }
  }

  // Check specific permission
  if (permission) {
    try {
      const { db } = await import('@/lib/db')
      const perm = await db.userPermission.findFirst({
        where: { userId: user.id, permission },
      })
      if (!perm) {
        return {
          user: null,
          error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
        }
      }
    } catch {
      return {
        user: null,
        error: NextResponse.json({ error: 'Permission check failed' }, { status: 503 }),
      }
    }
  }

  return { user, error: null }
}

/**
 * Extract client IP address from request
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }
  return '127.0.0.1'
}

/**
 * Extract user agent from request
 */
export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'Unknown'
}

/**
 * Parse device info from user agent string
 */
export function parseDeviceInfo(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Windows/i.test(userAgent)) return 'Windows Desktop'
  if (/Macintosh/i.test(userAgent)) return 'Mac Desktop'
  if (/Linux/i.test(userAgent)) return 'Linux Desktop'
  return 'Unknown Device'
}
