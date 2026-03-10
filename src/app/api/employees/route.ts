export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Employee, EmployeeRole } from '@/types';
import { getEmployeesData, invalidateEmployeesCache } from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';

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

function normalizeEmployeeRole(id: string, requestedRole?: EmployeeRole): EmployeeRole {
  if (id === 'emp_manager_admin') return 'admin';
  if (requestedRole === 'admin') return 'employee';
  return 'employee';
}

export async function GET() {
  try {
    const employees = await getEmployeesData();
    return NextResponse.json(employees);
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
    if (newEmployee.role === 'admin' && newEmployee.id !== 'emp_manager_admin') {
      return NextResponse.json({ error: 'Роль admin разрешена только для Менеджер Про' }, { status: 400 });
    }
    newEmployee.role = normalizeEmployeeRole(newEmployee.id, newEmployee.role);
    const filePath = path.join(dataDir, `${newEmployee.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newEmployee, null, 2), 'utf-8');
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Employee created successfully', employee: newEmployee }, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
