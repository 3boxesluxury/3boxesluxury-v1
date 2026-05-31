import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helper';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// POST /api/upload — Upload product images (admin only)
// On Vercel: saves to /tmp/uploads/products/ (writable in serverless)
// Locally: saves to /public/uploads/products/ (servable as static files)
// Images are served via /api/uploads/[filename] route on Vercel
export async function POST(request: NextRequest) {
  // Verify admin auth
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    const formData = await request.formData();
    const files = formData.getAll('files');

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    const urls: string[] = [];
    const isVercel = process.env.VERCEL === '1';

    // On Vercel, use /tmp which is writable in serverless functions
    // Locally, use public/ for static file serving
    const uploadDir = isVercel
      ? path.join('/tmp', 'uploads', 'products')
      : path.join(process.cwd(), 'public', 'uploads', 'products');

    // Ensure upload directory exists
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    for (const file of files) {
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Invalid file' }, { status: 400 });
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 5MB limit` },
          { status: 400 }
        );
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: `File "${file.name}" is not an allowed image type` },
          { status: 400 }
        );
      }

      // Generate unique filename
      const ext = file.name.split('.').pop() || 'jpg';
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const filename = `product-${timestamp}-${randomStr}.${ext}`;
      const filepath = path.join(uploadDir, filename);

      // Write file to disk
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filepath, buffer);

      // On Vercel, images are served via /api/uploads/[filename]
      // Locally, they're served from /public/uploads/products/
      if (isVercel) {
        urls.push(`/api/uploads/${filename}`);
      } else {
        urls.push(`/uploads/products/${filename}`);
      }
    }

    return NextResponse.json({ urls });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: `Upload failed: ${err?.message || 'Unknown error'}` },
      { status: 500 }
    );
  }
}
