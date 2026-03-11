export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { Employee } from '@/types';
import { verifyCookieValue } from '@/lib/employee-auth-cookie';

export async function GET(request: Request) {
  const cookieStore = cookies();
  const token = cookieStore.get('employee_auth_sim');

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Проверяем подпись
    let rawPayload: string | null = verifyCookieValue(token.value);

    // Обратная совместимость со старыми неподписанными cookie
    if (!rawPayload) {
      try {
        JSON.parse(token.value);
        rawPayload = token.value;
      } catch {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    const parsed = JSON.parse(rawPayload) as Partial<Employee>;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.username !== 'string') {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Безопасное удаление пароля через деструктуризацию
    const { password: _, ...safeEmployee } = parsed as Employee;
    return NextResponse.json({ employee: safeEmployee });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}
