import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/server-auth';
import { OCR_FAILED_DIR, saveOcrCorrectedPhoto, updateOcrFailedPhotoReason } from '@/services/plate-recognition-service';
import { readdir, readFile, unlink, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface OcrFailedEntry {
  filename: string;
  savedAt: string;
  reason: string;
  sizeBytes: number;
}

export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    if (!existsSync(OCR_FAILED_DIR)) {
      return NextResponse.json({ items: [], total: 0 });
    }

    const files = await readdir(OCR_FAILED_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const entries: OcrFailedEntry[] = [];
    for (const jsonFile of jsonFiles) {
      try {
        const raw = await readFile(join(OCR_FAILED_DIR, jsonFile), 'utf-8');
        const meta = JSON.parse(raw);
        const imgPath = join(OCR_FAILED_DIR, meta.filename);
        if (!existsSync(imgPath)) continue;
        const info = await stat(imgPath);
        entries.push({
          filename: meta.filename,
          savedAt: meta.savedAt,
          reason: meta.reason,
          sizeBytes: info.size,
        });
      } catch {
        // skip corrupt meta
      }
    }

    entries.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

    return NextResponse.json({ items: entries, total: entries.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/ocr-failed — сохранить исправление OCR (когда пользователь исправил номер после распознавания)
export async function POST(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json() as {
      filename?: string;
      imageBase64?: string;
      originalOcr?: string;
      correctedOcr?: string;
      source?: string; // 'web' | 'telegram'
    };

    const filename = String(body?.filename || '').trim();
    const original = body?.originalOcr || 'unknown';
    const corrected = body?.correctedOcr || 'unknown';
    const source = body?.source || 'web';
    const reason = `ocr_corrected_by_user: original="${original}" corrected="${corrected}" source="${source}"`;

    if (filename) {
      const updatedFilename = await updateOcrFailedPhotoReason(filename, reason);
      return NextResponse.json({ ok: true, saved: true, filename: updatedFilename });
    }

    const imageBase64 = String(body?.imageBase64 || '').trim();
    if (!imageBase64) {
      return NextResponse.json({ error: 'filename or imageBase64 is required' }, { status: 400 });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const savedFilename = await saveOcrCorrectedPhoto(buffer, reason);

    return NextResponse.json({ ok: true, saved: true, filename: savedFilename });
  } catch (error: any) {
    console.error('Error saving OCR correction:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE /api/ocr-failed?filename=xxx  — удалить конкретный файл
// DELETE /api/ocr-failed?all=1          — очистить всё
export async function DELETE(request: NextRequest) {
  // Удаление требует прав администратора
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');
  const all = searchParams.get('all') === '1';

  try {
    if (all) {
      if (!existsSync(OCR_FAILED_DIR)) return NextResponse.json({ deleted: 0 });
      const files = await readdir(OCR_FAILED_DIR);
      let deleted = 0;
      for (const f of files) {
        try { await unlink(join(OCR_FAILED_DIR, f)); deleted++; } catch {}
      }
      return NextResponse.json({ deleted });
    }

    if (!filename) {
      return NextResponse.json({ error: 'filename required' }, { status: 400 });
    }

    // only allow safe filenames
    if (!/^[\w\-\.]+$/.test(filename)) {
      return NextResponse.json({ error: 'invalid filename' }, { status: 400 });
    }

    const imgPath = join(OCR_FAILED_DIR, filename);
    const metaPath = join(OCR_FAILED_DIR, filename.replace(/\.[^.]+$/, '.json'));
    if (existsSync(imgPath)) await unlink(imgPath);
    if (existsSync(metaPath)) await unlink(metaPath);

    return NextResponse.json({ deleted: 1 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
