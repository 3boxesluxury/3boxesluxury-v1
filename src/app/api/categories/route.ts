import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isShopifyConfigured, getShopifyCollections } from '@/lib/shopify/client'

/**
 * Fetch categories from Shopify Storefront API and map to our format
 */
async function handleShopifyCategories() {
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

  return NextResponse.json({ categories: transformed })
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
 */
async function handleLocalCategories() {
  const categories = await db.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { products: true },
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
    shopifyId: cat.shopifyId || null,
    source: 'local' as const,
  }))

  return NextResponse.json({ categories: transformed })
}

export async function GET(request?: NextRequest) {
  try {
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

    // Default behavior: when Shopify is configured, try Shopify first then fall back to local DB
    if (isShopifyConfigured()) {
      try {
        return await handleShopifyCategories()
      } catch (error) {
        console.error('Shopify collections fetch failed, falling back to local DB:', error)
        // Fall through to local DB
      }
    }

    // Local DB fallback (or default when Shopify is not configured)
    return await handleLocalCategories()
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    )
  }
}
