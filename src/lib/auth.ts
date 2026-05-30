import jwt from 'jsonwebtoken'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionAsync } from '@/lib/sessions'
import { db } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || '3b0x3s-s3cr3t-k3y-pr0duct10n-2024-xy7z'

interface JWTPayload {
  userId: string
  email?: string
  role?: string
  name?: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
  adminRole?: string | null
  corporateRole?: string | null
  approvalStatus?: string
  isActive?: boolean
  emailVerified?: boolean
  twoFactorEnabled?: boolean
  twoFactorRequired?: boolean
}

/**
 * Authenticate a request using JWT first, then session as fallback.
 * CRITICAL: When DB lookup fails (cold start, empty table), uses JWT payload directly.
 * This prevents admin logout on Vercel cold starts.
 */
export async function authenticate(
  request: NextRequest
): Promise<{ user: AuthUser; error: null } | { user: null; error: NextResponse }> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return {
      user: null,
      error: NextResponse.json({ error: 'Authorization header required' }, { status: 401 }),
    }
  }

  const token = authHeader.replace('Bearer ', '')

  // Strategy 1: JWT verification (PRIMARY - survives cold starts)
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload

    // Try DB lookup for full user data
    try {
      const dbUser = await db.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true, email: true, name: true, role: true,
          adminRole: true, corporateRole: true, isActive: true,
          approvalStatus: true, emailVerified: true,
          twoFactorEnabled: true, twoFactorRequired: true,
        },
      })

      if (dbUser && dbUser.isActive) {
        return { user: dbUser as AuthUser, error: null }
      }

      // DB lookup returned null but JWT is valid — use JWT payload directly
      // This happens on Vercel cold starts when User table is empty
      if (decoded.userId && decoded.email && decoded.role) {
        return {
          user: {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name || decoded.email,
            role: decoded.role,
            isActive: true,
          } as AuthUser,
          error: null,
        }
      }
    } catch (dbErr: any) {
      // DB error (table doesn't exist, cold start, etc.) — use JWT payload directly
      console.error('[auth] DB lookup failed, using JWT payload:', dbErr?.message || dbErr)
      if (decoded.userId && decoded.email && decoded.role) {
        return {
          user: {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name || decoded.email,
            role: decoded.role,
            isActive: true,
          } as AuthUser,
          error: null,
        }
      }
    }
  } catch (jwtErr: any) {
    // JWT expired or invalid — don't fall through to session for expired tokens
    if (jwtErr.name === 'TokenExpiredError') {
      return {
        user: null,
        error: NextResponse.json({ error: 'Token expired' }, { status: 401 }),
      }
    }
    // Other JWT error — try session fallback
  }

  // Strategy 2: Database session (FALLBACK for old session tokens)
  try {
    const sessionUser = await getSessionAsync(token)
    if (!sessionUser) {
      return {
        user: null,
        error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
      }
    }

    // Try DB lookup for extended data
    try {
      const dbUser = await db.user.findUnique({
        where: { id: sessionUser.id },
        select: {
          id: true, email: true, name: true, role: true,
          adminRole: true, corporateRole: true, isActive: true,
          approvalStatus: true, emailVerified: true,
          twoFactorEnabled: true, twoFactorRequired: true,
        },
      })

      if (dbUser && dbUser.isActive) {
        return { user: dbUser as AuthUser, error: null }
      }
    } catch {
      // DB lookup failed — use session data directly
    }

    return {
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        role: sessionUser.role,
        isActive: true,
      } as AuthUser,
      error: null,
    }
  } catch {
    return {
      user: null,
      error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    }
  }
}

/**
 * Get session info from request (lightweight).
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<AuthUser | null> {
  try {
    const result = await authenticate(request)
    if (result.error) return null
    return result.user
  } catch {
    return null
  }
}

/**
 * Require admin role.
 */
export async function requireAdmin(
  request: NextRequest
): Promise<{ user: AuthUser; error: null } | { user: null; error: NextResponse }> {
  const result = await authenticate(request)
  if (result.error) return result

  if (result.user.role !== 'admin' && result.user.role !== 'superadmin') {
    return {
      user: null,
      error: NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 }),
    }
  }

  return result
}

/**
 * Require a specific permission.
 */
export async function requirePermission(
  request: NextRequest,
  permission?: string
): Promise<{ user: AuthUser; error: null } | { user: null; error: NextResponse }> {
  const result = await authenticate(request)
  if (result.error) return result

  if (result.user.role === 'admin') return result

  return {
    user: null,
    error: NextResponse.json({ error: `Forbidden: ${permission || 'Admin'} access required` }, { status: 403 }),
  }
}

/**
 * Generate a JWT token for a user
 */
export function generateJWT(userId: string, email: string, role: string, name?: string): string {
  return jwt.sign({ userId, email, role, name }, JWT_SECRET, { expiresIn: '7d', issuer: '3boxes-luxury' })
}

/**
 * Extract client IP address from request
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
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