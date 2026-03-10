export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data-loader';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const employees = await getEmployeesData();
    const links = employees
      .map((employee) => ({
        employeeId: employee.id,
        fullName: employee.fullName,
        telegramChatId: employee.telegramChatId || '',
      }))
      .filter((item) => item.telegramChatId.trim().length > 0);

    return NextResponse.json({
      ok: true,
      data: {
        links,
      },
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    console.error('Error reading telegram employee links:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}

