/**
 * Shared ZAI (z-ai-web-dev-sdk) helper — SIMPLIFIED for Vercel Serverless
 *
 * This version skips health checks (they add latency and can fail on Vercel).
 * Just reads env vars and creates the SDK instance directly.
 *
 * Required environment variables on Vercel:
 *   ZAI_BASE_URL  — e.g. https://internal-api.z.ai/v1
 *   ZAI_API_KEY   — e.g. Z.ai
 *   ZAI_CHAT_ID   — e.g. chat-eeb868c8-...
 *   ZAI_USER_ID   — e.g. a891c820-...
 *   ZAI_TOKEN     — JWT token
 */

import ZAI from 'z-ai-web-dev-sdk'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

let _cachedZai: InstanceType<typeof ZAI> | null = null

/**
 * Read config from environment variables.
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
function readConfigFileManual(): Record<string, string> | null {
  const configPaths = [
    join(process.cwd(), '.z-ai-config'),
    join(homedir(), '.z-ai-config'),
    '/etc/.z-ai-config',
  ]

  for (const filePath of configPaths) {
    try {
      if (!existsSync(filePath)) continue
      const content = readFileSync(filePath, 'utf-8').trim()
      const parsed = JSON.parse(content)
      if (parsed.baseUrl && parsed.apiKey) return parsed
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
 * Create and cache a ZAI instance.
 *
 * Priority:
 *   1. Environment variables (fastest, no I/O — best for Vercel)
 *   2. .z-ai-config file
 *   3. SDK's built-in ZAI.create()
 *
 * NO health check — saves 5-30 seconds on cold starts and avoids
 * false failures when the API is reachable from Vercel but not from
 * the health-check's specific endpoint.
 */
export async function createZAI(): Promise<InstanceType<typeof ZAI>> {
  // Reuse cached instance
  if (_cachedZai) return _cachedZai

  // ── Strategy 1: Environment variables ──────────────────────────
  const envConfig = readConfigFromEnv()
  if (envConfig) {
    console.log('[zai] Using config from environment variables (baseUrl=' + envConfig.baseUrl + ')')
    _cachedZai = createInstanceFromConfig(envConfig)
    return _cachedZai
  }

  // ── Strategy 2: .z-ai-config file ──────────────────────────────
  const fileConfig = readConfigFileManual()
  if (fileConfig) {
    console.log('[zai] Using config from .z-ai-config file')
    _cachedZai = createInstanceFromConfig(fileConfig)
    return _cachedZai
  }

  // ── Strategy 3: SDK's built-in config loader ───────────────────
  try {
    const sdkInstance = await ZAI.create()
    console.log('[zai] Using config from SDK built-in loader')
    _cachedZai = sdkInstance
    return _cachedZai
  } catch {
    // SDK couldn't load config — skip
  }

  // ── No config found ────────────────────────────────────────────
  throw new Error(
    'AI service is not configured. ' +
    'Set ZAI_BASE_URL and ZAI_API_KEY environment variables on Vercel, ' +
    'or create a .z-ai-config file in your project root.'
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
 * Get proxy headers to add to API requests when using proxy mode.
 */
export function getProxyHeaders(zai: InstanceType<typeof ZAI>): Record<string, string> {
  if (!(zai as any).__isProxy) return {}
  return {
    'X-AI-Proxy-Key': (zai as any).__proxyKey || '',
  }
}

/**
 * Reset the cached instance (useful when env vars change at runtime).
 */
export function resetZAI(): void {
  _cachedZai = null
}
