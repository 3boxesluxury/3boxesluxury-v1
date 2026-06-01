import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helper';
import { ensureSeeded } from '@/lib/auto-seed';

// GET /api/admin/products/[id] - Get single product
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await ensureSeeded();

  try {
    const { id } = await params;
    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        vendor: true,
        inventoryLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const productResponse = {
      ...product,
      images: JSON.parse(product.images),
      tags: product.tags ? JSON.parse(product.tags) : null,
    };

    return NextResponse.json(productResponse);
  } catch (err: any) {
    console.error('[admin-products] GET by ID error:', err?.message);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}

// PUT /api/admin/products/[id] - Update product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await ensureSeeded();

  const { id } = await params;

  try {
    const body = await request.json();
    const existing = await db.product.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Resolve Shopify GID categoryId if needed
    let resolvedCategoryId = body.categoryId;
    if (body.categoryId && typeof body.categoryId === 'string' && body.categoryId.startsWith('gid://shopify/')) {
      const localCategory = await db.category.findFirst({
        where: { shopifyId: body.categoryId },
      });
      if (localCategory) {
        resolvedCategoryId = localCategory.id;
      } else {
        return NextResponse.json(
          { error: 'Category from Shopify not found in local database.' },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) {
      updateData.name = body.name;
      // Regenerate slug if name changes
      const baseSlug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      let slug = baseSlug;
      let slugCounter = 1;
      let existingSlug = await db.product.findFirst({
        where: { slug, id: { not: id } },
      });
      while (existingSlug) {
        slug = `${baseSlug}-${slugCounter}`;
        slugCounter++;
        const check = await db.product.findFirst({
          where: { slug, id: { not: id } },
        });
        if (!check) break;
      }
      updateData.slug = slug;
    }
    if (body.description !== undefined) updateData.description = body.description;
    if (body.price !== undefined) updateData.price = parseFloat(body.price);
    if (body.compareAtPrice !== undefined) updateData.compareAtPrice = body.compareAtPrice ? parseFloat(body.compareAtPrice) : null;
    if (body.costPrice !== undefined) updateData.costPrice = body.costPrice ? parseFloat(body.costPrice) : null;
    if (body.sku !== undefined) updateData.sku = body.sku;
    if (body.images !== undefined) {
      // Handle both URL strings and base64 data URIs
      const validImages = Array.isArray(body.images)
        ? body.images.filter((img: string) => img && img.trim().length > 0)
        : [];
      updateData.images = validImages.length > 0 ? JSON.stringify(validImages) : '[]';
    }
    if (resolvedCategoryId !== undefined) updateData.categoryId = resolvedCategoryId;
    if (body.stock !== undefined) {
      updateData.stock = parseInt(body.stock);
      // Also update stockStatus based on new stock level
      const reorderLevel = body.reorderLevel !== undefined ? parseInt(body.reorderLevel) : (existing.reorderLevel || 5);
      if (updateData.stock <= 0) updateData.stockStatus = 'out_of_stock';
      else if (updateData.stock <= reorderLevel) updateData.stockStatus = 'low_stock';
      else updateData.stockStatus = 'in_stock';
    }
    if (body.reorderLevel !== undefined) updateData.reorderLevel = parseInt(body.reorderLevel);
    if (body.featured !== undefined) updateData.featured = body.featured;
    if (body.tags !== undefined) updateData.tags = body.tags ? JSON.stringify(body.tags) : null;
    if (body.vendorId !== undefined) updateData.vendorId = body.vendorId || null;
    if (body.sourceUrl !== undefined) updateData.sourceUrl = body.sourceUrl || null;
    if (body.platform !== undefined) updateData.platform = body.platform || null;

    const product = await db.product.update({
      where: { id },
      data: updateData,
      include: { category: true, vendor: true },
    });

    const productResponse = {
      ...product,
      images: JSON.parse(product.images),
      tags: product.tags ? JSON.parse(product.tags) : null,
    };

    return NextResponse.json(productResponse);
  } catch (err: any) {
    console.error('[admin-products] PUT error:', err);
    const message = err?.message || 'Failed to update product';

    if (message.includes('Foreign key') || message.includes('FOREIGN KEY') || err?.code === 'P2003') {
      return NextResponse.json({ error: 'Invalid category selected.' }, { status: 400 });
    }
    if (message.includes('Unique constraint') || message.includes('UNIQUE') || err?.code === 'P2002') {
      return NextResponse.json({ error: 'A product with this name already exists.' }, { status: 409 });
    }

    return NextResponse.json({ error: `Failed to update product: ${message}` }, { status: 500 });
  }
}

// DELETE /api/admin/products/[id] - Delete product
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await ensureSeeded();

  const { id } = await params;

  try {
    const existing = await db.product.findUnique({
      where: { id },
      include: { cartItems: true, orderItems: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (existing.cartItems.length > 0 || existing.orderItems.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product with existing cart items or orders' },
        { status: 400 }
      );
    }

    await db.inventoryLog.deleteMany({ where: { productId: id } });
    await db.product.delete({ where: { id } });

    return NextResponse.json({ message: 'Product deleted successfully' });
  } catch (err: any) {
    console.error('[admin-products] DELETE error:', err);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
