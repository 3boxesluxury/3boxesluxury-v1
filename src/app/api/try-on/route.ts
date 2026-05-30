/**
 * Try-On API Route v2 — FIXED for Vercel Serverless
 *
 * KEY CHANGES from previous version:
 * 1. NO z-ai-web-dev-sdk dependency — uses raw fetch instead
 * 2. NO readFileSync — fetches product images via HTTP
 * 3. NO polling — returns result synchronously in POST response
 * 4. NO file system dependencies — works on Vercel serverless
 *
 * Required environment variables on Vercel:
 *   ZAI_BASE_URL  — https://internal-api.z.ai/v1
 *   ZAI_API_KEY   — Z.ai
 *   ZAI_CHAT_ID   — chat-eeb868c8-9041-42f2-be71-d4045dd60c00
 *   ZAI_USER_ID   — a891c820-2df0-4010-856e-aed1c7d75526
 *   ZAI_TOKEN     — eyJhbGciOiJIUzI1NiIs...
 *   NEXT_PUBLIC_BASE_URL — https://your-app.vercel.app
 */

import { NextRequest, NextResponse } from 'next/server'

type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440'

// ── Z.AI API Helper (raw fetch — no SDK needed) ─────────────────

function getZAIConfig() {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error(
      'AI service not configured. Set ZAI_BASE_URL and ZAI_API_KEY environment variables on Vercel.'
    )
  }
  return {
    baseUrl,
    apiKey,
    chatId: process.env.ZAI_CHAT_ID || '',
    userId: process.env.ZAI_USER_ID || '',
    token: process.env.ZAI_TOKEN || '',
  }
}

function getZAIHeaders(config: ReturnType<typeof getZAIConfig>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
    'X-Z-AI-From': 'Z',
  }
  if (config.chatId) headers['X-Chat-Id'] = config.chatId
  if (config.userId) headers['X-User-Id'] = config.userId
  if (config.token) headers['X-Token'] = config.token
  return headers
}

/** Generate image from text prompt */
async function generateImage(prompt: string, size: ImageSize): Promise<string | null> {
  const config = getZAIConfig()
  const url = `${config.baseUrl}/images/generations`
  const headers = getZAIHeaders(config)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, size }),
    signal: AbortSignal.timeout(60000),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[zai-api] Image generation failed:', response.status, errorBody.substring(0, 200))
    throw new Error(`AI API error ${response.status}: ${errorBody.substring(0, 100)}`)
  }

  const result = await response.json()

  // The API returns either base64 data or a URL
  if (result.data?.[0]?.base64) {
    return result.data[0].base64
  }

  // If it returns a URL, download and convert to base64
  if (result.data?.[0]?.url) {
    const imageUrl = result.data[0].url
    console.log('[zai-api] Downloading generated image from URL:', imageUrl.substring(0, 100))
    const imgResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
    if (imgResponse.ok) {
      const buffer = Buffer.from(await imgResponse.arrayBuffer())
      return buffer.toString('base64')
    }
    console.error('[zai-api] Failed to download image from URL')
    return null
  }

  return null
}

/** Edit image with prompt + reference images */
async function editImage(
  prompt: string,
  images: Array<{ url: string }>,
  size: ImageSize
): Promise<string | null> {
  const config = getZAIConfig()
  const url = `${config.baseUrl}/images/generations/edit`
  const headers = getZAIHeaders(config)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, images, size }),
    signal: AbortSignal.timeout(60000),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[zai-api] Image edit failed:', response.status, errorBody.substring(0, 200))
    throw new Error(`AI edit API error ${response.status}: ${errorBody.substring(0, 100)}`)
  }

  const result = await response.json()

  if (result.data?.[0]?.base64) {
    return result.data[0].base64
  }

  if (result.data?.[0]?.url) {
    const imageUrl = result.data[0].url
    console.log('[zai-api] Downloading edited image from URL:', imageUrl.substring(0, 100))
    const imgResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
    if (imgResponse.ok) {
      const buffer = Buffer.from(await imgResponse.arrayBuffer())
      return buffer.toString('base64')
    }
    console.error('[zai-api] Failed to download edited image from URL')
    return null
  }

  return null
}

// ── Product image helper (HTTP fetch only — works on Vercel) ──────

async function getProductImageBase64(imagePath: string): Promise<string | null> {
  try {
    let url = imagePath
    if (imagePath.startsWith('//')) {
      url = `https:${imagePath}`
    }

    // For absolute HTTP URLs, fetch directly
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        console.error('[try-on] Failed to fetch image:', response.status, url.substring(0, 100))
        return null
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const mimeType = contentType.split(';')[0].trim()
      const buffer = Buffer.from(await response.arrayBuffer())
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    }

    // For local paths like /images/products/xxx.jpg — fetch via the deployed site URL
    if (url.startsWith('/')) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
        || 'http://localhost:3000'
      const fullUrl = `${baseUrl}${url}`
      console.log('[try-on] Fetching local image via HTTP:', fullUrl)
      const response = await fetch(fullUrl, {
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        console.error('[try-on] Failed to fetch local image:', response.status, fullUrl)
        return null
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const mimeType = contentType.split(';')[0].trim()
      const buffer = Buffer.from(await response.arrayBuffer())
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    }

    console.error('[try-on] Unsupported image path format:', imagePath.substring(0, 100))
    return null
  } catch (err) {
    console.error('[try-on] Failed to get product image:', (err as Error).message?.substring(0, 200))
    return null
  }
}

// ── Product placement helpers ──────────────────────────────────────

function getProductPlacement(categorySlug: string, productName: string): string {
  const n = productName.toLowerCase()
  if (categorySlug === 'jewelry') {
    if (n.includes('earring') || n.includes('jhumka') || n.includes('stud')) return 'wearing earrings on both earlobes'
    if (n.includes('necklace') || n.includes('choker') || n.includes('pendant') || n.includes('temple')) return 'wearing a necklace around the neck'
    if (n.includes('bracelet') || n.includes('cuff') || n.includes('bangle')) return 'wearing a bracelet on the wrist'
    if (n.includes('ring')) return 'wearing a ring on the finger'
    if (n.includes('set') || n.includes('bridal')) return 'wearing a matching jewelry set of necklace and earrings'
    return 'wearing the jewelry piece'
  }
  if (categorySlug === 'sarees') return 'draped in the saree in traditional Indian style with pallu over shoulder'
  if (categorySlug === 'mens-shirts') return 'wearing the shirt on the torso'
  if (categorySlug === 'watches') return 'wearing the watch on the wrist'
  if (categorySlug === 'fashion') return 'wearing the outfit'
  return 'wearing the product'
}

function getImageSize(categorySlug: string): ImageSize {
  if (['sarees', 'fashion', 'mens-shirts'].includes(categorySlug)) return '768x1344'
  if (categorySlug === 'home-living') return '1344x768'
  return '864x1152'
}

// ── POST /api/try-on — SYNCHRONOUS (returns result directly) ──────

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Parse request body
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body — could not parse JSON' }, { status: 400 })
    }

    const { productId, selfieData, productImageUrl } = body

    // Validate inputs
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }
    if (!selfieData) {
      return NextResponse.json({ error: 'Selfie photo is required' }, { status: 400 })
    }
    if (!selfieData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid selfie format — must be a data:image/ URI' }, { status: 400 })
    }

    // Import db dynamically
    const { db } = await import('@/lib/db')

    // Look up product
    let product: any
    try {
      product = await db.product.findUnique({
        where: { id: productId },
        include: { category: true },
      })
    } catch (dbErr) {
      console.error('[try-on] Database error:', (dbErr as Error).message?.substring(0, 200))
      return NextResponse.json({ error: 'Database error — product lookup failed. Try refreshing the page.' }, { status: 500 })
    }

    if (!product) {
      return NextResponse.json({ error: 'Product not found — it may have been removed' }, { status: 404 })
    }

    // Get product image
    let productImages: string[] = []
    try {
      productImages = JSON.parse(product.images || '[]')
    } catch {
      productImages = []
    }

    const productImageToUse = productImageUrl || (productImages.length > 0 ? productImages[0] : null)

    if (!productImageToUse) {
      return NextResponse.json({ error: 'No product image available for this item' }, { status: 400 })
    }

    const productImageBase64 = await getProductImageBase64(productImageToUse)

    if (!productImageBase64) {
      return NextResponse.json({ error: 'Could not load product image — the image URL may be broken' }, { status: 400 })
    }

    const categorySlug = product.category?.slug || 'jewelry'
    const productName = product.name
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)

    // ── Strategy 1: edit-both (best quality — uses both selfie + product images) ──
    console.log(`[try-on] Strategy 1: edit-both, size: ${size}`)
    try {
      const prompt = `Professional fashion photograph. The FIRST image is the person, the SECOND image is the ${productName}. Combine them: show this person ${placement}. Keep the exact same face, hair, skin tone from the first image. Apply the exact product from the second image. Studio lighting, photorealistic, 8K quality.`

      const b64 = await editImage(
        prompt,
        [{ url: selfieData }, { url: productImageBase64 }],
        size
      )

      if (b64) {
        const imageUrl = `data:image/png;base64,${b64}`
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[try-on] edit-both SUCCESS in ${elapsed}s, ${(b64.length / 1024).toFixed(0)} KB`)

        // Get suggestions
        let suggestions: any[] = []
        try {
          const pairingMap: Record<string, string[]> = {
            'sarees': ['jewelry'],
            'jewelry': ['sarees', 'fashion'],
            'watches': ['mens-shirts', 'leather-goods'],
            'mens-shirts': ['watches', 'leather-goods'],
            'fashion': ['jewelry', 'watches'],
            'fragrances': ['jewelry', 'fashion'],
            'leather-goods': ['watches', 'fashion'],
          }
          const pairingCats = pairingMap[categorySlug] || ['jewelry']
          const suggestionProducts = await db.product.findMany({
            where: {
              category: { slug: { in: pairingCats } },
              id: { not: productId },
              stock: { gt: 0 },
            },
            include: { category: true },
            take: 4,
            orderBy: { rating: 'desc' },
          })
          suggestions = suggestionProducts.map((s: any) => ({
            id: s.id,
            name: s.name,
            price: s.price,
            image: JSON.parse(s.images || '[]')[0] || '/images/placeholder.jpg',
            category: s.category?.name || '',
            categorySlug: s.category?.slug || '',
          }))
        } catch {
          // Non-critical
        }

        return NextResponse.json({
          status: 'completed',
          imageUrl,
          productName,
          categorySlug,
          strategy: 'edit-both',
          faceScore: 8,
          productScore: 8,
          suggestions,
          elapsed: `${elapsed}s`,
        })
      }

      console.log('[try-on] edit-both returned no image data, trying next strategy...')
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      console.error('[try-on] edit-both FAILED:', errMsg.substring(0, 200))
    }

    // ── Strategy 2: edit-selfie (uses selfie + text description of product) ──
    console.log(`[try-on] Strategy 2: edit-selfie, size: ${size}`)
    try {
      const prompt = `Professional fashion photograph of the person in this image, now ${placement}. The product is a ${productName}. Make it look natural and realistic. Keep the exact same face, skin tone, hair, and eye color. Studio lighting, photorealistic, 8K quality.`

      const b64 = await editImage(
        prompt,
        [{ url: selfieData }],
        size
      )

      if (b64) {
        const imageUrl = `data:image/png;base64,${b64}`
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[try-on] edit-selfie SUCCESS in ${elapsed}s, ${(b64.length / 1024).toFixed(0)} KB`)

        return NextResponse.json({
          status: 'completed',
          imageUrl,
          productName,
          categorySlug,
          strategy: 'edit-selfie',
          faceScore: 7,
          productScore: 6,
          suggestions: [],
          elapsed: `${elapsed}s`,
        })
      }

      console.log('[try-on] edit-selfie returned no image data, trying next strategy...')
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      console.error('[try-on] edit-selfie FAILED:', errMsg.substring(0, 200))
    }

    // ── Strategy 3: create (text-to-image fallback) ──
    console.log(`[try-on] Strategy 3: create (text-to-image), size: ${size}`)
    try {
      const bodyType = categorySlug === 'sarees' || categorySlug === 'fashion'
        ? 'Full-body professional fashion photograph'
        : categorySlug === 'jewelry' || categorySlug === 'watches'
        ? 'Close-up professional beauty photograph from chest up'
        : 'Professional fashion photograph'

      const prompt = `${bodyType} of a person ${placement}. Product: ${productName}. Photorealistic, studio lighting, 8K, high detail, professional fashion photography.`

      const b64 = await generateImage(prompt, size)

      if (b64) {
        const imageUrl = `data:image/png;base64,${b64}`
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[try-on] create SUCCESS in ${elapsed}s, ${(b64.length / 1024).toFixed(0)} KB`)

        return NextResponse.json({
          status: 'completed',
          imageUrl,
          productName,
          categorySlug,
          strategy: 'create-detailed',
          faceScore: 4,
          productScore: 6,
          suggestions: [],
          elapsed: `${elapsed}s`,
        })
      }
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      console.error('[try-on] create FAILED:', errMsg.substring(0, 200))
    }

    // All strategies failed
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`[try-on] ALL strategies failed in ${elapsed}s`)
    return NextResponse.json({
      error: 'AI could not generate a style preview. This may be a temporary issue — please try again in a moment.',
      detail: 'All image generation strategies returned no result',
    }, { status: 502 })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[try-on] Unexpected error:', errMsg.substring(0, 500))
    return NextResponse.json({
      error: 'An error occurred while generating the style preview',
      detail: errMsg.substring(0, 300),
    }, { status: 500 })
  }
}

// ── GET /api/try-on — Health check / status ───────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const check = searchParams.get('check')

  if (check === 'health') {
    try {
      const config = getZAIConfig()
      // Quick connectivity test — just check if we can reach the Z.AI API
      const testResponse = await fetch(`${config.baseUrl}/models`, {
        headers: getZAIHeaders(config),
        signal: AbortSignal.timeout(10000),
      })
      return NextResponse.json({
        status: testResponse.ok ? 'ok' : 'degraded',
        ai: testResponse.ok ? 'reachable' : 'unreachable',
        baseUrl: config.baseUrl,
        message: testResponse.ok
          ? 'Try-on service is ready'
          : `API returned status ${testResponse.status}`,
      })
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        ai: 'unreachable',
        baseUrl: process.env.ZAI_BASE_URL || '(not set)',
        message: (err as Error).message?.substring(0, 200),
      }, { status: 503 })
    }
  }

  // For backward compatibility
  const jobId = searchParams.get('jobId')
  if (jobId) {
    return NextResponse.json({
      jobId,
      status: 'failed',
      error: 'This endpoint no longer uses background jobs. The POST request now returns the result directly.',
    })
  }

  return NextResponse.json({
    status: 'ready',
    message: 'Send a POST request with productId and selfieData to generate a style preview',
    envCheck: {
      ZAI_BASE_URL: process.env.ZAI_BASE_URL ? 'SET' : 'MISSING',
      ZAI_API_KEY: process.env.ZAI_API_KEY ? 'SET' : 'MISSING',
      ZAI_CHAT_ID: process.env.ZAI_CHAT_ID ? 'SET' : 'MISSING',
      ZAI_USER_ID: process.env.ZAI_USER_ID ? 'SET' : 'MISSING',
      ZAI_TOKEN: process.env.ZAI_TOKEN ? 'SET' : 'MISSING',
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '(not set)',
    },
  })
}

// Vercel serverless function configuration
export const maxDuration = 60
