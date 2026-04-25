import type { Employee, Shift, ShiftStatus, ShiftType } from '@/types';

export type BoxNumber = 1 | 2;

export interface ResolvedBoxShiftState {
  boxNumber: BoxNumber;
  employees: Employee[];
  employeeIds: string[];
  shiftId: string | null;
  shiftStatus: ShiftStatus | null;
  isShiftActive: boolean;
}

function getShiftTimestamp(shift: Shift): number {
  if (shift.startedAt) {
    const startedAt = Date.parse(shift.startedAt);
    if (!Number.isNaN(startedAt)) {
      return startedAt;
    }
  }

  if (shift.closedAt) {
    const closedAt = Date.parse(shift.closedAt);
    if (!Number.isNaN(closedAt)) {
      return closedAt;
    }
  }

  const match = /^shift_(\d+)/.exec(shift.id || '');
  if (match) {
    return Number(match[1]);
  }

  return 0;
}

function compareByPriority(a: Shift, b: Shift): number {
  const statusWeight = (shift: Shift) => {
    if (shift.status === 'active') return 3;
    if (!shift.status || shift.status === 'scheduled') return 2;
    return 1;
  };

  const statusDelta = statusWeight(b) - statusWeight(a);
  if (statusDelta !== 0) {
    return statusDelta;
  }

  const employeeDelta = (b.employeeIds?.length || 0) - (a.employeeIds?.length || 0);
  if (employeeDelta !== 0) {
    return employeeDelta;
  }

  return getShiftTimestamp(b) - getShiftTimestamp(a);
}

function dedupeEmployeeIds(employeeIds: string[] = []): string[] {
  return Array.from(new Set(employeeIds.filter(Boolean)));
}

function mapEmployees(employeeIds: string[], employees: Employee[]): Employee[] {
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  return employeeIds
    .map((employeeId) => employeeMap.get(employeeId))
    .filter(Boolean) as Employee[];
}

export function resolveBoxShiftState(params: {
  shifts: Shift[];
  employees: Employee[];
  date: string;
  shiftType: ShiftType;
  boxNumber: BoxNumber;
}): ResolvedBoxShiftState {
  const { shifts, employees, date, shiftType, boxNumber } = params;
  // Prefer shifts whose washId matches the expected wash for this box.
  // Box 1 → wash_1, Box 2 → could be wash_1 (2nd box) or wash_2.
  // Active shifts take priority regardless, then prefer matching washId.
  const expectedWashId = boxNumber === 1 ? 'wash_1' : 'wash_2';

  const relevantShifts = shifts
    .filter((shift) => (
      shift.date === date
      && shift.boxNumber === boxNumber
      && shift.shiftType === shiftType
      && shift.status !== 'completed'
    ))
    .sort((a, b) => {
      const washMatchDelta = Number((b.washId || 'wash_1') === expectedWashId) - Number((a.washId || 'wash_1') === expectedWashId);
      if (washMatchDelta !== 0) {
        return washMatchDelta;
      }

      return compareByPriority(a, b);
    });

  const activeShift = relevantShifts.find((shift) => shift.status === 'active') ?? null;
  const primaryShift = activeShift ?? relevantShifts[0] ?? null;
  const employeeIds = primaryShift
    ? dedupeEmployeeIds(primaryShift.employeeIds)
    : [];

  return {
    boxNumber,
    employees: mapEmployees(employeeIds, employees),
    employeeIds,
    shiftId: primaryShift?.id ?? null,
    shiftStatus: primaryShift?.status ?? null,
    isShiftActive: primaryShift?.status === 'active',
  };
}

export function resolveCurrentBoxShiftStates(params: {
  shifts: Shift[];
  employees: Employee[];
  date: string;
  shiftType: ShiftType;
}) {
  const { shifts, employees, date, shiftType } = params;

  return {
    box1: resolveBoxShiftState({ shifts, employees, date, shiftType, boxNumber: 1 }),
    box2: resolveBoxShiftState({ shifts, employees, date, shiftType, boxNumber: 2 }),
  };
}
