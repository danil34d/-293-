import type { WashEvent } from '@/types';

export function isDismissedWashEvent(event: WashEvent): boolean {
  return event.status === 'dismissed';
}

export function isRestoredWashEvent(event: WashEvent): boolean {
  return event.status === 'restored';
}

export function isCompletedWashEvent(event: WashEvent): boolean {
  return !event.status || event.status === 'completed';
}

export function blocksCameraPendingQueue(event: WashEvent): boolean {
  return isCompletedWashEvent(event) || isDismissedWashEvent(event);
}
