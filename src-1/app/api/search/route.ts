import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── In-Memory Cache for Search Results ───
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const searchCache = new Map<string, CacheEntry<unknown>>()
const CACHE_TTL = 30 * 1000 // 30 seconds — shorter TTL for search since results vary widely

function getCached<T>(key: string): T | null {
  const entry = searchCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    searchCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  searchCache.set(key, { data, timestamp: Date.now() })
  // Evict old entries if cache grows too large
  if (searchCache.size > 100) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < 20 && i < oldest.length; i++) {
      searchCache.delete(oldest[i][0])
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category');
    const minPrice = parseFloat(searchParams.get('minPrice') || '0');
    const maxPrice = parseFloat(searchParams.get('maxPrice') || '999999');
    const occasion = searchParams.get('occasion');
    const recipient = searchParams.get('recipient');
    const sort = searchParams.get('sort') || 'relevance';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build cache key from all search parameters
    const cacheKey = `search:${q}:${category}:${minPrice}:${maxPrice}:${occasion}:${recipient}:${sort}:${page}:${limit}`;

    // Check cache first
    const cached = getCached<{ products: any[]; total: number; aiSuggestions: string[] }>(cacheKey);
    if (cached) {
      return NextResponse.json({
        ...cached,
        page,
        limit,
        totalPages: Math.ceil(cached.total / limit),
        query: q,
      });
    }

    // Build where clause
    const where: Record<string, unknown>[] = [];

    if (q) {
      where.push({
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { sku: { contains: q } },
          { tags: { contains: q } },
        ],
      });
    }

    if (category) {
      where.push({
        category: { slug: category },
      });
    }

    if (minPrice > 0 || maxPrice < 999999) {
      where.push({
        price: { gte: minPrice, lte: maxPrice },
      });
    }

    // OPTIMIZATION: For JSON field searches, we use contains which does a string match
    // on the stored JSON array. This works because the values are stored as:
    // ["birthday", "anniversary"] — searching for "birthday" with contains matches.
    // While this causes a full table scan, SQLite is fast enough for small-medium datasets.
    // For larger datasets, consider using a separate filter table or FTS5.
    if (occasion) {
      where.push({
        occasions: { contains: occasion },
      });
    }

    if (recipient) {
      where.push({
        recipientTypes: { contains: recipient },
      });
    }

    const whereClause = where.length > 0 ? { AND: where } : undefined;

    // OPTIMIZATION: Run products query and count in PARALLEL instead of sequential
    const [products, total] = await Promise.all([
      db.product.findMany({
        where: whereClause,
        include: {
          category: { select: { name: true, slug: true } },
        },
        orderBy: sort === 'price_asc' ? { price: 'asc' }
          : sort === 'price_desc' ? { price: 'desc' }
          : sort === 'rating' ? { rating: 'desc' }
          : sort === 'newest' ? { createdAt: 'desc' }
          : { featured: 'desc' },
        skip,
        take: limit,
      }),
      db.product.count({
        where: whereClause,
      }),
    ]);

    // Format results
    const formattedProducts = products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      images: p.images ? JSON.parse(p.images) : [],
      category: p.category.name,
      categorySlug: p.category.slug,
      stock: p.stock,
      stockStatus: p.stockStatus,
      rating: p.rating,
      reviewCount: p.reviewCount,
      featured: p.featured,
      tags: p.tags ? JSON.parse(p.tags || '[]') : [],
      occasions: p.occasions ? JSON.parse(p.occasions || '[]') : [],
      recipientTypes: p.recipientTypes ? JSON.parse(p.recipientTypes || '[]') : [],
      deliveryEstimate: p.deliveryEstimate,
      isExternal: p.isExternal,
      platform: p.platform,
      affiliateUrl: p.affiliateUrl,
      source: p.source || 'local',
      shopifyId: p.shopifyId || null,
      createdAt: p.createdAt?.toISOString() || null,
    }));

    // Parse natural language query for AI suggestions
    let aiSuggestions: string[] = [];
    if (q) {
      const lowerQ = q.toLowerCase();
      const occasionKeywords = ['birthday', 'anniversary', 'wedding', 'diwali', 'christmas', 'valentine', 'mother', 'father', 'housewarming', 'farewell'];
      const recipientKeywords = ['him', 'her', 'couple', 'kids', 'parents', 'friend', 'colleague', 'boss', 'wife', 'husband', 'girlfriend', 'boyfriend', 'mom', 'dad'];
      
      const detectedOccasions = occasionKeywords.filter(o => lowerQ.includes(o));
      const detectedRecipients = recipientKeywords.filter(r => lowerQ.includes(r));
      const budgetMatch = lowerQ.match(/under\s*₹?(\d+)|below\s*₹?(\d+)|less\s*than\s*₹?(\d+)/);
      
      if (detectedOccasions.length > 0 || detectedRecipients.length > 0 || budgetMatch) {
        aiSuggestions = [
          ...(detectedOccasions.length > 0 ? [`Occasion detected: ${detectedOccasions.join(', ')}`] : []),
          ...(detectedRecipients.length > 0 ? [`Recipient: ${detectedRecipients.join(', ')}`] : []),
          ...(budgetMatch ? [`Budget: under ₹${budgetMatch[1] || budgetMatch[2] || budgetMatch[3]}`] : []),
        ];
      }
    }

    const result = {
      products: formattedProducts,
      total,
      aiSuggestions,
    };

    // Cache the result
    setCache(cacheKey, result);

    return NextResponse.json({
      ...result,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query: q,
    }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
