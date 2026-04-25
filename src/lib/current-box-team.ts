import type { Employee, Shift, ShiftStatus, ShiftType, WashId } from '@/types';

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
  washId?: WashId;
}): ResolvedBoxShiftState {
  const { shifts, employees, date, shiftType, boxNumber, washId = 'wash_1' } = params;

  const relevantShifts = shifts
    .filter((shift) => (
      shift.date === date
      && shift.boxNumber === boxNumber
      && shift.shiftType === shiftType
      && (shift.washId || 'wash_1') === washId
      && shift.status !== 'completed'
    ))
    .sort(compareByPriority);

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
  washId?: WashId;
}) {
  const { shifts, employees, date, shiftType, washId = 'wash_1' } = params;

  return {
    box1: resolveBoxShiftState({ shifts, employees, date, shiftType, boxNumber: 1, washId }),
    box2: resolveBoxShiftState({ shifts, employees, date, shiftType, boxNumber: 2, washId }),
  };
}
