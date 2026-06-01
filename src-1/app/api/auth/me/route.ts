import { NextRequest, NextResponse } from 'next/server';
import { getSessionAsync } from '@/lib/sessions';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Verify session
    const auth = request.headers.get('authorization');
    const user = await getSessionAsync(auth?.replace('Bearer ', '') ?? '');

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch fresh user data from DB with permissions
    const dbUser = await db.user.findUnique({
      where: { id: user.id },
      include: {
        permissions: {
          select: {
            id: true,
            permission: true,
          },
        },
      },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        avatar: dbUser.avatar,
        phone: dbUser.phone,
        isActive: dbUser.isActive,
        emailVerified: dbUser.emailVerified,
        phoneVerified: dbUser.phoneVerified,
        twoFactorEnabled: dbUser.twoFactorEnabled,
        approvalStatus: dbUser.approvalStatus,
        socialProvider: dbUser.socialProvider,
        createdAt: dbUser.createdAt,
        updatedAt: dbUser.updatedAt,
      },
      permissions: dbUser.permissions.map((p) => p.permission),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'An error occurred while fetching profile' },
      { status: 500 }
    );
  }
}
