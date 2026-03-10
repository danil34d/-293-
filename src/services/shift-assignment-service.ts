import fs from 'fs/promises';
import path from 'path';
import type { Shift, ShiftAssignmentRequest, ShiftRequestStatus, ShiftType, WashId } from '@/types';
import { getShiftAssignmentRequestsData, getShiftsData, invalidateShiftAssignmentRequestsCache, invalidateShiftsCache } from '@/lib/data-loader';
import { ServiceError } from './service-error';
import { normalizeWashId } from '@/lib/wash';

const ASSIGNMENT_DIR = path.join(process.cwd(), 'data', 'shift-assignment-requests');
const SHIFTS_DIR = path.join(process.cwd(), 'data', 'shifts');

type AssignmentResolveStatus = Extract<ShiftRequestStatus, 'accepted' | 'rejected' | 'cancelled'>;

interface AssignmentPermissionContext {
  actorId: string;
  isAdmin: boolean;
}

interface CreateAssignmentInput {
  employeeId: string;
  date: string;
  shiftType: ShiftType;
  boxNumber: 1 | 2;
  washId?: WashId | string;
  comment?: string;
}

interface ResolveAssignmentInput extends AssignmentPermissionContext {
  requestId: string;
  status: AssignmentResolveStatus;
}

async function ensureDirectory(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

function normalizeDate(input: string): string {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ServiceError('Некорректная дата. Ожидается формат YYYY-MM-DD.', 400);
  }
  return trimmed;
}

export async function createAssignmentRequest(input: CreateAssignmentInput, ctx: AssignmentPermissionContext): Promise<ShiftAssignmentRequest> {
  const employeeId = input.employeeId?.trim();
  const date = normalizeDate(input.date);
  const shiftType = input.shiftType;
  const boxNumber = input.boxNumber;
  const washId = normalizeWashId(input.washId);
  const comment = input.comment?.trim();

  if (!employeeId) {
    throw new ServiceError('employeeId обязателен', 400);
  }

  if (!ctx.isAdmin && ctx.actorId !== employeeId) {
    throw new ServiceError('Недостаточно прав для создания запроса за другого сотрудника', 403);
  }

  if (shiftType !== 'day' && shiftType !== 'night') {
    throw new ServiceError('Некорректный тип смены', 400);
  }

  if (boxNumber !== 1 && boxNumber !== 2) {
    throw new ServiceError('Некорректный номер бокса', 400);
  }

  const now = new Date();
  const requestDate = new Date(`${date}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (requestDate < today) {
    throw new ServiceError('Нельзя запросить смену на прошедшую дату', 400);
  }

  const requests = await getShiftAssignmentRequestsData();
  const duplicatePending = requests.find(
    (r) =>
      r.employeeId === employeeId &&
      r.date === date &&
      r.shiftType === shiftType &&
      r.boxNumber === boxNumber &&
      r.washId === washId &&
      r.status === 'pending'
  );

  if (duplicatePending) {
    throw new ServiceError('Похожий запрос уже существует и ожидает решения', 409);
  }

  const created: ShiftAssignmentRequest = {
    id: `assignment_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    washId,
    createdAt: new Date().toISOString(),
    employeeId,
    date,
    shiftType,
    boxNumber,
    status: 'pending',
    comment: comment || undefined,
  };

  await ensureDirectory(ASSIGNMENT_DIR);
  await fs.writeFile(path.join(ASSIGNMENT_DIR, `${created.id}.json`), JSON.stringify(created, null, 2), 'utf-8');
  await invalidateShiftAssignmentRequestsCache();
  return created;
}

async function saveAssignmentRequest(updatedRequest: ShiftAssignmentRequest): Promise<void> {
  await ensureDirectory(ASSIGNMENT_DIR);
  await fs.writeFile(path.join(ASSIGNMENT_DIR, `${updatedRequest.id}.json`), JSON.stringify(updatedRequest, null, 2), 'utf-8');
  await invalidateShiftAssignmentRequestsCache();
}

async function saveShift(shift: Shift): Promise<void> {
  await ensureDirectory(SHIFTS_DIR);
  await fs.writeFile(path.join(SHIFTS_DIR, `${shift.id}.json`), JSON.stringify(shift, null, 2), 'utf-8');
}

export async function resolveAssignmentRequest(input: ResolveAssignmentInput): Promise<ShiftAssignmentRequest> {
  const requests = await getShiftAssignmentRequestsData();
  const request = requests.find((r) => r.id === input.requestId);

  if (!request) {
    throw new ServiceError('Запрос на назначение смены не найден', 404);
  }

  if (request.status !== 'pending') {
    throw new ServiceError('Запрос уже обработан', 409);
  }

  if (input.status === 'cancelled') {
    const canCancel = input.isAdmin || input.actorId === request.employeeId;
    if (!canCancel) {
      throw new ServiceError('Недостаточно прав для отмены запроса', 403);
    }
  } else if (!input.isAdmin) {
    throw new ServiceError('Только администратор может принимать или отклонять запросы', 403);
  }

  const updatedRequest: ShiftAssignmentRequest = {
    ...request,
    status: input.status,
    resolvedAt: new Date().toISOString(),
    resolvedBy: input.isAdmin ? input.actorId : request.resolvedBy,
  };

  if (input.status === 'accepted') {
    const shifts = await getShiftsData();
    let targetShift = shifts.find(
      (s) =>
        s.date === request.date &&
        s.boxNumber === request.boxNumber &&
        s.shiftType === request.shiftType &&
        s.washId === request.washId
    );

    if (targetShift) {
      if (targetShift.employeeIds.includes(request.employeeId)) {
        throw new ServiceError('Сотрудник уже назначен на эту смену', 409);
      }

      if (targetShift.employeeIds.length >= 2) {
        throw new ServiceError('Смена уже заполнена (максимум 2 сотрудника)', 400);
      }

      targetShift = { ...targetShift, employeeIds: [...targetShift.employeeIds, request.employeeId] };
      await saveShift(targetShift);
    } else {
      const newShift: Shift = {
        id: `shift_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        washId: request.washId,
        date: request.date,
        boxNumber: request.boxNumber,
        employeeIds: [request.employeeId],
        shiftType: request.shiftType,
        startTime: request.shiftType === 'day' ? '08:00' : '20:00',
        endTime: request.shiftType === 'day' ? '20:00' : '08:00',
      };

      await saveShift(newShift);
    }

    await invalidateShiftsCache();
  }

  await saveAssignmentRequest(updatedRequest);
  return updatedRequest;
}

export async function cancelAssignmentRequest(requestId: string, ctx: AssignmentPermissionContext): Promise<ShiftAssignmentRequest> {
  return resolveAssignmentRequest({
    requestId,
    status: 'cancelled',
    actorId: ctx.actorId,
    isAdmin: ctx.isAdmin,
  });
}
