export const dynamic = 'force-dynamic';

import { getWashEventsData } from '@/lib/data';
import {
  buildUnprocessedVehicles,
  fetchCameraSessionsRange,
} from '@/lib/camera-pending-range';
import { UnprocessedClient } from './components/UnprocessedClient';

interface Props {
  searchParams: { from?: string; to?: string };
}

const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 30;

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value + 'T00:00:00');
  return Number.isFinite(d.getTime()) ? d : fallback;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function UnprocessedPage({ searchParams }: Props) {
  const today = new Date();
  const fallbackFrom = new Date(today);
  fallbackFrom.setDate(today.getDate() - DEFAULT_RANGE_DAYS);

  let fromDate = parseDate(searchParams.from, fallbackFrom);
  let toDate = parseDate(searchParams.to, today);

  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (diffDays > MAX_RANGE_DAYS) {
    fromDate = new Date(toDate);
    fromDate.setDate(toDate.getDate() - MAX_RANGE_DAYS);
  }
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];

  const fromKey = toDateKey(fromDate);
  const toKey = toDateKey(toDate);

  const [cameraSessions, washEvents] = await Promise.all([
    fetchCameraSessionsRange(fromKey, toKey),
    getWashEventsData(),
  ]);

  const items = buildUnprocessedVehicles(cameraSessions, washEvents, fromKey, toKey);

  // Группировка по дням для UI badge'ей
  const groupedByDate: Record<string, number> = {};
  for (const item of items) {
    groupedByDate[item.dateKey] = (groupedByDate[item.dateKey] || 0) + 1;
  }

  return (
    <UnprocessedClient
      initialItems={items}
      initialGroupedByDate={groupedByDate}
      initialRange={{ from: fromKey, to: toKey }}
    />
  );
}
