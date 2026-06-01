/**
 * Image Upload API Route — Works on Vercel Serverless
 *
 * IMPORTANT: On Vercel serverless, /tmp is PER-FUNCTION-INVOCATION.
 * Files saved to /tmp in one function call are NOT accessible from
 * another function call. This means:
 *   - Image uploaded in POST /api/upload → saved to /tmp
 *   - Image requested in GET /api/uploads/[filename] → DIFFERENT function → /tmp is empty!
 *
 * SOLUTION: On Vercel, we use BASE64 data URLs instead of /tmp filesystem.
 * The base64 data URL is stored directly in the product's images JSON field.
 * This works because:
 *   1. Data URLs render directly in <img src="data:...">
 *   2. No separate GET request needed to serve the file
 *   3. Data survives across all serverless function invocations
 *
 * Priority order:
 * 1. Vercel Blob (@vercel/blob) — Best, needs BLOB_READ_WRITE_TOKEN env var
 * 2. Base64 data URI — Works on Vercel, stored in product's images JSON
 * 3. Local filesystem — Only for local development (public/uploads/)
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Try to import @vercel/blob
let vercelBlob: typeof import('@vercel/blob') | null = null
try {
  vercelBlob = require('@vercel/blob')
} catch {
  console.log('[upload] @vercel/blob not installed, using base64 fallback')
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

const isVercel = process.env.VERCEL === '1'

async function processFile(file: File, folder: string): Promise<string> {
  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`Invalid file type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP, SVG`)
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 5MB`)
  }

  // ── Strategy 1: Vercel Blob (best option) ──
  if (vercelBlob && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const filename = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const blob = await vercelBlob.put(filename, file, {
        access: 'public',
        contentType: file.type,
      })
      console.log(`[upload] Uploaded to Vercel Blob: ${blob.url}`)
      return blob.url
    } catch (blobErr) {
      console.error('[upload] Vercel Blob error:', (blobErr as Error).message?.substring(0, 200))
      // Fall through to base64 strategy
    }
  }

  // ── Strategy 2: Local filesystem (local development only) ──
  if (!isVercel) {
    try {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder)
      await mkdir(uploadDir, { recursive: true })

      const ext = file.name.split('.').pop() || 'jpg'
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substring(2, 8)
      const filename = `product-${timestamp}-${randomStr}.${ext}`
      const filepath = path.join(uploadDir, filename)

      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      await writeFile(filepath, buffer)

      const url = `/uploads/${folder}/${filename}`
      console.log(`[upload] Saved to local filesystem: ${url} (${(buffer.length / 1024).toFixed(0)}KB)`)
      return url
    } catch (fsErr) {
      console.error('[upload] Local filesystem error:', (fsErr as Error).message?.substring(0, 200))
      // Fall through to base64
    }
  }

  // ── Strategy 3: Base64 data URI (Vercel primary / fallback) ──
  // On Vercel, this is the PRIMARY strategy because /tmp is ephemeral.
  // The data URL is stored directly in the product's images JSON field
  // and renders directly in <img src="data:..."> tags.
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // Limit base64 images to 2MB (2.67MB base64) to prevent database bloat
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error(`Image too large for inline storage (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Max 2MB without Vercel Blob. Please use a smaller image or configure Vercel Blob.`)
  }

  const base64 = buffer.toString('base64')
  const dataUri = `data:${file.type};base64,${base64}`
  console.log(`[upload] Converted to base64 data URL (${(buffer.length / 1024).toFixed(0)}KB)`)
  return dataUri
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const folder = (formData.get('folder') as string) || 'products'

    // Collect all files — support both "file" (single) and "files" (multiple)
    const files: File[] = []

    // Check for "files" field (admin panel sends multiple files this way)
    const filesEntries = formData.getAll('files')
    for (const entry of filesEntries) {
      if (entry instanceof File) files.push(entry)
    }

    // Check for "file" field (single file upload)
    const singleFile = formData.get('file')
    if (singleFile instanceof File) files.push(singleFile)

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    // Process all files
    const urls: string[] = []
    const errors: string[] = []

    for (const file of files) {
      try {
        const url = await processFile(file, folder)
        urls.push(url)
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`)
      }
    }

    // If all files failed
    if (urls.length === 0 && errors.length > 0) {
      return NextResponse.json(
        { error: errors.join('; ') },
        { status: 400 }
      )
    }

    // Return format that matches admin panel expectations
    if (files.length === 1 && urls.length === 1) {
      // Single file — return both formats for compatibility
      return NextResponse.json({
        url: urls[0],
        urls: urls,
        filename: files[0].name,
        size: files[0].size,
        provider: vercelBlob && process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : (isVercel ? 'base64' : 'local'),
        ...(errors.length > 0 ? { warnings: errors } : {}),
      })
    }

    // Multiple files — return urls array (admin panel expects this)
    return NextResponse.json({
      urls: urls,
      provider: vercelBlob && process.env.BLOB_READ_WRITE_TOKEN ? 'vercel-blob' : (isVercel ? 'base64' : 'local'),
      ...(errors.length > 0 ? { warnings: errors } : {}),
    })
  } catch (error: any) {
    console.error('[upload] Error:', error.message?.substring(0, 300))
    return NextResponse.json(
      { error: `Upload failed: ${error.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}

// Handle DELETE for removing files
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    if (vercelBlob && url.includes('blob.vercel-storage.com')) {
      try {
        await vercelBlob.del(url)
        return NextResponse.json({ success: true })
      } catch (delErr) {
        console.error('[upload] Delete error:', (delErr as Error).message?.substring(0, 200))
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, note: 'Base64 images are stored in the database' })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}

export const maxDuration = 30
