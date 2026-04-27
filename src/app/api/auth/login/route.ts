import { NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data';
import type { Employee } from '@/types';
import { serializeEmployeeAuthCookie } from '@/lib/employee-auth-cookie';
import { verifyPassword } from '@/lib/password-hash';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_FAILURES = 5;

type RateEntry = { count: number; firstAt: number };
const rateMap = new Map<string, RateEntry>();

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function rateKey(request: Request, username: string): string {
  return `${getClientIp(request)}::${username.toLowerCase()}`;
}

function consumeFailedAttempt(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now - entry.firstAt >= RATE_LIMIT_WINDOW_MS) {
    rateMap.set(key, { count: 1, firstAt: now });
    return { blocked: false, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX_FAILURES) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.firstAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { blocked: true, retryAfterSec };
  }
  return { blocked: false, retryAfterSec: 0 };
}

function checkRateLimit(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry) return { blocked: false, retryAfterSec: 0 };
  if (now - entry.firstAt >= RATE_LIMIT_WINDOW_MS) {
    rateMap.delete(key);
    return { blocked: false, retryAfterSec: 0 };
  }
  if (entry.count > RATE_LIMIT_MAX_FAILURES) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.firstAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
    return { blocked: true, retryAfterSec };
  }
  return { blocked: false, retryAfterSec: 0 };
}

function clearRate(key: string): void {
  rateMap.delete(key);
}

export async function POST(request: Request) {
  try {
    const requestBody = await request.text();
    let parsedBody: { username?: unknown; password?: unknown } = {};

    try {
      parsedBody = requestBody ? JSON.parse(requestBody) : {};
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 });
    }

    const username = typeof parsedBody.username === 'string' ? parsedBody.username.trim() : '';
    const password = typeof parsedBody.password === 'string' ? parsedBody.password : '';

    if (!username || !password) {
      return NextResponse.json({ error: 'Логин и пароль обязательны' }, { status: 400 });
    }

    const rkey = rateKey(request, username);
    const preCheck = checkRateLimit(rkey);
    if (preCheck.blocked) {
      return NextResponse.json(
        { error: 'Слишком много попыток. Попробуйте позже.' },
        { status: 429, headers: { 'Retry-After': String(preCheck.retryAfterSec) } }
      );
    }

    const employees = await getEmployeesData();

    // Ищем по username, затем проверяем пароль через verifyPassword
    // (поддерживает и хеш scrypt, и plain-text для обратной совместимости)
    const employee = employees.find((emp) => emp.username === username);
    if (!employee || !employee.password) {
      const after = consumeFailedAttempt(rkey);
      const status = after.blocked ? 429 : 401;
      const headers = after.blocked ? { 'Retry-After': String(after.retryAfterSec) } : undefined;
      return NextResponse.json(
        { error: after.blocked ? 'Слишком много попыток. Попробуйте позже.' : 'Неверный логин или пароль' },
        headers ? { status, headers } : { status }
      );
    }

    const passwordValid = await verifyPassword(password, employee.password);
    if (!passwordValid) {
      const after = consumeFailedAttempt(rkey);
      const status = after.blocked ? 429 : 401;
      const headers = after.blocked ? { 'Retry-After': String(after.retryAfterSec) } : undefined;
      return NextResponse.json(
        { error: after.blocked ? 'Слишком много попыток. Попробуйте позже.' : 'Неверный логин или пароль' },
        headers ? { status, headers } : { status }
      );
    }

    clearRate(rkey);
    const { password: _, ...employeeData } = employee;

    const cookieValue = JSON.stringify(employeeData);
    const cookie = serializeEmployeeAuthCookie(request, cookieValue);

    const response = NextResponse.json({ employee: employeeData });
    response.headers.set('Set-Cookie', cookie);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера' }, { status: 500 });
  }
}
