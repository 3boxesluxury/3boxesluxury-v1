import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import os from 'os'

/**
 * GET /api/try-on/status
 *
 * Lightweight availability check — does NOT make any API calls.
 * Just verifies the SDK config exists so we don't waste rate-limited quota.
 * Returns { available: boolean, message?: string }
 */
export async function GET() {
  try {
    // Check if z-ai-config exists (same logic as SDK)
    const homeDir = os.homedir()
    const configPaths = [
      join(process.cwd(), '.z-ai-config'),
      join(homeDir, '.z-ai-config'),
      '/etc/.z-ai-config',
    ]

    let configFound = false
    for (const filePath of configPaths) {
      try {
        const configStr = readFileSync(filePath, 'utf-8')
        const config = JSON.parse(configStr)
        if (config.baseUrl && config.apiKey) {
          configFound = true
          break
        }
      } catch {
        // Continue to next path
      }
    }

    if (configFound) {
      return NextResponse.json({ available: true })
    }

    return NextResponse.json({
      available: false,
      message: 'AI service is not configured. Please contact support.',
    })
  } catch {
    return NextResponse.json({
      available: false,
      message: 'Could not check AI availability.',
    })
  }
}
