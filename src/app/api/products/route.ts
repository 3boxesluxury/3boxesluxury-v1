import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  isShopifyConfigured,
  getShopifyProducts,
  searchShopifyProducts,
  shopifyProductToAppProduct,
  getShopifyCollections,
} from '@/lib/shopify/client'

// Platform slug to logo URL mapping
const PLATFORM_LOGO_MAP: Record<string, string> = {
  myntra: '/logos/myntra.png',
  nykaa: '/logos/nykaa.png',
  amazon: '/logos/amazon.png',
  flipkart: '/logos/flipkart.png',
  caratlane: '/logos/caratlane.png',
  tanishq: '/logos/tanishq.png',
  bluestone: '/logos/bluestone.png',
  voylla: '/logos/voylla.png',
}

/**
 * Map a Shopify product (already converted via shopifyProductToAppProduct)
 * to the same format the frontend expects from the local DB query.
 * Also merges with local DB data when available.
 */
function mapShopifyToProductRow(
  shopifyProd: ReturnType<typeof shopifyProductToAppProduct>,
  localMatch: {
    images?: string | null;
    occasions?: string | null;
    recipientTypes?: string | null;
    relationships?: string | null;
    deliveryEstimate?: string | null;
    platform?: string | null;
    isExternal?: boolean | null;
    sourceUrl?: string | null;
    affiliateUrl?: string | null;
    commission?: number | null;
    syncStatus?: string | null;
    stock?: number | null;
    rating?: number | null;
    reviewCount?: number | null;
    featured?: boolean | null;
  } | null,
  categorySlugMap: Map<string, string>
) {
  // Use local DB images when Shopify product has no images (common when images weren't uploaded)
  const localImages = localMatch?.images ? JSON.parse(localMatch.images) as string[] : []
  const productImages = shopifyProd.images.length > 0 ? shopifyProd.images : localImages

  // If still no images, try the featuredImage as a last resort
  const finalImages = productImages.length > 0 ? productImages
    : shopifyProd.featuredImage ? [shopifyProd.featuredImage]
    : []

  return {
    id: shopifyProd.id,
    name: shopifyProd.name,
    slug: shopifyProd.slug,
    description: shopifyProd.description,
    price: shopifyProd.price,
    compareAtPrice: shopifyProd.compareAtPrice ?? null,
    images: finalImages,
    category: shopifyProd.category || 'Uncategorized',
    categorySlug: categorySlugMap.get(shopifyProd.category?.toLowerCase() || '') || shopifyProd.slug,
    stock: localMatch?.stock ?? (shopifyProd.inStock ? 10 : 0),
    rating: localMatch?.rating ?? 0,
    reviewCount: localMatch?.reviewCount ?? 0,
    featured: localMatch?.featured ?? false,
    tags: shopifyProd.tags,
    occasions: localMatch ? JSON.parse(localMatch.occasions || '[]') : [],
    recipientTypes: localMatch ? JSON.parse(localMatch.recipientTypes || '[]') : [],
    relationships: localMatch ? JSON.parse(localMatch.relationships || '[]') : [],
    deliveryEstimate: localMatch?.deliveryEstimate || null,
    platform: localMatch?.platform || null,
    isExternal: localMatch?.isExternal || false,
    sourceUrl: localMatch?.sourceUrl || null,
    affiliateUrl: localMatch?.affiliateUrl || null,
    platformLogo: null,
    commission: localMatch?.commission || null,
    syncStatus: localMatch?.syncStatus || null,
    shopifyId: shopifyProd.id,
    shopifyVariantId: shopifyProd.shopifyVariantId || null,
    source: 'shopify' as const,
    createdAt: shopifyProd.createdAt || null,
  }
}

/**
 * Handle Shopify-sourced product fetching
 */
async function handleShopifySource(searchParams: URLSearchParams) {
  const search = searchParams.get('search')
  const category = searchParams.get('category')
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '12', 10)

  // Fetch products from Shopify
  let shopifyProducts
  if (search) {
    shopifyProducts = await searchShopifyProducts(search, 250)
  } else {
    const result = await getShopifyProducts(250)
    shopifyProducts = result.products
  }

  // Convert to app format
  const appProducts = shopifyProducts.map((sp) => shopifyProductToAppProduct(sp))

  // Filter by category (productType) if specified
  let filtered = appProducts
  if (category) {
    filtered = filtered.filter(
      (p) => p.category?.toLowerCase() === category.toLowerCase()
    )
  }

  // Build a category-name → slug map from Shopify collections
  const categorySlugMap = new Map<string, string>()
  try {
    const collections = await getShopifyCollections()
    for (const col of collections) {
      categorySlugMap.set(col.title.toLowerCase(), col.handle)
    }
  } catch {
    // Collections fetch is optional; continue without it
  }

  // Try to merge with local DB data for enrichment
  const localProductsMap = new Map<string, {
    images: string | null;
    occasions: string | null;
    recipientTypes: string | null;
    relationships: string | null;
    deliveryEstimate: string | null;
    platform: string | null;
    isExternal: boolean | null;
    sourceUrl: string | null;
    affiliateUrl: string | null;
    commission: number | null;
    syncStatus: string | null;
    stock: number | null;
    rating: number | null;
    reviewCount: number | null;
    featured: boolean | null;
  }>()

  try {
    const localProducts = await db.product.findMany({
      where: {
        shopifyId: { not: null },
      },
      select: {
        shopifyId: true,
        images: true,
        occasions: true,
        recipientTypes: true,
        relationships: true,
        deliveryEstimate: true,
        platform: true,
        isExternal: true,
        sourceUrl: true,
        affiliateUrl: true,
        commission: true,
        syncStatus: true,
        stock: true,
        rating: true,
        reviewCount: true,
        featured: true,
      },
    })
    for (const lp of localProducts) {
      if (lp.shopifyId) {
        localProductsMap.set(lp.shopifyId, {
          images: lp.images,
          occasions: lp.occasions,
          recipientTypes: lp.recipientTypes,
          relationships: lp.relationships,
          deliveryEstimate: lp.deliveryEstimate,
          platform: lp.platform,
          isExternal: lp.isExternal,
          sourceUrl: lp.sourceUrl,
          affiliateUrl: lp.affiliateUrl,
          commission: lp.commission,
          syncStatus: lp.syncStatus,
          stock: lp.stock,
          rating: lp.rating,
          reviewCount: lp.reviewCount,
          featured: lp.featured,
        })
      }
    }
  } catch {
    // Local DB enrichment is optional
  }

  // Also fetch local-only products (added via admin, no shopifyId) so they appear alongside Shopify products
  const localOnlyProducts: Array<any> = []
  try {
    const localOnlyWhere: Record<string, unknown> = {
      shopifyId: null,
      isExternal: false,
    }
    // Filter by category slug if specified
    if (category) {
      localOnlyWhere.category = { slug: category }
    }
    const localOnly = await db.product.findMany({
      where: localOnlyWhere,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
    for (const lp of localOnly) {
      localOnlyProducts.push({
        id: lp.id,
        name: lp.name,
        slug: lp.slug,
        description: lp.description,
        price: lp.price,
        compareAtPrice: lp.compareAtPrice,
        images: JSON.parse(lp.images || '[]') as string[],
        category: lp.category.name,
        categorySlug: lp.category.slug,
        stock: lp.stock,
        rating: lp.rating,
        reviewCount: lp.reviewCount,
        featured: lp.featured,
        tags: JSON.parse(lp.tags || '[]') as string[],
        occasions: JSON.parse(lp.occasions || '[]') as string[],
        recipientTypes: JSON.parse(lp.recipientTypes || '[]') as string[],
        relationships: JSON.parse(lp.relationships || '[]') as string[],
        deliveryEstimate: lp.deliveryEstimate || null,
        platform: lp.platform,
        isExternal: lp.isExternal,
        sourceUrl: lp.sourceUrl,
        affiliateUrl: lp.affiliateUrl,
        platformLogo: null,
        commission: lp.commission,
        syncStatus: lp.syncStatus,
        shopifyId: null,
        shopifyVariantId: null,
        source: 'local' as const,
        createdAt: lp.createdAt,
      })
    }
  } catch {
    // Local-only products fetch is optional
  }

  // Map to output format
  const mapped = filtered.map((sp) =>
    mapShopifyToProductRow(sp, localProductsMap.get(sp.id) || null, categorySlugMap)
  )

  // Merge local-only products (added via admin) with Shopify products
  const allProducts = [...localOnlyProducts, ...mapped]

  // Apply sort
  switch (sort) {
    case 'price-asc':
      allProducts.sort((a, b) => a.price - b.price)
      break
    case 'price-desc':
      allProducts.sort((a, b) => b.price - a.price)
      break
    case 'rating':
      allProducts.sort((a, b) => b.rating - a.rating)
      break
    case 'newest':
    default:
      allProducts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      break
  }

  // Paginate
  const total = allProducts.length
  const skip = (page - 1) * limit
  const paginated = allProducts.slice(skip, skip + limit)

  return NextResponse.json({
    products: paginated,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}

/**
 * Handle local DB sourced product fetching (original behavior, preserved)
 */
async function handleLocalSource(searchParams: URLSearchParams) {
  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '12', 10)

  // New filters for platform aggregation
  const platform = searchParams.get('platform')
  const source = searchParams.get('source') // 'own' or 'external'
  const isExternalParam = searchParams.get('isExternal') // 'true', 'false', or 'all'

  // Gift-centric filters
  const occasion = searchParams.get('occasion')
  const recipient = searchParams.get('recipient')
  const relationship = searchParams.get('relationship')
  const priceMin = searchParams.get('priceMin')
  const priceMax = searchParams.get('priceMax')

  const skip = (page - 1) * limit

  // Build where clause
  const where: Record<string, unknown> = {}

  if (category) {
    where.category = { slug: category }
  }

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ]
  }

  // Price range (legacy + new params)
  const effectiveMinPrice = priceMin || minPrice
  const effectiveMaxPrice = priceMax || maxPrice
  if (effectiveMinPrice || effectiveMaxPrice) {
    where.price = {}
    if (effectiveMinPrice) (where.price as Record<string, unknown>).gte = parseFloat(effectiveMinPrice)
    if (effectiveMaxPrice) (where.price as Record<string, unknown>).lte = parseFloat(effectiveMaxPrice)
  }

  // Platform filter: filter by platform slug
  if (platform) {
    where.platform = platform
  }

  // Source filter: 'own' = isExternal false + source not shopify, 'external' = isExternal true, 'shopify' = source shopify
  if (source === 'own') {
    where.OR = [
      { isExternal: false, source: null },
      { isExternal: false, source: { not: 'shopify' } },
    ]
  } else if (source === 'external') {
    where.isExternal = true
  } else if (source === 'shopify') {
    where.source = 'shopify'
  }

  // isExternal filter: explicit true/false/all
  if (isExternalParam === 'true') {
    where.isExternal = true
  } else if (isExternalParam === 'false') {
    where.isExternal = false
  }
  // 'all' or undefined = no filter (show both)

  // Occasion filter: products whose occasions JSON array contains the value
  if (occasion) {
    where.occasions = { contains: occasion }
  }

  // Recipient filter: products whose recipientTypes JSON array contains the value
  if (recipient) {
    where.recipientTypes = { contains: recipient }
  }

  // Relationship filter: products whose relationships JSON array contains the value
  if (relationship) {
    where.relationships = { contains: relationship }
  }

  // Build orderBy
  let orderBy: Record<string, unknown> | Array<Record<string, unknown>> = { createdAt: 'desc' }
  switch (sort) {
    case 'price-asc':
      orderBy = { price: 'asc' }
      break
    case 'price-desc':
      orderBy = { price: 'desc' }
      break
    case 'rating':
      orderBy = { rating: 'desc' }
      break
    case 'featured':
      orderBy = [{ featured: 'desc' }, { createdAt: 'desc' }]
      break
    case 'newest':
    default:
      orderBy = { createdAt: 'desc' }
      break
  }

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { category: true },
      orderBy,
      skip,
      take: limit,
    }),
    db.product.count({ where }),
  ])

  // Transform products for frontend
  const transformedProducts = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    images: JSON.parse(p.images || '[]') as string[],
    category: p.category.name,
    categorySlug: p.category.slug,
    stock: p.stock,
    rating: p.rating,
    reviewCount: p.reviewCount,
    featured: p.featured,
    tags: JSON.parse(p.tags || '[]') as string[],
    occasions: JSON.parse(p.occasions || '[]') as string[],
    recipientTypes: JSON.parse(p.recipientTypes || '[]') as string[],
    relationships: JSON.parse(p.relationships || '[]') as string[],
    deliveryEstimate: p.deliveryEstimate || null,
    // Platform aggregation fields
    platform: p.platform,
    isExternal: p.isExternal,
    sourceUrl: p.sourceUrl,
    affiliateUrl: p.affiliateUrl,
    platformLogo: p.platform ? (PLATFORM_LOGO_MAP[p.platform] || null) : null,
    commission: p.commission,
    syncStatus: p.syncStatus,
    // Shopify integration fields
    shopifyId: p.shopifyId || null,
    shopifyVariantId: p.shopifyVariantId || null,
    source: p.source || 'local',
    createdAt: p.createdAt,
  }))

  return NextResponse.json({
    products: transformedProducts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceParam = searchParams.get('source') // 'shopify' or 'local'

    // If source=shopify is explicitly requested, try Shopify first
    if (sourceParam === 'shopify') {
      if (isShopifyConfigured()) {
        try {
          return await handleShopifySource(searchParams)
        } catch (error) {
          console.error('Shopify fetch failed, returning error:', error)
          return NextResponse.json(
            { error: 'Failed to fetch products from Shopify', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 502 }
          )
        }
      } else {
        return NextResponse.json(
          { error: 'Shopify is not configured. Set SHOPIFY_STOREFRONT_TOKEN environment variable.' },
          { status: 400 }
        )
      }
    }

    // If source=local is explicitly requested, use local DB
    if (sourceParam === 'local') {
      return await handleLocalSource(searchParams)
    }

    // Default behavior: when Shopify is configured, try Shopify first then fall back to local DB
    if (isShopifyConfigured()) {
      try {
        return await handleShopifySource(searchParams)
      } catch (error) {
        console.error('Shopify fetch failed, falling back to local DB:', error)
        // Fall through to local DB
      }
    }

    // Local DB fallback (or default when Shopify is not configured)
    return await handleLocalSource(searchParams)
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}
