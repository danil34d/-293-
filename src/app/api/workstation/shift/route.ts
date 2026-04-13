export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Shift } from '@/types';
import { getShiftsData, invalidateShiftsCache } from '@/lib/data';
import { saveEntity } from '@/lib/data/write-helpers';
import { requireAuth } from '@/lib/server-auth';

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

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return NextResponse.json({ error: 'Нужно выбрать хотя бы одного сотрудника' }, { status: 400 });
    }
    if (boxNumber !== 1 && boxNumber !== 2) {
      return NextResponse.json({ error: 'Некорректный бокс. Допустимо: 1 или 2' }, { status: 400 });
    }

    const now = new Date();
    const hour = now.getHours();
    const shiftType = hour < 20 && hour >= 8 ? 'day' : 'night';
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const shiftId = `shift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const newShift: Shift = {
      id: shiftId,
      washId: boxNumber === 2 ? 'wash_2' : 'wash_1',
      date,
      boxNumber,
      employeeIds: [...new Set(employeeIds)],
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
    const { shiftId, employeeIds } = body;

    if (!shiftId || !Array.isArray(employeeIds)) {
      return NextResponse.json({ error: 'shiftId и employeeIds обязательны' }, { status: 400 });
    }

    const shifts = await getShiftsData();
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) {
      return NextResponse.json({ error: 'Смена не найдена' }, { status: 404 });
    }
    if (shift.status !== 'active') {
      return NextResponse.json({ error: 'Смена не активна' }, { status: 400 });
    }

    const updatedShift: Shift = {
      ...shift,
      employeeIds: [...new Set(employeeIds)],
    };

    await saveEntity('shift', updatedShift);
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
