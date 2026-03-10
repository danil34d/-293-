import type { WashId } from '@/types';

export const DEFAULT_WASH_ID: WashId = 'wash_1';

export function isWashId(value: unknown): value is WashId {
  return value === 'wash_1' || value === 'wash_2';
}

export function normalizeWashId(value: unknown): WashId {
  return value === 'wash_2' ? 'wash_2' : DEFAULT_WASH_ID;
}
