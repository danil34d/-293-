export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { format } from 'date-fns';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { TelegramInternalApiResponse, TelegramFinanceSummary } from '@/types/telegram-bot';
import { getEmployeeFinanceSummary } from '@/services/employee-finance-service';
import { ServiceError } from '@/services/service-error';

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId')?.trim();
    const month = searchParams.get('month')?.trim() || format(new Date(), 'yyyy-MM');

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const summary = await getEmployeeFinanceSummary(employeeId, month);
    return NextResponse.json({
      ok: true,
      data: summary,
    } satisfies TelegramInternalApiResponse<TelegramFinanceSummary>);
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ ok: false, error: error.message } satisfies TelegramInternalApiResponse<never>, { status: error.statusCode });
    }
    console.error('Error building telegram finance summary:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}

