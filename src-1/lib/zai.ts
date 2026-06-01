/**
 * Z.AI API Helper — SIMPLIFIED for Vercel Serverless
 *
 * This version uses RAW FETCH only — no z-ai-web-dev-sdk dependency.
 * This eliminates the "Unexpected token '<'" error caused by missing SDK import.
 *
 * Required environment variables on Vercel:
 *   ZAI_BASE_URL  — e.g. https://internal-api.z.ai/v1
 *   ZAI_API_KEY   — e.g. Z.ai
 *   ZAI_CHAT_ID   — e.g. chat-eeb868c8-...
 *   ZAI_USER_ID   — e.g. a891c820-...
 *   ZAI_TOKEN     — JWT token
 *
 * NOTE: If you want to use the SDK instead, run:
 *   npm install z-ai-web-dev-sdk
 * But the route.ts no longer requires it — this file is kept
 * for backward compatibility only.
 */

// ── Configuration ──────────────────────────────────────────────

export interface ZAIConfig {
  baseUrl: string
  apiKey: string
  chatId?: string
  userId?: string
  token?: string
}

export function getZAIConfig(): ZAIConfig {
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
    chatId: process.env.ZAI_CHAT_ID,
    userId: process.env.ZAI_USER_ID,
    token: process.env.ZAI_TOKEN,
  }
}

export function getZAIHeaders(config: ZAIConfig): Record<string, string> {
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

// ── Image Generation (raw fetch) ───────────────────────────────

type ImageSize = '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440'

export async function generateImage(prompt: string, size: ImageSize = '1024x1024'): Promise<string | null> {
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
    throw new Error(`AI API error ${response.status}: ${errorBody.substring(0, 100)}`)
  }

  const result = await response.json()

  if (result.data?.[0]?.base64) {
    return result.data[0].base64
  }

  if (result.data?.[0]?.url) {
    const imgResponse = await fetch(result.data[0].url, { signal: AbortSignal.timeout(30000) })
    if (imgResponse.ok) {
      const buffer = Buffer.from(await imgResponse.arrayBuffer())
      return buffer.toString('base64')
    }
    return null
  }

  return null
}

// ── Image Edit (raw fetch) ─────────────────────────────────────

export async function editImage(
  prompt: string,
  images: Array<{ url: string }>,
  size: ImageSize = '1024x1024'
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
    throw new Error(`AI edit API error ${response.status}: ${errorBody.substring(0, 100)}`)
  }

  const result = await response.json()

  if (result.data?.[0]?.base64) {
    return result.data[0].base64
  }

  if (result.data?.[0]?.url) {
    const imgResponse = await fetch(result.data[0].url, { signal: AbortSignal.timeout(30000) })
    if (imgResponse.ok) {
      const buffer = Buffer.from(await imgResponse.arrayBuffer())
      return buffer.toString('base64')
    }
    return null
  }

  return null
}

// ── Chat Completions (raw fetch) ────────────────────────────────

export async function chatCompletion(
  messages: Array<{ role: string; content: string }>,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string | null> {
  const config = getZAIConfig()
  const url = `${config.baseUrl}/chat/completions`
  const headers = getZAIHeaders(config)

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      messages,
      thinking: { type: 'disabled' },
      ...options,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Chat API error ${response.status}: ${errorBody.substring(0, 100)}`)
  }

  const result = await response.json()
  return result.choices?.[0]?.message?.content || null
}

// ── Backward-compatible exports ─────────────────────────────────

/**
 * @deprecated The route.ts no longer uses this. Kept for backward compatibility.
 * If you still need the SDK-based approach, install z-ai-web-dev-sdk first.
 */
export async function createZAI() {
  throw new Error(
    'createZAI() is deprecated. The try-on route now uses raw fetch. ' +
    'You do NOT need z-ai-web-dev-sdk installed. Just set the ZAI_* environment variables.'
  )
}

export function isProxyMode(): boolean { return false }
export function isVercelProxy(): boolean { return false }
export function getProxyHeaders(): Record<string, string> { return {} }
export function resetZAI(): void { /* no-op */ }
