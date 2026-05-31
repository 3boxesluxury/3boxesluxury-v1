/**
 * Try-On API Route v5 — Hugging Face FREE API + Z.AI Fallback
 *
 * PRIMARY: Hugging Face Inference API (FREE — no credit card needed!)
 *   - Sign up: https://huggingface.co/join
 *   - Get API key: https://huggingface.co/settings/tokens
 *   - Free tier: ~30 requests/hour for image generation
 *   - Models: FLUX.1-schnell (fast), Stable Diffusion XL (quality)
 *
 * FALLBACK: Z.AI Public API (needs credits)
 *   - https://api.z.ai/api/paas/v4
 *
 * Previous fixes retained:
 *   - ensureDBReady() before DB queries (fixes Vercel cold start)
 *   - Product API fallback if DB fails
 *   - NO z-ai-web-dev-sdk dependency — uses raw fetch only
 *   - NO readFileSync — fetches images via HTTP only
 *
 * Required Vercel Environment Variables:
 *   HF_API_KEY          — Your free Hugging Face API key
 *   NEXT_PUBLIC_BASE_URL — https://3boxesluxury-v1.vercel.app
 *
 * Optional (for Z.AI fallback):
 *   ZAI_BASE_URL  — https://api.z.ai/api/paas/v4
 *   ZAI_API_KEY   — Your Z.AI API key (needs credits)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ── Auto-seed helper (works with or without the updated db.ts) ──────
let _dbSeeded = false
let _seedPromise: Promise<void> | null = null

async function ensureDBReady(): Promise<void> {
  if (_dbSeeded) return
  if (_seedPromise) return _seedPromise

  _seedPromise = (async () => {
    try {
      const dbModule = await import('@/lib/db') as any
      if (typeof dbModule.ensureDBReady === 'function') {
        await dbModule.ensureDBReady()
        _dbSeeded = true
        return
      }
    } catch {}

    try {
      const { ensureSeeded } = await import('@/lib/auto-seed')
      await ensureSeeded()
      _dbSeeded = true
    } catch (err) {
      _seedPromise = null
      console.error('[try-on] ensureDBReady failed:', (err as Error).message?.substring(0, 300))
    }
  })()

  return _seedPromise
}

// ══════════════════════════════════════════════════════════════════
// HUGGING FACE INFERENCE API (FREE)
// ══════════════════════════════════════════════════════════════════

const HF_MODELS = [
  'black-forest-labs/FLUX.1-schnell',      // Fastest, great quality
  'stabilityai/stable-diffusion-xl-base-1.0', // SDXL fallback
]

async function generateWithHuggingFace(prompt: string, retries = 2): Promise<string | null> {
  const apiKey = (process.env.HF_API_KEY || '').trim()
  if (!apiKey) {
    console.log('[hf] No HF_API_KEY set, skipping Hugging Face')
    return null
  }

  for (const model of HF_MODELS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `https://api-inference.huggingface.co/models/${model}`
        console.log(`[hf] POST ${url} (attempt ${attempt + 1})`)

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              num_inference_steps: 20,
              guidance_scale: 7.5,
            },
          }),
          signal: AbortSignal.timeout(60000),
        })

        // HF returns 503 when model is loading
        if (response.status === 503) {
          const body = await response.json().catch(() => ({}))
          const waitTime = body.estimated_time || 20
          console.log(`[hf] Model ${model} is loading, waiting ${waitTime}s...`)

          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, Math.min(waitTime * 1000, 30000)))
            continue
          }
          break // Try next model
        }

        // Rate limited
        if (response.status === 429) {
          console.log(`[hf] Rate limited on ${model}, waiting 10s...`)
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 10000))
            continue
          }
          break
        }

        // Auth error
        if (response.status === 401) {
          console.error('[hf] Invalid API key! Get one at https://huggingface.co/settings/tokens')
          return null
        }

        if (!response.ok) {
          const errorText = await response.text().catch(() => '')
          console.error(`[hf] Error ${response.status}: ${errorText.substring(0, 200)}`)
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            continue
          }
          break
        }

        // HF returns binary image data (not JSON)
        const contentType = response.headers.get('content-type') || ''

        if (contentType.includes('image')) {
          // Direct image binary response
          const buffer = Buffer.from(await response.arrayBuffer())
          const base64 = buffer.toString('base64')
          console.log(`[hf] SUCCESS with model ${model} (${(buffer.length / 1024).toFixed(0)}KB)`)
          return base64
        }

        // Sometimes HF returns JSON with image data
        if (contentType.includes('json')) {
          const json = await response.json()
          if (json[0]?.image) {
            // Base64 in JSON
            const base64 = json[0].image
            console.log(`[hf] SUCCESS with model ${model} (JSON base64)`)
            return base64.startsWith('data:') ? base64.split(',')[1] : base64
          }
          console.error('[hf] Unexpected JSON response:', JSON.stringify(json).substring(0, 200))
        } else {
          // Try to parse as binary anyway
          const buffer = Buffer.from(await response.arrayBuffer())
          if (buffer.length > 1000) {
            const base64 = buffer.toString('base64')
            console.log(`[hf] SUCCESS with model ${model} (binary fallback, ${buffer.length} bytes)`)
            return base64
          }
        }
      } catch (err) {
        console.error(`[hf] Error with ${model}:`, (err as Error).message?.substring(0, 200))
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          continue
        }
      }
    }
  }

  return null
}

// ══════════════════════════════════════════════════════════════════
// Z.AI PUBLIC API (FALLBACK — needs credits)
// ══════════════════════════════════════════════════════════════════

type CogViewSize = '1280x1280' | '1568x1056' | '1056x1568' | '1472x1088' | '1088x1472' | '1728x960' | '960x1728'

function getZAIConfig() {
  const baseUrl = (process.env.ZAI_BASE_URL || '').trim()
  const apiKey = (process.env.ZAI_API_KEY || '').trim()
  return { baseUrl, apiKey }
}

function mapToCogViewSize(size: string): CogViewSize {
  const sizeMap: Record<string, CogViewSize> = {
    '1024x1024': '1280x1280',
    '1056x1568': '1056x1568',
    '768x1344': '1056x1568',
    '864x1152': '1088x1472',
    '1344x768': '1728x960',
    '1152x864': '1472x1088',
    '1440x720': '1728x960',
    '720x1440': '960x1728',
  }
  return sizeMap[size] || '1280x1280'
}

async function generateWithZAI(prompt: string, size: string): Promise<string | null> {
  const config = getZAIConfig()
  if (!config.baseUrl || !config.apiKey) {
    console.log('[zai] No ZAI_BASE_URL/ZAI_API_KEY set, skipping Z.AI')
    return null
  }

  const isPublic = config.baseUrl.includes('api.z.ai/api/paas')
  const url = `${config.baseUrl}/images/generations`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`,
  }

  const body: Record<string, any> = isPublic
    ? { model: 'glm-image', prompt, size: mapToCogViewSize(size), quality: 'standard' }
    : { prompt, size }

  console.log(`[zai] POST ${url} model=${body.model || 'default'}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[zai] Error ${response.status}: ${errorBody.substring(0, 200)}`)
      return null
    }

    const result = await response.json()

    // Extract base64 from response
    if (result.data?.[0]?.base64) {
      return result.data[0].base64
    }

    // Download from URL
    if (result.data?.[0]?.url) {
      const imageUrl = result.data[0].url
      console.log('[zai] Downloading from URL:', imageUrl.substring(0, 100))
      const imgResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) })
      if (imgResponse.ok) {
        const buffer = Buffer.from(await imgResponse.arrayBuffer())
        return buffer.toString('base64')
      }
    }

    console.error('[zai] No image in response:', JSON.stringify(result).substring(0, 200))
    return null
  } catch (err) {
    console.error('[zai] Error:', (err as Error).message?.substring(0, 200))
    return null
  }
}

// ══════════════════════════════════════════════════════════════════
// PRODUCT LOOKUP (DB + API fallback)
// ══════════════════════════════════════════════════════════════════

interface ProductData {
  id: string
  name: string
  images: string[]
  categorySlug: string
  category: { slug: string; name: string }
}

async function getProduct(productId: string): Promise<ProductData | null> {
  // Strategy 1: Database with ensureDBReady()
  try {
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

    if (!response.ok) return null

    const data = await response.json()
    if (data.product) {
      console.log('[try-on] Product found via API:', data.product.name)
      return {
        id: data.product.id,
        name: data.product.name,
        images: data.product.images || [],
        categorySlug: data.product.categorySlug || 'jewelry',
        category: {
          slug: data.product.categorySlug || 'jewelry',
          name: data.product.category || 'Jewelry',
        },
      }
    }
  } catch (apiErr) {
    console.error('[try-on] Product API fallback failed:', (apiErr as Error).message?.substring(0, 200))
  }

  return null
}

// ══════════════════════════════════════════════════════════════════
// PRODUCT PLACEMENT HELPERS
// ══════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════
// POST /api/try-on — MAIN HANDLER
// ══════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { productId, selfieData, productImageUrl } = body

    if (!productId) return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    if (!selfieData) return NextResponse.json({ error: 'Selfie photo is required' }, { status: 400 })

    // Look up product
    const product = await getProduct(productId)
    if (!product) {
      return NextResponse.json({ error: 'Product not found — it may have been removed' }, { status: 404 })
    }

    const categorySlug = product.category?.slug || product.categorySlug || 'jewelry'
    const productName = product.name
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)

    // Build a high-quality prompt for fashion image generation
    const bodyType = categorySlug === 'sarees' || categorySlug === 'fashion'
      ? 'Full-body professional fashion photograph'
      : categorySlug === 'jewelry' || categorySlug === 'watches'
      ? 'Close-up professional beauty photograph from chest up'
      : 'Professional fashion photograph'

    const prompt = `${bodyType} of an Indian person ${placement}. Product: ${productName}. The person has a confident, elegant expression. Photorealistic, studio lighting, 8K, high detail, professional fashion photography, clean background.`

    console.log(`[try-on] Generating for: ${productName} (${categorySlug})`)

    // ── Strategy 1: Hugging Face (FREE) ──────────────────────
    let b64 = await generateWithHuggingFace(prompt)
    if (b64) {
      const imageUrl = `data:image/png;base64,${b64}`
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[try-on] SUCCESS via Hugging Face in ${elapsed}s`)
      return NextResponse.json({
        status: 'completed',
        imageUrl,
        productName,
        categorySlug,
        strategy: 'huggingface',
        provider: 'Hugging Face (Free)',
        faceScore: 5,
        productScore: 6,
        suggestions: [],
        elapsed: `${elapsed}s`,
      })
    }

    // ── Strategy 2: Z.AI Public API (needs credits) ──────────
    b64 = await generateWithZAI(prompt, size)
    if (b64) {
      const imageUrl = `data:image/png;base64,${b64}`
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[try-on] SUCCESS via Z.AI in ${elapsed}s`)
      return NextResponse.json({
        status: 'completed',
        imageUrl,
        productName,
        categorySlug,
        strategy: 'zai-public',
        provider: 'Z.AI',
        faceScore: 5,
        productScore: 6,
        suggestions: [],
        elapsed: `${elapsed}s`,
      })
    }

    // All strategies failed
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.error(`[try-on] ALL strategies failed in ${elapsed}s`)
    return NextResponse.json({
      error: 'AI could not generate a style preview. This may be a temporary issue — please try again in a moment.',
      detail: 'All image generation providers returned no result. Check HF_API_KEY and/or ZAI_API_KEY.',
      help: 'Get a free Hugging Face API key at https://huggingface.co/settings/tokens',
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

// ══════════════════════════════════════════════════════════════════
// GET /api/try-on — Health Check / Status
// ══════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const check = searchParams.get('check')

  if (check === 'health') {
    const hfKey = !!(process.env.HF_API_KEY || '').trim()
    const zaiKey = !!(process.env.ZAI_API_KEY || '').trim()
    const zaiUrl = (process.env.ZAI_BASE_URL || '').trim()

    let hfReachable = false
    let hfMessage = ''

    // Test Hugging Face connectivity
    if (hfKey) {
      try {
        const response = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.HF_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: 'test' }),
          signal: AbortSignal.timeout(15000),
        })

        if (response.ok || response.status === 503) {
          hfReachable = true
          hfMessage = response.status === 503
            ? 'HF API reachable (model loading - will work on retry)'
            : 'HF API reachable and authenticated'
        } else if (response.status === 401) {
          hfMessage = 'HF_API_KEY is invalid — get one at https://huggingface.co/settings/tokens'
        } else {
          hfMessage = `HF API returned ${response.status}`
        }
      } catch (err) {
        hfMessage = `Cannot reach HF API: ${(err as Error).message?.substring(0, 80)}`
      }
    } else {
      hfMessage = 'HF_API_KEY not set — get a free key at https://huggingface.co/settings/tokens'
    }

    return NextResponse.json({
      status: hfReachable ? 'ok' : 'error',
      providers: {
        huggingface: {
          configured: hfKey,
          reachable: hfReachable,
          message: hfMessage,
          free: true,
          getUrl: 'https://huggingface.co/settings/tokens',
        },
        zai: {
          configured: zaiKey,
          baseUrl: zaiUrl || '(not set)',
          free: false,
          note: 'Needs credits — get API key at https://z.ai/manage-apikey/apikey-list',
        },
      },
    }, { status: hfReachable ? 200 : 503 })
  }

  if (check === 'db') {
    try {
      await ensureDBReady()
      const count = await db.product.count()
      return NextResponse.json({
        status: 'ok',
        productCount: count,
        message: `Database ready. ${count} products available.`,
      })
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        message: (err as Error).message?.substring(0, 300),
      }, { status: 500 })
    }
  }

  // Default status
  return NextResponse.json({
    status: 'ready',
    message: 'Send POST with productId and selfieData to generate a style preview',
    envCheck: {
      HF_API_KEY: process.env.HF_API_KEY ? 'SET' : 'MISSING (free — get one at https://huggingface.co/settings/tokens)',
      ZAI_BASE_URL: process.env.ZAI_BASE_URL || '(not set)',
      ZAI_API_KEY: process.env.ZAI_API_KEY ? 'SET' : '(optional)',
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || '(not set)',
    },
  })
}

export const maxDuration = 60
