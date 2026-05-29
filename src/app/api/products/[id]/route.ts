import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  isShopifyConfigured,
  getShopifyProductById,
  getShopifyProductByHandle,
  shopifyProductToAppProduct,
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
 * Fetch a product from Shopify by GID or handle, then merge with local DB data
 */
async function handleShopifyProduct(shopifyGid: string, handle?: string) {
  let shopifyProduct

  if (handle) {
    shopifyProduct = await getShopifyProductByHandle(handle)
  } else {
    shopifyProduct = await getShopifyProductById(shopifyGid)
  }

  if (!shopifyProduct) {
    return null
  }

  const appProd = shopifyProductToAppProduct(shopifyProduct)

  // Try to find local DB match by shopifyId for enrichment
  let localMatch = null
  try {
    localMatch = await db.product.findFirst({
      where: { shopifyId: shopifyProduct.id },
      include: { category: true },
    })
  } catch {
    // Local DB lookup is optional
  }

  // Resolve category slug
  let categorySlug = appProd.slug
  if (localMatch?.category?.slug) {
    categorySlug = localMatch.category.slug
  } else if (appProd.category) {
    // Derive slug from category name
    categorySlug = appProd.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  // Use local DB images when Shopify product has no images (common when images weren't uploaded)
  const localImages = localMatch?.images ? JSON.parse(localMatch.images) as string[] : []
  const productImages = appProd.images.length > 0 ? appProd.images : localImages

  const transformed = {
    id: localMatch?.id || appProd.id,
    name: appProd.name,
    slug: appProd.slug,
    description: appProd.description,
    price: appProd.price,
    compareAtPrice: appProd.compareAtPrice ?? null,
    images: productImages,
    category: localMatch?.category?.name || appProd.category || 'Uncategorized',
    categorySlug,
    stock: appProd.inStock ? (localMatch?.stock || 10) : 0,
    rating: localMatch?.rating || 0,
    reviewCount: localMatch?.reviewCount || 0,
    featured: localMatch?.featured || false,
    tags: appProd.tags,
    deliveryEstimate: localMatch?.deliveryEstimate || '3-5 business days',
    // Platform fields
    platform: localMatch?.platform || null,
    isExternal: localMatch?.isExternal || false,
    sourceUrl: localMatch?.sourceUrl || null,
    affiliateUrl: localMatch?.affiliateUrl || null,
    platformLogo: localMatch?.platform ? (PLATFORM_LOGO_MAP[localMatch.platform] || null) : null,
    // Shopify integration fields
    shopifyId: appProd.id,
    shopifyVariantId: appProd.shopifyVariantId || null,
    source: 'shopify' as const,
    createdAt: localMatch?.createdAt?.toISOString() || appProd.createdAt || null,
  }

  return transformed
}

/**
 * Fetch a product from local DB by ID
 */
async function handleLocalProduct(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: { category: true },
  })

  if (!product) {
    return null
  }

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    images: JSON.parse(product.images || '[]') as string[],
    category: product.category.name,
    categorySlug: product.category.slug,
    stock: product.stock,
    rating: product.rating,
    reviewCount: product.reviewCount,
    featured: product.featured,
    tags: JSON.parse(product.tags || '[]') as string[],
    deliveryEstimate: product.deliveryEstimate || '3-5 business days',
    // Platform fields
    platform: product.platform,
    isExternal: product.isExternal,
    sourceUrl: product.sourceUrl,
    affiliateUrl: product.affiliateUrl,
    platformLogo: product.platform ? (PLATFORM_LOGO_MAP[product.platform] || null) : null,
    // Shopify integration fields
    shopifyId: product.shopifyId || null,
    shopifyVariantId: product.shopifyVariantId || null,
    source: product.source || 'local',
    createdAt: product.createdAt?.toISOString() || null,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const handle = searchParams.get('handle') || undefined
    const sourceParam = searchParams.get('source') // 'shopify' or 'local'

    const isShopifyGid = id.startsWith('gid://shopify/Product/')

    // If source=local is explicitly requested, use local DB
    if (sourceParam === 'local') {
      const product = await handleLocalProduct(id)
      if (!product) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ product })
    }

    // If source=shopify is explicitly requested, or the ID is a Shopify GID, try Shopify
    if (sourceParam === 'shopify' || isShopifyGid || handle) {
      if (isShopifyConfigured()) {
        try {
          const product = await handleShopifyProduct(id, handle)
          if (product) {
            return NextResponse.json({ product })
          }
        } catch (error) {
          console.error('Shopify product fetch failed:', error)
          // If source=shopify was explicit, return error instead of falling back
          if (sourceParam === 'shopify') {
            return NextResponse.json(
              { error: 'Failed to fetch product from Shopify', details: error instanceof Error ? error.message : 'Unknown error' },
              { status: 502 }
            )
          }
          // Otherwise fall through to local DB
        }
      } else if (sourceParam === 'shopify') {
        return NextResponse.json(
          { error: 'Shopify is not configured. Set SHOPIFY_STOREFRONT_TOKEN environment variable.' },
          { status: 400 }
        )
      }
    }

    // Default: try local DB
    const product = await handleLocalProduct(id)
    if (!product) {
      // If we haven't tried Shopify yet and it's configured, try it as fallback
      if (isShopifyConfigured() && sourceParam !== 'local') {
        try {
          // Try looking up by shopifyId in local DB, then fetch from Shopify
          const localByShopifyId = await db.product.findFirst({
            where: { shopifyId: id },
          })
          if (localByShopifyId) {
            const shopifyProduct = await handleShopifyProduct(localByShopifyId.shopifyId!)
            if (shopifyProduct) {
              return NextResponse.json({ product: shopifyProduct })
            }
          }
        } catch {
          // Shopify fallback failed, return 404
        }
      }
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ product })
  } catch (error) {
    console.error('Error fetching product:', error)
    return NextResponse.json(
      { error: 'Failed to fetch product' },
      { status: 500 }
    )
  }
}
