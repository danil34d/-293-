export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { detectVehicleContext } from '@/services/wash-registration-service';
import type { TelegramInternalApiResponse, TelegramWashDetectVehicleResponse } from '@/types/telegram-bot';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = (await request.json()) as { employeeId?: string; vehicleNumber?: string };
    const vehicleNumber = String(body?.vehicleNumber || '').trim();
    if (!vehicleNumber) {
      return NextResponse.json(
        { ok: false, error: 'vehicleNumber is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const data = await detectVehicleContext(vehicleNumber);
    return NextResponse.json({
      ok: true,
      data,
    } satisfies TelegramInternalApiResponse<TelegramWashDetectVehicleResponse>);
  } catch (error: any) {
    console.error('Error detecting telegram wash vehicle context:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}

