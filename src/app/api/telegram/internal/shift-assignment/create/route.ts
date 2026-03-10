export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { ShiftType } from '@/types';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';
import { createAssignmentRequest } from '@/services/shift-assignment-service';
import { ServiceError } from '@/services/service-error';

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = await request.json();
    const employeeId = String(body?.employeeId || '').trim();
    const date = String(body?.date || '').trim();
    const shiftType = body?.shiftType as ShiftType;
    const boxNumber = Number(body?.boxNumber) as 1 | 2;
    const washId = typeof body?.washId === 'string' ? body.washId : undefined;
    const comment = typeof body?.comment === 'string' ? body.comment : undefined;

    if (!employeeId || !date || !shiftType || !boxNumber) {
      return NextResponse.json({ ok: false, error: 'employeeId, date, shiftType, boxNumber are required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const created = await createAssignmentRequest(
      { employeeId, date, shiftType, boxNumber, washId, comment },
      { actorId: employeeId, isAdmin: false }
    );

    return NextResponse.json({
      ok: true,
      data: created,
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ ok: false, error: error.message } satisfies TelegramInternalApiResponse<never>, { status: error.statusCode });
    }
    console.error('Error creating assignment request from telegram:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}
