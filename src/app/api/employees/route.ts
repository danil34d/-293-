export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Employee, EmployeeRole } from '@/types';
import { getEmployeesData, invalidateEmployeesCache } from '@/lib/data';
import { requireAuth, requireAdmin } from '@/lib/server-auth';
import { hasAdminAccess } from '@/lib/employee-role';
import { hashPassword } from '@/lib/password-hash';
import { saveEntity } from '@/lib/data/write-helpers';
import { isKiosk } from '@/lib/employee-role';

// 🔥 ФИКС 2026-08-09 (найдено субагентом): в списке не было 'kiosk1', и
// normalizeEmployeeRole понижал роль терминала до 'employee' при КАЖДОМ
// сохранении карточки. Фронт от этого защитили раньше в тот же день, но
// сервер всё равно портил данные — фикс был неполным.
const VALID_ROLES: EmployeeRole[] = ['admin', 'employee', 'kiosk', 'kiosk1'];

const PUBLIC_FIELDS_FOR_NON_ADMIN = ['id', 'fullName', 'role', 'username'] as const;

function pickPublicFields(emp: Employee): Pick<Employee, typeof PUBLIC_FIELDS_FOR_NON_ADMIN[number]> {
  return {
    id: emp.id,
    fullName: emp.fullName,
    role: emp.role,
    username: emp.username,
  };
}

function normalizeEmployeeRole(requestedRole?: EmployeeRole): EmployeeRole {
  if (requestedRole && VALID_ROLES.includes(requestedRole)) return requestedRole;
  return 'employee';
}

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const employees = await getEmployeesData();
    // 🔥 2026-08-09: сравнение с литералом пропускало 'kiosk1' — запись
    // терминала уезжала в общий список сотрудников всем клиентам.
    const filteredEmployees = employees.filter((emp) => !isKiosk(emp));

    if (hasAdminAccess(auth)) {
      const safeEmployees = filteredEmployees.map(({ password, ...emp }) => emp);
      return NextResponse.json(safeEmployees);
    }

    // Non-admin caller: strip PII (phone, paymentDetails, telegramChatId, etc.)
    // Only safe fields needed for shift display, swap UI, employee selectors.
    const safeEmployees = filteredEmployees.map(pickPublicFields);
    return NextResponse.json(safeEmployees);
  } catch (error) {
    console.error('Error reading employees directory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const newEmployee: Employee = await request.json();
    if (!newEmployee.id) {
       return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }
    newEmployee.role = normalizeEmployeeRole(newEmployee.role);

    // Check username uniqueness
    if (newEmployee.username) {
      const existing = await getEmployeesData();
      const duplicate = existing.find(e => e.username === newEmployee.username && e.id !== newEmployee.id);
      if (duplicate) {
        return NextResponse.json({ error: `Логин "${newEmployee.username}" уже занят сотрудником ${duplicate.fullName}` }, { status: 409 });
      }
    }

    // Hash password if provided
    if (newEmployee.password) {
      newEmployee.password = await hashPassword(newEmployee.password);
    }
    await saveEntity('employee', newEmployee);
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Employee created successfully', employee: newEmployee }, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
