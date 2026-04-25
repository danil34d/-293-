export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getEmployeesData } from '@/lib/data';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import { createTelegramWebAppSession } from '@/services/telegram-webapp-session-service';
import type {
  TelegramInternalApiResponse,
  TelegramWebAppSessionCreateRequest,
  TelegramWebAppSessionCreateResponse,
} from '@/types/telegram-bot';

function readTelegramBaseUrlFromEnvFile(): string {
  const envFilePath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envFilePath)) {
    return '';
  }

  const raw = fs.readFileSync(envFilePath, 'utf-8');
  const line = raw
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith('TELEGRAM_APP_BASE_URL='));

  if (!line) {
    return '';
  }

  return line.replace(/^\s*TELEGRAM_APP_BASE_URL\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
}

function applyCurrentRequestPort(baseUrl: string, request: Request): string {
  try {
    const requestUrl = new URL(request.url);
    const targetUrl = new URL(baseUrl);
    if (requestUrl.port) {
      targetUrl.port = requestUrl.port;
    }
    return targetUrl.toString().replace(/\/+$/, '');
  } catch {
    return baseUrl.replace(/\/+$/, '');
  }
}

function resolveBaseUrl(request: Request): string {
  const fromEnv = (process.env.TELEGRAM_APP_BASE_URL || '').trim();
  if (fromEnv && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(fromEnv)) {
    return applyCurrentRequestPort(fromEnv, request);
  }

  const fromEnvFile = readTelegramBaseUrlFromEnvFile();
  if (fromEnvFile) {
    return applyCurrentRequestPort(fromEnvFile, request);
  }

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const body = (await request.json()) as Partial<TelegramWebAppSessionCreateRequest>;
    const employeeId = String(body?.employeeId || '').trim();
    const chatId = String(body?.chatId || '').trim();

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

    if (employee.telegramChatId && employee.telegramChatId.trim() !== chatId) {
      return NextResponse.json(
        { ok: false, error: 'chatId does not match employee binding' } satisfies TelegramInternalApiResponse<never>,
        { status: 403 }
      );
    }

    const session = await createTelegramWebAppSession({ employeeId, chatId });
    const baseUrl = resolveBaseUrl(request);
    const url = `${baseUrl}/api/telegram/webapp-login?token=${encodeURIComponent(session.token)}`;

    return NextResponse.json({
      ok: true,
      data: {
        token: session.token,
        url,
        expiresAt: session.expiresAt,
      },
    } satisfies TelegramInternalApiResponse<TelegramWebAppSessionCreateResponse>);
  } catch (error) {
    console.error('Error creating telegram webapp session:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>,
      { status: 500 }
    );
  }
}
