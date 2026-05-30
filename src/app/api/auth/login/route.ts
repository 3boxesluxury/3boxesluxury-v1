/**
 * Login Route — FIXED for Vercel Serverless
 *
 * KEY FIX: Returns JWT token instead of UUID session token.
 *
 * OLD PROBLEM:
 * - Login created UUID session tokens stored in Session table (SQLite)
 * - On Vercel cold start, /tmp is wiped → Session table gone → user logged out
 * - auth-helper.ts only checked DB sessions → always 401 on cold start
 *
 * NEW FIX:
 * - Login returns JWT token (self-contained, verified with secret key)
 * - JWT tokens survive Vercel cold starts — no DB lookup needed
 * - Also creates DB session as backup (optional, won't block login)
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || '3boxes-secret-key-change-in-production';
const JWT_EXPIRY = '7d'; // 7 days

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user by email
    let user;
    try {
      user = await db.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
    } catch (dbErr) {
      console.error('[login] DB lookup failed:', (dbErr as Error).message?.substring(0, 200));
      return NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if user has a password (social login users may not)
    if (!user.password) {
      return NextResponse.json(
        { error: 'Please log in with your social account' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact support.' },
        { status: 403 }
      );
    }

    // Check approval status
    if (user.approvalStatus === 'pending') {
      return NextResponse.json(
        { error: 'Your account is pending approval', approvalStatus: 'pending' },
        { status: 403 }
      );
    }

    if (user.approvalStatus === 'rejected') {
      return NextResponse.json(
        { error: 'Your account has been rejected. Please contact support.', approvalStatus: 'rejected' },
        { status: 403 }
      );
    }

    // If 2FA is enabled, return that 2FA verification is needed
    if (user.twoFactorEnabled) {
      return NextResponse.json({
        requiresTwoFactor: true,
        userId: user.id,
        message: 'Two-factor authentication required',
      });
    }

    // ── KEY FIX: Generate JWT token instead of UUID session token ──
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      JWT_SECRET,
      {
        expiresIn: JWT_EXPIRY,
        issuer: '3boxes-luxury',
      }
    );

    // Also try to create a DB session as backup (optional, won't block login)
    try {
      const { createSession, generateToken } = await import('@/lib/sessions');
      const sessionToken = generateToken();
      await createSession(sessionToken, {
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
      });
    } catch {
      // DB session creation is optional — JWT is the primary auth method
      console.log('[login] DB session creation skipped (DB not ready)');
    }

    // Return user data and JWT token
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        phone: user.phone,
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        approvalStatus: user.approvalStatus,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
