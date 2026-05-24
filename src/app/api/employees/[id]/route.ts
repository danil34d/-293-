export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Employee, EmployeeRole } from '@/types';
import { appendEmployeeSchemeHistory, getEmployeeImpact, getEmployeesData, invalidateEmployeesCache, createEmployeeChangeLogBatch } from '@/lib/data';
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

    // Check username uniqueness (exclude self)
    if (updatedData.username) {
      const existing = await getEmployeesData();
      const duplicate = existing.find(e => e.username === updatedData.username && e.id !== id);
      if (duplicate) {
        return NextResponse.json({ error: `Логин "${updatedData.username}" уже занят сотрудником ${duplicate.fullName}` }, { status: 409 });
      }
    }

    // Password handling: if empty — keep old, if provided — hash it
    let oldDataForHistory: Employee | null = null;
    if (!updatedData.password) {
      try {
        const oldData = await readEntity<Employee>('employee', id);
        if (oldData) {
          updatedData.password = oldData.password;
          oldDataForHistory = oldData;
        }
      } catch { /* new employee or not found — leave empty */ }
    } else {
      // Need oldData for scheme history even if password is being changed
      try {
        oldDataForHistory = await readEntity<Employee>('employee', id);
      } catch { /* not found */ }
      updatedData.password = await hashPassword(updatedData.password);
    }

    await saveEntity('employee', updatedData);
    invalidateEmployeesCache();

    // UX-safety: append EmployeeSalarySchemeHistory если salarySchemeId изменился.
    // Это позволит позже считать ZP по схеме, действовавшей на момент мойки,
    // вместо ретроактивного пересчёта (см. АРХИТЕКТУРНЫЕ-НАХОДКИ #2).
    if (oldDataForHistory && oldDataForHistory.salarySchemeId !== updatedData.salarySchemeId) {
      try {
        await appendEmployeeSchemeHistory(
          id,
          updatedData.salarySchemeId ?? null,
          (auth as any).id
        );
      } catch (histErr: any) {
        // History — best-effort, не блокируем основной save.
        console.warn(`[scheme-history] failed for employee ${id}:`, histErr?.message);
      }
    }

    // Phase 29 / V2-NEW-3: EmployeeChangeLog audit для опасных правок.
    // Сравниваем old vs new для tracked полей и пишем batch.
    if (oldDataForHistory) {
      const tracked: Array<{ field: keyof Employee; isPassword?: boolean }> = [
        { field: 'fullName' },
        { field: 'role' },
        { field: 'username' },
        { field: 'password', isPassword: true },
        { field: 'salarySchemeId' },
        { field: 'archived' },
        { field: 'phone' },
        { field: 'paymentDetails' },
      ];
      const entries: Array<{
        employeeId: string;
        fieldName: string;
        oldValue: string | null;
        newValue: string | null;
        changedBy: string;
      }> = [];
      for (const t of tracked) {
        const oldV = (oldDataForHistory as any)[t.field];
        const newV = (updatedData as any)[t.field];
        if (oldV !== newV) {
          // Для пароля не пишем значения — только факт изменения
          const oldStr = t.isPassword ? (oldV ? '***' : null) : (oldV == null ? null : String(oldV));
          const newStr = t.isPassword ? (newV ? '***' : null) : (newV == null ? null : String(newV));
          entries.push({
            employeeId: id,
            fieldName: String(t.field),
            oldValue: oldStr,
            newValue: newStr,
            changedBy: (auth as any).id,
          });
        }
      }
      if (entries.length > 0) {
        try {
          await createEmployeeChangeLogBatch(entries);
        } catch (logErr: any) {
          console.warn(`[employee-change-log] failed for ${id}:`, logErr?.message);
        }
      }
    }

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

    // UX-safety pre-check: блокируем hard DELETE если есть история (Phase 6.2).
    // Cascade удалит WashEventEmployee, ShiftEmployee, EmployeeTransaction,
    // EmployeeDayStatus, EmployeeCanister, Violation — это ВСЯ история работы.
    // Архивация (POST /archive) сохраняет данные и решает 99% случаев.
    const impact = await getEmployeeImpact(id);
    const hasHistory =
      impact.washEvents > 0 ||
      impact.transactions > 0 ||
      impact.shifts > 0 ||
      impact.violations > 0;

    // Опциональный bypass для очень осознанного hard-delete: header X-Confirm-Hard-Delete
    // Frontend в UI требует ввод ФИО + 2 чек-листа перед таким запросом.
    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    if (hasHistory && !force) {
      return NextResponse.json({
        error: 'У сотрудника есть история (мойки, транзакции, смены). Используйте Archive вместо Delete.',
        impact,
        suggestArchive: true,
      }, { status: 409 });
    }

    await deleteEntity('employee', id);
    invalidateEmployeesCache();
    return NextResponse.json({ message: 'Employee deleted successfully', impact });
  } catch (error: any) {
    console.error(`Error deleting employee data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
