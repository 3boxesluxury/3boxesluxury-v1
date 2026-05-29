/**
 * Shared ZAI (z-ai-web-dev-sdk) helper with robust configuration.
 *
 * Priority order for configuration:
 *   1. .z-ai-config file (manually read from project root / home / etc)
 *   2. .z-ai-config file (via SDK's built-in ZAI.create())
 *   3. ZAI_BASE_URL + ZAI_API_KEY environment variables (fallback)
 *
 * A connectivity health check is performed on first use.
 * If env vars point to an unreachable server, we fall back to config file automatically.
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
function readConfigFileManual(): { instance: InstanceType<typeof ZAI>; source: string } | null {
  const configPaths = [
    { path: join(process.cwd(), '.z-ai-config'), label: 'project root' },
    { path: join(homedir(), '.z-ai-config'), label: 'home directory' },
    { path: '/etc/.z-ai-config', label: '/etc' },
  ]

  for (const { path: filePath, label } of configPaths) {
    try {
      if (!existsSync(filePath)) continue
      const content = readFileSync(filePath, 'utf-8').trim()
      const config = JSON.parse(content)
      if (config.baseUrl && config.apiKey) {
        console.log(`[zai] Using config from .z-ai-config file (${label})`)
        const instance = new ZAI({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          ...(config.chatId ? { chatId: config.chatId } : {}),
          ...(config.userId ? { userId: config.userId } : {}),
          ...(config.token ? { token: config.token } : {}),
        } as any)
        return { instance, source: label }
      }
    } catch {
      // File doesn't exist or invalid JSON — skip
    }
  }
  return null
}

/**
 * Try to load config using the SDK's built-in loader.
 * Returns null if no valid config file is found.
 */
async function loadConfigViaSDK(): Promise<InstanceType<typeof ZAI> | null> {
  try {
    const instance = await ZAI.create()
    console.log('[zai] Using config from .z-ai-config file (via SDK)')
    return instance
  } catch {
    return null
  }
}

/**
 * Create a ZAI instance from environment variables.
 * Returns null if required env vars are missing.
 */
function loadFromEnv(): InstanceType<typeof ZAI> | null {
  const baseUrl = process.env.ZAI_BASE_URL
  const apiKey  = process.env.ZAI_API_KEY

  if (!baseUrl || !apiKey) return null

  const config: Record<string, string> = { baseUrl, apiKey }
  if (process.env.ZAI_CHAT_ID) config.chatId = process.env.ZAI_CHAT_ID
  if (process.env.ZAI_USER_ID) config.userId = process.env.ZAI_USER_ID
  if (process.env.ZAI_TOKEN)    config.token  = process.env.ZAI_TOKEN

  console.log('[zai] Using config from environment variables (baseUrl=' + baseUrl + ')')
  return new ZAI(config as any)
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

export async function createZAI(): Promise<InstanceType<typeof ZAI>> {
  // Reuse cached instance in the same process (warm lambda / dev server)
  if (_cachedZai) return _cachedZai

  // ── Strategy 1: Manually read .z-ai-config file (most reliable) ──
  const manualConfig = readConfigFileManual()

  if (manualConfig) {
    const isHealthy = await healthCheck(manualConfig.instance)
    if (isHealthy) {
      _cachedZai = manualConfig.instance
      return _cachedZai
    }
    console.warn('[zai] .z-ai-config (' + manualConfig.source + ') loaded but API unreachable. Trying other methods...')
  }

  // ── Strategy 2: SDK's built-in config loader ────────────────────
  const sdkConfig = await loadConfigViaSDK()

  if (sdkConfig) {
    const isHealthy = await healthCheck(sdkConfig)
    if (isHealthy) {
      _cachedZai = sdkConfig
      return _cachedZai
    }
    console.warn('[zai] SDK config loaded but API unreachable.')
  }

  // ── Strategy 3: Environment variables ───────────────────────────
  const envInstance = loadFromEnv()

  if (envInstance) {
    const isHealthy = await healthCheck(envInstance)
    if (isHealthy) {
      _cachedZai = envInstance
      return _cachedZai
    }
    console.warn('[zai] Env vars loaded but API unreachable.')
  }

  // ── Strategy 4: Use config file anyway (temporary network issue) ─
  if (manualConfig) {
    console.warn('[zai] Using .z-ai-config despite health check failure (likely temporary)')
    _cachedZai = manualConfig.instance
    return _cachedZai
  }
  if (sdkConfig) {
    console.warn('[zai] Using SDK config despite health check failure (likely temporary)')
    _cachedZai = sdkConfig
    return _cachedZai
  }

  // ── No working config found ─────────────────────────────────────
  throw new Error(
    'AI service is not configured or unreachable. ' +
    'Create a .z-ai-config file in your project root (next to package.json), or set ZAI_BASE_URL and ZAI_API_KEY environment variables. ' +
    'See DEPLOY.md for details.'
  )
}

/**
 * Reset the cached instance (useful when env vars change at runtime).
 */
export function resetZAI(): void {
  _cachedZai = null
}
