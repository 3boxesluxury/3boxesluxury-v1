import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isShopifyConfigured, getShopifyCollections } from '@/lib/shopify/client'
import { ensureSeeded } from '@/lib/auto-seed'

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

/**
 * Fetch categories from Shopify Storefront API and map to our format
 */
async function handleShopifyCategories() {
  // Check cache first
  const cacheKey = 'shopify-categories'
  const cached = getCached<{ categories: Array<any> }>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } })

  const collections = await getShopifyCollections()

  // Try to get product counts from Shopify (via collection products query)
  // and also merge with local DB data (shopifyId mapping)
  const localCategoriesMap = new Map<string, {
    id: string;
    slug: string;
    productCount: number;
  }>()

  try {
    const localCategories = await db.category.findMany({
      where: { shopifyId: { not: null } },
      include: {
        _count: { select: { products: true } },
      },
    })
    for (const lc of localCategories) {
      if (lc.shopifyId) {
        localCategoriesMap.set(lc.shopifyId, {
          id: lc.id,
          slug: lc.slug,
          productCount: lc._count.products,
        })
      }
    }
  } catch {
    // Local DB enrichment is optional
  }

  const transformed = collections
    // Filter out default Shopify collections that aren't real categories
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
 * Fetch categories that have recently added products (last 30 days)
 */
async function handleLocalNewArrivalCategories() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Find categories that have at least one product created in the last 30 days
  const categories = await db.category.findMany({
    where: {
      products: {
        some: {
          createdAt: { gte: thirtyDaysAgo },
        },
      },
    },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { products: true },
      },
      products: {
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { id: true },
      },
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

/**
 * Fetch categories from local DB (original behavior, preserved)
 * FIX: Added retry logic — if 0 categories, wait 2s and retry once (seed may still be running)
 * FIX: Don't cache empty responses on Vercel CDN
 */
async function handleLocalCategories() {
  let categories = await db.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { products: true },
      },
    },
  })

  // FIX: Retry logic — if 0 categories, seed might still be running
  if (categories.length === 0) {
    console.log('[categories] Got 0 local categories — waiting 2s and retrying...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    categories = await db.category.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    })
  }

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

  // FIX: Don't cache empty responses on Vercel CDN
  const headers: Record<string, string> = transformed.length === 0
    ? { 'Cache-Control': 'no-store' }
    : { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' }

  return NextResponse.json({ categories: transformed }, { headers })
}

export async function GET(request?: NextRequest) {
  try {
    // Auto-seed on Vercel if database is empty
    await ensureSeeded()
    const searchParams = request ? new URL(request.url).searchParams : new URLSearchParams()
    const sourceParam = searchParams.get('source') // 'shopify' or 'local'
    const newArrivals = searchParams.get('newArrivals') // 'true' to filter categories with recent products

    // New Arrivals: return only categories with products added in last 30 days
    if (newArrivals === 'true') {
      // For Shopify source, try Shopify first
      if (sourceParam === 'shopify' || (!sourceParam && isShopifyConfigured())) {
        try {
          // For Shopify, we return all categories since Shopify doesn't filter by createdAt easily
          // The frontend will sort by newest when displaying products
          return await handleShopifyCategories()
        } catch {
          // Fall through to local
        }
      }
      return await handleLocalNewArrivalCategories()
    }

    // If source=shopify is explicitly requested, try Shopify
    if (sourceParam === 'shopify') {
      if (isShopifyConfigured()) {
        try {
          return await handleShopifyCategories()
        } catch (error) {
          console.error('Shopify collections fetch failed:', error)
          return NextResponse.json(
            { error: 'Failed to fetch categories from Shopify', details: error instanceof Error ? error.message : 'Unknown error' },
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
      return await handleLocalCategories()
    }

    // Default behavior: Always include local DB categories (auto-seeded).
    // If Shopify is configured, merge Shopify collections with local categories.
    // This ensures auto-seeded categories ALWAYS show on Vercel.

    // Step 1: Always get local categories first (auto-seeded + admin-added)
    let localCategories: Array<any> = []
    try {
      const localResult = await handleLocalCategories()
      const localData = await localResult.json()
      localCategories = localData.categories || []
    } catch (error) {
      console.error('[categories] Local categories fetch failed:', error)
    }

    // Step 2: If Shopify is configured, try to also get Shopify collections and merge
    if (isShopifyConfigured()) {
      try {
        const shopifyResult = await handleShopifyCategories()
        const shopifyClone = shopifyResult.clone()
        const shopifyData = await shopifyClone.json()
        const shopifyCategories = shopifyData.categories || []

        // Merge: local categories first, then Shopify categories not already in local
        const localSlugs = new Set(localCategories.map((c: any) => c.slug?.toLowerCase()))
        const shopifyOnly = shopifyCategories.filter((c: any) => !localSlugs.has(c.slug?.toLowerCase()))

        const merged = [...localCategories, ...shopifyOnly]
        if (merged.length > 0) {
          return NextResponse.json(
            { categories: merged },
            { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
          )
        }
      } catch (error) {
        console.error('[categories] Shopify merge failed, returning local categories only:', error)
        // Fall through - return local categories
      }
    }

    // Return local categories (always available from auto-seed)
    if (localCategories.length > 0) {
      return NextResponse.json(
        { categories: localCategories },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
      )
    }

    // Last resort: try Shopify if local is empty
    if (isShopifyConfigured()) {
      try {
        return await handleShopifyCategories()
      } catch (error) {
        console.error('Shopify collections fetch failed:', error)
      }
    }

    return await handleLocalCategories()
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}
