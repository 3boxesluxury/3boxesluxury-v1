import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helper';
import { ensureSeeded } from '@/lib/auto-seed';

// GET /api/admin/products - List all products with category + vendor
export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  // Ensure database schema + seed data exists (critical on Vercel cold starts)
  await ensureSeeded();

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const search = searchParams.get('search') || '';
  const categoryId = searchParams.get('categoryId') || '';

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { productNumber: { contains: search } },
      { sku: { contains: search } },
    ];
  }
  if (categoryId) where.categoryId = categoryId;

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        category: true,
        vendor: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.product.count({ where }),
  ]);

  // Parse JSON string fields for frontend consumption
  const parsedProducts = products.map((p) => ({
    ...p,
    images: p.images ? JSON.parse(p.images) : [],
    tags: p.tags ? JSON.parse(p.tags) : [],
  }));

  return NextResponse.json({
    products: parsedProducts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

// POST /api/admin/products - Create product with auto-generated productNumber and slug
export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;

  // Ensure database schema + seed data exists (critical on Vercel cold starts)
  await ensureSeeded();

  try {
    const body = await request.json();
    const {
      name,
      description,
      price,
      compareAtPrice,
      costPrice,
      sku,
      images,
      categoryId,
      stock,
      reorderLevel,
      featured,
      tags,
      vendorId,
      sourceUrl,
      platform,
      occasions,
      recipientTypes,
      relationships,
      deliveryEstimate,
      isExternal,
      affiliateUrl,
      commission,
    } = body;

    if (!name || !description || !price || !categoryId) {
      return NextResponse.json(
        { error: 'Name, description, price, and categoryId are required' },
        { status: 400 }
      );
    }

    // Validate categoryId exists in the database
    const categoryExists = await db.category.findUnique({ where: { id: categoryId } });
    if (!categoryExists) {
      return NextResponse.json(
        { error: 'Invalid category selected. Please refresh and try again.' },
        { status: 400 }
      );
    }

    // Auto-generate productNumber: PRD-XXXXX
    const lastProduct = await db.product.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { productNumber: true },
    });
    let nextNum = 10001;
    if (lastProduct?.productNumber) {
      const lastNum = parseInt(lastProduct.productNumber.replace('PRD-', ''));
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    const productNumber = `PRD-${nextNum}`;

    // Auto-generate slug from name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let slug = baseSlug;
    let slugCounter = 1;
    while (await db.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${slugCounter}`;
      slugCounter++;
    }

    // Calculate stockStatus based on stock level
    const stockNum = stock ? parseInt(String(stock)) : 0;
    const reorderNum = reorderLevel ? parseInt(String(reorderLevel)) : 5;
    let stockStatus = 'in_stock';
    if (stockNum <= 0) stockStatus = 'out_of_stock';
    else if (stockNum <= reorderNum) stockStatus = 'low_stock';

    const product = await db.product.create({
      data: {
        productNumber,
        name,
        slug,
        description,
        price: parseFloat(String(price)) || 0,
        compareAtPrice: compareAtPrice ? parseFloat(String(compareAtPrice)) : null,
        costPrice: costPrice ? parseFloat(String(costPrice)) : null,
        sku: sku || null,
        images: (Array.isArray(images) && images.length > 0) ? JSON.stringify(images) : '[]',
        categoryId,
        stock: stockNum,
        stockStatus,
        reorderLevel: reorderNum,
        featured: featured || false,
        tags: tags ? JSON.stringify(tags) : null,
        vendorId: vendorId || null,
        sourceUrl: sourceUrl || null,
        platform: platform || null,
        // Gift-centric filter fields
        occasions: occasions ? JSON.stringify(occasions) : null,
        recipientTypes: recipientTypes ? JSON.stringify(recipientTypes) : null,
        relationships: relationships ? JSON.stringify(relationships) : null,
        deliveryEstimate: deliveryEstimate || null,
        // Platform/affiliate fields
        isExternal: isExternal || false,
        affiliateUrl: affiliateUrl || null,
        commission: commission ? parseFloat(commission) : null,
      },
      include: {
        category: true,
        vendor: true,
      },
    });

    // Parse images back for response
    const productResponse = {
      ...product,
      images: JSON.parse(product.images),
      tags: product.tags ? JSON.parse(product.tags) : null,
    };

    return NextResponse.json(productResponse, { status: 201 });
  } catch (err: any) {
    console.error('Error creating product:', err);
    const message = err?.message || 'Failed to create product';
    // Provide more specific error messages for common issues
    if (message.includes('Unique constraint') || message.includes('unique') || message.includes('UNIQUE')) {
      return NextResponse.json({ error: 'A product with this name or slug already exists' }, { status: 409 });
    }
    if (message.includes('Foreign key') || message.includes('categoryId') || message.includes('FOREIGN KEY')) {
      return NextResponse.json({ error: 'Invalid category selected. Please refresh the page and try again.' }, { status: 400 });
    }
    if (message.includes('NOT NULL') || message.includes('not null')) {
      return NextResponse.json({ error: `Missing required field: ${message}` }, { status: 400 });
    }
    if (message.includes('no such table') || message.includes('does not exist')) {
      return NextResponse.json({ error: 'Database not initialized. Please refresh the page and try again.' }, { status: 503 });
    }
    return NextResponse.json({ error: `Failed to create product: ${message}` }, { status: 500 });
  }
}
