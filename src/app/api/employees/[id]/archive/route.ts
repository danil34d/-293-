export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { archiveEmployee, unarchiveEmployee, getEmployeeById, invalidateEmployeesCache } from '@/lib/data';

/**
 * UX-safety: soft-delete сотрудника (Phase 6.2).
 *
 * Альтернатива hard DELETE с cascade на 7 таблиц
 * (WashEventEmployee · ShiftEmployee · EmployeeTransaction · EmployeeDayStatus ·
 *  EmployeeCanister · Violation · StockMovement.employeeId SET NULL).
 *
 * После archive:
 *  - Сотрудник пропадает из активных списков / графиков / автодополнений
 *  - История WashEvent / EmployeeTransaction / Shift полностью сохраняется
 *  - Отчёты /salary-report за прошлые периоды остаются корректными
 *
 * Body (optional): { action: 'archive' | 'unarchive' } — по умолчанию 'archive'.
 * Owner: Менеджер Про. Auth: requireAdmin.
 *
 * См. АДМИНКА-АРХИТЕКТУРНЫЕ-НАХОДКИ #1.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }
  if (id === 'emp_manager_admin') {
    return NextResponse.json({ error: 'Нельзя архивировать основного администратора' }, { status: 403 });
  }

  let action: 'archive' | 'unarchive' = 'archive';
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === 'unarchive') action = 'unarchive';
  } catch { /* keep default */ }

  try {
    const existing = await getEmployeeById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    if (action === 'archive') {
      if (existing.archived) {
        return NextResponse.json({ message: 'Already archived', employee: existing });
      }
      await archiveEmployee(id);
    } else {
      if (!existing.archived) {
        return NextResponse.json({ message: 'Not archived', employee: existing });
      }
      await unarchiveEmployee(id);
    }

    await invalidateEmployeesCache();
    return NextResponse.json({
      message: action === 'archive' ? 'Employee archived' : 'Employee restored',
      employeeId: id,
      action,
    });
  } catch (error: any) {
    console.error(`Error ${action} employee ${id}:`, error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
