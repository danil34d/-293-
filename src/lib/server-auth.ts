import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { Employee } from '@/types';
import { isEmployeeAdmin } from '@/lib/employee-role';

function parseEmployeeFromCookie(): Employee | null {
  const authCookie = cookies().get('employee_auth_sim');
  if (!authCookie?.value) return null;

  try {
    const parsed = JSON.parse(authCookie.value) as Partial<Employee>;
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.username !== 'string') {
      return null;
    }
    return parsed as Employee;
  } catch {
    return null;
  }
}

export function requireAuth(): Employee | NextResponse {
  const employee = parseEmployeeFromCookie();
  if (!employee) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
  }
  return employee;
}

export function requireAdmin(): Employee | NextResponse {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;
  if (!isEmployeeAdmin(auth)) {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  }
  return auth;
}
