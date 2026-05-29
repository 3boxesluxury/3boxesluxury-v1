import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureSeeded } from '@/lib/auto-seed'
import {
  isShopifyConfigured,
  getShopifyProducts,
  searchShopifyProducts,
  shopifyProductToAppProduct,
  getShopifyCollections,
} from '@/lib/shopify/client'

// ─── In-Memory Cache for Shopify Data ───
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const shopifyCache = new Map<string, CacheEntry<unknown>>()
const CACHE_TTL = 60 * 1000 // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = shopifyCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    shopifyCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  shopifyCache.set(key, { data, timestamp: Date.now() })
  if (shopifyCache.size > 50) {
    const oldest = [...shopifyCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 10 && i < oldest.length; i++) {
      shopifyCache.delete(oldest[i][0)
    }
  }
}

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
 * Fetch ALL local DB products (auto-seeded + admin-added).
 * This is the PRIMARY source — always called, always included.
 */
async function getLocalProducts(searchParams: URLSearchParams) {
  const category = searchParams.get('category')
  const search = searchParams.get('search')
  const minPrice = searchParams.get('minPrice')
  const maxPrice = searchParams.get('maxPrice')
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const platform = searchParams.get('platform')
  const source = searchParams.get('source')
  const isExternalParam = searchParams.get('isExternal')
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

  // Price range
  const effectiveMinPrice = priceMin || minPrice
  const effectiveMaxPrice = priceMax || maxPrice
  if (effectiveMinPrice || effectiveMaxPrice) {
    where.price = {}
    if (effectiveMinPrice) (where.price as Record<string, unknown>).gte = parseFloat(effectiveMinPrice)
    if (effectiveMaxPrice) (where.price as Record<string, unknown>).lte = parseFloat(effectiveMaxPrice)
  }

  if (platform) {
    where.platform = platform
  }

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

  if (isExternalParam === 'true') {
    where.isExternal = true
  } else if (isExternalParam === 'false') {
    where.isExternal = false
  }

  if (occasion) {
    where.occasions = { contains: occasion }
  }
  if (recipient) {
    where.recipientTypes = { contains: recipient }
  }
  if (relationship) {
    where.relationships = { contains: relationship }
  }

  // Build orderBy
  let orderBy: Record<string, unknown> | Array<Record<string, unknown>> = { createdAt: 'desc' }
  switch (sort) {
    case 'price-asc': orderBy = { price: 'asc' }; break
    case 'price-desc': orderBy = { price: 'desc' }; break
    case 'rating': orderBy = { rating: 'desc' }; break
    case 'featured': orderBy = [{ featured: 'desc' }, { createdAt: 'desc' }]; break
    default: orderBy = { createdAt: 'desc' }; break
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
    platform: p.platform,
    isExternal: p.isExternal,
    sourceUrl: p.sourceUrl,
    affiliateUrl: p.affiliateUrl,
    platformLogo: p.platform ? (PLATFORM_LOGO_MAP[p.platform] || null) : null,
    commission: p.commission,
    syncStatus: p.syncStatus,
    shopifyId: p.shopifyId || null,
    shopifyVariantId: p.shopifyVariantId || null,
    source: p.source || 'local',
    createdAt: p.createdAt,
  }))

  return { products: transformedProducts, total, page, totalPages: Math.ceil(total / limit) }
}

/**
 * Fetch Shopify products and convert to the same format as local DB products.
 * Used as a SUPPLEMENT to local DB, never as a replacement.
 */
async function getShopifyProductsList(searchParams: URLSearchParams) {
  const search = searchParams.get('search')
  const category = searchParams.get('category')

  const cacheKeyProducts = search ? `shopify-products-search:${search}` : 'shopify-products-all'
  const cacheKeyCollections = 'shopify-collections-all'

  const [shopifyProductsResult, collectionsResult] = await Promise.all([
    (async () => {
      const cached = getCached<typeof shopifyProducts>(cacheKeyProducts)
      if (cached) return cached
      let result
      if (search) {
        result = await searchShopifyProducts(search, 250)
      } else {
        const r = await getShopifyProducts(250)
        result = r.products
      }
      setCache(cacheKeyProducts, result)
      return result
    })(),
    (async () => {
      try {
        const cached = getCached<Awaited<ReturnType<typeof getShopifyCollections>>>(cacheKeyCollections)
        if (cached) return cached
        const collections = await getShopifyCollections()
        setCache(cacheKeyCollections, collections)
        return collections
      } catch {
        return null
      }
    })(),
  ])

  const shopifyProducts = shopifyProductsResult

  // Convert to app format
  const appProducts = shopifyProducts.map((sp) => shopifyProductToAppProduct(sp))

  // Build slug → name map from Shopify collections
  const slugToNameMap = new Map<string, string>()
  if (collectionsResult) {
    for (const col of collectionsResult) {
      slugToNameMap.set(col.handle.toLowerCase(), col.title.toLowerCase())
    }
  }

  // Filter by category if specified
  let filtered = appProducts
  if (category) {
    const categoryLower = category.toLowerCase()
    const resolvedName = slugToNameMap.get(categoryLower)
    
    filtered = filtered.filter((p) => {
      const pCategory = p.category?.toLowerCase()
      if (!pCategory) return false
      return pCategory === categoryLower 
        || pCategory.replace(/[^a-z0-9]+/g, '-') === categoryLower
        || (resolvedName && pCategory === resolvedName)
        || pCategory.includes(categoryLower.replace(/-/g, ' '))
        || categoryLower.includes(pCategory.replace(/[^a-z0-9]+/g, ' '))
    })
  }

  // Try to enrich with local DB data
  const localProductsMap = new Map<string, {
    images: string | null; occasions: string | null; recipientTypes: string | null;
    relationships: string | null; deliveryEstimate: string | null; platform: string | null;
    isExternal: boolean | null; sourceUrl: string | null; affiliateUrl: string | null;
    commission: number | null; syncStatus: string | null; stock: number | null;
    rating: number | null; reviewCount: number | null; featured: boolean | null;
  }>()

  try {
    const localProducts = await db.product.findMany({
      where: { shopifyId: { not: null } },
      select: {
        shopifyId: true, images: true, occasions: true, recipientTypes: true,
        relationships: true, deliveryEstimate: true, platform: true,
        isExternal: true, sourceUrl: true, affiliateUrl: true,
        commission: true, syncStatus: true, stock: true,
        rating: true, reviewCount: true, featured: true,
      },
    })
    for (const lp of localProducts) {
      if (lp.shopifyId) {
        localProductsMap.set(lp.shopifyId, {
          images: lp.images, occasions: lp.occasions, recipientTypes: lp.recipientTypes,
          relationships: lp.relationships, deliveryEstimate: lp.deliveryEstimate,
          platform: lp.platform, isExternal: lp.isExternal, sourceUrl: lp.sourceUrl,
          affiliateUrl: lp.affiliateUrl, commission: lp.commission, syncStatus: lp.syncStatus,
          stock: lp.stock, rating: lp.rating, reviewCount: lp.reviewCount, featured: lp.featured,
        })
      }
    }
  } catch {
    // Local DB enrichment is optional
  }

  // Build category name → slug map
  const categorySlugMap = new Map<string, string>()
  if (collectionsResult) {
    for (const col of collectionsResult) {
      categorySlugMap.set(col.title.toLowerCase(), col.handle)
    }
  }

  // Map to output format (same as local DB products)
  return filtered.map((sp) => {
    const localMatch = localProductsMap.get(sp.id) || null
    const localImages = localMatch?.images ? JSON.parse(localMatch.images) as string[] : []
    const productImages = sp.images.length > 0 ? sp.images : localImages
    const finalImages = productImages.length > 0 ? productImages
      : sp.featuredImage ? [sp.featuredImage] : []

    return {
      id: sp.id,
      name: sp.name,
      slug: sp.slug,
      description: sp.description,
      price: sp.price,
      compareAtPrice: sp.compareAtPrice ?? null,
      images: finalImages,
      category: sp.category || 'Uncategorized',
      categorySlug: categorySlugMap.get(sp.category?.toLowerCase() || '') || sp.slug,
      stock: localMatch?.stock ?? (sp.inStock ? 10 : 0),
      rating: localMatch?.rating ?? 0,
      reviewCount: localMatch?.reviewCount ?? 0,
      featured: localMatch?.featured ?? false,
      tags: sp.tags,
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
      shopifyId: sp.id,
      shopifyVariantId: sp.shopifyVariantId || null,
      source: 'shopify' as const,
      createdAt: sp.createdAt || null,
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    // Auto-seed on Vercel if database is empty
    await ensureSeeded()

    const { searchParams } = new URL(request.url)
    const sourceParam = searchParams.get('source')

    // ─────────────────────────────────────────────────────────
    // KEY FIX: Always get local DB products FIRST.
    // Local DB (auto-seeded) is the PRIMARY source.
    // Shopify is a SUPPLEMENT, never a replacement.
    // ─────────────────────────────────────────────────────────

    let localResult
    try {
      localResult = await getLocalProducts(searchParams)
    } catch (error: any) {
      console.error('[products] Local DB error:', error.message)
      localResult = { products: [], total: 0, page: 1, totalPages: 0 }
    }

    // If source=local is explicitly requested, return local only
    if (sourceParam === 'local') {
      return NextResponse.json(localResult, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
      })
    }

    // If source=shopify is explicitly requested, try Shopify only
    if (sourceParam === 'shopify') {
      if (isShopifyConfigured()) {
        try {
          const shopifyProducts = await getShopifyProductsList(searchParams)
          return NextResponse.json({
            products: shopifyProducts,
            total: shopifyProducts.length,
            page: 1,
            totalPages: Math.ceil(shopifyProducts.length / 12),
          }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
        } catch (error) {
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

    // Default behavior: merge local DB + Shopify products
    // Local DB products are ALWAYS included (auto-seeded products show up!)
    let shopifyProducts: any[] = []
    if (isShopifyConfigured()) {
      try {
        shopifyProducts = await getShopifyProductsList(searchParams)
      } catch (error) {
        console.error('[products] Shopify fetch failed (non-critical):', error instanceof Error ? error.message : 'Unknown error')
        // Continue with local-only results
      }
    }

    // Merge: local products first, then Shopify products that aren't duplicates
    const localSlugs = new Set(localResult.products.map((p: any) => p.slug))
    const newShopifyProducts = shopifyProducts.filter((p: any) => !localSlugs.has(p.slug))
    const allProducts = [...localResult.products, ...newShopifyProducts]

    // Apply sort to merged list
    const sort = searchParams.get('sort') || 'newest'
    switch (sort) {
      case 'price-asc':
        allProducts.sort((a: any, b: any) => a.price - b.price)
        break
      case 'price-desc':
        allProducts.sort((a: any, b: any) => b.price - a.price)
        break
      case 'rating':
        allProducts.sort((a: any, b: any) => b.rating - a.rating)
        break
      case 'newest':
      default:
        allProducts.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        break
    }

    // Paginate
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '12', 10)
    const total = allProducts.length
    const skip = (page - 1) * limit
    const paginated = allProducts.slice(skip, skip + limit)

    return NextResponse.json({
      products: paginated,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}
