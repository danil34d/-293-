export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Shift } from '@/types';
import { getShiftsData, invalidateShiftsCache } from '@/lib/data';
import { saveEntity } from '@/lib/data/write-helpers';
import { requireAuth } from '@/lib/server-auth';

function uniqueEmployeeIds(employeeIds: unknown): string[] {
  if (!Array.isArray(employeeIds)) {
    return [];
  }

  return Array.from(
    new Set(
      employeeIds
        .filter((employeeId): employeeId is string => typeof employeeId === 'string')
        .map((employeeId) => employeeId.trim())
        .filter(Boolean),
    ),
  );
}

function getShiftTimestamp(shift: Shift): number {
  if (shift.startedAt) {
    const startedAt = Date.parse(shift.startedAt);
    if (!Number.isNaN(startedAt)) {
      return startedAt;
    }
  }

  const idMatch = /^shift_(\d+)/.exec(shift.id || '');
  if (idMatch) {
    return Number(idMatch[1]);
  }

  return 0;
}

function findMatchingShifts(shifts: Shift[], params: { date: string; boxNumber: 1 | 2; shiftType: Shift['shiftType'] }) {
  return shifts.filter((shift) => (
    shift.date === params.date
    && shift.boxNumber === params.boxNumber
    && shift.shiftType === params.shiftType
  ));
}

/**
 * POST — Start a new shift from the workstation
 * Body: { employeeIds: string[], boxNumber: 1 | 2 }
 */
export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { employeeIds, boxNumber } = body;
    const normalizedEmployeeIds = uniqueEmployeeIds(employeeIds);

    if (normalizedEmployeeIds.length === 0) {
      return NextResponse.json({ error: 'Нужно выбрать хотя бы одного сотрудника' }, { status: 400 });
    }
    if (boxNumber !== 1 && boxNumber !== 2) {
      return NextResponse.json({ error: 'Некорректный бокс. Допустимо: 1 или 2' }, { status: 400 });
    }

    const now = new Date();
    const hour = now.getHours();
    const shiftType = hour < 20 && hour >= 8 ? 'day' : 'night';
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const shifts = await getShiftsData();
    const matchingShifts = findMatchingShifts(shifts, { date, boxNumber, shiftType }).sort((a, b) => getShiftTimestamp(b) - getShiftTimestamp(a));
    const existingActiveShift = matchingShifts.find((shift) => shift.status === 'active');
    const scheduledShift = matchingShifts.find((shift) => !shift.status || shift.status === 'scheduled');

    if (existingActiveShift) {
      const updatedActiveShift: Shift = {
        ...existingActiveShift,
        employeeIds: normalizedEmployeeIds,
      };

      await saveEntity('shift', updatedActiveShift);

      for (const companionShift of matchingShifts.filter((shift) => shift.id !== existingActiveShift.id && (!shift.status || shift.status === 'scheduled'))) {
        await saveEntity('shift', {
          ...companionShift,
          employeeIds: normalizedEmployeeIds,
        });
      }

      await invalidateShiftsCache();
      return NextResponse.json({ shift: updatedActiveShift, reused: true });
    }

    if (scheduledShift) {
      const activatedShift: Shift = {
        ...scheduledShift,
        washId: scheduledShift.washId || (boxNumber === 2 ? 'wash_2' : 'wash_1'),
        employeeIds: normalizedEmployeeIds,
        status: 'active',
        startedAt: now.toISOString(),
        closedAt: undefined,
      };

      await saveEntity('shift', activatedShift);

      for (const companionShift of matchingShifts.filter((shift) => shift.id !== scheduledShift.id && (!shift.status || shift.status === 'scheduled'))) {
        await saveEntity('shift', {
          ...companionShift,
          employeeIds: normalizedEmployeeIds,
        });
      }

      await invalidateShiftsCache();
      return NextResponse.json({ shift: activatedShift, reused: true }, { status: 201 });
    }

    const shiftId = `shift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const newShift: Shift = {
      id: shiftId,
      washId: boxNumber === 2 ? 'wash_2' : 'wash_1',
      date,
      boxNumber,
      employeeIds: normalizedEmployeeIds,
      shiftType,
      startTime: shiftType === 'day' ? '08:00' : '20:00',
      endTime: shiftType === 'day' ? '20:00' : '08:00',
      status: 'active',
      startedAt: now.toISOString(),
    };

    await saveEntity('shift', newShift);
    await invalidateShiftsCache();

    return NextResponse.json({ shift: newShift }, { status: 201 });
  } catch (error) {
    console.error('Error starting shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH — Update employees on an active shift
 * Body: { shiftId: string, employeeIds: string[] }
 */
export async function PATCH(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { shiftId, employeeIds, boxNumber } = body;
    const normalizedEmployeeIds = uniqueEmployeeIds(employeeIds);

    if (!shiftId && boxNumber !== 1 && boxNumber !== 2) {
      return NextResponse.json({ error: 'Нужен shiftId или корректный boxNumber' }, { status: 400 });
    }

    const shifts = await getShiftsData();
    let shift = shiftId ? shifts.find((candidate) => candidate.id === shiftId) : undefined;

    if (!shift && (boxNumber === 1 || boxNumber === 2)) {
      const now = new Date();
      const hour = now.getHours();
      const shiftType = hour < 20 && hour >= 8 ? 'day' : 'night';
      const date = now.toISOString().slice(0, 10);
      const matchingShifts = findMatchingShifts(shifts, { date, boxNumber, shiftType }).sort((a, b) => getShiftTimestamp(b) - getShiftTimestamp(a));
      shift = matchingShifts.find((candidate) => candidate.status === 'active') ?? matchingShifts.find((candidate) => !candidate.status || candidate.status === 'scheduled');

      if (!shift) {
        if (normalizedEmployeeIds.length === 0) {
          return NextResponse.json({ shift: null, reused: false, noop: true });
        }

        const createdShift: Shift = {
          id: `shift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          washId: boxNumber === 2 ? 'wash_2' : 'wash_1',
          date,
          boxNumber,
          employeeIds: normalizedEmployeeIds,
          shiftType,
          startTime: shiftType === 'day' ? '08:00' : '20:00',
          endTime: shiftType === 'day' ? '20:00' : '08:00',
          status: 'scheduled',
        };

        await saveEntity('shift', createdShift);
        await invalidateShiftsCache();

        return NextResponse.json({ shift: createdShift, reused: false }, { status: 201 });
      }
    }

    if (!shift) {
      return NextResponse.json({ error: 'Смена не найдена' }, { status: 404 });
    }
    if (shift.status === 'completed') {
      return NextResponse.json({ error: 'Завершённую смену менять нельзя' }, { status: 400 });
    }

    const updatedShift: Shift = {
      ...shift,
      employeeIds: normalizedEmployeeIds,
    };

    await saveEntity('shift', updatedShift);

    const companionShifts = findMatchingShifts(shifts, {
      date: shift.date,
      boxNumber: shift.boxNumber,
      shiftType: shift.shiftType,
    }).filter((candidate) => candidate.id !== shift.id && candidate.status !== 'completed');

    for (const companionShift of companionShifts) {
      await saveEntity('shift', {
        ...companionShift,
        employeeIds: normalizedEmployeeIds,
      });
    }

    await invalidateShiftsCache();

    return NextResponse.json({ shift: updatedShift });
  } catch (error) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PUT — End an active shift
 * Body: { shiftId: string }
 */
export async function PUT(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { shiftId } = body;

    if (!shiftId) {
      return NextResponse.json({ error: 'shiftId обязателен' }, { status: 400 });
    }

    const shifts = await getShiftsData();
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) {
      return NextResponse.json({ error: 'Смена не найдена' }, { status: 404 });
    }
    if (shift.status !== 'active') {
      return NextResponse.json({ error: 'Смена не активна' }, { status: 400 });
    }

    const now = new Date();

    const updatedShift: Shift = {
      ...shift,
      status: 'completed',
      closedAt: now.toISOString(),
    };

    await saveEntity('shift', updatedShift);

    const companionShifts = findMatchingShifts(shifts, {
      date: shift.date,
      boxNumber: shift.boxNumber,
      shiftType: shift.shiftType,
    }).filter((candidate) => candidate.id !== shift.id && (!candidate.status || candidate.status === 'scheduled'));

    for (const companionShift of companionShifts) {
      await saveEntity('shift', {
        ...companionShift,
        employeeIds: updatedShift.employeeIds,
        status: 'completed',
        startedAt: companionShift.startedAt || updatedShift.startedAt,
        closedAt: now.toISOString(),
      });
    }

    await invalidateShiftsCache();

    // Generate shift report
    let reportSummary = { totalWashes: 0, totalAmount: 0 };
    try {
      const { generateShiftReport } = await import('@/services/shift-report-service');
      reportSummary = await generateShiftReport(updatedShift);
    } catch (e) {
      console.error('Error generating shift report:', e);
    }

    return NextResponse.json({
      shift: updatedShift,
      summary: reportSummary,
    });
  } catch (error) {
    console.error('Error ending shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
