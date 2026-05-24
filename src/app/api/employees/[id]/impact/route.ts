export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getEmployeeById, getEmployeeImpact } from '@/lib/data';

/**
 * GET /api/employees/[id]/impact
 *
 * Возвращает счётчики связанных записей для pre-check перед DELETE/Archive.
 * Используется UI в EmployeeDeleteModal чтобы показать «удалит 142 моек, 23 транзакции».
 *
 * Безопасный read-only endpoint. requireAdmin потому что показывает счётчики
 * приватных таблиц.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }

  try {
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }
    const impact = await getEmployeeImpact(id);
    const hasHistory =
      impact.washEvents > 0 ||
      impact.transactions > 0 ||
      impact.shifts > 0 ||
      impact.violations > 0;
    return NextResponse.json({
      employeeId: id,
      fullName: employee.fullName,
      archived: employee.archived ?? false,
      impact,
      hasHistory,
    });
  } catch (error: any) {
    console.error(`Error fetching employee impact ${id}:`, error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
