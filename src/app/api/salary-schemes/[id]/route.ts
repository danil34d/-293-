export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { SalaryScheme } from '@/types';
import { getEmployeesData, invalidateSalarySchemesCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, deleteEntity, readEntity } from '@/lib/data/write-helpers';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Scheme ID is required' }, { status: 400 });
  }

  try {
    const data = await readEntity<SalaryScheme>('salaryScheme', id);
    if (!data) {
      return NextResponse.json({ error: 'Salary scheme not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Error reading salary scheme data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Scheme ID is required for PUT' }, { status: 400 });
  }

  try {
    const updatedData: SalaryScheme = await request.json();

    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }

    await saveEntity('salaryScheme', updatedData);
    invalidateSalarySchemesCache();
    return NextResponse.json({ message: 'Data updated successfully', scheme: updatedData });
  } catch (error) {
    console.error(`Error writing salary scheme data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Scheme ID is required for DELETE' }, { status: 400 });
  }

  try {
    const existing = await readEntity('salaryScheme', id);
    if (!existing) {
      return NextResponse.json({ error: 'Salary scheme not found' }, { status: 404 });
    }

    // UX-safety pre-check: блокируем hard DELETE если есть привязанные сотрудники.
    // Иначе `onDelete: SetNull` в Prisma молча обнулит salarySchemeId у всех —
    // ZP-расчёт сломается (см. АРХИТЕКТУРНЫЕ-НАХОДКИ #1).
    // UI должен предложить archive вместо delete (POST /api/salary-schemes/[id]/archive).
    const allEmployees = await getEmployeesData();
    const linkedEmployees = allEmployees.filter(e => e.salarySchemeId === id);
    if (linkedEmployees.length > 0) {
      return NextResponse.json({
        error: 'У этой схемы есть привязанные сотрудники. Используйте Archive вместо Delete.',
        employeesCount: linkedEmployees.length,
        employees: linkedEmployees.map(e => ({ id: e.id, fullName: e.fullName })),
        suggestArchive: true,
      }, { status: 409 });
    }

    await deleteEntity('salaryScheme', id);
    invalidateSalarySchemesCache();
    return NextResponse.json({ message: 'Salary scheme deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting salary scheme data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
