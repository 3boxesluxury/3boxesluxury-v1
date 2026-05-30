/**
 * Shared ZAI (z-ai-web-dev-sdk) helper with robust configuration.
 *
 * Priority order for configuration:
 *   1. .z-ai-config file (manually read from project root / home / etc)
 *   2. .z-ai-config file (via SDK's built-in ZAI.create())
 *   3. Vercel/Cloud AI Proxy (for local dev - routes through Vercel deployment)
 *   4. Cloud direct proxy (for local dev / Vercel)
 *   5. ZAI_BASE_URL + ZAI_API_KEY + ZAI_TOKEN + ZAI_CHAT_ID + ZAI_USER_ID environment variables
 *
 * When the internal API is unreachable (e.g., from local dev on a user's PC),
 * the system automatically falls back to routing through the Vercel deployment
 * which CAN reach the internal API.
 */

import ZAI from 'z-ai-web-dev-sdk'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

let _cachedZai: InstanceType<typeof ZAI> | null = null

/**
 * Manually read .z-ai-config from known locations.
 * This is more reliable than the SDK's built-in loader, especially on Windows.
 */
function readConfigFileManual(): { config: Record<string, string>; source: string } | null {
  const configPaths = [
    { path: join(process.cwd(), '.z-ai-config'), label: 'project root' },
    { path: join(homedir(), '.z-ai-config'), label: 'home directory' },
    { path: '/etc/.z-ai-config', label: '/etc' },
  ]

  for (const { path: filePath, label } of configPaths) {
    try {
      if (!existsSync(filePath)) continue
      const content = readFileSync(filePath, 'utf-8').trim()
      const parsed = JSON.parse(content)
      if (parsed.baseUrl && parsed.apiKey) {
        return { config: parsed, source: label }
      }
    } catch {
      // File doesn't exist or invalid JSON — skip
    }
  }
  return null
}

/**
 * Read config from environment variables.
 * Supports: ZAI_BASE_URL, ZAI_API_KEY, ZAI_CHAT_ID, ZAI_USER_ID, ZAI_TOKEN
 */
function readConfigFromEnv(): Record<string, string> | null {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey = process.env.ZAI_API_KEY
  if (!baseUrl || !apiKey) return null

  return {
    baseUrl,
    apiKey,
    ...(process.env.ZAI_CHAT_ID ? { chatId: process.env.ZAI_CHAT_ID } : {}),
    ...(process.env.ZAI_USER_ID ? { userId: process.env.ZAI_USER_ID } : {}),
    ...(process.env.ZAI_TOKEN ? { token: process.env.ZAI_TOKEN } : {}),
  }
}

/**
 * Create a ZAI instance from a config object.
 */
function createInstanceFromConfig(config: Record<string, string>): InstanceType<typeof ZAI> {
  return new ZAI({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    ...(config.chatId ? { chatId: config.chatId } : {}),
    ...(config.userId ? { userId: config.userId } : {}),
    ...(config.token ? { token: config.token } : {}),
  } as any)
}

/**
 * Quick connectivity health check — makes a lightweight API call
 * to verify the ZAI service is reachable.
 * Returns true if the API responds, false if unreachable.
 */
async function healthCheck(zai: InstanceType<typeof ZAI>): Promise<boolean> {
  try {
    await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
    })
    return true
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.warn('[zai] Health check FAILED:', errMsg.substring(0, 150))
    return false
  }
}

/**
 * Check if we can reach the cloud proxy server.
 */
async function checkProxyConnectivity(proxyUrl: string, proxyKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${proxyUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Proxy-Key': proxyKey,
        'Authorization': 'Bearer Z.ai',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15000),
    })
    return response.ok || response.status === 200
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.warn('[zai] Proxy health check FAILED:', errMsg.substring(0, 150))
    return false
  }
}

/**
 * The Vercel deployment URL that can proxy AI API requests.
 * This deployment CAN reach internal-api.z.ai from its serverless functions.
 */
const VERCEL_PROXY_URL = process.env.VERCEL_PROXY_URL || 'https://my-project-sepia-seven-42.vercel.app'

/**
 * Check if we can reach the Vercel proxy's try-on endpoint.
 */
async function checkVercelProxy(): Promise<boolean> {
  try {
    const response = await fetch(`${VERCEL_PROXY_URL}/api/config`, {
      signal: AbortSignal.timeout(10000),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function createZAI(): Promise<InstanceType<typeof ZAI>> {
  // Reuse cached instance in the same process (warm lambda / dev server)
  if (_cachedZai) return _cachedZai

  const manualConfig = readConfigFileManual()
  const envConfig = readConfigFromEnv()

  // ── Strategy 1: Direct API via .z-ai-config file ────────────────
  if (manualConfig) {
    console.log(`[zai] Using config from .z-ai-config file (${manualConfig.source})`)
    const instance = createInstanceFromConfig(manualConfig.config)
    const isHealthy = await healthCheck(instance)
    if (isHealthy) {
      _cachedZai = instance
      return _cachedZai
    }
    console.warn('[zai] .z-ai-config (project root) loaded but API unreachable. Trying other methods...')
  }

  // ── Strategy 2: SDK's built-in config loader ────────────────────
  try {
    const sdkInstance = await ZAI.create()
    console.log('[zai] Using config from .z-ai-config file (via SDK)')
    const isHealthy = await healthCheck(sdkInstance)
    if (isHealthy) {
      _cachedZai = sdkInstance
      return _cachedZai
    }
    console.warn('[zai] SDK config loaded but API unreachable.')
  } catch {
    // SDK couldn't load config — skip
  }

  // ── Strategy 3: Vercel AI Proxy ─────────────────────────────────
  // The Vercel deployment's API routes can reach internal-api.z.ai.
  // We route through the Vercel deployment's /api/ai-proxy endpoint.
  const vercelProxyBaseUrl = `${VERCEL_PROXY_URL}/api/ai-proxy`
  const proxyKey = process.env.AI_PROXY_KEY || '3boxes-proxy-2025-secure'

  console.log(`[zai] Trying Vercel proxy: ${vercelProxyBaseUrl}`)
  const vercelProxyHealthy = await checkProxyConnectivity(vercelProxyBaseUrl, proxyKey)

  if (vercelProxyHealthy) {
    console.log('[zai] Vercel proxy is reachable! Using Vercel as API base.')
    const mergedConfig = manualConfig?.config || envConfig || {}
    const proxyInstance = new ZAI({
      baseUrl: vercelProxyBaseUrl,
      apiKey: mergedConfig.apiKey || 'Z.ai',
      ...(mergedConfig.chatId ? { chatId: mergedConfig.chatId } : {}),
      ...(mergedConfig.userId ? { userId: mergedConfig.userId } : {}),
      ...(mergedConfig.token ? { token: mergedConfig.token } : {}),
    } as any)

    _cachedZai = proxyInstance
    ;(_cachedZai as any).__isProxy = true
    ;(_cachedZai as any).__isVercelProxy = true
    ;(_cachedZai as any).__proxyKey = proxyKey
    ;(_cachedZai as any).__proxyUrl = vercelProxyBaseUrl
    return _cachedZai
  }

  // ── Strategy 4: Cloud Direct Proxy ──────────────────────────────
  const directProxyUrl = process.env.AI_PROXY_URL || 'https://boxes3.space.z.ai/api/ai-proxy'

  console.log(`[zai] Trying cloud direct proxy: ${directProxyUrl}`)
  const directProxyHealthy = await checkProxyConnectivity(directProxyUrl, proxyKey)

  if (directProxyHealthy) {
    console.log('[zai] Cloud direct proxy is reachable! Using proxy as API base.')
    const mergedConfig = manualConfig?.config || envConfig || {}
    const proxyInstance = new ZAI({
      baseUrl: directProxyUrl,
      apiKey: mergedConfig.apiKey || 'Z.ai',
      ...(mergedConfig.chatId ? { chatId: mergedConfig.chatId } : {}),
      ...(mergedConfig.userId ? { userId: mergedConfig.userId } : {}),
      ...(mergedConfig.token ? { token: mergedConfig.token } : {}),
    } as any)

    _cachedZai = proxyInstance
    ;(_cachedZai as any).__isProxy = true
    ;(_cachedZai as any).__proxyKey = proxyKey
    ;(_cachedZai as any).__proxyUrl = directProxyUrl
    return _cachedZai
  }

  // ── Strategy 5: Environment variables (with full credentials) ───
  if (envConfig) {
    console.log('[zai] Using config from environment variables (baseUrl=' + envConfig.baseUrl + ')')
    const envInstance = createInstanceFromConfig(envConfig)
    const isHealthy = await healthCheck(envInstance)
    if (isHealthy) {
      _cachedZai = envInstance
      return _cachedZai
    }
    console.warn('[zai] Env vars loaded but API unreachable.')
  }

  // ── Strategy 6: Use config file anyway (temporary network issue) ─
  if (manualConfig) {
    console.warn('[zai] Using .z-ai-config despite health check failure (likely temporary)')
    _cachedZai = createInstanceFromConfig(manualConfig.config)
    ;(_cachedZai as any).__isProxy = false
    return _cachedZai
  }

  // ── No working config found ─────────────────────────────────────
  throw new Error(
    'AI service is not configured or unreachable. ' +
    'Create a .z-ai-config file in your project root (next to package.json), ' +
    'or set ZAI_BASE_URL and ZAI_API_KEY environment variables. ' +
    'See DEPLOY.md for details.'
  )
}

/**
 * Check if the current ZAI instance is using a proxy.
 */
export function isProxyMode(zai: InstanceType<typeof ZAI>): boolean {
  return !!(zai as any).__isProxy
}

/**
 * Check if the current ZAI instance is using the Vercel proxy.
 */
export function isVercelProxy(zai: InstanceType<typeof ZAI>): boolean {
  return !!(zai as any).__isVercelProxy
}

/**
 * Get the Vercel proxy URL for forwarding try-on requests.
 */
export function getVercelProxyUrl(): string {
  return VERCEL_PROXY_URL
}

/**
 * Get proxy headers to add to API requests when using proxy mode.
 */
export function getProxyHeaders(zai: InstanceType<typeof ZAI>): Record<string, string> {
  if (!(zai as any).__isProxy) return {}
  return {
    'X-AI-Proxy-Key': (zai as any).__proxyKey || '',
  }
}

/**
 * Get the proxy URL.
 */
export function getProxyUrl(zai: InstanceType<typeof ZAI>): string {
  return (zai as any).__proxyUrl || ''
}

/**
 * Reset the cached instance (useful when env vars change at runtime).
 */
export function resetZAI(): void {
  _cachedZai = null
}
