/**
 * Shared ZAI (z-ai-web-dev-sdk) helper with robust configuration.
 *
 * Priority order for configuration:
 *   1. Environment variables (ZAI_BASE_URL + ZAI_API_KEY + ZAI_TOKEN etc.)
 *   2. .z-ai-config file (manually read from project root / home / etc)
 *   3. .z-ai-config file (via SDK's built-in ZAI.create())
 *   4. Vercel/Cloud AI Proxy (fallback)
 *
 * ENV vars are checked FIRST because they are the fastest and most reliable
 * method on Vercel serverless — no file I/O, no network health checks needed.
 */

import ZAI from 'z-ai-web-dev-sdk'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

let _cachedZai: InstanceType<typeof ZAI> | null = null

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
 * Manually read .z-ai-config from known locations.
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
 * Quick connectivity health check.
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
      signal: AbortSignal.timeout(10000),
    })
    return response.ok || response.status === 200
  } catch (err) {
    const errMsg = (err as Error)?.message || String(err)
    console.warn('[zai] Proxy health check FAILED:', errMsg.substring(0, 150))
    return false
  }
}

const VERCEL_PROXY_URL = process.env.VERCEL_PROXY_URL || 'https://my-project-sepia-seven-42.vercel.app'

export async function createZAI(): Promise<InstanceType<typeof ZAI>> {
  // Reuse cached instance
  if (_cachedZai) return _cachedZai

  // ── Strategy 1: Environment variables (FASTEST — no I/O needed) ──
  const envConfig = readConfigFromEnv()
  if (envConfig) {
    console.log('[zai] Using config from environment variables (baseUrl=' + envConfig.baseUrl + ')')
    const instance = createInstanceFromConfig(envConfig)
    const isHealthy = await healthCheck(instance)
    if (isHealthy) {
      _cachedZai = instance
      console.log('[zai] Environment variable config OK — AI service connected')
      return _cachedZai
    }
    console.warn('[zai] Env vars loaded but health check failed. Trying other methods...')
  }

  // ── Strategy 2: Direct API via .z-ai-config file ────────────────
  const manualConfig = readConfigFileManual()
  if (manualConfig) {
    console.log(`[zai] Using config from .z-ai-config file (${manualConfig.source})`)
    const instance = createInstanceFromConfig(manualConfig.config)
    const isHealthy = await healthCheck(instance)
    if (isHealthy) {
      _cachedZai = instance
      return _cachedZai
    }
    console.warn('[zai] .z-ai-config loaded but API unreachable. Trying other methods...')
  }

  // ── Strategy 3: SDK's built-in config loader ────────────────────
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

  // ── Strategy 4: Vercel AI Proxy ─────────────────────────────────
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

  // ── Strategy 5: Use config file despite health check failure ────
  if (manualConfig) {
    console.warn('[zai] Using .z-ai-config despite health check failure (likely temporary)')
    _cachedZai = createInstanceFromConfig(manualConfig.config)
    ;(_cachedZai as any).__isProxy = false
    return _cachedZai
  }

  // ── Strategy 6: Use env vars despite health check failure ──────
  if (envConfig) {
    console.warn('[zai] Using env vars despite health check failure (likely temporary)')
    _cachedZai = createInstanceFromConfig(envConfig)
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
