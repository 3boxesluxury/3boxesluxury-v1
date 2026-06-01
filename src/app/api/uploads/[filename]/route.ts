import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }
    const isVercel = process.env.VERCEL === '1';
    const uploadDir = isVercel
      ? path.join('/tmp', 'uploads', 'products')
      : path.join(process.cwd(), 'public', 'uploads', 'products');
    const filepath = path.join(uploadDir, filename);
    try { await stat(filepath); } catch { return NextResponse.json({ error: 'Image not found' }, { status: 404 }); }
    const fileBuffer = await readFile(filepath);
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
    const contentType = contentTypeMap[ext || ''] || 'application/octet-stream';
    return new NextResponse(fileBuffer, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Length': fileBuffer.length.toString() } });
  } catch (err: any) {
    console.error('Error serving uploaded file:', err);
    return NextResponse.json({ error: 'Failed to serve image' }, { status: 500 });
  }
}
