export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Employee, EmployeeRole } from '@/types';
import { invalidateEmployeesCache } from '@/lib/data-loader';
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

const VALID_ROLES: EmployeeRole[] = ['admin', 'employee', 'kiosk'];

function normalizeEmployeeRole(requestedRole?: EmployeeRole): EmployeeRole {
  if (requestedRole && VALID_ROLES.includes(requestedRole)) return requestedRole;
  return 'employee';
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await ensureDataDirectory();
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(fileContent);
    return NextResponse.json(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    console.error(`Error reading employee data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Employee ID is required for PUT' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await ensureDataDirectory();
    const updatedData: Employee = await request.json();
    
    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }
    updatedData.role = normalizeEmployeeRole(updatedData.role);

    await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf-8');
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Data updated successfully', employee: updatedData });
  } catch (error) {
    console.error(`Error writing employee data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Employee ID is required for DELETE' }, { status: 400 });
  }
  if (id === 'emp_manager_admin') {
    return NextResponse.json({ error: 'Нельзя удалить основного администратора' }, { status: 403 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    await ensureDataDirectory();
    await fs.unlink(filePath);
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Employee deleted successfully' });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    console.error(`Error deleting employee data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
