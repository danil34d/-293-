export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData, getWashEventsData } from '@/lib/data';
import { fetchCameraSessionsRange, buildUnprocessedVehicles } from '@/lib/camera-pending-range';
import { isCompletedWashEvent } from '@/lib/wash-event-status';
import { isKiosk } from '@/lib/employee-role';
import { KioskClient } from './components/KioskClient';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function KioskPage() {
  const today = new Date();
  const todayStr = ymd(today);
  const sevenDaysAgoStr = ymd(new Date(Date.now() - 7 * 86_400_000));

  const [shifts, allEmployees, washEvents, cameraSessions] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getWashEventsData(),
    fetchCameraSessionsRange(sevenDaysAgoStr, todayStr),
  ]);

  // 🔥 Терминал/устройства НЕ показывать в списке "Сегодня на смене"
  // (это устройства, не люди — как POS-касса)
  const realPeople = allEmployees.filter((e) => !isKiosk(e));

  // Shifts for today at wash_1
  const todayShifts = shifts.filter((s) => s.date === todayStr && s.washId === 'wash_1');

  // Today's REAL employees from schedule (без терминалов)
  const todayEmployeeIds = Array.from(
    new Set(todayShifts.flatMap((s) => s.employeeIds)),
  ).filter((id) => realPeople.some((p) => p.id === id));

  // 🔥 ФИКС приватности: показываем только мойки ТЕКУЩЕЙ смены, а не за весь день.
  // Иначе мойщик ночной видит выручку дневной (и наоборот) — можно прикинуть
  // зарплату коллег. Граница смен: 08:00–20:00 = day, 20:00–08:00 = night.
  const currentHour = today.getHours();
  const isDayShift = currentHour >= 8 && currentHour < 20;

  function isInCurrentShift(timestamp: string): boolean {
    if (!timestamp) return false;
    const ts = new Date(timestamp);
    if (!Number.isFinite(ts.getTime())) return false;
    const sameDay = timestamp.startsWith(todayStr);
    const hr = ts.getHours();
    if (isDayShift) {
      // Дневная смена: с 8:00 сегодня до 20:00 сегодня
      return sameDay && hr >= 8 && hr < 20;
    } else if (currentHour >= 20) {
      // Ночь после 20:00: с 20:00 сегодня
      return sameDay && hr >= 20;
    } else {
      // Ночь до 8:00: события с 20:00 вчера или 0:00–8:00 сегодня
      const yesterdayStr = ymd(new Date(today.getTime() - 86_400_000));
      if (timestamp.startsWith(yesterdayStr)) return hr >= 20;
      return sameDay && hr < 8;
    }
  }

  const allTodayEvents = washEvents.filter((e) => isCompletedWashEvent(e));
  const shiftEvents = allTodayEvents.filter((e) => isInCurrentShift(e.timestamp || ''));

  // Pending camera (неоформленные) за неделю — для бейджа на главной
  const unprocessedCount = buildUnprocessedVehicles(
    cameraSessions,
    washEvents,
    sevenDaysAgoStr,
    todayStr,
  ).length;

  // Сводка: только текущая смена (приватность!)
  const box1Count = shiftEvents.filter((e) => e.boxNumber === 1).length;
  const box2Count = shiftEvents.filter((e) => e.boxNumber === 2).length;
  const shiftTotal = shiftEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  // 🔥 ДИЗАЙН 2026-05-10: разбивка кассы по 4 типам оплаты для Hero.
  // Из design handoff: мойщику полезно видеть сразу сколько чего набрали.
  const cashBreakdown = {
    cash: 0,        // 'cash'                  → Наличные
    card: 0,        // 'card'                  → Карта
    transfer: 0,    // 'transfer'              → Перевод
    cashless: 0,    // 'aggregator' + 'counterAgentContract' → Безнал
  };
  for (const e of shiftEvents) {
    const amount = e.totalAmount || 0;
    switch (e.paymentMethod) {
      case 'cash':
        cashBreakdown.cash += amount;
        break;
      case 'card':
        cashBreakdown.card += amount;
        break;
      case 'transfer':
        cashBreakdown.transfer += amount;
        break;
      case 'aggregator':
      case 'counterAgentContract':
        cashBreakdown.cashless += amount;
        break;
    }
  }

  return (
    <KioskClient
      todayEmployeeIds={todayEmployeeIds}
      employees={realPeople}            // ⚠ только реальные люди
      shiftCount={shiftEvents.length}
      box1Count={box1Count}
      box2Count={box2Count}
      shiftTotal={shiftTotal}
      shiftLabel={isDayShift ? 'дневной смены' : 'ночной смены'}
      isDayShift={isDayShift}
      cashBreakdown={cashBreakdown}
      unprocessedCount={unprocessedCount}
    />
  );
}
