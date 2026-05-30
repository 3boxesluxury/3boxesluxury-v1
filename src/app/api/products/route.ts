import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  isShopifyConfigured,
  getShopifyProducts,
  searchShopifyProducts,
  shopifyProductToAppProduct,
  getShopifyCollections,
} from '@/lib/shopify/client'

// ─── In-Memory Cache ───
interface CacheEntry<T> { data: T; timestamp: number }
const shopifyCache = new Map<string, CacheEntry<unknown>>()
const CACHE_TTL = 60 * 1000

function getCached<T>(key: string): T | null {
  const entry = shopifyCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) { shopifyCache.delete(key); return null }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  shopifyCache.set(key, { data, timestamp: Date.now() })
  if (shopifyCache.size > 50) {
    const oldest = [...shopifyCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 10 && i < oldest.length; i++) shopifyCache.delete(oldest[i][0])
  }
}

const PLATFORM_LOGO_MAP: Record<string, string> = {
  myntra: '/logos/myntra.png', nykaa: '/logos/nykaa.png', amazon: '/logos/amazon.png',
  flipkart: '/logos/flipkart.png', caratlane: '/logos/caratlane.png', tanishq: '/logos/tanishq.png',
  bluestone: '/logos/bluestone.png', voylla: '/logos/voylla.png',
}

function mapShopifyToProductRow(
  shopifyProd: ReturnType<typeof shopifyProductToAppProduct>,
  localMatch: { images?: string | null; occasions?: string | null; recipientTypes?: string | null; relationships?: string | null; deliveryEstimate?: string | null; platform?: string | null; isExternal?: boolean | null; sourceUrl?: string | null; affiliateUrl?: string | null; commission?: number | null; syncStatus?: string | null; stock?: number | null; rating?: number | null; reviewCount?: number | null; featured?: boolean | null } | null,
  categorySlugMap: Map<string, string>
) {
  const localImages = localMatch?.images ? JSON.parse(localMatch.images) as string[] : []
  const productImages = shopifyProd.images.length > 0 ? shopifyProd.images : localImages
  const finalImages = productImages.length > 0 ? productImages : shopifyProd.featuredImage ? [shopifyProd.featuredImage] : []

  return {
    id: shopifyProd.id, name: shopifyProd.name, slug: shopifyProd.slug, description: shopifyProd.description,
    price: shopifyProd.price, compareAtPrice: shopifyProd.compareAtPrice ?? null, images: finalImages,
    category: shopifyProd.category || 'Uncategorized', categorySlug: categorySlugMap.get(shopifyProd.category?.toLowerCase() || '') || shopifyProd.slug,
    stock: localMatch?.stock ?? (shopifyProd.inStock ? 10 : 0), rating: localMatch?.rating ?? 0, reviewCount: localMatch?.reviewCount ?? 0,
    featured: localMatch?.featured ?? false, tags: shopifyProd.tags,
    occasions: localMatch ? JSON.parse(localMatch.occasions || '[]') : [], recipientTypes: localMatch ? JSON.parse(localMatch.recipientTypes || '[]') : [],
    relationships: localMatch ? JSON.parse(localMatch.relationships || '[]') : [], deliveryEstimate: localMatch?.deliveryEstimate || null,
    platform: localMatch?.platform || null, isExternal: localMatch?.isExternal || false, sourceUrl: localMatch?.sourceUrl || null,
    affiliateUrl: localMatch?.affiliateUrl || null, platformLogo: null, commission: localMatch?.commission || null,
    syncStatus: localMatch?.syncStatus || null, shopifyId: shopifyProd.id, shopifyVariantId: shopifyProd.shopifyVariantId || null,
    source: 'shopify' as const, createdAt: shopifyProd.createdAt || null,
  }
}

async function handleShopifySource(searchParams: URLSearchParams) {
  const search = searchParams.get('search')
  const category = searchParams.get('category')
  const sort = searchParams.get('sort') || 'newest'
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '12', 10)

  const cacheKeyProducts = search ? `shopify-products-search:${search}` : 'shopify-products-all'
  const cacheKeyCollections = 'shopify-collections-all'

  const [shopifyProductsResult, collectionsResult] = await Promise.all([
    (async () => {
      const cached = getCached<typeof shopifyProducts>(cacheKeyProducts)
      if (cached) return cached
      const result = search ? await searchShopifyProducts(search, 250) : (await getShopifyProducts(250)).products
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
      } catch { return null }
    })(),
  ])

  const appProducts = shopifyProductsResult.map((sp) => shopifyProductToAppProduct(sp))
  const categorySlugMap = new Map<string, string>()
  const slugToNameMap = new Map<string, string>()
  if (collectionsResult) {
    for (const col of collectionsResult) {
      categorySlugMap.set(col.title.toLowerCase(), col.handle)
      slugToNameMap.set(col.handle.toLowerCase(), col.title.toLowerCase())
    }
  }

  let filtered = appProducts
  if (category) {
    const categoryLower = category.toLowerCase()
    const resolvedName = slugToNameMap.get(categoryLower)
    filtered = filtered.filter((p) => {
      const pCategory = p.category?.toLowerCase()
      if (!pCategory) return false
      return pCategory === categoryLower || pCategory.replace(/[^a-z0-9]+/g, '-') === categoryLower
        || (resolvedName && pCategory === resolvedName)
        || pCategory.includes(categoryLower.replace(/-/g, ' '))
        || categoryLower.includes(pCategory.replace(/[^a-z0-9]+/g, ' '))
    })
  }

  // Try local DB enrichment (optional)
  const localProductsMap = new Map<string, any>()
  const localOnlyProducts: Array<any> = []
  try {
    const localProducts = await db.product.findMany({
      where: { shopifyId: { not: null } },
      select: { shopifyId: true, images: true, occasions: true, recipientTypes: true, relationships: true, deliveryEstimate: true, platform: true, isExternal: true, sourceUrl: true, affiliateUrl: true, commission: true, syncStatus: true, stock: true, rating: true, reviewCount: true, featured: true },
    })
    for (const lp of localProducts) {
      if (lp.shopifyId) localProductsMap.set(lp.shopifyId, lp)
    }

    // Local-only products
    const localOnlyWhere: Record<string, unknown> = { shopifyId: null, isExternal: false }
    if (category) localOnlyWhere.category = { slug: category }
    const localOnly = await db.product.findMany({ where: localOnlyWhere, include: { category: true }, orderBy: { createdAt: 'desc' } })
    for (const lp of localOnly) {
      localOnlyProducts.push({
        id: lp.id, name: lp.name, slug: lp.slug, description: lp.description, price: lp.price, compareAtPrice: lp.compareAtPrice,
        images: JSON.parse(lp.images || '[]') as string[], category: lp.category.name, categorySlug: lp.category.slug,
        stock: lp.stock, rating: lp.rating, reviewCount: lp.reviewCount, featured: lp.featured,
        tags: JSON.parse(lp.tags || '[]') as string[], occasions: JSON.parse(lp.occasions || '[]') as string[],
        recipientTypes: JSON.parse(lp.recipientTypes || '[]') as string[], relationships: JSON.parse(lp.relationships || '[]') as string[],
        deliveryEstimate: lp.deliveryEstimate || null, platform: lp.platform, isExternal: lp.isExternal, sourceUrl: lp.sourceUrl,
        affiliateUrl: lp.affiliateUrl, platformLogo: null, commission: lp.commission, syncStatus: lp.syncStatus,
        shopifyId: null, shopifyVariantId: null, source: 'local' as const, createdAt: lp.createdAt,
      })
    }
  } catch { /* DB enrichment optional */ }

  const mapped = filtered.map((sp) => mapShopifyToProductRow(sp, localProductsMap.get(sp.id) || null, categorySlugMap))
  const allProducts = [...localOnlyProducts, ...mapped]

  switch (sort) {
    case 'price-asc': allProducts.sort((a, b) => a.price - b.price); break
    case 'price-desc': allProducts.sort((a, b) => b.price - a.price); break
    case 'rating': allProducts.sort((a, b) => b.rating - a.rating); break
    default: allProducts.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()); break
  }

  const total = allProducts.length
  const skip = (page - 1) * limit
  const paginated = allProducts.slice(skip, skip + limit)

  return NextResponse.json({ products: paginated, total, page, totalPages: Math.ceil(total / limit) }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}

async function handleLocalSource(searchParams: URLSearchParams) {
  try {
    return await handleLocalSourceInner(searchParams)
  } catch (error: any) {
    console.error('[products] Local source error:', error.message)
    return NextResponse.json({ products: [], total: 0, page: 1, totalPages: 0 })
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
  const platform = searchParams.get('platform')
  const source = searchParams.get('source')
  const isExternalParam = searchParams.get('isExternal')
  const occasion = searchParams.get('occasion')
  const recipient = searchParams.get('recipient')
  const relationship = searchParams.get('relationship')
  const priceMin = searchParams.get('priceMin')
  const priceMax = searchParams.get('priceMax')
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}
  if (category) where.category = { slug: category }
  if (search) where.OR = [{ name: { contains: search } }, { description: { contains: search } }]

  const effectiveMinPrice = priceMin || minPrice
  const effectiveMaxPrice = priceMax || maxPrice
  if (effectiveMinPrice || effectiveMaxPrice) {
    where.price = {}
    if (effectiveMinPrice) (where.price as Record<string, unknown>).gte = parseFloat(effectiveMinPrice)
    if (effectiveMaxPrice) (where.price as Record<string, unknown>).lte = parseFloat(effectiveMaxPrice)
  }
  if (platform) where.platform = platform
  if (source === 'own') where.OR = [{ isExternal: false, source: null }, { isExternal: false, source: { not: 'shopify' } }]
  else if (source === 'external') where.isExternal = true
  else if (source === 'shopify') where.source = 'shopify'
  if (isExternalParam === 'true') where.isExternal = true
  else if (isExternalParam === 'false') where.isExternal = false
  if (occasion) where.occasions = { contains: occasion }
  if (recipient) where.recipientTypes = { contains: recipient }
  if (relationship) where.relationships = { contains: relationship }

  let orderBy: Record<string, unknown> | Array<Record<string, unknown>> = { createdAt: 'desc' }
  switch (sort) {
    case 'price-asc': orderBy = { price: 'asc' }; break
    case 'price-desc': orderBy = { price: 'desc' }; break
    case 'rating': orderBy = { rating: 'desc' }; break
    case 'featured': orderBy = [{ featured: 'desc' }, { createdAt: 'desc' }]; break
    default: orderBy = { createdAt: 'desc' }; break
  }

  const [products, total] = await Promise.all([
    db.product.findMany({ where, include: { category: true }, orderBy, skip, take: limit }),
    db.product.count({ where }),
  ])

  const transformedProducts = products.map((p) => ({
    id: p.id, name: p.name, slug: p.slug, description: p.description, price: p.price, compareAtPrice: p.compareAtPrice,
    images: JSON.parse(p.images || '[]') as string[], category: p.category.name, categorySlug: p.category.slug,
    stock: p.stock, rating: p.rating, reviewCount: p.reviewCount, featured: p.featured,
    tags: JSON.parse(p.tags || '[]') as string[], occasions: JSON.parse(p.occasions || '[]') as string[],
    recipientTypes: JSON.parse(p.recipientTypes || '[]') as string[], relationships: JSON.parse(p.relationships || '[]') as string[],
    deliveryEstimate: p.deliveryEstimate || null, platform: p.platform, isExternal: p.isExternal, sourceUrl: p.sourceUrl,
    affiliateUrl: p.affiliateUrl, platformLogo: p.platform ? (PLATFORM_LOGO_MAP[p.platform] || null) : null,
    commission: p.commission, syncStatus: p.syncStatus, shopifyId: p.shopifyId || null, shopifyVariantId: p.shopifyVariantId || null,
    source: p.source || 'local', createdAt: p.createdAt,
  }))

  return NextResponse.json({ products: transformedProducts, total, page, totalPages: Math.ceil(total / limit) }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
}

export async function GET(request: NextRequest) {
  try {
    // NOTE: No more blocking ensureSeeded() call here!
    // db.ts $extends() handles auto-seeding before every query.
    // If seeding times out, queries fail gracefully and we return empty data.

    const { searchParams } = new URL(request.url)
    const sourceParam = searchParams.get('source')

    if (sourceParam === 'shopify') {
      if (isShopifyConfigured()) {
        try {
          return await handleShopifySource(searchParams)
        } catch (error) {
          return NextResponse.json({ error: 'Failed to fetch products from Shopify' }, { status: 502 })
        }
      } else {
        return NextResponse.json({ error: 'Shopify is not configured' }, { status: 400 })
      }
    }

    if (sourceParam === 'local') {
      return await handleLocalSource(searchParams)
    }

    // Default: local DB first, then Shopify merge
    const localResult = await handleLocalSource(searchParams)

    if (isShopifyConfigured()) {
      try {
        const shopifyResult = await handleShopifySource(searchParams)
        const shopifyClone = shopifyResult.clone()
        const shopifyData = await shopifyClone.json()

        if (shopifyData.products && shopifyData.products.length > 0) {
          const localClone = localResult.clone()
          const localData = await localClone.json()
          const localIds = new Set(localData.products.map((p: any) => p.id))
          const shopifyOnly = shopifyData.products.filter((p: any) => !localIds.has(p.id))
          const mergedProducts = [...localData.products, ...shopifyOnly]
          const mergedTotal = (localData.total || 0) + shopifyOnly.length

          return NextResponse.json({
            products: mergedProducts, total: mergedTotal, page: localData.page || 1,
            totalPages: Math.ceil(mergedTotal / 50),
          }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
        }
      } catch {
        // Shopify merge failed, return local result
      }
    }

    return localResult
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json({ products: [], total: 0, page: 1, totalPages: 0 })
  }
}
