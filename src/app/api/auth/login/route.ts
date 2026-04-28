import { NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data';
import type { Employee } from '@/types';
import { serializeEmployeeAuthCookie } from '@/lib/employee-auth-cookie';
import { verifyPassword } from '@/lib/password-hash';
import { RateLimiter, getClientIp } from '@/lib/rate-limit';

// 5 неудачных попыток за минуту (per-IP + per-username) → 429 + Retry-After
const loginRateLimiter = new RateLimiter({ windowMs: 60_000, maxFailures: 5 });

function rateKey(request: Request, username: string): string {
  return `${getClientIp(request)}::${username.toLowerCase()}`;
}

/**
 * Ответ при неудачной попытке логина: 401 если лимит не достигнут,
 * 429+Retry-After если этот запрос превысил лимит.
 */
function failedLoginResponse(rkey: string): NextResponse {
  const after = loginRateLimiter.consumeFailure(rkey);
  if (after.blocked) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(after.retryAfterSec) } }
    );
  }
  return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
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
    const preCheck = loginRateLimiter.check(rkey);
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
      return failedLoginResponse(rkey);
    }

    const passwordValid = await verifyPassword(password, employee.password);
    if (!passwordValid) {
      return failedLoginResponse(rkey);
    }

    loginRateLimiter.clear(rkey);
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
