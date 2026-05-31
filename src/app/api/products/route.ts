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
const CACHE_TTL = 60 * 1000 // 60 seconds — balance freshness vs. API calls

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
  // Evict old entries if cache grows too large
  if (shopifyCache.size > 50) {
    const oldest = [...shopifyCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 10 && i < oldest.length; i++) {
      shopifyCache.delete(oldest[i][0])
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

  // ─── Fetch Shopify products + collections IN PARALLEL with caching ───
  const cacheKeyProducts = search ? `shopify-products-search:${search}` : 'shopify-products-all'
  const cacheKeyCollections = 'shopify-collections-all'

  // Cached + parallel: Shopify products & collections at the same time
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

  // Build a category-name → slug map and slug → name map from Shopify collections
  const categorySlugMap = new Map<string, string>()
  const slugToNameMap = new Map<string, string>()
  if (collectionsResult) {
    for (const col of collectionsResult) {
      categorySlugMap.set(col.title.toLowerCase(), col.handle)
      slugToNameMap.set(col.handle.toLowerCase(), col.title.toLowerCase())
    }
  }

  // Filter by category if specified
  // Support both slug-based (e.g., "mens-shirts") and name-based (e.g., "Men's Shirts") matching
  let filtered = appProducts
  if (category) {
    const categoryLower = category.toLowerCase()
    // Try to resolve slug to collection name for matching
    const resolvedName = slugToNameMap.get(categoryLower)
    
    filtered = filtered.filter((p) => {
      const pCategory = p.category?.toLowerCase()
      if (!pCategory) return false
      // Match by exact category name, by slug, or by resolved collection name
      return pCategory === categoryLower 
        || pCategory.replace(/[^a-z0-9]+/g, '-') === categoryLower
        || (resolvedName && pCategory === resolvedName)
        || pCategory.includes(categoryLower.replace(/-/g, ' '))
        || categoryLower.includes(pCategory.replace(/[^a-z0-9]+/g, ' '))
    })
  }

  // Try to merge with local DB data for enrichment
  // Also fetch local-only products IN PARALLEL with Shopify enrichment data
  const cacheKeyLocalEnrichment = 'local-shopify-enrichment'
  const cacheKeyLocalOnly = category ? `local-only-products:${category}` : 'local-only-products-all'

  const [localProductsMapResult, localOnlyProductsResult] = await Promise.all([
    (async () => {
      const cached = getCached<Map<string, {
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
      }>>(cacheKeyLocalEnrichment)
      if (cached) return cached

      const map = new Map<string, {
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
            map.set(lp.shopifyId, {
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
        setCache(cacheKeyLocalEnrichment, map)
      } catch {
        // Local DB enrichment is optional
      }
      return map
    })(),
    (async () => {
      // Also fetch local-only products (added via admin, no shopifyId)
      const localOnlyProducts: Array<any> = []
      try {
        const localOnlyWhere: Record<string, unknown> = {
          shopifyId: null,
          isExternal: false,
        }
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
      return localOnlyProducts
    })(),
  ])

  const localProductsMap = localProductsMapResult
  const localOnlyProducts = localOnlyProductsResult

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
  }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}

/**
 * Handle local DB sourced product fetching (original behavior, preserved)
 * Returns empty results gracefully if DB tables don't exist yet.
 */
async function handleLocalSource(searchParams: URLSearchParams) {
  try {
    return await handleLocalSourceInner(searchParams)
  } catch (error: any) {
    console.error('[products] Local source error:', error.message)
    // Return empty results instead of crashing
    return NextResponse.json({
      products: [],
      total: 0,
      page: 1,
      totalPages: 0,
    })
  }
}

async function handleLocalSourceInner(searchParams: URLSearchParams) {
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

  // Don't cache empty responses — only cache when we have data
  const hasData = transformedProducts.length > 0
  const cacheHeaders = hasData
    ? { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
    : { 'Cache-Control': 'no-store' }

  return NextResponse.json({
    products: transformedProducts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }, { headers: cacheHeaders })
}

export async function GET(request: NextRequest) {
  try {
    // Auto-seed on Vercel if database is empty
    await ensureSeeded()

    const { searchParams } = new URL(request.url)
    const sourceParam = searchParams.get('source') // 'shopify' or 'local'

    // RETRY LOGIC: On Vercel cold starts, ensureSeeded() might finish but
    // another concurrent process might still be writing products to the DB.
    // If local DB returns 0 products on first try, wait and retry once.
    let retryCount = 0
    const maxRetries = 2

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

    // Default behavior: ALWAYS use local DB first to ensure auto-seeded products show up.
    // Shopify products are merged into the local results as an enrichment layer.
    // This fixes the critical bug where Shopify responses were consumed by .json()
    // and then returned as empty responses.
    //
    // Previous flow (BROKEN):
    //   1. Try Shopify → shopifyResult.json() CONSUMES the body → return shopifyResult (EMPTY!)
    //   2. Only fall to local DB if Shopify returned 0 products
    //
    // New flow (FIXED):
    //   1. Always fetch local DB products first (auto-seeded + admin-added)
    //   2. If Shopify is configured, ALSO fetch Shopify products and merge them in
    //   3. Return combined results

    // Step 1: Get local DB products (always works, even on Vercel cold start)
    //         Retry if empty — Vercel cold-start race condition fix
    let localResult = await handleLocalSource(searchParams)
    let localData = await localResult.clone().json()

    if (localData.products?.length === 0 && retryCount < maxRetries) {
      console.log('[products] Empty result after seed, retrying in 2s...')
      await new Promise(r => setTimeout(r, 2000))
      retryCount++
      localResult = await handleLocalSource(searchParams)
      localData = await localResult.clone().json()
    }

    // Step 2: If Shopify is configured, try to also fetch Shopify products and merge
    if (isShopifyConfigured()) {
      try {
        const shopifyResult = await handleShopifySource(searchParams)
        const shopifyClone = shopifyResult.clone()
        const shopifyData = await shopifyClone.json()

        if (shopifyData.products && shopifyData.products.length > 0) {
          // Merge: local products first, then Shopify products not already in local
          const localIds = new Set(localData.products.map((p: any) => p.id))
          const shopifyOnly = shopifyData.products.filter((p: any) => !localIds.has(p.id))
          const mergedProducts = [...localData.products, ...shopifyOnly]
          const mergedTotal = (localData.total || 0) + shopifyOnly.length
          const hasData = mergedProducts.length > 0
          const cacheHeaders = hasData
            ? { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
            : { 'Cache-Control': 'no-store' }

          return NextResponse.json({
            products: mergedProducts,
            total: mergedTotal,
            page: localData.page || 1,
            totalPages: Math.ceil(mergedTotal / 50),
          }, { headers: cacheHeaders })
        }
      } catch (error) {
        console.error('[products] Shopify merge failed, returning local DB only:', error)
        // Fall through - return local result as-is
      }
    }

    // Return local DB result (always available)
    // Don't cache empty responses — prevents CDN from caching "no products"
    const finalHasData = localData.products?.length > 0
    const finalCacheHeaders = finalHasData
      ? { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }
      : { 'Cache-Control': 'no-store' }

    return NextResponse.json(localData, { headers: finalCacheHeaders })
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json(
      { error: 'Failed to fetch products' },
      { status: 500 }
    )
  }
}
