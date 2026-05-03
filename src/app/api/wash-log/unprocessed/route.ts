import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getWashEventsData } from '@/lib/data';
import {
  buildUnprocessedVehicles,
  fetchCameraSessionsRange,
} from '@/lib/camera-pending-range';

const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 30;

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value + 'T00:00:00');
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/wash-log/unprocessed?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Возвращает список неоформленных camera-сессий за период.
 * Default: последние 7 дней. Max: 30 дней.
 *
 * Response:
 * {
 *   range: { from, to },
 *   total: number,
 *   groupedByDate: { "2026-04-27": 3, "2026-04-28": 1, ... },
 *   items: UnprocessedCameraVehicle[]
 * }
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const today = new Date();
  const fallbackFrom = new Date(today);
  fallbackFrom.setDate(today.getDate() - DEFAULT_RANGE_DAYS);

  let fromDate = parseDate(searchParams.get('from'), fallbackFrom);
  let toDate = parseDate(searchParams.get('to'), today);

  // Защита от слишком широкого диапазона (производительность)
  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / 86_400_000);
  if (diffDays > MAX_RANGE_DAYS) {
    fromDate = new Date(toDate);
    fromDate.setDate(toDate.getDate() - MAX_RANGE_DAYS);
  }

  // from > to → swap
  if (fromDate > toDate) {
    [fromDate, toDate] = [toDate, fromDate];
  }

  const fromKey = toDateKey(fromDate);
  const toKey = toDateKey(toDate);

  try {
    const [cameraSessions, washEvents] = await Promise.all([
      fetchCameraSessionsRange(fromKey, toKey),
      getWashEventsData(),
    ]);

    const items = buildUnprocessedVehicles(cameraSessions, washEvents, fromKey, toKey);

    // Группировка по дням для UI
    const groupedByDate: Record<string, number> = {};
    for (const item of items) {
      groupedByDate[item.dateKey] = (groupedByDate[item.dateKey] || 0) + 1;
    }

    return NextResponse.json({
      range: { from: fromKey, to: toKey },
      total: items.length,
      groupedByDate,
      items,
    });
  } catch (error: any) {
    console.error('GET /api/wash-log/unprocessed error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load unprocessed vehicles' },
      { status: 500 }
    );
  }
}
