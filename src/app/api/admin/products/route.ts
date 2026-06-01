import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helper';
import { ensureSeeded } from '@/lib/auto-seed';

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request);
  if (error) return error;
  await ensureSeeded();
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const where: Record<string, unknown> = {};
    if (search) { where.OR = [{ name: { contains: search } }, { productNumber: { contains: search } }, { sku: { contains: search } }]; }
    if (categoryId) where.categoryId = categoryId;
    const [products, total] = await Promise.all([db.product.findMany({ where, include: { category: true, vendor: true }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), db.product.count({ where })]);
    const parsedProducts = products.map((p) => ({ ...p, images: p.images ? JSON.parse(p.images) : [], tags: p.tags ? JSON.parse(p.tags) : [] }));
    return NextResponse.json({ products: parsedProducts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err: any) { console.error('[admin-products] GET error:', err?.message); return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const { error, user } = await requireAdmin(request);
  if (error) return error;
  try { await ensureSeeded(); } catch (seedErr: any) { console.error('[admin-products] Seed failed:', seedErr?.message); }
  try {
    const body = await request.json();
    console.log('[admin-products] categoryId received:', body.categoryId);
    const { name, description, price, compareAtPrice, costPrice, sku, images, categoryId, stock, reorderLevel, featured, tags, vendorId, sourceUrl, platform, occasions, recipientTypes, relationships, deliveryEstimate, isExternal, affiliateUrl, commission } = body;
    if (!name || !description || price === undefined || price === null || price === '' || !categoryId) {
      return NextResponse.json({ error: 'Name, description, price, and categoryId are required' }, { status: 400 });
    }
    let resolvedCategoryId: string | null = null;
    const directMatch = await db.category.findUnique({ where: { id: categoryId } });
    if (directMatch) { resolvedCategoryId = directMatch.id; console.log('[admin-products] Found by direct ID'); }
    if (!resolvedCategoryId && typeof categoryId === 'string' && categoryId.startsWith('gid://shopify/')) {
      const shopifyMatch = await db.category.findFirst({ where: { shopifyId: categoryId } });
      if (shopifyMatch) { resolvedCategoryId = shopifyMatch.id; console.log('[admin-products] Resolved Shopify GID'); }
    }
    if (!resolvedCategoryId && typeof categoryId === 'string') {
      const slugMatch = await db.category.findUnique({ where: { slug: categoryId } });
      if (slugMatch) { resolvedCategoryId = slugMatch.id; console.log('[admin-products] Resolved by slug'); }
    }
    if (!resolvedCategoryId) {
      const allCats = await db.category.findMany({ select: { id: true, name: true, slug: true } });
      console.log('[admin-products] Available cats:', allCats.map(c => c.name + '=' + c.id));
      for (const cat of allCats) {
        if (cat.name.toLowerCase() === categoryId.toLowerCase() || cat.slug.toLowerCase() === categoryId.toLowerCase()) {
          resolvedCategoryId = cat.id; console.log('[admin-products] Resolved by name/slug:', cat.name); break;
        }
      }
    }
    if (!resolvedCategoryId) {
      const allCats = await db.category.findMany({ select: { id: true, name: true, slug: true } });
      return NextResponse.json({ error: 'Category not found. Please REFRESH the admin page and try again.', availableCategories: allCats.map(c => ({ id: c.id, name: c.name })) }, { status: 400 });
    }
    const lastProduct = await db.product.findFirst({ orderBy: { createdAt: 'desc' }, select: { productNumber: true } });
    let nextNum = 10001;
    if (lastProduct?.productNumber) { const lastNum = parseInt(lastProduct.productNumber.replace('PRD-', '')); if (!isNaN(lastNum)) nextNum = lastNum + 1; }
    const productNumber = `PRD-${nextNum}`;
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug; let slugCounter = 1;
    while (await db.product.findUnique({ where: { slug } })) { slug = `${baseSlug}-${slugCounter}`; slugCounter++; }
    let imagesJSON: string = '[]';
    if (Array.isArray(images) && images.length > 0) { const validImages = images.filter((img: string) => img && img.trim().length > 0); if (validImages.length > 0) imagesJSON = JSON.stringify(validImages); }
    const stockNum = stock ? parseInt(String(stock)) : 0;
    const reorderNum = reorderLevel ? parseInt(String(reorderLevel)) : 5;
    let stockStatus = 'in_stock';
    if (stockNum <= 0) stockStatus = 'out_of_stock'; else if (stockNum <= reorderNum) stockStatus = 'low_stock';
    console.log('[admin-products] Creating:', { productNumber, slug, name, categoryId: resolvedCategoryId, stockStatus });
    const product = await db.product.create({
      data: { productNumber, name, slug, description, price: parseFloat(String(price)) || 0, compareAtPrice: compareAtPrice ? parseFloat(String(compareAtPrice)) : null, costPrice: costPrice ? parseFloat(String(costPrice)) : null, sku: sku || null, images: imagesJSON, categoryId: resolvedCategoryId, stock: stockNum, stockStatus, reorderLevel: reorderNum, featured: featured || false, tags: tags ? JSON.stringify(tags) : null, vendorId: vendorId || null, sourceUrl: sourceUrl || null, platform: platform || null, occasions: occasions ? JSON.stringify(occasions) : null, recipientTypes: recipientTypes ? JSON.stringify(recipientTypes) : null, relationships: relationships ? JSON.stringify(relationships) : null, deliveryEstimate: deliveryEstimate || null, isExternal: isExternal || false, affiliateUrl: affiliateUrl || null, commission: commission ? parseFloat(commission) : null },
      include: { category: true, vendor: true },
    });
    const productResponse = { ...product, images: JSON.parse(product.images), tags: product.tags ? JSON.parse(product.tags) : null };
    console.log('[admin-products] Product created:', product.id);
    return NextResponse.json(productResponse, { status: 201 });
  } catch (err: any) {
    console.error('[admin-products] Error:', err);
    const message = err?.message || 'Unknown error';
    if (message.includes('Unique constraint') || message.includes('unique') || message.includes('UNIQUE') || err?.code === 'P2002') return NextResponse.json({ error: 'A product with this name or slug already exists.' }, { status: 409 });
    if (message.includes('Foreign key') || message.includes('FOREIGN KEY') || err?.code === 'P2003') return NextResponse.json({ error: 'Invalid category. Please refresh and try again.' }, { status: 400 });
    if (message.includes('NOT NULL') || message.includes('not null') || err?.code === 'P2011') return NextResponse.json({ error: `Missing required field: ${message}` }, { status: 400 });
    if (message.includes('no such table') || message.includes('does not exist') || err?.code === 'P2021') return NextResponse.json({ error: 'Database not initialized. Please refresh.' }, { status: 503 });
    return NextResponse.json({ error: `Failed to create product: ${message}` }, { status: 500 });
  }
}