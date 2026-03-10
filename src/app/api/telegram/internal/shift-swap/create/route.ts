export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { ShiftRequestType } from '@/types';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';
import { createSwapRequest } from '@/services/shift-swap-service';
import { ServiceError } from '@/services/service-error';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = await request.json();
    const requesterId = String(body?.employeeId || body?.requesterId || '').trim();
    const requesterShiftId = String(body?.requesterShiftId || '').trim();
    const type = body?.type as ShiftRequestType;
    const targetEmployeeId = String(body?.targetEmployeeId || '').trim();
    const targetShiftId = typeof body?.targetShiftId === 'string' ? body.targetShiftId.trim() : undefined;

    if (!requesterId || !requesterShiftId || !type || !targetEmployeeId) {
      return NextResponse.json({ ok: false, error: 'requesterId, requesterShiftId, type, targetEmployeeId are required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const created = await createSwapRequest(
      {
        requesterId,
        requesterShiftId,
        type,
        targetEmployeeId,
        targetShiftId,
      },
      { actorId: requesterId, isAdmin: false }
    );

    return NextResponse.json({
      ok: true,
      data: created,
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ ok: false, error: error.message } satisfies TelegramInternalApiResponse<never>, { status: error.statusCode });
    }
    console.error('Error creating swap request from telegram:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}

