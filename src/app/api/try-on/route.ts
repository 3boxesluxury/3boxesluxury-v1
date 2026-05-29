import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createZAI } from '@/lib/zai'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440'

interface TryOnJob {
  status: 'processing' | 'completed' | 'failed'
  imageUrl?: string
  productName?: string
  categorySlug?: string
  error?: string
  createdAt: number
  attempt?: number
  strategy?: string
  faceScore?: number
  productScore?: number
  suggestions?: any[]
  progress?: string
  debugLog?: string[]
}

interface GenResult {
  imageUrl: string
  strategy: string
  faceScore: number
  productScore: number
}

const jobs = new Map<string, TryOnJob>()

// Clean up old jobs every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [id, job] of jobs) {
    if (now - job.createdAt > 10 * 60 * 1000) {
      jobs.delete(id)
    }
  }
}, 5 * 60 * 1000)

// ── Product image helpers ──────────────────────────────────────────

function getProductImageBase64Local(imagePath: string): string | null {
  try {
    const fullPath = join(process.cwd(), 'public', imagePath)
    if (!existsSync(fullPath)) return null
    const buffer = readFileSync(fullPath)
    const ext = imagePath.split('.').pop()?.toLowerCase() || 'jpg'
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch (err) {
    console.error('[try-on] Failed to read local product image:', err)
    return null
  }
}

async function getProductImageBase64(imagePath: string): Promise<string | null> {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    try {
      const response = await fetch(imagePath, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) {
        console.error('[try-on] Failed to fetch external image:', response.status)
        return null
      }
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const mimeType = contentType.split(';')[0].trim()
      const buffer = Buffer.from(await response.arrayBuffer())
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch (err) {
      console.error('[try-on] Failed to fetch external product image:', err)
      return null
    }
  }
  if (imagePath.startsWith('//')) {
    return getProductImageBase64(`https:${imagePath}`)
  }
  if (imagePath.startsWith('/api/image-proxy')) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
      const response = await fetch(`${baseUrl}${imagePath}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return null
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const mimeType = contentType.split(';')[0].trim()
      const buffer = Buffer.from(await response.arrayBuffer())
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    } catch (err) {
      console.error('[try-on] Failed to fetch proxied product image:', err)
      return null
    }
  }
  return getProductImageBase64Local(imagePath)
}

// ── VLM Prompts ────────────────────────────────────────────────────

const VLM_PERSON_PROMPT = `Analyze this person's face and appearance in EXACT detail for a virtual try-on. Describe:
1. Face shape (round/oval/square/heart/oblong), skin tone (light/fair/medium/olive/brown/dark, with warm/cool/neutral undertone)
2. Eyes: shape (almond/round/hooded), color, eyelashes
3. Eyebrows: thickness, shape, color
4. Nose: shape, size relative to face
5. Lips: fullness, color, shape
6. Hair: color, texture (straight/wavy/curly), length, style
7. Chin and jawline shape
8. Any distinctive features (moles, dimples, freckles)
9. Body type and build
10. Current expression and pose
Be extremely specific about skin tone, eye color, hair, and face shape. 4-5 sentences.`

const VLM_PRODUCT_PROMPT = `Describe this fashion/luxury product in EXACT detail for a virtual try-on. Describe:
1. Type and name (saree, necklace, shirt, watch, etc.)
2. EXACT primary color (not just "red" - say "deep maroon red" or "rose pink")
3. Secondary colors and accents
4. Pattern: floral/geometric/solid/striped/paisley/embroidered - describe the pattern precisely
5. Material and texture: silk sheen/matte cotton/shiny gold/satin/mesh - be specific
6. Key design details: borders, embellishments, gemstones, stitching, collar style
7. How it would be worn on the body (draped, fitted, layered, etc.)
8. Size/coverage: how much of the body does it cover
Be extremely specific about color, material, and pattern. 4-5 sentences.`

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

// ── Category pairing for suggestions ───────────────────────────────

function getPairingCategory(categorySlug: string): string[] {
  const pairs: Record<string, string[]> = {
    'sarees': ['jewelry'],
    'jewelry': ['sarees', 'fashion'],
    'watches': ['mens-shirts', 'leather-goods'],
    'mens-shirts': ['watches', 'leather-goods'],
    'fashion': ['jewelry', 'watches'],
    'fragrances': ['jewelry', 'fashion'],
    'leather-goods': ['watches', 'fashion'],
  }
  return pairs[categorySlug] || ['jewelry']
}

// ── POST /api/try-on ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId, selfieData, productImageUrl } = body

    if (!productId || !selfieData) {
      return NextResponse.json({ error: 'Product ID and selfie are required' }, { status: 400 })
    }
    if (!selfieData.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 })
    }

    const product = await db.product.findUnique({
      where: { id: productId },
      include: { category: true },
    })
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const productImages: string[] = JSON.parse(product.images || '[]')
    const productImageToUse = productImageUrl || (productImages.length > 0 ? productImages[0] : null)
    const productImageBase64 = productImageToUse ? await getProductImageBase64(productImageToUse) : null

    if (!productImageBase64) {
      return NextResponse.json({ error: 'Product image not available' }, { status: 400 })
    }

    const pairingCategories = getPairingCategory(product.category.slug)
    const suggestionsPromise = db.product.findMany({
      where: {
        category: { slug: { in: pairingCategories } },
        id: { not: productId },
        stock: { gt: 0 },
      },
      include: { category: true },
      take: 4,
      orderBy: { rating: 'desc' },
    })

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

    jobs.set(jobId, {
      status: 'processing',
      createdAt: Date.now(),
      categorySlug: product.category.slug,
      attempt: 1,
      progress: 'Analyzing your photo and product...',
      debugLog: [],
    })

    backgroundProcess(jobId, product.name, product.category.slug, selfieData, productImageBase64, suggestionsPromise)
      .catch((err) => console.error('[try-on] Background job failed:', err))

    return NextResponse.json({
      jobId,
      status: 'processing',
      productName: product.name,
      categorySlug: product.category.slug,
    })
  } catch (error) {
    console.error('[try-on] API error:', error)
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Unexpected error occurred' }, { status: 500 })
  }
}

// ── GET /api/try-on?jobId=xxx ──────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Job ID required' }, { status: 400 })

  const job = jobs.get(jobId)
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  return NextResponse.json({
    jobId,
    status: job.status,
    imageUrl: job.imageUrl,
    productName: job.productName,
    categorySlug: job.categorySlug,
    error: job.error,
    attempt: job.attempt,
    strategy: job.strategy,
    faceScore: job.faceScore,
    productScore: job.productScore,
    suggestions: job.suggestions,
    progress: job.progress,
    debugLog: job.debugLog,
  })
}

// ── VLM helpers ────────────────────────────────────────────────────

async function vlmAnalyze(zai: any, prompt: string, imageUrl: string, timeoutMs = 30000): Promise<string> {
  try {
    const result = await Promise.race([
      zai.chat.completions.createVision({
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ]}],
        thinking: { type: 'disabled' },
      }),
      new Promise<null>(r => setTimeout(() => r(null), timeoutMs)),
    ])
    return result ? (result.choices[0]?.message?.content || '') : ''
  } catch (err) {
    console.error('[try-on] VLM analyze error:', (err as Error).message?.substring(0, 200))
    return ''
  }
}

async function vlmVerify(
  zai: any, selfieData: string, productImageBase64: string, resultImageUrl: string, productName: string,
): Promise<{ faceScore: number; productScore: number }> {
  try {
    const [faceRes, prodRes] = await Promise.all([
      zai.chat.completions.createVision({
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Compare the FACE in these two images. The FIRST is the original selfie, the SECOND is the AI-generated result. Rate how similar the FACE is from 1 to 10: 1=completely different person, 5=similar ethnicity/gender but different person, 7=same person with changes, 9=same person minor lighting differences, 10=identical. Reply ONLY with: SCORE|BRIEF_REASON` },
          { type: 'image_url', image_url: { url: selfieData } },
          { type: 'image_url', image_url: { url: resultImageUrl } },
        ]}],
        thinking: { type: 'disabled' },
      }),
      zai.chat.completions.createVision({
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Compare the PRODUCT in these two images. The FIRST is the original "${productName}" photo, the SECOND is the AI-generated result. Rate how similar the PRODUCT is from 1 to 10: 1=completely different product, 5=similar type/color, 7=same product minor differences, 9=same product nearly exact, 10=identical. Reply ONLY with: SCORE|BRIEF_REASON` },
          { type: 'image_url', image_url: { url: productImageBase64 } },
          { type: 'image_url', image_url: { url: resultImageUrl } },
        ]}],
        thinking: { type: 'disabled' },
      }),
    ])

    const parseScore = (res: any) => {
      const content = res?.choices?.[0]?.message?.content || ''
      const m = content.match(/(\d+)/)
      return m ? Math.min(10, Math.max(1, parseInt(m[1]))) : 5
    }

    return { faceScore: parseScore(faceRes), productScore: parseScore(prodRes) }
  } catch {
    return { faceScore: 5, productScore: 5 }
  }
}

// ── Generation strategies ──────────────────────────────────────────
// IMPORTANT: The ZAI API requires { images: [{ url: ... }] } format (NOT image: string)
// The SDK type definitions are misleading — always use images array.

interface StrategyResult {
  imageUrl: string | null
  error: string | null
}

async function strategyEditBoth(
  zai: any, selfieData: string, productImageBase64: string,
  productName: string, categorySlug: string, personDesc: string, productDesc: string,
): Promise<StrategyResult> {
  try {
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)

    const prompt = `Professional fashion photograph. The FIRST image is the person, the SECOND image is the ${productName}. Combine them: show this person ${placement}. Keep the exact same face, hair, skin tone from the first image. Apply the exact product from the second image. Studio lighting, photorealistic, 8K quality.`

    console.log(`[try-on] Strategy: edit-both, size: ${size}`)

    const response = await zai.images.generations.edit({
      prompt,
      images: [{ url: selfieData }, { url: productImageBase64 }],
      size,
    } as any)

    const b64 = response.data?.[0]?.base64
    if (!b64) {
      const detail = `edit-both: API returned no image data. Response keys=${Object.keys(response || {}).join(',')}, dataLen=${response?.data?.length}`
      console.error('[try-on]', detail)
      return { imageUrl: null, error: detail }
    }
    console.log('[try-on] edit-both: SUCCESS', (b64.length / 1024).toFixed(0), 'KB')
    return { imageUrl: `data:image/png;base64,${b64}`, error: null }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error('[try-on] edit-both FAILED:', errMsg.substring(0, 300))
    return { imageUrl: null, error: `edit-both: ${errMsg.substring(0, 200)}` }
  }
}

async function strategyEditSelfie(
  zai: any, selfieData: string, productImageBase64: string,
  productName: string, categorySlug: string, personDesc: string, productDesc: string,
): Promise<StrategyResult> {
  try {
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)

    const prompt = `Professional fashion photograph of the person in this image, now ${placement}. The product is: ${productDesc}. Keep the exact same face, skin tone, hair, eye color, and body type. ${personDesc ? `The person has ${personDesc}.` : ''} Studio lighting, photorealistic, 8K quality.`

    console.log(`[try-on] Strategy: edit-selfie, size: ${size}`)

    const response = await zai.images.generations.edit({
      prompt,
      images: [{ url: selfieData }],
      size,
    } as any)

    const b64 = response.data?.[0]?.base64
    if (!b64) {
      const detail = `edit-selfie: API returned no image data. Response keys=${Object.keys(response || {}).join(',')}, dataLen=${response?.data?.length}`
      console.error('[try-on]', detail)
      return { imageUrl: null, error: detail }
    }
    console.log('[try-on] edit-selfie: SUCCESS', (b64.length / 1024).toFixed(0), 'KB')
    return { imageUrl: `data:image/png;base64,${b64}`, error: null }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error('[try-on] edit-selfie FAILED:', errMsg.substring(0, 300))
    return { imageUrl: null, error: `edit-selfie: ${errMsg.substring(0, 200)}` }
  }
}

async function strategyEditProduct(
  zai: any, selfieData: string, productImageBase64: string,
  productName: string, categorySlug: string, personDesc: string, productDesc: string,
): Promise<StrategyResult> {
  try {
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)

    const prompt = `Professional fashion photograph of a person ${placement}. The person has: ${personDesc}. Keep the exact product shown in the image on this person. Studio lighting, photorealistic, 8K quality.`

    console.log(`[try-on] Strategy: edit-product, size: ${size}`)

    const response = await zai.images.generations.edit({
      prompt,
      images: [{ url: productImageBase64 }],
      size,
    } as any)

    const b64 = response.data?.[0]?.base64
    if (!b64) {
      const detail = `edit-product: API returned no image data. Response keys=${Object.keys(response || {}).join(',')}, dataLen=${response?.data?.length}`
      console.error('[try-on]', detail)
      return { imageUrl: null, error: detail }
    }
    console.log('[try-on] edit-product: SUCCESS', (b64.length / 1024).toFixed(0), 'KB')
    return { imageUrl: `data:image/png;base64,${b64}`, error: null }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error('[try-on] edit-product FAILED:', errMsg.substring(0, 300))
    return { imageUrl: null, error: `edit-product: ${errMsg.substring(0, 200)}` }
  }
}

async function strategyCreateDetailed(
  zai: any, productName: string, categorySlug: string, personDesc: string, productDesc: string,
): Promise<StrategyResult> {
  try {
    const placement = getProductPlacement(categorySlug, productName)
    const size = getImageSize(categorySlug)

    const bodyType = categorySlug === 'sarees' || categorySlug === 'fashion'
      ? 'Full-body professional fashion photograph'
      : categorySlug === 'jewelry' || categorySlug === 'watches'
      ? 'Close-up professional beauty photograph from chest up'
      : 'Professional fashion photograph'

    const prompt = `${bodyType} of a person ${placement}. Person: ${personDesc}. Product: ${productDesc}. The person is ${placement}. Photorealistic, studio lighting, 8K, high detail, professional fashion photography.`

    console.log(`[try-on] Strategy: create-detailed, size: ${size}`)

    const response = await zai.images.generations.create({ prompt, size })
    const b64 = response.data?.[0]?.base64
    if (!b64) {
      const detail = `create-detailed: API returned no image data. Response keys=${Object.keys(response || {}).join(',')}, dataLen=${response?.data?.length}`
      console.error('[try-on]', detail)
      return { imageUrl: null, error: detail }
    }
    console.log('[try-on] create-detailed: SUCCESS', (b64.length / 1024).toFixed(0), 'KB')
    return { imageUrl: `data:image/png;base64,${b64}`, error: null }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error('[try-on] create-detailed FAILED:', errMsg.substring(0, 300))
    return { imageUrl: null, error: `create-detailed: ${errMsg.substring(0, 200)}` }
  }
}

// ── Main pipeline with detailed debug logging ──────────────────────

function addLog(job: TryOnJob | undefined, msg: string) {
  if (!job) return
  if (!job.debugLog) job.debugLog = []
  job.debugLog.push(`[${new Date().toISOString().substring(11, 19)}] ${msg}`)
  console.log(`[try-on] ${msg}`)
}

async function backgroundProcess(
  jobId: string, productName: string, categorySlug: string,
  selfieData: string, productImageBase64: string,
  suggestionsPromise: Promise<any>,
) {
  const job = jobs.get(jobId)
  if (!job) return

  const strategyErrors: string[] = []

  try {
    // Step 0: Verify ZAI initialization
    addLog(job, 'Initializing AI service...')
    let zai: any
    try {
      zai = await createZAI()
      addLog(job, 'AI service initialized OK')
    } catch (zaiErr) {
      const msg = `AI init FAILED: ${(zaiErr as Error).message}`
      addLog(job, msg)
      strategyErrors.push(msg)
      throw new Error(msg)
    }

    // Step 1: VLM analysis + suggestions in parallel
    if (job) job.progress = 'AI is analyzing your face and product details...'
    addLog(job, 'Starting VLM analysis...')

    const [suggestions, personDesc, productDesc] = await Promise.all([
      suggestionsPromise,
      vlmAnalyze(zai, VLM_PERSON_PROMPT, selfieData),
      vlmAnalyze(zai, VLM_PRODUCT_PROMPT, productImageBase64),
    ])

    addLog(job, `VLM done. Person: ${personDesc ? personDesc.substring(0, 80) + '...' : 'EMPTY'}`)
    addLog(job, `VLM done. Product: ${productDesc ? productDesc.substring(0, 80) + '...' : 'EMPTY'}`)

    if (!personDesc && !productDesc) {
      addLog(job, 'WARNING: Both VLM descriptions are empty! API may be down.')
    }

    // Store suggestions
    const formattedSuggestions = suggestions.map((s: any) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      image: JSON.parse(s.images || '[]')[0] || '/images/placeholder.jpg',
      category: s.category?.name || '',
      categorySlug: s.category?.slug || '',
    }))
    if (job) job.suggestions = formattedSuggestions

    const results: GenResult[] = []

    // Step 2: Phase 1 — Best strategy: edit-both
    if (job) { job.attempt = 1; job.progress = 'Generating your try-on look (1/3)...' }
    addLog(job, 'Running strategy 1: edit-both (selfie + product images)')
    const aResult = await strategyEditBoth(zai, selfieData, productImageBase64, productName, categorySlug, personDesc, productDesc)
    if (aResult.imageUrl) {
      const v = await vlmVerify(zai, selfieData, productImageBase64, aResult.imageUrl, productName)
      addLog(job, `edit-both OK: Face=${v.faceScore}/10, Product=${v.productScore}/10`)
      results.push({ imageUrl: aResult.imageUrl, strategy: 'edit-both', faceScore: v.faceScore, productScore: v.productScore })
      if (v.faceScore >= 8 && v.productScore >= 7) {
        addLog(job, 'Excellent result! Skipping other strategies.')
        if (job) {
          job.status = 'completed'; job.imageUrl = aResult.imageUrl; job.productName = productName
          job.strategy = 'edit-both'; job.faceScore = v.faceScore; job.productScore = v.productScore; job.progress = 'Complete!'
        }
        return
      }
    } else {
      addLog(job, `edit-both FAILED: ${aResult.error}`)
      strategyErrors.push(aResult.error || 'edit-both: unknown error')
    }

    // Step 3: Phase 2 — 2 strategies in parallel
    if (job) { job.attempt = 2; job.progress = 'Optimizing your preview (2/3)...' }
    addLog(job, 'Running strategies 2+3 in parallel: edit-selfie + edit-product')
    await new Promise(r => setTimeout(r, 1000))

    const [bResult, cResult] = await Promise.all([
      strategyEditSelfie(zai, selfieData, productImageBase64, productName, categorySlug, personDesc, productDesc),
      strategyEditProduct(zai, selfieData, productImageBase64, productName, categorySlug, personDesc, productDesc),
    ])

    // Verify successful results in parallel
    const verifyPromises: Promise<GenResult | null>[] = []
    if (bResult.imageUrl) {
      addLog(job, 'edit-selfie generated image, verifying...')
      verifyPromises.push(
        vlmVerify(zai, selfieData, productImageBase64, bResult.imageUrl, productName).then(v => {
          addLog(job, `edit-selfie OK: Face=${v.faceScore}/10, Product=${v.productScore}/10`)
          return { imageUrl: bResult.imageUrl!, strategy: 'edit-selfie', faceScore: v.faceScore, productScore: v.productScore }
        })
      )
    } else {
      addLog(job, `edit-selfie FAILED: ${bResult.error}`)
      strategyErrors.push(bResult.error || 'edit-selfie: unknown error')
    }
    if (cResult.imageUrl) {
      addLog(job, 'edit-product generated image, verifying...')
      verifyPromises.push(
        vlmVerify(zai, selfieData, productImageBase64, cResult.imageUrl, productName).then(v => {
          addLog(job, `edit-product OK: Face=${v.faceScore}/10, Product=${v.productScore}/10`)
          return { imageUrl: cResult.imageUrl!, strategy: 'edit-product', faceScore: v.faceScore, productScore: v.productScore }
        })
      )
    } else {
      addLog(job, `edit-product FAILED: ${cResult.error}`)
      strategyErrors.push(cResult.error || 'edit-product: unknown error')
    }
    const verifyResults = await Promise.all(verifyPromises)
    for (const r of verifyResults) {
      if (r) results.push(r)
    }

    // Step 4: Phase 3 — Fallback
    const bestSoFar = results.length > 0
      ? results.reduce((a, b) => (b.faceScore * 0.6 + b.productScore * 0.4) > (a.faceScore * 0.6 + a.productScore * 0.4) ? b : a)
      : null

    if (!bestSoFar || (bestSoFar.faceScore < 5 && bestSoFar.productScore < 5)) {
      if (job) { job.attempt = 3; job.progress = 'Creating from descriptions (3/3)...' }
      addLog(job, 'Running fallback strategy: create-detailed (text-to-image)')
      await new Promise(r => setTimeout(r, 1000))
      const dResult = await strategyCreateDetailed(zai, productName, categorySlug, personDesc, productDesc)
      if (dResult.imageUrl) {
        const v = await vlmVerify(zai, selfieData, productImageBase64, dResult.imageUrl, productName)
        addLog(job, `create-detailed OK: Face=${v.faceScore}/10, Product=${v.productScore}/10`)
        results.push({ imageUrl: dResult.imageUrl, strategy: 'create-detailed', faceScore: v.faceScore, productScore: v.productScore })
      } else {
        addLog(job, `create-detailed FAILED: ${dResult.error}`)
        strategyErrors.push(dResult.error || 'create-detailed: unknown error')
      }
    }

    if (results.length === 0) {
      const errorDetail = strategyErrors.join(' | ')
      addLog(job, `ALL STRATEGIES FAILED. Errors: ${errorDetail}`)
      throw new Error(`All strategies failed. Details: ${errorDetail}`)
    }

    // Step 5: Pick best result
    const best = results.reduce((a, b) => {
      const sa = a.faceScore * 0.6 + a.productScore * 0.4
      const sb = b.faceScore * 0.6 + b.productScore * 0.4
      return sb > sa ? b : a
    })

    addLog(job, `Best result: ${best.strategy}, Face=${best.faceScore}/10, Product=${best.productScore}/10`)

    if (job) {
      job.status = 'completed'
      job.imageUrl = best.imageUrl
      job.productName = productName
      job.strategy = best.strategy
      job.faceScore = best.faceScore
      job.productScore = best.productScore
      job.progress = 'Complete!'
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Generation failed'
    addLog(job, `JOB FAILED: ${errMsg}`)
    if (job) {
      job.status = 'failed'
      job.error = errMsg
    }
  }
}

// Increase body size limit for large selfie uploads
export const maxBodyLength = 10 * 1024 * 1024
