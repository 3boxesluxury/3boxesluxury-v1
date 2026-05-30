import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isShopifyConfigured, getShopifyCollections } from '@/lib/shopify/client'

// ─── In-Memory Cache for Categories ───
interface CacheEntry<T> {
  data: T
  timestamp: number
}
const categoriesCache = new Map<string, CacheEntry<unknown>>()
const CACHE_TTL = 60 * 1000 // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = categoriesCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    categoriesCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  categoriesCache.set(key, { data, timestamp: Date.now() })
  if (categoriesCache.size > 20) {
    const oldest = [...categoriesCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 5 && i < oldest.length; i++) {
      categoriesCache.delete(oldest[i][0])
    }
  }
}

// ─── Hardcoded fallback categories (used when DB + Shopify both fail) ───
// This ensures the homepage ALWAYS shows categories, even on Vercel cold starts
const FALLBACK_CATEGORIES = [
  { id: 'cat-couple-gifts', name: 'Couple Friendly Gifts', slug: 'couple-gifts', description: 'Gift experiences for couples to share together', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-fashion', name: 'Fashion', slug: 'fashion', description: 'Designer clothing and haute couture collections', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-fragrances', name: 'Fragrance', slug: 'fragrances', description: "Signature scents from the world's finest perfumers", image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-home-living', name: 'Home & Living', slug: 'home-living', description: 'Luxurious home decor and lifestyle accessories', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-jewelry', name: 'Jewelry', slug: 'jewelry', description: 'Exquisite jewelry crafted with precious stones and metals', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-leather-goods', name: 'Leather Goods', slug: 'leather-goods', description: 'Premium leather bags, wallets, and accessories', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-mens-shirts', name: "Men's Shirts & T-Shirts", slug: 'mens-shirts', description: 'Premium shirts and t-shirts for the modern gentleman', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-romantic-gifts', name: 'Romantic Gifts', slug: 'romantic-gifts', description: 'Thoughtful gift experiences to express your love', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-sarees', name: 'Saree', slug: 'sarees', description: 'Handwoven silk and designer sarees for every occasion', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-toys', name: 'Toys', slug: 'toys', description: 'Premium collectible toys and luxury gifts for all ages', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
  { id: 'cat-watches', name: 'Watches', slug: 'watches', description: 'Luxury timepieces from world-renowned makers', image: null, productCount: 0, shopifyId: null, source: 'fallback' as const },
]

/**
 * Fetch categories from Shopify Storefront API and map to our format
 */
async function handleShopifyCategories() {
  const cacheKey = 'shopify-categories'
  const cached = getCached<{ categories: Array<any> }>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })

  const collections = await getShopifyCollections()

  const localCategoriesMap = new Map<string, { id: string; slug: string; productCount: number }>()

  try {
    const localCategories = await db.category.findMany({
      where: { shopifyId: { not: null } },
      include: { _count: { select: { products: true } } },
    })
    for (const lc of localCategories) {
      if (lc.shopifyId) {
        localCategoriesMap.set(lc.shopifyId, { id: lc.id, slug: lc.slug, productCount: lc._count.products })
      }
    }
  } catch { /* Local DB enrichment is optional */ }

  const transformed = collections
    .filter((col) => col.handle !== 'frontpage' && col.handle !== 'all' && col.title !== 'Uncategorized')
    .map((col) => {
      const localMatch = localCategoriesMap.get(col.id)
      return {
        id: localMatch?.id || col.id,
        name: col.title,
        slug: localMatch?.slug || col.handle,
        description: col.description || null,
        image: col.image?.url || null,
        productCount: localMatch?.productCount || 0,
        shopifyId: col.id,
        handle: col.handle,
        source: 'shopify' as const,
      }
    })

  const result = { categories: transformed }
  setCache(cacheKey, result)
  return NextResponse.json(result, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })
}

/**
 * Fetch categories from local DB — with fallback on error
 */
async function handleLocalCategories() {
  const categories = await db.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  })

  const transformed = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    image: cat.image,
    productCount: cat._count.products,
    shopifyId: cat.shopifyId || null,
    source: 'local' as const,
  }))

  return NextResponse.json({ categories: transformed })
}

/**
 * Fetch categories that have recently added products (last 30 days)
 */
async function handleLocalNewArrivalCategories() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const categories = await db.category.findMany({
    where: { products: { some: { createdAt: { gte: thirtyDaysAgo } } } },
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { products: true } },
      products: { where: { createdAt: { gte: thirtyDaysAgo } }, select: { id: true } },
    },
  })

  const transformed = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: cat.description,
    image: cat.image,
    productCount: cat._count.products,
    newProductCount: cat.products.length,
    shopifyId: cat.shopifyId || null,
    source: 'local' as const,
  }))

  return NextResponse.json({ categories: transformed })
}

export async function GET(request?: NextRequest) {
  try {
    // NOTE: We do NOT call ensureSeeded() here anymore.
    // The db.ts $extends() auto-seeds before every query.
    // If seeding times out, we catch the error and use fallback data.

    const searchParams = request ? new URL(request.url).searchParams : new URLSearchParams()
    const sourceParam = searchParams.get('source')
    const newArrivals = searchParams.get('newArrivals')

    // New Arrivals
    if (newArrivals === 'true') {
      if (sourceParam === 'shopify' || (!sourceParam && isShopifyConfigured())) {
        try {
          return await handleShopifyCategories()
        } catch { /* Fall through to local */ }
      }
      try {
        return await handleLocalNewArrivalCategories()
      } catch {
        // DB not ready yet — return fallback
        return NextResponse.json({ categories: FALLBACK_CATEGORIES })
      }
    }

    // source=shopify
    if (sourceParam === 'shopify') {
      if (isShopifyConfigured()) {
        try {
          return await handleShopifyCategories()
        } catch (error) {
          return NextResponse.json({ error: 'Failed to fetch categories from Shopify' }, { status: 502 })
        }
      } else {
        return NextResponse.json({ error: 'Shopify is not configured' }, { status: 400 })
      }
    }

    // source=local
    if (sourceParam === 'local') {
      try {
        return await handleLocalCategories()
      } catch {
        return NextResponse.json({ categories: FALLBACK_CATEGORIES })
      }
    }

    // Default: local DB first, then Shopify merge, then fallback
    let localCategories: Array<any> = []
    try {
      const localResult = await handleLocalCategories()
      const localData = await localResult.json()
      localCategories = localData.categories || []
    } catch {
      console.error('[categories] Local DB failed, trying Shopify/fallback')
    }

    // Try Shopify merge if configured
    if (isShopifyConfigured()) {
      try {
        const shopifyResult = await handleShopifyCategories()
        const shopifyClone = shopifyResult.clone()
        const shopifyData = await shopifyClone.json()
        const shopifyCategories = shopifyData.categories || []

        const localSlugs = new Set(localCategories.map((c: any) => c.slug?.toLowerCase()))
        const shopifyOnly = shopifyCategories.filter((c: any) => !localSlugs.has(c.slug?.toLowerCase()))

        const merged = [...localCategories, ...shopifyOnly]
        if (merged.length > 0) {
          return NextResponse.json({ categories: merged }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
        }
      } catch {
        // Shopify merge failed, continue with local/fallback
      }
    }

    // Return local categories if we have them
    if (localCategories.length > 0) {
      return NextResponse.json({ categories: localCategories }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
    }

    // Try Shopify as last resort
    if (isShopifyConfigured()) {
      try {
        return await handleShopifyCategories()
      } catch { /* Fall through to fallback */ }
    }

    // Final fallback: hardcoded categories
    return NextResponse.json({ categories: FALLBACK_CATEGORIES })

  } catch (error) {
    console.error('Error fetching categories:', error)
    // NEVER return a 500 — always return fallback data so the homepage works
    return NextResponse.json({ categories: FALLBACK_CATEGORIES })
  }
}
