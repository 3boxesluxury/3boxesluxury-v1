/**
 * Login Route — FIXED for Vercel Serverless (v4)
 *
 * v3 BUG: await ensureSeeded() at the top BLOCKS forever on Vercel
 * — seeding 65 products takes too long, function times out, login hangs.
 *
 * v4 FIX: Try DB query FIRST (fast path for warm starts).
 * Only call ensureSeeded() if the query fails (cold start).
 * Add 10-second timeout to prevent infinite loading.
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

    // Find user by email — try DB first, seed only if needed
    let user;
    let dbAttempts = 0;
    const maxAttempts = 3;

    while (dbAttempts < maxAttempts) {
      try {
        // Try the query first (fast on warm starts)
        user = await db.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        break; // Success — no seeding needed
      } catch (dbErr: any) {
        dbAttempts++;
        const errMsg = dbErr?.message || '';
        console.error(`[login] DB lookup attempt ${dbAttempts} failed:`, errMsg.substring(0, 200));

        // Only seed if table doesn't exist (cold start)
        if (errMsg.includes('does not exist') || errMsg.includes('no such table')) {
          console.log(`[login] Table missing — seeding database (attempt ${dbAttempts})...`);

          // Call ensureSeeded with a 10-second timeout
          try {
            const seedPromise = import('@/lib/auto-seed').then(m => m.ensureSeeded());
            const timeoutPromise = new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Seed timeout')), 10000)
            );
            await Promise.race([seedPromise, timeoutPromise]);
            console.log('[login] Database seeded successfully');
          } catch (seedErr: any) {
            console.error('[login] Seed failed:', seedErr.message?.substring(0, 200));
          }

          if (dbAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }

        // Other errors or max retries
        return NextResponse.json(
          { error: 'Service temporarily unavailable. Please try again.' },
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

    // Try to create a DB session as backup (optional, won't block)
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
