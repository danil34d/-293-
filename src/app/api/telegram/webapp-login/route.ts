export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data';
import { consumeTelegramWebAppSession } from '@/services/telegram-webapp-session-service';
import { serializeEmployeeAuthCookie } from '@/lib/employee-auth-cookie';

function buildLoginErrorRedirect(request: Request): NextResponse {
  const url = new URL('/login?error=tg_webapp_auth_failed', request.url);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token')?.trim() || '';

    if (!token) {
      return buildLoginErrorRedirect(request);
    }

    const consumeResult = await consumeTelegramWebAppSession(token);
    if (consumeResult.status !== 'ok') {
      return buildLoginErrorRedirect(request);
    }

    const employees = await getEmployeesData();
    const employee = employees.find((item) => item.id === consumeResult.session.employeeId);
    if (!employee) {
      return buildLoginErrorRedirect(request);
    }

    const { password: _password, ...employeeData } = employee;
    const cookieValue = JSON.stringify(employeeData);
    const cookie = serializeEmployeeAuthCookie(request, cookieValue);

    const redirectUrl = new URL('/employee/workstation', request.url);
    const response = NextResponse.redirect(redirectUrl);
    response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (error) {
    console.error('Telegram webapp login error:', error);
    return buildLoginErrorRedirect(request);
  }
}
