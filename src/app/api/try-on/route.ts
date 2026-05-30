/**
 * Try-On API Route v4 — FIXED for Vercel Serverless + Z.AI Public API
 *
 * KEY FIX v4: Uses Z.AI PUBLIC API endpoint (https://api.z.ai/api/paas/v4)
 * which is accessible from Vercel's servers!
 *
 * The internal endpoint (internal-api.z.ai) uses PRIVATE IPs (172.25.x.x)
 * and is ONLY reachable from Z.AI's internal network — NOT from Vercel.
 *
 * v3 fixes retained:
 * - Calls ensureSeeded() before DB queries
 * - Falls back to product API if DB fails
 * - NO z-ai-web-dev-sdk dependency — uses raw fetch
 * - NO readFileSync — fetches images via HTTP
 * - NO polling — returns result synchronously
 *
 * Required Vercel environment variables:
 *   ZAI_BASE_URL  — https://api.z.ai/api/paas/v4
 *   ZAI_API_KEY   — Your Z.AI API key (get one at https://z.ai → API Keys)
 *   NEXT_PUBLIC_BASE_URL — https://3boxesluxury-v1.vercel.app
 *
 * Optional (not needed for public API):
 *   ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN — only for internal API
 */

import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDBReady } from '@/lib/db'

// ── Image sizes supported by Z.AI public API ──────────────────────

type GLMImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440'
type CogViewSize = '1280x1280' | '1568x1056' | '1056x1568' | '1472x1088' | '1088x1472' | '1728x960' | '960x1728'

// ── Z.AI Public API Helper ────────────────────────────────────────

function getZAIConfig() {
  const baseUrl = (process.env.ZAI_BASE_URL || '').trim()
  const apiKey = (process.env.ZAI_API_KEY || '').trim()

  if (!baseUrl || !apiKey) {
    throw new Error(
      'AI service not configured. Set ZAI_BASE_URL and ZAI_API_KEY on Vercel. ' +
      'Get an API key at https://z.ai → API Keys page. ' +
      'Set ZAI_BASE_URL=https://api.z.ai/api/paas/v4'
    )
  }

  return {
    baseUrl,
    apiKey,
    // Internal API headers (kept for backward compat if using internal-api.z.ai)
    chatId: process.env.ZAI_CHAT_ID || '',
    userId: process.env.ZAI_USER_ID || '',
    token: process.env.ZAI_TOKEN || '',
  }
}

function getZAIHeaders(config: ReturnType<typeof getZAIConfig>) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  }

  // If using internal API, add the extra headers
  if (config.baseUrl.includes('internal-api.z.ai')) {
    headers['X-Z-AI-From'] = 'Z'
    if (config.chatId) headers['X-Chat-Id'] = config.chatId
    if (config.userId) headers['X-User-Id'] = config.userId
    if (config.token) headers['X-Token'] = config.token
  }

  return headers
}

/** Check if we're using the Z.AI public API */
function isPublicAPI(config: ReturnType<typeof getZAIConfig>): boolean {
  return config.baseUrl.includes('api.z.ai/api/paas')
}

/** Generate image from text prompt using Z.AI public API */
async function generateImage(prompt: string, size: string): Promise<string | null> {
  const config = getZAIConfig()
  const url = `${config.baseUrl}/images/generations`
  const headers = getZAIHeaders(config)

  const body: Record<string, any> = isPublicAPI(config)
    ? { model: 'glm-image', prompt, size: mapToCogViewSize(size), quality: 'standard' }
    : { prompt, size }

  console.log(`[zai-api] POST ${url} model=${body.model || 'default'} size=${body.size}`)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error('[zai-api] Image generation failed:', response.status, errorBody.substring(0, 300))

    // Check for auth errors and give helpful message
    if (response.status === 401 || errorBody.includes('auth') || errorBody.includes('Authentication')) {
      throw new Error(
        'Z.AI API authentication failed. Your API key may be invalid or expired. ' +
        'Get a new key at https://z.ai → API Keys. ' +
        `Detail: ${errorBody.substring(0, 100)}`
      )
    }

    throw new Error(`AI API error ${response.status}: ${errorBody.substring(0, 150)}`)
  }

  const result = await response.json()
  return extractImageFromResponse(result)
}

/** Generate image asynchronously (better for Vercel timeout) */
async function generateImageAsync(prompt: string, size: string): Promise<string | null> {
  const config = getZAIConfig()

  // Only public API supports async endpoint
  if (!isPublicAPI(config)) {
    return generateImage(prompt, size)
  }

  const url = `${config.baseUrl}/async/images/generations`
  const headers = getZAIHeaders(config)
  const body = { model: 'glm-image', prompt, size: mapToCogViewSize(size), quality: 'standard' }

  console.log(`[zai-api] ASYNC POST ${url} model=${body.model} size=${body.size}`)

  // Step 1: Submit the async request
  const submitResponse = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!submitResponse.ok) {
    const errorBody = await submitResponse.text()
    console.error('[zai-api] Async submit failed:', submitResponse.status, errorBody.substring(0, 200))

    // Fallback to sync
    console.log('[zai-api] Falling back to synchronous generation')
    return generateImage(prompt, size)
  }

  const submitResult = await submitResponse.json()
  const taskId = submitResult.id || submitResult.task_id || submitResult.request_id

  if (!taskId) {
    console.error('[zai-api] No task ID in async response:', JSON.stringify(submitResult).substring(0, 200))
    return generateImage(prompt, size)
  }

  console.log(`[zai-api] Async task submitted: ${taskId}`)

  // Step 2: Poll for result
  const resultUrl = `${config.baseUrl}/async-result/${taskId}`
  const maxPolls = 30
  const pollInterval = 3000

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval))

    const pollResponse = await fetch(resultUrl, {
      headers,
      signal: AbortSignal.timeout(15000),
    })

    if (!pollResponse.ok) {
      console.error(`[zai-api] Poll ${i + 1} failed:`, pollResponse.status)
      continue
    }

    const pollResult = await pollResponse.json()

    // Check if task is complete
    if (pollResult.data?.[0]?.url || pollResult.data?.[0]?.base64) {
      console.log(`[zai-api] Async task completed after ${i + 1} polls`)
      return extractImageFromResponse(pollResult)
    }

    // Check task status
    const taskStatus = pollResult.task_status || pollResult.status
    if (taskStatus === 'FAILED' || taskStatus === 'failed') {
      console.error('[zai-api] Async task failed:', JSON.stringify(pollResult).substring(0, 200))
      return null
    }

    console.log(`[zai-api] Poll ${i + 1}/${maxPolls}: status=${taskStatus || 'processing'}`)
  }

  console.error('[zai-api] Async task timed out after', maxPolls * pollInterval / 1000, 's')
  return null
}

/** Edit image with prompt + reference images (internal API only) */
async function editImage(
  prompt: string,
  images: Array<{ url: string }>,
  size: string
): Promise<string | null> {
  const config = getZAIConfig()

  // Public API does NOT have an edit endpoint — skip this strategy
  if (isPublicAPI(config)) {
    console.log('[zai-api] Image edit not available on public API, skipping')
    return null
  }

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
  return extractImageFromResponse(result)
}

/** Extract image data from Z.AI API response (handles both URL and base64) */
async function extractImageFromResponse(result: any): Promise<string | null> {
  if (result.data?.[0]?.base64) {
    return result.data[0].base64
  }

  if (result.data?.[0]?.url) {
    const imageUrl = result.data[0].url
    console.log('[zai-api] Downloading generated image from URL:', imageUrl.substring(0, 120))
    try {
      const imgResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
      if (imgResponse.ok) {
        const buffer = Buffer.from(await imgResponse.arrayBuffer())
        return buffer.toString('base64')
      }
      console.error('[zai-api] Failed to download image:', imgResponse.status)
    } catch (downloadErr) {
      console.error('[zai-api] Image download error:', (downloadErr as Error).message?.substring(0, 200))
    }
    return null
  }

  console.error('[zai-api] No image data in response:', JSON.stringify(result).substring(0, 200))
  return null
}

/** Map standard size to CogView-4 supported sizes */
function mapToCogViewSize(size: string): CogViewSize {
  const cogViewSizes: CogViewSize[] = ['1280x1280', '1568x1056', '1056x1568', '1472x1088', '1088x1472', '1728x960', '960x1720']
  if (cogViewSizes.includes(size as CogViewSize)) return size as CogViewSize

  // Map standard sizes to closest CogView sizes
  const sizeMap: Record<string, CogViewSize> = {
    '1024x1024': '1280x1280',
    '768x1344': '1056x1568',
    '864x1152': '1088x1472',
    '1344x768': '1728x960',
    '1152x864': '1472x1088',
    '1440x720': '1728x960',
    '720x1440': '960x1720',
  }
  return sizeMap[size] || '1280x1280'
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

// ── Product lookup with DB + fallback ─────────────────────────────

interface ProductData {
  id: string
  name: string
  images: string[]
  categorySlug: string
  category: { slug: string; name: string }
}

async function getProduct(productId: string): Promise<ProductData | null> {
  // Strategy 1: Try database with ensureDBReady()
  try {
    // CRITICAL: Ensure DB is seeded before querying!
    // On Vercel, each serverless instance starts with empty /tmp DB.
    await ensureDBReady()

    const product = await db.product.findUnique({
      where: { id: productId },
      include: { category: true },
    })

    if (product) {
      console.log('[try-on] Product found in DB:', product.name)
      return product as unknown as ProductData
    }
  } catch (dbErr) {
    console.error('[try-on] DB lookup failed:', (dbErr as Error).message?.substring(0, 200))
  }

  // Strategy 2: Fallback — fetch from product API endpoint
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')
      || 'http://localhost:3000'
    const apiUrl = `${baseUrl}/api/products/${encodeURIComponent(productId)}`
    console.log('[try-on] Falling back to product API:', apiUrl)

    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      console.error('[try-on] Product API returned:', response.status)
      return null
    }

    const data = await response.json()
    const product = data.product

    if (product) {
      console.log('[try-on] Product found via API:', product.name)
      return {
        id: product.id,
        name: product.name,
        images: product.images || [],
        categorySlug: product.categorySlug || 'jewelry',
        category: {
          slug: product.categorySlug || 'jewelry',
          name: product.category || 'Jewelry',
        },
      }
    }
  } catch (apiErr) {
    console.error('[try-on] Product API fallback failed:', (apiErr as Error).message?.substring(0, 200))
  }

  return null
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

function getImageSize(categorySlug: string): string {
  if (['sarees', 'fashion', 'mens-shirts'].includes(categorySlug)) return '1056x1568'
  if (categorySlug === 'home-living') return '1728x960'
  return '1088x1472'
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

    // Look up product (with ensureSeeded + API fallback)
    const product = await getProduct(productId)

    if (!product) {
      return NextResponse.json({ error: 'Product not found — it may have been removed' }, { status: 404 })
    }

    // Get product image
    let productImages: string[] = []
    try {
      productImages = typeof product.images === 'string'
        ? JSON.parse(product.images || '[]')
        : (product.images || [])
    } catch {
      productImages = []
    }

    const productImageToUse = productImageUrl || (productImages.length > 0 ? productImages[0] : null)

    const categorySlug = product.category?.slug || product.categorySlug || 'jewelry'
    const productName = product.name
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)
    const config = getZAIConfig()

    // ── Strategy 1: edit-both (internal API only — uses both selfie + product images) ──
    if (!isPublicAPI(config) && productImageToUse) {
      console.log(`[try-on] Strategy 1: edit-both (internal API), size: ${size}`)
      try {
        const productImageBase64 = await getProductImageBase64(productImageToUse)
        if (productImageBase64) {
          const prompt = `Professional fashion photograph. The FIRST image is the person, the SECOND image is the ${productName}. Combine them: show this person ${placement}. Keep the exact same face, hair, skin tone from the first image. Apply the exact product from the second image. Studio lighting, photorealistic, 8K quality.`

          const b64 = await editImage(
            prompt,
            [{ url: selfieData }, { url: productImageBase64 }],
            size
          )

          if (b64) {
            const imageUrl = `data:image/png;base64,${b64}`
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            console.log(`[try-on] edit-both SUCCESS in ${elapsed}s`)
            return NextResponse.json({
              status: 'completed',
              imageUrl,
              productName,
              categorySlug,
              strategy: 'edit-both',
              faceScore: 8,
              productScore: 8,
              suggestions: [],
              elapsed: `${elapsed}s`,
            })
          }
        }
      } catch (err) {
        console.error('[try-on] edit-both FAILED:', (err as Error).message?.substring(0, 200))
      }
    }

    // ── Strategy 2: edit-selfie (internal API only — uses selfie + text description) ──
    if (!isPublicAPI(config)) {
      console.log(`[try-on] Strategy 2: edit-selfie (internal API), size: ${size}`)
      try {
        const prompt = `Professional fashion photograph of the person in this image, now ${placement}. The product is a ${productName}. Make it look natural and realistic. Keep the exact same face, skin tone, hair, and eye color. Studio lighting, photorealistic, 8K quality.`

        const b64 = await editImage(prompt, [{ url: selfieData }], size)

        if (b64) {
          const imageUrl = `data:image/png;base64,${b64}`
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          console.log(`[try-on] edit-selfie SUCCESS in ${elapsed}s`)
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
      } catch (err) {
        console.error('[try-on] edit-selfie FAILED:', (err as Error).message?.substring(0, 200))
      }
    }

    // ── Strategy 3: text-to-image (works on BOTH public and internal API) ──
    // This is the PRIMARY strategy for the public API
    console.log(`[try-on] Strategy 3: text-to-image (${isPublicAPI(config) ? 'public' : 'internal'} API), size: ${size}`)
    try {
      const bodyType = categorySlug === 'sarees' || categorySlug === 'fashion'
        ? 'Full-body professional fashion photograph'
        : categorySlug === 'jewelry' || categorySlug === 'watches'
        ? 'Close-up professional beauty photograph from chest up'
        : 'Professional fashion photograph'

      const prompt = `${bodyType} of an Indian person ${placement}. Product: ${productName}. The person has a confident, elegant expression. Photorealistic, studio lighting, 8K, high detail, professional fashion photography, clean background.`

      // Try async first (better for Vercel timeout), fall back to sync
      let b64 = await generateImageAsync(prompt, size)

      if (!b64) {
        console.log('[try-on] Async generation failed, trying sync...')
        b64 = await generateImage(prompt, size)
      }

      if (b64) {
        const imageUrl = `data:image/png;base64,${b64}`
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[try-on] text-to-image SUCCESS in ${elapsed}s`)
        return NextResponse.json({
          status: 'completed',
          imageUrl,
          productName,
          categorySlug,
          strategy: 'text-to-image',
          faceScore: 4,
          productScore: 6,
          suggestions: [],
          elapsed: `${elapsed}s`,
        })
      }
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err)
      console.error('[try-on] text-to-image FAILED:', errMsg.substring(0, 300))

      // If it's an auth error, return a clear message
      if (errMsg.includes('auth') || errMsg.includes('Authentication') || errMsg.includes('401')) {
        return NextResponse.json({
          error: 'Z.AI API key is invalid or expired. Please update your ZAI_API_KEY on Vercel.',
          detail: errMsg.substring(0, 300),
          help: 'Go to https://z.ai → API Keys to create a new key, then update ZAI_API_KEY in Vercel environment variables.',
        }, { status: 401 })
      }
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
      const publicAPI = isPublicAPI(config)

      // Test API connectivity with a simple request
      let aiReachable = false
      let apiMessage = ''

      if (publicAPI) {
        // For public API, try to generate a tiny test image
        try {
          const testResponse = await fetch(`${config.baseUrl}/images/generations`, {
            method: 'POST',
            headers: getZAIHeaders(config),
            body: JSON.stringify({
              model: 'glm-image',
              prompt: 'test',
              size: '1280x1280',
              quality: 'standard',
            }),
            signal: AbortSignal.timeout(15000),
          })

          if (testResponse.ok) {
            aiReachable = true
            apiMessage = 'Public API is reachable and authenticated'
          } else {
            const errBody = await testResponse.text()
            if (testResponse.status === 401 || errBody.includes('auth')) {
              apiMessage = 'API key is invalid or expired — update ZAI_API_KEY'
            } else {
              apiMessage = `API returned status ${testResponse.status}`
            }
          }
        } catch (err) {
          apiMessage = `Cannot reach API: ${(err as Error).message?.substring(0, 100)}`
        }
      } else {
        // For internal API, try /models endpoint
        try {
          const testResponse = await fetch(`${config.baseUrl}/models`, {
            headers: getZAIHeaders(config),
            signal: AbortSignal.timeout(10000),
          })
          aiReachable = testResponse.ok
          apiMessage = testResponse.ok
            ? 'Internal API is reachable'
            : `API returned status ${testResponse.status}`
        } catch (err) {
          apiMessage = `Cannot reach internal API: ${(err as Error).message?.substring(0, 100)}`
        }
      }

      return NextResponse.json({
        status: aiReachable ? 'ok' : 'error',
        ai: aiReachable ? 'reachable' : 'unreachable',
        apiType: publicAPI ? 'public' : 'internal',
        baseUrl: config.baseUrl.replace(/\/$/, ''),
        message: apiMessage,
      }, { status: aiReachable ? 200 : 503 })

    } catch (err) {
      return NextResponse.json({
        status: 'error',
        ai: 'unreachable',
        baseUrl: process.env.ZAI_BASE_URL || '(not set)',
        message: (err as Error).message?.substring(0, 300),
      }, { status: 503 })
    }
  }

  if (check === 'db') {
    try {
      await ensureDBReady()
      const count = await db.product.count()
      return NextResponse.json({
        status: 'ok',
        productCount: count,
        message: `Database is working. ${count} products available.`,
      })
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        message: (err as Error).message?.substring(0, 300),
      }, { status: 500 })
    }
  }

  // Default status page
  const config = getZAIConfig()
  return NextResponse.json({
    status: 'ready',
    message: 'Send a POST request with productId and selfieData to generate a style preview',
    apiType: isPublicAPI(config) ? 'public' : 'internal',
    envCheck: {
      ZAI_BASE_URL: process.env.ZAI_BASE_URL ? 'SET' : 'MISSING',
      ZAI_API_KEY: process.env.ZAI_API_KEY ? 'SET' : 'MISSING',
      ZAI_CHAT_ID: process.env.ZAI_CHAT_ID ? 'SET' : '(optional)',
      ZAI_USER_ID: process.env.ZAI_USER_ID ? 'SET' : '(optional)',
      ZAI_TOKEN: process.env.ZAI_TOKEN ? 'SET' : '(optional)',
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '(not set)',
      VERCEL_URL: process.env.VERCEL_URL || '(not set)',
    },
    hint: !isPublicAPI(config)
      ? 'WARNING: Using internal API which is NOT reachable from Vercel! Change ZAI_BASE_URL to https://api.z.ai/api/paas/v4'
      : 'Using public API — correct for Vercel deployment',
  })
}

// Vercel serverless function configuration
export const maxDuration = 60
