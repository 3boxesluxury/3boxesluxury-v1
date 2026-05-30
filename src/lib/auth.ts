import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || '3boxes-secret-key-change-in-production'

export interface AuthUser {
  id: string; email: string; name: string; role: string;
  avatar?: string | null; isActive: boolean; approvalStatus: string;
  emailVerified: boolean; phoneVerified: boolean; twoFactorEnabled: boolean;
}

export async function authenticate(request: NextRequest): Promise<{
  user: AuthUser | null; error: NextResponse | null
}> {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return { user: null, error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: '3boxes-luxury' }) as any
    if (decoded?.userId) {
      try {
        const { db } = await import('@/lib/db')
        const dbUser = await db.user.findUnique({ where: { id: decoded.userId } })
        if (dbUser) {
          if (!dbUser.isActive) return { user: null, error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }) }
          return { user: { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role, avatar: dbUser.avatar, isActive: dbUser.isActive, approvalStatus: dbUser.approvalStatus, emailVerified: dbUser.emailVerified, phoneVerified: dbUser.phoneVerified, twoFactorEnabled: dbUser.twoFactorEnabled }, error: null }
        }
      } catch {
        return { user: { id: decoded.userId, email: decoded.email, name: decoded.name || decoded.email?.split('@')[0] || 'User', role: decoded.role || 'user', avatar: null, isActive: true, approvalStatus: 'approved', emailVerified: false, phoneVerified: false, twoFactorEnabled: false }, error: null }
      }
    }
  } catch (jwtErr: any) {
    if (jwtErr.name === 'TokenExpiredError') return { user: null, error: NextResponse.json({ error: 'Session expired' }, { status: 401 }) }
  }

  try {
    const { getSessionAsync } = await import('@/lib/sessions')
    const session = await getSessionAsync(token)
    if (session) return { user: session, error: null }
  } catch {}

  return { user: null, error: NextResponse.json({ error: 'Invalid session' }, { status: 401 }) }
}

export async function verifyAuth(request: NextRequest): Promise<AuthUser | null> { return (await authenticate(request)).user }
export async function getSessionFromRequest(request: NextRequest): Promise<AuthUser | null> { return verifyAuth(request) }

export async function requireAdmin(request: NextRequest): Promise<{ user: AuthUser | null; error: NextResponse | null }> {
  const { user, error } = await authenticate(request)
  if (!user) return { user: null, error }
  if (user.role !== 'admin' && user.role !== 'superadmin') return { user: null, error: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  return { user, error: null }
}

export async function requirePermission(request: NextRequest, permission?: string): Promise<{ user: AuthUser | null; error: NextResponse | null }> {
  const { user, error } = await authenticate(request)
  if (!user) return { user: null, error }
  if (user.role === 'admin' || user.role === 'superadmin') return { user, error: null }
  if (permission) { try { const { db } = await import('@/lib/db'); const perm = await db.userPermission.findFirst({ where: { userId: user.id, permission } }); if (!perm) return { user: null, error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }) } } catch { return { user: null, error: NextResponse.json({ error: 'Permission check failed' }, { status: 503 }) } } }
  return { user, error: null }
}

export function getClientIp(request: NextRequest): string { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || '127.0.0.1' }
export function getUserAgent(request: NextRequest): string { return request.headers.get('user-agent') || 'Unknown' }
export function parseDeviceInfo(userAgent: string): string { if (/iPhone/i.test(userAgent)) return 'iPhone'; if (/iPad/i.test(userAgent)) return 'iPad'; if (/Android/i.test(userAgent)) return 'Android'; if (/Windows/i.test(userAgent)) return 'Windows'; if (/Macintosh/i.test(userAgent)) return 'Mac'; if (/Linux/i.test(userAgent)) return 'Linux'; return 'Unknown' }