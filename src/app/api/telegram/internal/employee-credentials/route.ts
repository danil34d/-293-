export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { TelegramEmployeeCredentialsResponse, TelegramInternalApiResponse } from '@/types/telegram-bot';

function getEmployeeChatIdFromEnv(employeeId: string): string {
  const raw = process.env.TELEGRAM_EMPLOYEE_CHAT_MAP_JSON?.trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed?.[employeeId];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId')?.trim() || '';
    const chatId = searchParams.get('chatId')?.trim() || '';

    if (!employeeId || !chatId) {
      return NextResponse.json(
        { ok: false, error: 'employeeId and chatId are required' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    if (!/^-?\d+$/.test(chatId)) {
      return NextResponse.json(
        { ok: false, error: 'chatId must be numeric string' } satisfies TelegramInternalApiResponse<never>,
        { status: 400 }
      );
    }

    const employees = await getEmployeesData();
    const employee = employees.find((item) => item.id === employeeId);
    if (!employee) {
      return NextResponse.json(
        { ok: false, error: 'Employee not found' } satisfies TelegramInternalApiResponse<never>,
        { status: 404 }
      );
    }

    const employeeChatId = (employee.telegramChatId || '').trim();
    const envChatId = getEmployeeChatIdFromEnv(employee.id);
    const expectedChatId = employeeChatId || envChatId;
    if (!expectedChatId) {
      return NextResponse.json(
        { ok: false, error: 'Employee is not linked to telegram chat' } satisfies TelegramInternalApiResponse<never>,
        { status: 403 }
      );
    }

    if (expectedChatId !== chatId) {
      return NextResponse.json(
        { ok: false, error: 'chatId does not match employee binding' } satisfies TelegramInternalApiResponse<never>,
        { status: 403 }
      );
    }

    const username = String(employee.username || '').trim();
    const password = String(employee.password || '');
    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: 'Login credentials are not set for employee' } satisfies TelegramInternalApiResponse<never>,
        { status: 404 }
      );
    }

    const data: TelegramEmployeeCredentialsResponse = {
      employeeId: employee.id,
      fullName: employee.fullName,
      username,
      password,
    };

    return NextResponse.json({
      ok: true,
      data,
    } satisfies TelegramInternalApiResponse<TelegramEmployeeCredentialsResponse>);
  } catch (error) {
    console.error('Error reading employee credentials for telegram:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, {
      status: 500,
    });
  }
}
