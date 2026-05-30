/**
 * Login Route — FIXED for Vercel Serverless (v5)
 * Quick bootstrap: creates ONLY User table + admin user (1-2 seconds).
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '3boxes-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

const ADMIN_PASSWORD_HASH = '$2b$10$e9AuzJsvSUtdPEjYshqskuiaRXQxKt9T.Stf/fSrbJ24dDQfKBY.K';
const USER_PASSWORD_HASH = '$2b$10$CD3bZ.ApSzllzp/NgpTz1.ZNbs7sfJUuMAB4DJ/LC6hv0HLcW7XNa';

let bootstrapDone = false;

async function quickBootstrap(): Promise<void> {
  if (bootstrapDone) return;
  try {
    const { db } = await import('@/lib/db');
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS User (
        id TEXT NOT NULL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        adminRole TEXT,
        corporateRole TEXT,
        avatar TEXT,
        phone TEXT,
        isActive BOOLEAN NOT NULL DEFAULT true,
        emailVerified BOOLEAN NOT NULL DEFAULT false,
        phoneVerified BOOLEAN NOT NULL DEFAULT false,
        twoFactorSecret TEXT,
        twoFactorEnabled BOOLEAN NOT NULL DEFAULT false,
        twoFactorRequired BOOLEAN NOT NULL DEFAULT false,
        approvalStatus TEXT NOT NULL DEFAULT 'pending',
        socialProvider TEXT,
        socialId TEXT,
        resetToken TEXT,
        resetTokenExpiry DATETIME,
        otpCode TEXT,
        otpExpiry DATETIME,
        emailVerifyToken TEXT,
        emailVerifyExpiry DATETIME,
        phoneVerifyCode TEXT,
        phoneVerifyExpiry DATETIME,
        lastLoginAt DATETIME,
        lastLoginIp TEXT,
        lastLoginDevice TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        preferredLanguage TEXT DEFAULT 'en',
        preferredCurrency TEXT DEFAULT 'INR',
        detectedCountry TEXT
      );
    `);
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS Session (
        id TEXT NOT NULL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        userId TEXT NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        deviceInfo TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expiresAt DATETIME NOT NULL,
        lastActivity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES User(id)
      );
    `);
    await db.$executeRawUnsafe(`
      INSERT OR IGNORE INTO User (id, email, name, password, role, isActive, approvalStatus, emailVerified, phoneVerified, twoFactorEnabled)
      VALUES ('admin-001', 'admin@3boxesluxury.com', 'Admin', '${ADMIN_PASSWORD_HASH}', 'admin', 1, 'approved', 1, 1, 0);
    `);
    await db.$executeRawUnsafe(`
      INSERT OR IGNORE INTO User (id, email, name, password, role, isActive, approvalStatus, emailVerified, phoneVerified, twoFactorEnabled)
      VALUES ('user-001', 'user@3boxesluxury.com', 'User', '${USER_PASSWORD_HASH}', 'user', 1, 'approved', 1, 0, 0);
    `);
    bootstrapDone = true;
    console.log('[login] Quick bootstrap done');
  } catch (err: any) {
    console.error('[login] Quick bootstrap error:', err.message?.substring(0, 200));
    bootstrapDone = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    await quickBootstrap();

    const { db } = await import('@/lib/db');
    let user;
    try {
      user = await db.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
    } catch (dbErr: any) {
      console.error('[login] DB lookup failed:', dbErr.message?.substring(0, 200));
      try {
        const results: any = await db.$queryRawUnsafe(
          `SELECT * FROM User WHERE email = '${email.toLowerCase().trim()}' LIMIT 1`
        );
        if (results && results.length > 0) user = results[0];
      } catch (rawErr: any) {
        console.error('[login] Raw SQL also failed:', rawErr.message?.substring(0, 200));
        return NextResponse.json({ error: 'Service temporarily unavailable. Please try again.' }, { status: 503 });
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    if (!user.password) {
      return NextResponse.json({ error: 'Please log in with your social account' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }
    if (!user.isActive) {
      return NextResponse.json({ error: 'Your account has been deactivated.' }, { status: 403 });
    }
    if (user.approvalStatus === 'pending') {
      return NextResponse.json({ error: 'Your account is pending approval', approvalStatus: 'pending' }, { status: 403 });
    }
    if (user.approvalStatus === 'rejected') {
      return NextResponse.json({ error: 'Your account has been rejected.' }, { status: 403 });
    }
    if (user.twoFactorEnabled) {
      return NextResponse.json({ requiresTwoFactor: true, userId: user.id, message: 'Two-factor authentication required' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY, issuer: '3boxes-luxury' }
    );

    try {
      const { createSession, generateToken } = await import('@/lib/sessions');
      const sessionToken = generateToken();
      await createSession(sessionToken, {
        id: user.id, email: user.email, name: user.name, role: user.role,
        avatar: user.avatar, isActive: user.isActive, approvalStatus: user.approvalStatus,
        emailVerified: user.emailVerified, phoneVerified: user.phoneVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      });
    } catch {
      console.log('[login] DB session creation skipped');
    }

    return NextResponse.json({
      user: {
        id: user.id, email: user.email, name: user.name, role: user.role,
        avatar: user.avatar, phone: user.phone, isActive: user.isActive,
        emailVerified: user.emailVerified, phoneVerified: user.phoneVerified,
        twoFactorEnabled: user.twoFactorEnabled, approvalStatus: user.approvalStatus,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'An error occurred during login' }, { status: 500 });
  }
}

export const maxDuration = 30;