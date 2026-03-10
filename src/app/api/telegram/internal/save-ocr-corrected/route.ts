export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { saveOcrCorrectedPhoto, updateOcrFailedPhotoReason } from '@/services/plate-recognition-service';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = await request.json() as {
      filename?: string;
      imageBase64?: string;
      originalOcr?: string;
      correctedOcr?: string;
      employeeId?: string;
      source?: string;
    };

    const filename = String(body?.filename || '').trim();
    const original = body?.originalOcr || 'unknown';
    const corrected = body?.correctedOcr || 'unknown';
    const source = body?.source || 'telegram';
    const employee = body?.employeeId || 'unknown';
    const reason = `ocr_corrected_by_user: original="${original}" corrected="${corrected}" employee="${employee}" source="${source}"`;
    if (filename) {
      const updatedFilename = await updateOcrFailedPhotoReason(filename, reason);
      return NextResponse.json(
        { ok: true, data: { saved: true, filename: updatedFilename } } satisfies TelegramInternalApiResponse<{ saved: boolean; filename: string }>,
      );
    }

    const imageBase64 = String(body?.imageBase64 || '').trim();
    if (!imageBase64) {
      return NextResponse.json(
        { ok: false, error: 'filename or imageBase64 is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const savedFilename = await saveOcrCorrectedPhoto(buffer, reason);

    return NextResponse.json(
      { ok: true, data: { saved: true, filename: savedFilename } } satisfies TelegramInternalApiResponse<{ saved: boolean; filename: string | null }>,
    );
  } catch (error: any) {
    console.error('Error saving OCR corrected photo:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}
