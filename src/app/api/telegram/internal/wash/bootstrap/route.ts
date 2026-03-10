export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { getWashBootstrap } from '@/services/wash-registration-service';
import type { TelegramInternalApiResponse, TelegramWashBootstrapResponse } from '@/types/telegram-bot';

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get('employeeId') || '').trim();
    if (!employeeId) {
      return NextResponse.json(
        { ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const data = await getWashBootstrap(employeeId);
    return NextResponse.json({
      ok: true,
      data,
    } satisfies TelegramInternalApiResponse<TelegramWashBootstrapResponse>);
  } catch (error: any) {
    console.error('Error getting telegram wash bootstrap:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}

