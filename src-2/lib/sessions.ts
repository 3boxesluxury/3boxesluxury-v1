import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

// In-memory session cache for fast lookups
const sessionCache = new Map<string, { userId: string; expiresAt: Date }>();

// Clean expired sessions from cache every 5 minutes
setInterval(() => {
  const now = new Date();
  for (const [token, session] of sessionCache.entries()) {
    if (session.expiresAt < now) {
      sessionCache.delete(token);
    }
  }
}, 5 * 60 * 1000);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string | null;
  isActive: boolean;
  approvalStatus: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: string;
}

/**
 * Create a new session for a user.
 * Persists to DB and in-memory cache.
 * Optionally tracks IP address, user agent, and device info.
 */
export async function createSession(
  token: string,
  user: SessionUser,
  metadata?: SessionMetadata
): Promise<void> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
      ipAddress: metadata?.ipAddress || null,
      userAgent: metadata?.userAgent || null,
      deviceInfo: metadata?.deviceInfo || null,
    },
  });

  sessionCache.set(token, { userId: user.id, expiresAt });
}

/**
 * Get a session by token.
 * Checks in-memory cache first, falls back to DB.
 * Returns the user data or null if session not found or expired.
 */
export async function getSessionAsync(
  token: string
): Promise<SessionUser | null> {
  if (!token) return null;

  // Check cache first
  const cached = sessionCache.get(token);
  if (cached) {
    if (cached.expiresAt < new Date()) {
      sessionCache.delete(token);
      return null;
    }

    // Fetch user from DB to get fresh data
    const user = await db.user.findUnique({
      where: { id: cached.userId },
    });

    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      isActive: user.isActive,
      approvalStatus: user.approvalStatus,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      twoFactorEnabled: user.twoFactorEnabled,
    };
  }

  // Fallback to DB
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;

  // Check expiration
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token } });
    return null;
  }

  // Check user is still active
  if (!session.user.isActive) return null;

  // Add to cache
  sessionCache.set(token, {
    userId: session.userId,
    expiresAt: session.expiresAt,
  });

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    avatar: session.user.avatar,
    isActive: session.user.isActive,
    approvalStatus: session.user.approvalStatus,
    emailVerified: session.user.emailVerified,
    phoneVerified: session.user.phoneVerified,
    twoFactorEnabled: session.user.twoFactorEnabled,
  };
}

/**
 * Destroy a session by token.
 * Removes from both DB and in-memory cache.
 */
export async function destroySession(token: string): Promise<void> {
  sessionCache.delete(token);

  try {
    await db.session.delete({ where: { token } });
  } catch {
    // Session may not exist, that's fine
  }
}

/**
 * Generate a new session token.
 */
export function generateToken(): string {
  return uuidv4();
}

/**
 * Generate a token pair (access token + refresh token) for a user.
 * Creates both tokens and persists sessions.
 */
export async function generateTokenPair(
  user: SessionUser,
  metadata?: SessionMetadata
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = uuidv4();
  const refreshToken = uuidv4();

  await createSession(accessToken, user, metadata);
  await createSession(refreshToken, user, metadata);

  return { accessToken, refreshToken };
}

/**
 * Refresh an access token using a valid refresh token.
 * Returns a new access token or null if the refresh token is invalid/expired.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string } | null> {
  const user = await getSessionAsync(refreshToken);
  if (!user) return null;

  const accessToken = uuidv4();
  await createSession(accessToken, user);

  return { accessToken };
}
