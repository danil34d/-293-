export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Employee, EmployeeRole } from '@/types';
import { getEmployeesData, invalidateEmployeesCache } from '@/lib/data-loader';
import { requireAuth, requireAdmin } from '@/lib/server-auth';
import { hashPassword } from '@/lib/password-hash';

const dataDir = path.join(process.cwd(), 'data', 'employees');

async function ensureDataDirectory() {
  try {
    await fs.access(dataDir);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dataDir, { recursive: true });
    } else {
      throw error;
    }
  }
}

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
    await ensureDataDirectory();
    const newEmployee: Employee = await request.json();
    if (!newEmployee.id) {
       return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }
    newEmployee.role = normalizeEmployeeRole(newEmployee.role);
    // Hash password if provided
    if (newEmployee.password) {
      newEmployee.password = await hashPassword(newEmployee.password);
    }
    const filePath = path.join(dataDir, `${newEmployee.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newEmployee, null, 2), 'utf-8');
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Employee created successfully', employee: newEmployee }, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
