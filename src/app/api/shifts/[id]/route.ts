export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Shift } from '@/types';
import { getShiftById, getShiftsData, invalidateShiftsCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { normalizeWashId } from '@/lib/wash';
import { saveEntity, deleteEntity } from '@/lib/data/write-helpers';

function isValidShiftType(value: unknown): value is Shift['shiftType'] {
  return value === 'day' || value === 'night';
}

function normalizeEmployeeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed) unique.add(trimmed);
  }
  return Array.from(unique);
}

function isValidYmdDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function isSameShiftSlot(
  shift: Pick<Shift, 'date' | 'washId' | 'boxNumber' | 'shiftType'>,
  slot: Pick<Shift, 'date' | 'washId' | 'boxNumber' | 'shiftType'>
): boolean {
  return (
    shift.date === slot.date &&
    normalizeWashId(shift.washId) === normalizeWashId(slot.washId) &&
    shift.boxNumber === slot.boxNumber &&
    shift.shiftType === slot.shiftType
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const shift = await getShiftById(id);
    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }
    return NextResponse.json(shift);
  } catch (error) {
    console.error('Error reading shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const existingShift = await getShiftById(id);
    if (!existingShift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const updatedData: Partial<Shift> = await request.json();
    const shiftType = updatedData.shiftType ?? existingShift.shiftType;
    if (!isValidShiftType(shiftType)) {
      return NextResponse.json({ error: 'Некорректный тип смены. Допустимо: day, night' }, { status: 400 });
    }

    const date = updatedData.date ?? existingShift.date;
    if (!isValidYmdDate(date)) {
      return NextResponse.json({ error: 'Некорректная дата. Ожидается формат YYYY-MM-DD' }, { status: 400 });
    }

    const boxNumber = updatedData.boxNumber ?? existingShift.boxNumber;
    if (boxNumber !== 1 && boxNumber !== 2) {
      return NextResponse.json({ error: 'Некорректный бокс. Допустимо: 1 или 2' }, { status: 400 });
    }

    const washId = normalizeWashId(updatedData.washId ?? existingShift.washId);
    const requestedEmployeeIds = updatedData.employeeIds === undefined
      ? normalizeEmployeeIds(existingShift.employeeIds)
      : normalizeEmployeeIds(updatedData.employeeIds);
    if (requestedEmployeeIds.length === 0) {
      return NextResponse.json({ error: 'Нужно выбрать хотя бы одного сотрудника' }, { status: 400 });
    }

    const defaultStart = shiftType === 'day' ? '08:00' : '20:00';
    const defaultEnd = shiftType === 'day' ? '20:00' : '08:00';
    const startTime = typeof updatedData.startTime === 'string' && updatedData.startTime.trim()
      ? updatedData.startTime
      : updatedData.shiftType
        ? defaultStart
        : existingShift.startTime || defaultStart;
    const endTime = typeof updatedData.endTime === 'string' && updatedData.endTime.trim()
      ? updatedData.endTime
      : updatedData.shiftType
        ? defaultEnd
        : existingShift.endTime || defaultEnd;

    const allShifts = await getShiftsData();
    const slot = { date, washId, boxNumber, shiftType } as const;
    const siblingSlotShifts = allShifts.filter((shift) => shift.id !== id && isSameShiftSlot(shift, slot));
    const siblingSlotIds = new Set(siblingSlotShifts.map((shift) => shift.id));

    // Validation: Check conflict within the SAME wash (another box)
    const conflictingShift = allShifts.find((shift) => (
      shift.id !== id &&
      shift.date === date &&
      shift.shiftType === shiftType &&
      normalizeWashId(shift.washId) === washId &&
      !siblingSlotIds.has(shift.id) &&
      shift.employeeIds.some((employeeId) => requestedEmployeeIds.includes(employeeId))
    ));

    if (conflictingShift) {
      return NextResponse.json(
        {
          error: `Сотрудник уже назначен на эту смену в Бокс ${conflictingShift.boxNumber}`,
          conflictShiftId: conflictingShift.id,
          conflictBox: conflictingShift.boxNumber,
        },
        { status: 409 }
      );
    }

    // Validation: Check conflict on the OTHER wash (same date + same shift type)
    const otherWashId = washId === 'wash_1' ? 'wash_2' : 'wash_1';
    const crossWashConflict = allShifts.find((shift) => (
      shift.id !== id &&
      shift.date === date &&
      shift.shiftType === shiftType &&
      normalizeWashId(shift.washId) === otherWashId &&
      shift.employeeIds.some((employeeId) => requestedEmployeeIds.includes(employeeId))
    ));

    if (crossWashConflict) {
      return NextResponse.json(
        {
          error: `Сотрудник уже работает на ${otherWashId === 'wash_1' ? 'Мойке 1' : 'Мойке 2'} в эту смену. Один сотрудник не может быть на двух мойках одновременно`,
        },
        { status: 409 }
      );
    }

    const mergedEmployeeIds = Array.from(
      new Set([...requestedEmployeeIds, ...siblingSlotShifts.flatMap((shift) => normalizeEmployeeIds(shift.employeeIds))])
    );
    if (mergedEmployeeIds.length > 5) {
      return NextResponse.json(
        { error: `Бокс ${boxNumber} переполнен: максимум 5 сотрудников на один бокс` },
        { status: 409 }
      );
    }

    const updatedShift: Shift = {
      ...existingShift,
      ...updatedData,
      id,
      washId,
      date,
      boxNumber,
      shiftType,
      startTime,
      endTime,
      employeeIds: mergedEmployeeIds,
    };

    await saveEntity('shift', updatedShift);

    const duplicateIds = siblingSlotShifts.map((shift) => shift.id);
    await Promise.all(
      duplicateIds.map(async (duplicateId) => {
        try {
          await deleteEntity('shift', duplicateId);
        } catch (err: any) {
          // Ignore not-found errors during duplicate cleanup
        }
      })
    );

    await invalidateShiftsCache();
    return NextResponse.json({
      message: 'Shift updated successfully',
      shift: updatedShift,
      mergedDuplicates: duplicateIds.length,
    });
  } catch (error) {
    console.error('Error updating shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const targetShift = await getShiftById(id);
    if (!targetShift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    const allShifts = await getShiftsData();
    const slotShifts = allShifts.filter((shift) => isSameShiftSlot(shift, targetShift));
    const idsToDelete = Array.from(new Set(slotShifts.map((shift) => shift.id).concat(id)));

    await Promise.all(
      idsToDelete.map(async (shiftId) => {
        try {
          await deleteEntity('shift', shiftId);
        } catch (err: any) {
          // Ignore not-found errors during slot cleanup
        }
      })
    );
    await invalidateShiftsCache();

    return NextResponse.json({ message: 'Shift deleted successfully', deletedIds: idsToDelete });
  } catch (error) {
    console.error('Error deleting shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
