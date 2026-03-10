export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { recognizePlateFromBuffer, saveOcrFailedPhoto } from '@/services/plate-recognition-service';
import type {
  TelegramInternalApiResponse,
  TelegramPlateRecognitionRequest,
  TelegramPlateRecognitionResponse,
} from '@/types/telegram-bot';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  let buffer: Buffer | null = null;

  try {
    const body = (await request.json()) as Partial<TelegramPlateRecognitionRequest>;
    const imageBase64 = String(body?.imageBase64 || '').trim();
    const employeeId = String(body?.employeeId || '').trim();
    if (!employeeId) {
      return NextResponse.json(
        { ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }
    if (!imageBase64) {
      return NextResponse.json(
        { ok: false, error: 'imageBase64 is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(cleanBase64, 'base64');
    const result = await recognizePlateFromBuffer(buffer);

    return NextResponse.json({
      ok: true,
      data: {
        success: result.success,
        plateNumber: result.plateNumber,
        error: result.error,
        rawOutput: result.rawOutput,
        failedFilename: result.failedFilename,
      },
    } satisfies TelegramInternalApiResponse<TelegramPlateRecognitionResponse>);
  } catch (error: any) {
    console.error('Error recognizing plate for telegram:', error);

    // Сохраняем фото даже при непредвиденной ошибке
    let failedFilename: string | undefined;
    if (buffer && buffer.length > 100) {
      try {
        failedFilename = (await saveOcrFailedPhoto(
          buffer,
          `error: telegram_unexpected: ${error?.message || 'unknown'}`
        )) || undefined;
      } catch {
        // не критично
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        success: false,
        error: error?.message || 'Internal Server Error',
        failedFilename,
      },
    } satisfies TelegramInternalApiResponse<TelegramPlateRecognitionResponse>);
  }
}
