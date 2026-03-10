export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { saveOcrFailedPhoto } from '@/services/plate-recognition-service';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = await request.json() as {
      imageBase64?: string;
      employeeId?: string;
      source?: string;
      reason?: string;
    };

    const imageBase64 = String(body?.imageBase64 || '').trim();
    if (!imageBase64) {
      return NextResponse.json(
        { ok: false, error: 'imageBase64 is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const employee = String(body?.employeeId || 'unknown').trim() || 'unknown';
    const source = String(body?.source || 'telegram').trim() || 'telegram';
    const rawReason = String(body?.reason || '').trim();
    const reason = rawReason
      ? `telegram_ocr_failed: employee="${employee}" source="${source}" reason="${rawReason}"`
      : `telegram_ocr_failed: employee="${employee}" source="${source}"`;

    const filename = await saveOcrFailedPhoto(buffer, reason);
    return NextResponse.json(
      { ok: true, data: { saved: true, filename } } satisfies TelegramInternalApiResponse<{ saved: boolean; filename: string | null }>,
    );
  } catch (error: any) {
    console.error('Error saving OCR failed photo:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}
