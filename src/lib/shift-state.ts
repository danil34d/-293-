import type { Shift } from '@/types';

function normalizeEmployeeId(value: string | undefined | null): string {
  return String(value || '').trim();
}

export function getShiftLinkedEmployeeIds(shift: Pick<Shift, 'employeeIds'>): string[] {
  return Array.from(
    new Set(
      (Array.isArray(shift.employeeIds) ? shift.employeeIds : [])
        .map((employeeId) => normalizeEmployeeId(employeeId))
        .filter(Boolean)
    )
  );
}

export function getShiftReleasedEmployeeId(shift: Partial<Pick<Shift, 'releasedEmployeeId'>>): string | undefined {
  const releasedEmployeeId = normalizeEmployeeId(shift.releasedEmployeeId);
  return releasedEmployeeId || undefined;
}

export function getShiftActiveEmployeeIds(
  shift: Pick<Shift, 'employeeIds'> & Partial<Pick<Shift, 'releasedEmployeeId'>>
): string[] {
  const releasedEmployeeId = getShiftReleasedEmployeeId(shift);
  return getShiftLinkedEmployeeIds(shift).filter((employeeId) => employeeId !== releasedEmployeeId);
}

export function isEmployeeLinkedToShift(
  shift: Pick<Shift, 'employeeIds'> & Partial<Pick<Shift, 'releasedEmployeeId'>>,
  employeeId: string
): boolean {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  if (!normalizedEmployeeId) return false;
  return getShiftLinkedEmployeeIds(shift).includes(normalizedEmployeeId);
}

export function isEmployeeActiveInShift(
  shift: Pick<Shift, 'employeeIds'> & Partial<Pick<Shift, 'releasedEmployeeId'>>,
  employeeId: string
): boolean {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  if (!normalizedEmployeeId) return false;
  return getShiftActiveEmployeeIds(shift).includes(normalizedEmployeeId);
}

export function isEmployeeReleasedFromShift(
  shift: Pick<Shift, 'employeeIds'> & Partial<Pick<Shift, 'releasedEmployeeId'>>,
  employeeId: string
): boolean {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  if (!normalizedEmployeeId) return false;
  return getShiftReleasedEmployeeId(shift) === normalizedEmployeeId;
}

export function getShiftPartnerIdForEmployee(
  shift: Pick<Shift, 'employeeIds'> & Partial<Pick<Shift, 'releasedEmployeeId'>>,
  employeeId: string
): string | undefined {
  const normalizedEmployeeId = normalizeEmployeeId(employeeId);
  if (!normalizedEmployeeId) return undefined;
  return getShiftLinkedEmployeeIds(shift).find((linkedEmployeeId) => linkedEmployeeId !== normalizedEmployeeId);
}
