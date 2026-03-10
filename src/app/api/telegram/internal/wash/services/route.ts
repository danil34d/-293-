export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { buildServicesCatalog } from '@/services/wash-registration-service';
import type {
  TelegramInternalApiResponse,
  TelegramWashPaymentMethod,
  TelegramWashServicesResponse,
} from '@/types/telegram-bot';

const PAYMENT_METHODS: TelegramWashPaymentMethod[] = [
  'cash',
  'card',
  'transfer',
  'aggregator',
  'counterAgentContract',
];

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get('employeeId') || '').trim();
    const vehicleNumber = String(searchParams.get('vehicleNumber') || '').trim();
    const paymentMethod = String(searchParams.get('paymentMethod') || '').trim();
    const sourceId = String(searchParams.get('sourceId') || '').trim() || undefined;
    const query = String(searchParams.get('query') || '').trim();
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '8');

    if (!employeeId) {
      return NextResponse.json(
        { ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }
    if (!vehicleNumber) {
      return NextResponse.json(
        { ok: false, error: 'vehicleNumber is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }
    if (!paymentMethod) {
      return NextResponse.json(
        { ok: false, error: 'paymentMethod is required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }
    if (!PAYMENT_METHODS.includes(paymentMethod as TelegramWashPaymentMethod)) {
      return NextResponse.json(
        { ok: false, error: 'invalid paymentMethod' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const data = await buildServicesCatalog({
      employeeId,
      vehicleNumber,
      paymentMethod: paymentMethod as TelegramWashPaymentMethod,
      sourceId,
      query,
      page,
      pageSize,
    });

    return NextResponse.json({
      ok: true,
      data,
    } satisfies TelegramInternalApiResponse<TelegramWashServicesResponse>);
  } catch (error: any) {
    console.error('Error getting telegram wash services:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}
