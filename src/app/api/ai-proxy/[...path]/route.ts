/**
 * AI Proxy API Route — forwards requests to the internal ZAI API.
 *
 * This proxy allows external clients (local dev, Vercel, etc.) to reach
 * the internal AI API (internal-api.z.ai) which is only accessible from
 * within the cloud server's network.
 *
 * Security: Requires a valid proxy key in the X-AI-Proxy-Key header
 * or in the ?proxyKey= query parameter.
 *
 * Usage: POST /api/ai-proxy/chat/completions
 *        POST /api/ai-proxy/images/generations
 *        POST /api/ai-proxy/images/generations/edit
 *        etc.
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const INTERNAL_API_BASE = 'https://internal-api.z.ai/v1'

// Load the ZAI config from .z-ai-config OR environment variables
function loadZaiConfig(): Record<string, string> {
  // First try: .z-ai-config file
  const configPaths = [
    join(process.cwd(), '.z-ai-config'),
    join(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]
  for (const filePath of configPaths) {
    try {
      if (!existsSync(filePath)) continue
      const content = readFileSync(filePath, 'utf-8').trim()
      const config = JSON.parse(content)
      if (config.baseUrl && config.apiKey) return config
    } catch { /* skip */ }
  }

  // Second try: environment variables
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (baseUrl && apiKey) {
    return {
      baseUrl,
      apiKey,
      ...(process.env.ZAI_CHAT_ID ? { chatId: process.env.ZAI_CHAT_ID } : {}),
      ...(process.env.ZAI_USER_ID ? { userId: process.env.ZAI_USER_ID } : {}),
      ...(process.env.ZAI_TOKEN ? { token: process.env.ZAI_TOKEN } : {}),
    }
  }

  return {}
}

// The proxy key — set this in your .env as AI_PROXY_KEY
// If not set, a default key is used (change in production!)
function getProxyKey(): string {
  return process.env.AI_PROXY_KEY || '3boxes-proxy-2025-secure'
}

function isProxyKeyValid(request: NextRequest): boolean {
  const key = getProxyKey()

  // Check header
  const headerKey = request.headers.get('x-ai-proxy-key')
  if (headerKey === key) return true

  // Check query parameter
  const url = new URL(request.url)
  const queryKey = url.searchParams.get('proxyKey')
  if (queryKey === key) return true

  return false
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Verify proxy key
  if (!isProxyKeyValid(request)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide valid X-AI-Proxy-Key header.' },
      { status: 401 }
    )
  }

  const { path } = await params
  const apiPath = path.join('/')
  const targetUrl = `${INTERNAL_API_BASE}/${apiPath}`

  try {
    // Read the request body
    const body = await request.json()

    // Forward headers (minus host and proxy key)
    const zaiConfig = loadZaiConfig()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${zaiConfig.apiKey || 'Z.ai'}`,
      'X-Z-AI-From': 'Z',
    }

    // Always include token, chatId, userId from config if not provided by client
    const chatId = request.headers.get('x-chat-id') || zaiConfig.chatId
    if (chatId) headers['X-Chat-Id'] = chatId
    const userId = request.headers.get('x-user-id') || zaiConfig.userId
    if (userId) headers['X-User-Id'] = userId
    const token = request.headers.get('x-token') || zaiConfig.token
    if (token) headers['X-Token'] = token

    console.log(`[ai-proxy] Forwarding POST /${apiPath}`)

    // Forward the request to internal API
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000), // 2 minute timeout for image generation
    })

    // Check content type to handle both JSON and binary responses
    const contentType = response.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const data = await response.json()

      if (!response.ok) {
        console.error(`[ai-proxy] API error ${response.status}:`, JSON.stringify(data).substring(0, 200))
        return NextResponse.json(data, { status: response.status })
      }

      return NextResponse.json(data)
    } else {
      // Binary response (e.g., image data)
      const buffer = Buffer.from(await response.arrayBuffer())
      console.log(`[ai-proxy] Response: binary, ${buffer.length} bytes, status ${response.status}`)

      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
        },
      })
    }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error(`[ai-proxy] Error forwarding to /${apiPath}:`, errMsg.substring(0, 300))
    return NextResponse.json(
      { error: 'Proxy request failed', detail: errMsg.substring(0, 200) },
      { status: 502 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Verify proxy key
  if (!isProxyKeyValid(request)) {
    return NextResponse.json(
      { error: 'Unauthorized. Provide valid X-AI-Proxy-Key header.' },
      { status: 401 }
    )
  }

  const { path } = await params
  const apiPath = path.join('/')
  const url = new URL(request.url)
  const queryString = url.searchParams.toString()
  const targetUrl = `${INTERNAL_API_BASE}/${apiPath}${queryString ? '?' + queryString : ''}`

  try {
    const zaiConfig = loadZaiConfig()
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${zaiConfig.apiKey || 'Z.ai'}`,
      'X-Z-AI-From': 'Z',
    }

    const chatId = request.headers.get('x-chat-id') || zaiConfig.chatId
    if (chatId) headers['X-Chat-Id'] = chatId
    const userId = request.headers.get('x-user-id') || zaiConfig.userId
    if (userId) headers['X-User-Id'] = userId
    const token = request.headers.get('x-token') || zaiConfig.token
    if (token) headers['X-Token'] = token

    console.log(`[ai-proxy] Forwarding GET /${apiPath}`)

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    })

    const contentType = response.headers.get('content-type') || 'application/json'

    if (contentType.includes('application/json')) {
      const data = await response.json()
      return NextResponse.json(data, { status: response.status })
    } else {
      const buffer = Buffer.from(await response.arrayBuffer())
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Content-Length': buffer.length.toString(),
        },
      })
    }
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.error(`[ai-proxy] Error forwarding GET to /${apiPath}:`, errMsg.substring(0, 300))
    return NextResponse.json(
      { error: 'Proxy request failed', detail: errMsg.substring(0, 200) },
      { status: 502 }
    )
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Headers': 'Content-Type, Authorization, X-AI-Proxy-Key, X-Chat-Id, X-User-Id, X-Token',
      'Access-Control-Max-Age': '86400',
    },
  })
}
