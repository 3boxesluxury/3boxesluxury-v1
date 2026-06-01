import { NextRequest, NextResponse } from 'next/server';
import { getSessionAsync, createSession, generateToken } from '@/lib/sessions';
import { db } from '@/lib/db';
import crypto from 'crypto';

/**
 * Verify a TOTP code against a secret.
 * Implements TOTP algorithm per RFC 6238.
 */
function verifyTOTP(secret: string, code: string, window: number = 1): boolean {
  // Decode base32 secret
  const key = base32Decode(secret);

  // Get current time step (30-second intervals)
  const timeStep = Math.floor(Date.now() / 1000 / 30);

  // Check current and adjacent windows
  for (let i = -window; i <= window; i++) {
    const step = timeStep + i;
    const timeBuffer = Buffer.alloc(8);
    // Write time step as big-endian 64-bit integer
    timeBuffer.writeBigUInt64BE(BigInt(step));

    // HMAC-SHA1
    const hmac = crypto.createHmac('sha1', key);
    hmac.update(timeBuffer);
    const hmacResult = hmac.digest();

    // Dynamic truncation
    const offset = hmacResult[hmacResult.length - 1] & 0x0f;
    const binary =
      ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);

    const otp = binary % 1000000;
    const otpString = otp.toString().padStart(6, '0');

    if (otpString === code) {
      return true;
    }
  }

  return false;
}

/**
 * Decode a base32 string to a Buffer.
 */
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  str = str.toUpperCase().replace(/=+$/, '');

  let bits = '';
  for (const char of str) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, enable, userId } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      );
    }

    // If this is a login 2FA verification (userId provided, no session needed)
    if (userId && !enable) {
      const user = await db.user.findUnique({
        where: { id: userId },
      });

      if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        return NextResponse.json(
          { error: 'Invalid 2FA verification request' },
          { status: 400 }
        );
      }

      // Verify the TOTP code
      if (!verifyTOTP(user.twoFactorSecret, code)) {
        return NextResponse.json(
          { error: 'Invalid verification code' },
          { status: 401 }
        );
      }

      // Check if user is still active and approved
      if (!user.isActive) {
        return NextResponse.json(
          { error: 'Your account has been deactivated' },
          { status: 403 }
        );
      }

      if (user.approvalStatus !== 'approved') {
        return NextResponse.json(
          { error: 'Your account is not approved', approvalStatus: user.approvalStatus },
          { status: 403 }
        );
      }

      // Create session
      const token = generateToken();
      await createSession(token, {
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
    }

    // If this is enabling 2FA (session required)
    const auth = request.headers.get('authorization');
    const user = await getSessionAsync(auth?.replace('Bearer ', '') ?? '');

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user from DB to get the secret
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser || !dbUser.twoFactorSecret) {
      return NextResponse.json(
        { error: '2FA setup not initialized. Please set up 2FA first.' },
        { status: 400 }
      );
    }

    // Verify the TOTP code
    if (!verifyTOTP(dbUser.twoFactorSecret, code)) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 401 }
      );
    }

    // If enable flag, enable 2FA on the account
    if (enable) {
      await db.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true },
      });

      return NextResponse.json({
        message: 'Two-factor authentication has been enabled successfully',
        twoFactorEnabled: true,
      });
    }

    return NextResponse.json({
      message: 'Verification code is valid',
      verified: true,
    });
  } catch (error) {
    console.error('2FA verify error:', error);
    return NextResponse.json(
      { error: 'An error occurred during 2FA verification' },
      { status: 500 }
    );
  }
}
