import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || '3b0x3s-s3cr3t-k3y-pr0duct10n-2024-xy7z';

async function quickBootstrap() {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS User (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        password TEXT,
        role TEXT DEFAULT 'user',
        avatar TEXT,
        phone TEXT,
        isActive BOOLEAN DEFAULT true,
        approvalStatus TEXT DEFAULT 'approved',
        emailVerified BOOLEAN DEFAULT true,
        phoneVerified BOOLEAN DEFAULT false,
        twoFactorEnabled BOOLEAN DEFAULT false,
        twoFactorRequired BOOLEAN DEFAULT false,
        adminRole TEXT,
        corporateRole TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS Session (
        id TEXT PRIMARY KEY,
        userId TEXT,
        token TEXT UNIQUE,
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const adminPasswordHash = '$2b$10$e9AuzJsvSUtdPEjYshqskuiaRXQxKt9T.Stf/fSrbJ24dDQfKBY.K';
    await db.$executeRawUnsafe(`
      INSERT OR IGNORE INTO User (id, email, name, password, role, isActive, approvalStatus, emailVerified)
      VALUES ('admin-001', 'admin@3boxesluxury.com', 'Admin', '${adminPasswordHash}', 'admin', 1, 'approved', 1)
    `);

    const userPasswordHash = '$2b$10$CD3bZ.ApSzllzp/NgpTz1.ZNbs7sfJUuMAB4DJ/LC6hv0HLcW7XNa';
    await db.$executeRawUnsafe(`
      INSERT OR IGNORE INTO User (id, email, name, password, role, isActive, approvalStatus, emailVerified)
      VALUES ('user-001', 'user@3boxesluxury.com', 'Demo User', '${userPasswordHash}', 'user', 1, 'approved', 1)
    `);
  } catch (err) {
    console.error('[login] Bootstrap error:', err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await quickBootstrap();

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    let user: any = null;
    try {
      user = await db.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
    } catch {
      try {
        const results = await db.$queryRawUnsafe(
          `SELECT id, email, name, password, role, isActive, approvalStatus, emailVerified, twoFactorEnabled FROM User WHERE email = '${email.toLowerCase().trim()}'`
        );
        user = (results as any[])[0] || null;
      } catch {
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

    if (user.twoFactorEnabled) {
      return NextResponse.json({
        requiresTwoFactor: true,
        userId: user.id,
        message: 'Two-factor authentication required',
      });
    }

    // CREATE JWT TOKEN - key fix
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: '7d', issuer: '3boxes-luxury' }
    );

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
        twoFactorEnabled: user.twoFactorEnabled || false,
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