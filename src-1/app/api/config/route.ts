/**
 * API Config Route — provides frontend with the AI proxy URL.
 *
 * The Z.AI platform (preview-chat-*.space-z.ai) provides a public
 * /api/try-on endpoint that proxies to the internal AI API.
 * This route tells the frontend which proxy URL to use.
 */

import { NextResponse } from 'next/server'

// The Z.AI platform chat ID from .z-ai-config
const ZAI_CHAT_ID = process.env.ZAI_CHAT_ID || 'chat-eeb868c8-9041-42f2-be71-d4045dd60c00'

export async function GET() {
  // The Z.AI platform provides a publicly-accessible try-on API
  // Pattern: https://preview-chat-{chatId}.space-z.ai
  const aiProxyUrl = process.env.AI_PROXY_URL ||
    `https://preview-chat-${ZAI_CHAT_ID}.space-z.ai`

  const isVercel = !!process.env.VERCEL

  return NextResponse.json({
    aiProxyUrl,
    isVercel,
  })
}
