import { NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data-loader';
import type { Employee } from '@/types';
import { serializeEmployeeAuthCookie } from '@/lib/employee-auth-cookie';

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

    const employees = await getEmployeesData();
    const employee = employees.find(
      (emp) => emp.username === username && emp.password === password
    );

    if (!employee) {
      return NextResponse.json({ error: 'Неверный логин или пароль' }, { status: 401 });
    }

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
