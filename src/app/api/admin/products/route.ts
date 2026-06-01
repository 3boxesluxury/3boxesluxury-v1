import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helper';
import { ensureSeeded } from '@/lib/auto-seed';

// GET /api/admin/products - List all products with category + vendor
export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  // Ensure database is initialized on Vercel cold starts
  await ensureSeeded();

  try {
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
  } catch (err: any) {
    console.error('[admin-products] GET error:', err?.message);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

// POST /api/admin/products - Create product with auto-generated productNumber and slug
export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;

  // CRITICAL: Ensure database is initialized on Vercel cold starts
  try {
    await ensureSeeded();
  } catch (seedErr: any) {
    console.error('[admin-products] Seed failed:', seedErr?.message);
  }

  try {
    const body = await request.json();
    console.log('[admin-products] POST body keys:', Object.keys(body));
    console.log('[admin-products] categoryId received:', body.categoryId);

    const {
      name,
      description,
      price,
      compareAtPrice,
      costPrice,
      sku,
      images,
      categoryId,
      categoryName, // NEW: sent from admin form as fallback
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

    // Validate required fields
    if (!name || !description || price === undefined || price === null || price === '' || !categoryId) {
      console.error('[admin-products] Missing required fields:', { name: !!name, description: !!description, price, categoryId });
      return NextResponse.json(
        { error: 'Name, description, price, and categoryId are required' },
        { status: 400 }
      );
    }

    // ════════════════════════════════════════════════════════════════
    // CATEGORY RESOLUTION - Multi-strategy for Vercel Serverless
    // ════════════════════════════════════════════════════════════════
    // On Vercel, every serverless function call gets a fresh /tmp with
    // re-seeded database. Category UUIDs change between calls.
    // The admin form now sends category SLUG as categoryId.
    // We try multiple strategies to find the category.
    // ════════════════════════════════════════════════════════════════

    let resolvedCategoryId: string | null = null;
    let category: any = null;

    // Strategy 1: Try direct UUID lookup (for backward compatibility with edit mode)
    if (categoryId.includes('-') && categoryId.length > 20) {
      console.log('[admin-products] Strategy 1: Trying UUID lookup:', categoryId);
      try {
        category = await db.category.findUnique({ where: { id: categoryId } });
        if (category) {
          resolvedCategoryId = category.id;
          console.log('[admin-products] Found by UUID:', category.name);
        }
      } catch (e) {
        // UUID lookup failed, continue to next strategy
      }
    }

    // Strategy 2: Try slug lookup (PRIMARY strategy - admin form now sends slug)
    if (!category) {
      console.log('[admin-products] Strategy 2: Trying slug lookup:', categoryId);
      try {
        category = await db.category.findFirst({ where: { slug: categoryId } });
        if (category) {
          resolvedCategoryId = category.id;
          console.log('[admin-products] Found by slug:', category.name);
        }
      } catch (e) {
        // Slug lookup failed
      }
    }

    // Strategy 3: Try Shopify GID lookup
    if (!category && categoryId.startsWith('gid://shopify/')) {
      console.log('[admin-products] Strategy 3: Trying Shopify GID lookup:', categoryId);
      try {
        category = await db.category.findFirst({ where: { shopifyId: categoryId } });
        if (category) {
          resolvedCategoryId = category.id;
          console.log('[admin-products] Found by Shopify GID:', category.name);
        }
      } catch (e) {
        // Shopify lookup failed
      }
    }

    // Strategy 4: Try name lookup (using categoryName from form, or categoryId as name)
    if (!category) {
      const nameToTry = categoryName || categoryId;
      console.log('[admin-products] Strategy 4: Trying name lookup:', nameToTry);
      try {
        // Exact name match
        category = await db.category.findFirst({
          where: { name: { equals: nameToTry, mode: 'insensitive' } }
        });
        if (!category && categoryName) {
          // Also try the raw categoryId as name
          category = await db.category.findFirst({
            where: { name: { equals: categoryId, mode: 'insensitive' } }
          });
        }
        if (category) {
          resolvedCategoryId = category.id;
          console.log('[admin-products] Found by name:', category.name);
        }
      } catch (e) {
        // Name lookup failed
      }
    }

    // Strategy 5: Slug-like conversion of categoryId
    if (!category) {
      const slugToTry = categoryId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      console.log('[admin-products] Strategy 5: Trying slug-like conversion:', slugToTry);
      try {
        // Exact slug match
        category = await db.category.findFirst({ where: { slug: slugToTry } });
        if (!category) {
          // Partial slug match
          category = await db.category.findFirst({
            where: { slug: { contains: slugToTry } }
          });
        }
        if (category) {
          resolvedCategoryId = category.id;
          console.log('[admin-products] Found by slug conversion:', category.name);
        }
      } catch (e) {
        // Slug conversion lookup failed
      }
    }

    // If still not found, get all categories for debug info
    if (!category) {
      const allCategories = await db.category.findMany({ select: { id: true, name: true, slug: true } });
      console.error('[admin-products] ALL strategies FAILED. Requested:', categoryId);
      console.error('[admin-products] Available categories:', JSON.stringify(allCategories));
      return NextResponse.json(
        {
          error: 'Category not found. Please REFRESH the admin page and try again.',
          debug: {
            requestedId: categoryId,
            requestedName: categoryName || null,
            availableCategories: allCategories.map(c => ({ id: c.id, name: c.name, slug: c.slug }))
          }
        },
        { status: 400 }
      );
    }

    console.log('[admin-products] Category resolved:', resolvedCategoryId, '(' + category.name + ')');

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

    // Process images - handle both URL strings and base64 data URIs
    let imagesJSON: string = '[]';
    if (Array.isArray(images) && images.length > 0) {
      const validImages = images.filter((img: string) => img && img.trim().length > 0);
      if (validImages.length > 0) {
        imagesJSON = JSON.stringify(validImages);
      }
    }

    // Calculate stockStatus based on stock level
    const stockNum = stock ? parseInt(String(stock)) : 0;
    const reorderNum = reorderLevel ? parseInt(String(reorderLevel)) : 5;
    let stockStatus = 'in_stock';
    if (stockNum <= 0) stockStatus = 'out_of_stock';
    else if (stockNum <= reorderNum) stockStatus = 'low_stock';

    console.log('[admin-products] Creating product:', { productNumber, slug, name, categoryId: resolvedCategoryId, stockStatus });

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
        images: imagesJSON,
        categoryId: resolvedCategoryId,
        stock: stockNum,
        stockStatus,
        reorderLevel: reorderNum,
        featured: featured || false,
        tags: tags ? JSON.stringify(tags) : null,
        vendorId: vendorId || null,
        sourceUrl: sourceUrl || null,
        platform: platform || null,
        occasions: occasions ? JSON.stringify(occasions) : null,
        recipientTypes: recipientTypes ? JSON.stringify(recipientTypes) : null,
        relationships: relationships ? JSON.stringify(relationships) : null,
        deliveryEstimate: deliveryEstimate || null,
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

    console.log('[admin-products] Product created successfully:', product.id);
    return NextResponse.json(productResponse, { status: 201 });
  } catch (err: any) {
    console.error('[admin-products] Error creating product:', err);
    console.error('[admin-products] Error code:', err?.code);
    console.error('[admin-products] Error meta:', JSON.stringify(err?.meta));

    const message = err?.message || 'Unknown error';

    if (message.includes('Unique constraint') || message.includes('unique') || message.includes('UNIQUE') || err?.code === 'P2002') {
      return NextResponse.json({ error: 'A product with this name or slug already exists. Try a different name.' }, { status: 409 });
    }
    if (message.includes('Foreign key') || message.includes('FOREIGN KEY') || err?.code === 'P2003') {
      return NextResponse.json({ error: 'Invalid category — it does not exist in the database. Please refresh and try again.' }, { status: 400 });
    }
    if (message.includes('NOT NULL') || message.includes('not null') || err?.code === 'P2011') {
      return NextResponse.json({ error: `Missing required field: ${message}` }, { status: 400 });
    }
    if (message.includes('no such table') || message.includes('does not exist') || err?.code === 'P2021') {
      return NextResponse.json({ error: 'Database not initialized. Please refresh the page and try again.' }, { status: 503 });
    }

    return NextResponse.json({ error: `Failed to create product: ${message}` }, { status: 500 });
  }
}
