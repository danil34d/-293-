/**
 * /kiosk/history — История моек на терминале.
 *
 * 3 таба:
 *  • Бокс 1 — мойки сегодня в боксе 1
 *  • Бокс 2 — мойки сегодня в боксе 2
 *  • Не оформлено — pending camera (машины с камер которые ещё не оформили)
 *
 * Для большого терминала-телефона: крупные карточки, минимум деталей,
 * мгновенный переход на «Оформить» из Не-оформленных.
 */
export const dynamic = 'force-dynamic';

import { getWashEventsData } from '@/lib/data';
import {
  buildUnprocessedVehicles,
  fetchCameraSessionsRange,
} from '@/lib/camera-pending-range';
import { isCompletedWashEvent } from '@/lib/wash-event-status';
import { KioskHistoryClient } from './KioskHistoryClient';

function todayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export default async function KioskHistoryPage() {
  const today = todayKey();
  const sevenDaysAgo = todayKey(new Date(Date.now() - 7 * 86_400_000));

  const [allWashEvents, cameraSessions] = await Promise.all([
    getWashEventsData(),
    fetchCameraSessionsRange(sevenDaysAgo, today),
  ]);

  // Сегодняшние оформленные мойки
  const todayCompleted = allWashEvents.filter(
    (e) => e.timestamp?.startsWith(today) && isCompletedWashEvent(e),
  );

  const box1 = todayCompleted.filter((e) => e.boxNumber === 1);
  const box2 = todayCompleted.filter((e) => e.boxNumber === 2);

  // Неоформленные за последние 7 дней
  const unprocessed = buildUnprocessedVehicles(
    cameraSessions,
    allWashEvents,
    sevenDaysAgo,
    today,
  );

  return (
    <KioskHistoryClient
      box1Events={JSON.parse(JSON.stringify(box1))}
      box2Events={JSON.parse(JSON.stringify(box2))}
      unprocessed={unprocessed}
    />
  );
}
