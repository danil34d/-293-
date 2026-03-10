export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Employee } from '@/types';
import { requireAuth } from '@/lib/server-auth';
import { invalidateEmployeesCache } from '@/lib/data-loader';
import { serializeEmployeeAuthCookie } from '@/lib/employee-auth-cookie';

const dataDir = path.join(process.cwd(), 'data', 'employees');

type ShiftPref = 'day' | 'night' | 'any';
type ShiftLoad = 'less' | 'standard' | 'more';
type AvailDays = 'all' | 'weekdays_only' | 'weekends_only';

function parseShiftPref(value: unknown): ShiftPref | undefined {
  if (value === 'day' || value === 'night' || value === 'any') return value;
  return undefined;
}

function parseShiftPrefUpdate(value: unknown): ShiftPref | null | undefined {
  if (value === null) return null;
  return parseShiftPref(value);
}

function parseShiftLoad(value: unknown): ShiftLoad | undefined {
  if (value === 'less' || value === 'standard' || value === 'more') return value;
  return undefined;
}

function parseAvailDays(value: unknown): AvailDays | undefined {
  if (value === 'all' || value === 'weekdays_only' || value === 'weekends_only') return value;
  return undefined;
}

function clampInt(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

async function readEmployeeFile(employeeId: string): Promise<Employee | null> {
  const filePath = path.join(dataDir, `${employeeId}.json`);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as Employee;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeEmployeeFile(employeeId: string, employee: Employee): Promise<void> {
  const filePath = path.join(dataDir, `${employeeId}.json`);
  await fs.writeFile(filePath, JSON.stringify(employee, null, 2), 'utf-8');
}

export async function PUT(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON в теле запроса' }, { status: 400 });
  }

  const employeeId = auth.id;
  if (!employeeId) {
    return NextResponse.json({ error: 'Некорректная сессия: нет employeeId' }, { status: 401 });
  }

  const existing = await readEmployeeFile(employeeId);
  if (!existing) {
    return NextResponse.json({ error: 'Сотрудник не найден' }, { status: 404 });
  }

  const preferredShiftType = parseShiftPref(body?.preferredShiftType);
  const weekdayPreferredShiftTypeUpdate = parseShiftPrefUpdate(body?.weekdayPreferredShiftType);
  const weekendPreferredShiftTypeUpdate = parseShiftPrefUpdate(body?.weekendPreferredShiftType);
  const targetShiftsPerMonth = clampInt(body?.targetShiftsPerMonth, 1, 31);
  const wantsMoreShifts = typeof body?.wantsMoreShifts === 'boolean' ? body.wantsMoreShifts : undefined;
  const shiftLoadPreference = parseShiftLoad(body?.shiftLoadPreference);
  const availableDays = parseAvailDays(body?.availableDays);
  const canWork24hShifts = typeof body?.canWork24hShifts === 'boolean' ? body.canWork24hShifts : undefined;
  const scheduleNote = body?.scheduleNote !== undefined
    ? (body.scheduleNote === null ? '' : String(body.scheduleNote).slice(0, 200))
    : undefined;

  const updated: Employee = {
    ...existing,
    preferredShiftType: preferredShiftType ?? existing.preferredShiftType,
    targetShiftsPerMonth: targetShiftsPerMonth ?? existing.targetShiftsPerMonth,
    wantsMoreShifts: wantsMoreShifts ?? existing.wantsMoreShifts,
    shiftLoadPreference: shiftLoadPreference ?? existing.shiftLoadPreference,
    availableDays: availableDays ?? existing.availableDays,
    canWork24hShifts: canWork24hShifts ?? existing.canWork24hShifts,
  };

  // scheduleNote
  if (scheduleNote !== undefined) {
    if (scheduleNote === '' || scheduleNote === null) {
      delete (updated as any).scheduleNote;
    } else {
      updated.scheduleNote = scheduleNote;
    }
  }

  // weekday/weekend preference overrides
  if (weekdayPreferredShiftTypeUpdate === null) {
    delete (updated as any).weekdayPreferredShiftType;
  } else if (weekdayPreferredShiftTypeUpdate !== undefined) {
    updated.weekdayPreferredShiftType = weekdayPreferredShiftTypeUpdate;
  }

  if (weekendPreferredShiftTypeUpdate === null) {
    delete (updated as any).weekendPreferredShiftType;
  } else if (weekendPreferredShiftTypeUpdate !== undefined) {
    updated.weekendPreferredShiftType = weekendPreferredShiftTypeUpdate;
  }

  try {
    await writeEmployeeFile(employeeId, updated);
    invalidateEmployeesCache();

    // Обновляем cookie, чтобы UI сразу видел актуальные значения
    const { password: _password, ...employeeData } = updated;
    const cookieValue = JSON.stringify(employeeData);
    const cookie = serializeEmployeeAuthCookie(request, cookieValue);

    const response = NextResponse.json({ employee: employeeData });
    response.headers.set('Set-Cookie', cookie);
    return response;
  } catch (error) {
    console.error('Error updating employee preferences:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
