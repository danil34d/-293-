export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';
import { respondSwapRequest } from '@/services/shift-swap-service';
import { ServiceError } from '@/services/service-error';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = await request.json();
    const employeeId = String(body?.employeeId || '').trim();
    const requestId = String(body?.requestId || '').trim();
    const decision = body?.decision === 'accepted' ? 'accepted' : body?.decision === 'rejected' ? 'rejected' : null;

    if (!employeeId || !requestId || !decision) {
      return NextResponse.json({ ok: false, error: 'employeeId, requestId, decision(accepted|rejected) are required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const updated = await respondSwapRequest({
      requestId,
      decision,
      actorId: employeeId,
      isAdmin: false,
    });

    return NextResponse.json({
      ok: true,
      data: updated,
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ ok: false, error: error.message } satisfies TelegramInternalApiResponse<never>, { status: error.statusCode });
    }
    console.error('Error responding to swap request from telegram:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}

