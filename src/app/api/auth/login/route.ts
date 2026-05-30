/**
 * Login Route — FIXED for Vercel Serverless (v3)
 *
 * v2 BUG: ensureDBReady() was imported but never actually called.
 * Plus, if db.ts wasn't updated, ensureDBReady doesn't exist.
 *
 * v3 FIX: Calls ensureSeeded() DIRECTLY from auto-seed module.
 * This works regardless of whether db.ts has the $extends() or not.
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || '3boxes-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

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

    // ── CRITICAL: Seed the database BEFORE querying ──
    // On Vercel cold starts, /tmp is empty — no tables exist.
    // We MUST call ensureSeeded() to create tables + seed data.
    try {
      const { ensureSeeded } = await import('@/lib/auto-seed');
      await ensureSeeded();
      console.log('[login] Database seeded successfully');
    } catch (seedErr) {
      console.error('[login] Auto-seed failed:', (seedErr as Error).message?.substring(0, 300));
    }

    // Find user by email — with retry logic
    let user;
    let dbAttempts = 0;
    const maxAttempts = 3;

    while (dbAttempts < maxAttempts) {
      try {
        user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        break;
      } catch (dbErr: any) {
        dbAttempts++;
        const errMsg = dbErr?.message || '';
        console.error(`[login] DB lookup attempt ${dbAttempts} failed:`, errMsg.substring(0, 200));

        if (errMsg.includes('does not exist') || errMsg.includes('no such table')) {
          try {
            const { ensureSeeded } = await import('@/lib/auto-seed');
            await ensureSeeded();
            console.log(`[login] Re-seeded on attempt ${dbAttempts}`);
          } catch {
            // Seeding failed again
          }

          if (dbAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }

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

    if (!user.password) {
      return NextResponse.json(
        { error: 'Please log in with your social account' },
        { status: 401 }
      );
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Your account has been deactivated. Please contact support.' },
        { status: 403 }
      );
    }

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

    if (user.twoFactorEnabled) {
      return NextResponse.json({
        requiresTwoFactor: true,
        userId: user.id,
        message: 'Two-factor authentication required',
      });
    }

    // ── Generate JWT token ──
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

    // Try to create a DB session as backup (optional)
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
      console.log('[login] DB session creation skipped');
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