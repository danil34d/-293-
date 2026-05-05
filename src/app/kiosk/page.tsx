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

  // Wash events за сегодня
  const todayEvents = washEvents.filter(
    (e) => e.timestamp?.startsWith(todayStr) && isCompletedWashEvent(e),
  );

  // Pending camera (неоформленные) за неделю — для бейджа на главной
  const unprocessedCount = buildUnprocessedVehicles(
    cameraSessions,
    washEvents,
    sevenDaysAgoStr,
    todayStr,
  ).length;

  // Сводка: total + по боксам
  const box1Count = todayEvents.filter((e) => e.boxNumber === 1).length;
  const box2Count = todayEvents.filter((e) => e.boxNumber === 2).length;
  const todayTotal = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  return (
    <KioskClient
      todayEmployeeIds={todayEmployeeIds}
      employees={realPeople}            // ⚠ только реальные люди
      todayCount={todayEvents.length}
      box1Count={box1Count}
      box2Count={box2Count}
      todayTotal={todayTotal}
      unprocessedCount={unprocessedCount}
    />
  );
}
