export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Employee, EmployeeRole } from '@/types';
import { getEmployeesData, invalidateEmployeesCache } from '@/lib/data';
import { requireAuth, requireAdmin } from '@/lib/server-auth';
import { hashPassword } from '@/lib/password-hash';
import { saveEntity } from '@/lib/data/write-helpers';

const VALID_ROLES: EmployeeRole[] = ['admin', 'employee', 'kiosk'];

function normalizeEmployeeRole(requestedRole?: EmployeeRole): EmployeeRole {
  if (requestedRole && VALID_ROLES.includes(requestedRole)) return requestedRole;
  return 'employee';
}

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const employees = await getEmployeesData();
    // Убираем пароли и киоск-аккаунты из ответа
    const safeEmployees = employees
      .filter(emp => emp.role !== 'kiosk')
      .map(({ password, ...emp }) => emp);
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
