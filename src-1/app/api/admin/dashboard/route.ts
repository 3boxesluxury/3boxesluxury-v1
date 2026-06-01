import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyAuth } from '@/lib/auth-api'

// GET /api/admin/dashboard — admin dashboard stats
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    // Run basic counts in parallel
    const [totalOrders, totalRevenue, totalUsers, totalProducts, recentOrders, ordersByStatusRows] =
      await Promise.all([
        db.order.count(),
        db.order.aggregate({ _sum: { total: true } }),
        db.user.count(),
        db.product.count(),
        db.order.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            email: true,
            total: true,
            status: true,
            paymentStatus: true,
            createdAt: true,
          },
        }),
        db.order.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
      ])

    // Revenue by month — last 6 months
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    const revenueRows = await db.order.findMany({
      where: {
        createdAt: { gte: sixMonthsAgo },
        status: { not: 'cancelled' },
      },
      select: { total: true, createdAt: true },
    })

    const revenueByMonth: Record<string, number> = {}
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      revenueByMonth[key] = 0
    }

    for (const row of revenueRows) {
      const key = `${row.createdAt.getFullYear()}-${String(row.createdAt.getMonth() + 1).padStart(2, '0')}`
      if (key in revenueByMonth) {
        revenueByMonth[key] += row.total
      }
    }

    // Format ordersByStatus
    const ordersByStatus: Record<string, number> = {}
    for (const row of ordersByStatusRows) {
      ordersByStatus[row.status] = row._count.status
    }

    return NextResponse.json({
      totalOrders,
      totalRevenue: totalRevenue._sum.total || 0,
      totalUsers,
      totalProducts,
      recentOrders,
      ordersByStatus,
      revenueByMonth,
    })
  } catch (error) {
    console.error('Admin dashboard GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 })
  }
}
