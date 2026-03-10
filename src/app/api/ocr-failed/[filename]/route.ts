import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { OCR_FAILED_DIR } from '@/services/plate-recognition-service';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { filename } = params;

  // only allow safe filenames (jpg files only)
  if (!/^[\w\-]+\.jpg$/.test(filename)) {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 });
  }

  const filePath = join(OCR_FAILED_DIR, filename);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
