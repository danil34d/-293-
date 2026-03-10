export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Shift } from '@/types';
import { getShiftsData, invalidateShiftsCache } from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';
import { isWashId, normalizeWashId } from '@/lib/wash';

const dataDir = path.join(process.cwd(), 'data', 'shifts');

async function ensureDataDirectory() {
  try {
    await fs.access(dataDir);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dataDir, { recursive: true });
    } else {
      throw error;
    }
  }
}

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // YYYY-MM format
    const employeeId = searchParams.get('employeeId');
    const washId = searchParams.get('washId');

    let shifts = await getShiftsData();

    // Filter by month if provided
    if (month) {
      shifts = shifts.filter(s => s.date.startsWith(month));
    }

    // Filter by employee if provided
    if (employeeId) {
      shifts = shifts.filter(s => s.employeeIds.includes(employeeId));
    }

    // Filter by wash if provided
    if (washId) {
      if (!isWashId(washId)) {
        return NextResponse.json({ error: 'Invalid washId. Allowed: wash_1, wash_2' }, { status: 400 });
      }
      shifts = shifts.filter(s => s.washId === washId);
    }

    return NextResponse.json(shifts);
  } catch (error) {
    console.error('Error reading shifts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    await ensureDataDirectory();
    const payload = await request.json() as Partial<Shift>;

    const date = isValidYmdDate(payload.date) ? payload.date.trim() : '';
    if (!date) {
      return NextResponse.json({ error: 'Некорректная дата. Ожидается формат YYYY-MM-DD' }, { status: 400 });
    }

    if (!isValidShiftType(payload.shiftType)) {
      return NextResponse.json({ error: 'Некорректный тип смены. Допустимо: day, night' }, { status: 400 });
    }
    const shiftType = payload.shiftType;

    if (payload.boxNumber !== 1 && payload.boxNumber !== 2) {
      return NextResponse.json({ error: 'Некорректный бокс. Допустимо: 1 или 2' }, { status: 400 });
    }
    const boxNumber = payload.boxNumber;

    const washId = normalizeWashId(payload.washId);
    const employeeIds = normalizeEmployeeIds(payload.employeeIds);
    if (employeeIds.length === 0) {
      return NextResponse.json({ error: 'Нужно выбрать хотя бы одного сотрудника' }, { status: 400 });
    }

    const startTime = typeof payload.startTime === 'string' && payload.startTime.trim()
      ? payload.startTime
      : shiftType === 'day' ? '08:00' : '20:00';
    const endTime = typeof payload.endTime === 'string' && payload.endTime.trim()
      ? payload.endTime
      : shiftType === 'day' ? '20:00' : '08:00';

    const shifts = await getShiftsData();
    const slot = { date, washId, boxNumber, shiftType } as const;
    const slotShifts = shifts.filter((shift) => isSameShiftSlot(shift, slot));
    const slotShiftIds = new Set(slotShifts.map((shift) => shift.id));

    // Validation: Check conflict within the SAME wash (another box)
    const conflictingShift = shifts.find((shift) => (
      shift.date === date &&
      shift.shiftType === shiftType &&
      normalizeWashId(shift.washId) === washId &&
      !slotShiftIds.has(shift.id) &&
      shift.employeeIds.some((employeeId) => employeeIds.includes(employeeId))
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
    const crossWashConflict = shifts.find((shift) => (
      shift.date === date &&
      shift.shiftType === shiftType &&
      normalizeWashId(shift.washId) === otherWashId &&
      shift.employeeIds.some((employeeId) => employeeIds.includes(employeeId))
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
      new Set([...slotShifts.flatMap((shift) => normalizeEmployeeIds(shift.employeeIds)), ...employeeIds])
    );

    if (mergedEmployeeIds.length > 2) {
      return NextResponse.json(
        { error: `Бокс ${boxNumber} переполнен: максимум 2 сотрудника на один бокс` },
        { status: 409 }
      );
    }

    if (slotShifts.length > 0) {
      const primaryShift = slotShifts.reduce((best, current) =>
        current.employeeIds.length > best.employeeIds.length ? current : best
      );

      const updatedShift: Shift = {
        ...primaryShift,
        washId,
        date,
        boxNumber,
        shiftType,
        startTime,
        endTime,
        employeeIds: mergedEmployeeIds,
      };

      await fs.writeFile(path.join(dataDir, `${primaryShift.id}.json`), JSON.stringify(updatedShift, null, 2), 'utf-8');

      const duplicateIds = slotShifts
        .filter((shift) => shift.id !== primaryShift.id)
        .map((shift) => shift.id);

      await Promise.all(
        duplicateIds.map(async (duplicateId) => {
          try {
            await fs.unlink(path.join(dataDir, `${duplicateId}.json`));
          } catch (unlinkError: any) {
            if (unlinkError?.code !== 'ENOENT') throw unlinkError;
          }
        })
      );

      await invalidateShiftsCache();
      return NextResponse.json(
        {
          message: 'Shift updated successfully',
          shift: updatedShift,
          mergedDuplicates: duplicateIds.length,
        },
        { status: 200 }
      );
    }

    const payloadId = typeof payload.id === 'string' ? payload.id.trim() : '';
    const shiftId = payloadId || `shift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (shifts.some((shift) => shift.id === shiftId)) {
      return NextResponse.json({ error: 'Shift ID already exists' }, { status: 409 });
    }

    const newShift: Shift = {
      id: shiftId,
      washId,
      date,
      boxNumber,
      employeeIds,
      shiftType,
      startTime,
      endTime,
    };

    const filePath = path.join(dataDir, `${newShift.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(newShift, null, 2), 'utf-8');
    await invalidateShiftsCache();

    return NextResponse.json({ message: 'Shift created successfully', shift: newShift }, { status: 201 });
  } catch (error) {
    console.error('Error creating shift:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
