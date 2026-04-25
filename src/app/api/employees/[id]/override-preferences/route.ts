export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Employee } from '@/types';
import { requireAuth } from '@/lib/server-auth';
import { invalidateEmployeesCache } from '@/lib/data';
import { readEntity, saveEntity } from '@/lib/data/write-helpers';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Только админ может переопределять предпочтения
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const { id } = params;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  try {
    const employee = await readEntity<Employee>('employee', id);
    if (!employee) {
      return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 });
    }

    // Формируем объект переопределений
    const overrides: NonNullable<Employee['managerOverrides']> = {};

    if (body.preferredShiftType && ['day', 'night', 'any'].includes(body.preferredShiftType)) {
      overrides.preferredShiftType = body.preferredShiftType;
    }
    if (body.weekdayPreferredShiftType && ['day', 'night', 'any'].includes(body.weekdayPreferredShiftType)) {
      overrides.weekdayPreferredShiftType = body.weekdayPreferredShiftType;
    }
    if (body.weekendPreferredShiftType && ['day', 'night', 'any'].includes(body.weekendPreferredShiftType)) {
      overrides.weekendPreferredShiftType = body.weekendPreferredShiftType;
    }
    if (body.targetShiftsPerMonth !== undefined) {
      const num = Number(body.targetShiftsPerMonth);
      if (Number.isFinite(num)) {
        overrides.targetShiftsPerMonth = Math.max(1, Math.min(31, Math.trunc(num)));
      }
    }
    if (body.shiftLoadPreference && ['less', 'standard', 'more'].includes(body.shiftLoadPreference)) {
      overrides.shiftLoadPreference = body.shiftLoadPreference;
    }
    if (body.availableDays && ['all', 'weekdays_only', 'weekends_only'].includes(body.availableDays)) {
      overrides.availableDays = body.availableDays;
    }
    if (typeof body.canWork24hShifts === 'boolean') {
      overrides.canWork24hShifts = body.canWork24hShifts;
    }
    if (body.note !== undefined) {
      overrides.note = body.note ? String(body.note).slice(0, 300) : undefined;
    }

    // Если body.clearOverrides — удалить все переопределения
    if (body.clearOverrides) {
      delete (employee as any).managerOverrides;
    } else if (Object.keys(overrides).length > 0) {
      overrides.updatedAt = new Date().toISOString();
      employee.managerOverrides = {
        ...(employee.managerOverrides || {}),
        ...overrides,
      };
    }

    await saveEntity('employee', employee);
    invalidateEmployeesCache();

    return NextResponse.json({ employee });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
