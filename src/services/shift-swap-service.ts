import fs from 'fs/promises';
import path from 'path';
import type { Shift, ShiftRequestType, ShiftSwapRequest } from '@/types';
import { getShiftById, getShiftSwapRequestsData, invalidateShiftSwapRequestsCache, invalidateShiftsCache } from '@/lib/data-loader';
import { ServiceError } from './service-error';

const SWAP_DIR = path.join(process.cwd(), 'data', 'shift-swap-requests');
const SHIFTS_DIR = path.join(process.cwd(), 'data', 'shifts');

interface SwapPermissionContext {
  actorId: string;
  isAdmin: boolean;
}

interface CreateSwapInput {
  requesterId: string;
  requesterShiftId: string;
  type: ShiftRequestType;
  targetEmployeeId: string;
  targetShiftId?: string;
}

interface RespondSwapInput extends SwapPermissionContext {
  requestId: string;
  decision: 'accepted' | 'rejected';
}

async function ensureDirectory(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function saveSwapRequest(request: ShiftSwapRequest) {
  await ensureDirectory(SWAP_DIR);
  await fs.writeFile(path.join(SWAP_DIR, `${request.id}.json`), JSON.stringify(request, null, 2), 'utf-8');
  await invalidateShiftSwapRequestsCache();
}

async function saveShift(shift: Shift) {
  await ensureDirectory(SHIFTS_DIR);
  await fs.writeFile(path.join(SHIFTS_DIR, `${shift.id}.json`), JSON.stringify(shift, null, 2), 'utf-8');
}

export async function createSwapRequest(input: CreateSwapInput, ctx: SwapPermissionContext): Promise<ShiftSwapRequest> {
  const requesterId = input.requesterId?.trim();
  const targetEmployeeId = input.targetEmployeeId?.trim();
  const requesterShiftId = input.requesterShiftId?.trim();
  const targetShiftId = input.targetShiftId?.trim();

  if (!requesterId || !targetEmployeeId || !requesterShiftId) {
    throw new ServiceError('requesterId, targetEmployeeId и requesterShiftId обязательны', 400);
  }

  if (input.type !== 'giveaway' && input.type !== 'swap') {
    throw new ServiceError('Некорректный тип заявки', 400);
  }

  if (!ctx.isAdmin && ctx.actorId !== requesterId) {
    throw new ServiceError('Недостаточно прав для создания заявки за другого сотрудника', 403);
  }

  if (requesterId === targetEmployeeId) {
    throw new ServiceError('Нельзя отправить заявку самому себе', 400);
  }

  const requesterShift = await getShiftById(requesterShiftId);
  if (!requesterShift) {
    throw new ServiceError('Смена инициатора не найдена', 404);
  }

  if (!requesterShift.employeeIds.includes(requesterId)) {
    throw new ServiceError('Инициатор не состоит в выбранной смене', 400);
  }

  if (input.type === 'swap') {
    if (!targetShiftId) {
      throw new ServiceError('Для обмена сменами требуется targetShiftId', 400);
    }
    const targetShift = await getShiftById(targetShiftId);
    if (!targetShift) {
      throw new ServiceError('Целевая смена для обмена не найдена', 404);
    }
    if (!targetShift.employeeIds.includes(targetEmployeeId)) {
      throw new ServiceError('Целевой сотрудник не состоит в выбранной смене', 400);
    }
  }

  const request: ShiftSwapRequest = {
    id: `swap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    type: input.type,
    createdAt: new Date().toISOString(),
    requesterId,
    requesterShiftId,
    targetEmployeeId,
    targetShiftId: input.type === 'swap' ? targetShiftId : undefined,
    status: 'pending',
  };

  await saveSwapRequest(request);
  return request;
}

export async function respondSwapRequest(input: RespondSwapInput): Promise<ShiftSwapRequest> {
  const requests = await getShiftSwapRequestsData();
  const request = requests.find((r) => r.id === input.requestId);
  if (!request) {
    throw new ServiceError('Заявка на обмен сменами не найдена', 404);
  }

  if (request.status !== 'pending') {
    throw new ServiceError('Заявка уже обработана', 409);
  }

  const canRespond = input.isAdmin || input.actorId === request.targetEmployeeId;
  if (!canRespond) {
    throw new ServiceError('Недостаточно прав для ответа на заявку', 403);
  }

  const updatedRequest: ShiftSwapRequest = {
    ...request,
    status: input.decision,
    resolvedAt: new Date().toISOString(),
  };

  if (input.decision === 'accepted') {
    const requesterShift = await getShiftById(request.requesterShiftId);
    if (!requesterShift) {
      throw new ServiceError('Смена инициатора не найдена', 404);
    }

    if (!request.targetEmployeeId) {
      throw new ServiceError('В заявке отсутствует targetEmployeeId', 400);
    }

    if (request.type === 'giveaway') {
      const newEmployeeIds = requesterShift.employeeIds.filter((id) => id !== request.requesterId);
      if (!newEmployeeIds.includes(request.targetEmployeeId)) {
        newEmployeeIds.push(request.targetEmployeeId);
      }
      await saveShift({ ...requesterShift, employeeIds: newEmployeeIds });
    } else {
      if (!request.targetShiftId) {
        throw new ServiceError('Для обмена требуется targetShiftId', 400);
      }
      const targetShift = await getShiftById(request.targetShiftId);
      if (!targetShift) {
        throw new ServiceError('Целевая смена не найдена', 404);
      }

      const requesterUpdated = requesterShift.employeeIds.filter((id) => id !== request.requesterId);
      if (!requesterUpdated.includes(request.targetEmployeeId)) {
        requesterUpdated.push(request.targetEmployeeId);
      }

      const targetUpdated = targetShift.employeeIds.filter((id) => id !== request.targetEmployeeId);
      if (!targetUpdated.includes(request.requesterId)) {
        targetUpdated.push(request.requesterId);
      }

      await saveShift({ ...requesterShift, employeeIds: requesterUpdated });
      await saveShift({ ...targetShift, employeeIds: targetUpdated });
    }

    await invalidateShiftsCache();
  }

  await saveSwapRequest(updatedRequest);
  return updatedRequest;
}

