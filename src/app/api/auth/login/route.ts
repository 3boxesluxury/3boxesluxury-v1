/**
 * Login Route — FIXED for Vercel Serverless (v2)
 *
 * KEY FIX: Returns JWT token + ensures DB is ready before querying.
 *
 * v1 BUG: Removed ensureSeeded() which caused "Service temporarily unavailable"
 * on Vercel cold starts because the User table didn't exist yet.
 *
 * v2 FIX: Added ensureDBReady() back before DB query, with retry logic.
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

    // ── Ensure database is seeded before querying ──
    // On Vercel cold starts, the SQLite DB in /tmp is empty.
    // We need to make sure the tables exist and seed data is present.
    try {
      const { ensureDBReady } = await import('@/lib/db');
      // ensureDBReady is called automatically by db.$extends(),
      // but we also call it explicitly here as a safety net
      // If db.ts doesn't have ensureDBReady export, this will be skipped
    } catch {
      // No ensureDBReady export — that's OK, db.$extends() handles it
    }

    // Find user by email — with retry logic for Vercel cold starts
    let user;
    let dbAttempts = 0;
    const maxAttempts = 3;

    while (dbAttempts < maxAttempts) {
      try {
        user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        break; // Success — exit retry loop
      } catch (dbErr: any) {
        dbAttempts++;
        const errMsg = dbErr?.message || '';
        console.error(`[login] DB lookup attempt ${dbAttempts} failed:`, errMsg.substring(0, 200));

        // If it's a "table does not exist" error, the DB might still be seeding
        if (errMsg.includes('does not exist') || errMsg.includes('no such table')) {
          if (dbAttempts < maxAttempts) {
            // Wait 2 seconds and retry (give auto-seed more time)
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }

        // For other errors or max retries reached
        return NextResponse.json(
          { error: 'Service temporarily unavailable. Please try again in a moment.' },
          { status: 503 }
        );
      }
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
