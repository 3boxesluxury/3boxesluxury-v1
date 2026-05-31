import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date() || !session.user.isActive || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parallel queries for performance
    const [
      totalProducts,
      totalCategories,
      totalOrders,
      totalUsers,
      totalRevenue,
      ordersByStatus,
      lowStockProducts,
      recentOrders,
      recentUsers,
      topSellingProducts,
    ] = await Promise.all([
      db.product.count(),
      db.category.count(),
      db.order.count(),
      db.user.count(),
      db.order.aggregate({ _sum: { total: true } }),
      db.order.groupBy({ by: ['status'], _count: { status: true } }),
      db.product.findMany({
        where: { stock: { lt: 5 } },
        take: 10,
        orderBy: { stock: 'asc' },
        select: { id: true, name: true, stock: true, price: true, images: true },
      }),
      db.order.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { items: true },
      }),
      db.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      }),
      // Top selling products by quantity sold
      db.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        _avg: { price: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
    ]);

    // Get product details for top selling
    const topProductIds = topSellingProducts.map(t => t.productId);
    const topProducts = await db.product.findMany({
      where: { id: { in: topProductIds } },
      select: { id: true, name: true, price: true, images: true, category: { select: { name: true } } },
    });
    const topProductMap = Object.fromEntries(topProducts.map(p => [p.id, p]));

    // Revenue by month (last 6 months)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthlyOrders = await db.order.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { total: true, createdAt: true },
    });

    const revenueByMonth: { month: string; revenue: number; orders: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      const monthOrders = monthlyOrders.filter(o => {
        const od = new Date(o.createdAt);
        return od.getMonth() === d.getMonth() && od.getFullYear() === d.getFullYear();
      });
      revenueByMonth.push({
        month: monthStr,
        revenue: monthOrders.reduce((sum, o) => sum + o.total, 0),
        orders: monthOrders.length,
      });
    }

    return NextResponse.json({
      totalRevenue: totalRevenue._sum.total || 0,
      totalOrders,
      totalUsers,
      totalProducts,
      totalCategories,
      revenueByMonth,
      ordersByStatus: ordersByStatus.map(o => ({ status: o.status, count: o._count.status })),
      topSellingProducts: topSellingProducts.map(t => ({
        id: t.productId,
        name: topProductMap[t.productId]?.name || 'Unknown',
        price: topProductMap[t.productId]?.price || 0,
        image: topProductMap[t.productId]?.images ? JSON.parse(topProductMap[t.productId].images)[0] : null,
        category: topProductMap[t.productId]?.category?.name || 'Unknown',
        totalSold: t._sum.quantity || 0,
      })),
      lowStockProducts: lowStockProducts.map(p => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        price: p.price,
        image: p.images ? JSON.parse(p.images)[0] : null,
      })),
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        email: o.email,
        total: o.total,
        status: o.status,
        paymentStatus: o.paymentStatus,
        deliveryType: o.deliveryType,
        createdAt: o.createdAt,
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
      })),
      recentUsers: recentUsers.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json({ error: 'Failed to load admin stats' }, { status: 500 });
  }
}
