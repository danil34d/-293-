export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { addDays, endOfDay, endOfMonth, isWithinInterval, startOfDay, startOfMonth } from 'date-fns';
import { getEmployeesData, getShiftsData } from '@/lib/data';
import {
  getShiftPartnerIdForEmployee,
  getShiftReleasedEmployeeId,
  isEmployeeLinkedToShift,
  isEmployeeReleasedFromShift,
} from '@/lib/shift-state';
import { requireTelegramInternalAuth } from '@/lib/telegram-internal-auth';
import type { TelegramInternalApiResponse } from '@/types/telegram-bot';

type ScheduleRange = 'today' | 'week' | 'month';

function resolveRange(range: ScheduleRange): { start: Date; end: Date } {
  const now = new Date();
  switch (range) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'week':
      return { start: startOfDay(now), end: endOfDay(addDays(now, 6)) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
}

export async function GET(request: Request) {
  const auth = requireTelegramInternalAuth(request);
  if (auth !== true) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employeeId')?.trim();
    const range = (searchParams.get('range')?.trim() || 'today') as ScheduleRange;

    if (!employeeId) {
      return NextResponse.json({ ok: false, error: 'employeeId is required' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    if (range !== 'today' && range !== 'week' && range !== 'month') {
      return NextResponse.json({ ok: false, error: 'range must be one of: today, week, month' } satisfies TelegramInternalApiResponse<never>, { status: 400 });
    }

    const [employees, shifts] = await Promise.all([getEmployeesData(), getShiftsData()]);
    const employeeMap = new Map(employees.map((e) => [e.id, e.fullName]));
    const { start, end } = resolveRange(range);

    const result = shifts
      .filter((shift) => isEmployeeLinkedToShift(shift, employeeId))
      .filter((shift) => {
        const shiftDate = new Date(`${shift.date}T00:00:00`);
        return isWithinInterval(shiftDate, { start, end });
      })
      .sort((a, b) => {
        const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        if (a.shiftType === b.shiftType) return a.boxNumber - b.boxNumber;
        return a.shiftType === 'day' ? -1 : 1;
      })
      .map((shift) => {
        const partnerId = getShiftPartnerIdForEmployee(shift, employeeId);
        const releasedEmployeeId = getShiftReleasedEmployeeId(shift);
        return {
          id: shift.id,
          date: shift.date,
          boxNumber: shift.boxNumber,
          shiftType: shift.shiftType,
          startTime: shift.startTime,
          endTime: shift.endTime,
          releasedEmployeeId,
          partnerId: partnerId || null,
          partnerName: partnerId ? employeeMap.get(partnerId) || null : null,
          isReleasedForEmployee: isEmployeeReleasedFromShift(shift, employeeId),
          isPartnerReleased: Boolean(partnerId && releasedEmployeeId === partnerId),
        };
      });

    const employeeName = employeeMap.get(employeeId) || null;

    return NextResponse.json({
      ok: true,
      data: {
        employeeId,
        employeeName,
        range,
        generatedAt: new Date().toISOString(),
        shifts: result,
      },
    } satisfies TelegramInternalApiResponse<unknown>);
  } catch (error) {
    console.error('Error building telegram schedule:', error);
    return NextResponse.json({ ok: false, error: 'Internal Server Error' } satisfies TelegramInternalApiResponse<never>, { status: 500 });
  }
}
