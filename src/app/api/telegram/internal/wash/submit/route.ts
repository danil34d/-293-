export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { createWashFromTelegramDraft } from '@/services/wash-registration-service';
import type {
  TelegramInternalApiResponse,
  TelegramWashPaymentMethod,
  TelegramWashSubmitRequest,
  TelegramWashSubmitResponse,
} from '@/types/telegram-bot';

const PAYMENT_METHODS: TelegramWashPaymentMethod[] = [
  'cash',
  'card',
  'transfer',
  'aggregator',
  'counterAgentContract',
];

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = (await request.json()) as Partial<TelegramWashSubmitRequest>;
    const employeeId = String(body?.employeeId || '').trim();
    const chatId = String(body?.chatId || '').trim();
    const draftId = String(body?.draftId || '').trim();
    const vehicleNumber = String(body?.vehicleNumber || '').trim();
    const selectedServices = Array.isArray(body?.selectedServices) ? body.selectedServices : [];

    if (!employeeId || !chatId || !draftId || !vehicleNumber) {
      return NextResponse.json(
        { ok: false, error: 'employeeId, chatId, draftId and vehicleNumber are required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    if (!body?.paymentMethod) {
      return NextResponse.json(
        { ok: false, error: 'paymentMethod is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }
    if (!PAYMENT_METHODS.includes(body.paymentMethod as TelegramWashPaymentMethod)) {
      return NextResponse.json(
        { ok: false, error: 'invalid paymentMethod' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const data = await createWashFromTelegramDraft({
      employeeId,
      chatId,
      draftId,
      vehicleNumber,
      paymentMethod: body.paymentMethod,
      sourceId: body.sourceId,
      teamEmployeeIds: Array.isArray(body?.teamEmployeeIds) ? body.teamEmployeeIds : [],
      selectedServices,
      comment: body.comment,
    });

    return NextResponse.json({
      ok: true,
      data,
    } satisfies TelegramInternalApiResponse<TelegramWashSubmitResponse>);
  } catch (error: any) {
    console.error('Error submitting telegram wash:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}
