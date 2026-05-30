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
    } catch {}

    // JWT valid but DB empty (cold start) — use JWT payload directly
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
  } catch (jwtErr: any) {
    if (jwtErr.name === 'TokenExpiredError') {
      return {
        user: null,
        error: NextResponse.json({ error: 'Token expired' }, { status: 401 }),
      }
    }
    // JWT verification failed, try session fallback
  }

  // Strategy 2: Session fallback (for old UUID tokens)
  try {
    const sessionUser = await getSessionAsync(token)
    if (sessionUser) {
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
      } catch {}

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
    }
  } catch {}

  return {
    user: null,
    error: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
  }
}

export async function verifyAuth(
  request: NextRequest
): Promise<{ id: string; email: string; name: string; role: string } | null> {
  try {
    const result = await authenticate(request)
    if (result.error) return null
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
    }
  } catch {
    return null
  }
}

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

export function generateJWT(userId: string, email: string, role: string, name?: string): string {
  return jwt.sign({ userId, email, role, name }, JWT_SECRET, { expiresIn: '7d', issuer: '3boxes-luxury' })
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return '127.0.0.1'
}

export function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'Unknown'
}

export function parseDeviceInfo(userAgent: string): string {
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Windows/i.test(userAgent)) return 'Windows Desktop'
  if (/Macintosh/i.test(userAgent)) return 'Mac Desktop'
  if (/Linux/i.test(userAgent)) return 'Linux Desktop'
  return 'Unknown Device'
}