export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Employee, EmployeeRole } from '@/types';
import { invalidateEmployeesCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { hashPassword } from '@/lib/password-hash';
import { saveEntity, deleteEntity, readEntity } from '@/lib/data/write-helpers';

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

  try {
    const data = await readEntity<Employee>('employee', id);
    if (!data) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    const { password, ...safeData } = data;
    return NextResponse.json(safeData);
  } catch (error: any) {
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

  try {
    const updatedData: Employee = await request.json();

    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }
    updatedData.role = normalizeEmployeeRole(updatedData.role);

    // Password handling: if empty — keep old, if provided — hash it
    if (!updatedData.password) {
      try {
        const oldData = await readEntity<Employee>('employee', id);
        if (oldData) {
          updatedData.password = oldData.password;
        }
      } catch { /* new employee or not found — leave empty */ }
    } else {
      updatedData.password = await hashPassword(updatedData.password);
    }

    await saveEntity('employee', updatedData);
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

  try {
    const existing = await readEntity('employee', id);
    if (!existing) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    await deleteEntity('employee', id);
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Employee deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting employee data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
