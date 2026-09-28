export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData, getWashEventsData } from '@/lib/data';
import { getPendingCameraVehicles } from '@/lib/camera-pending';
import { resolveCurrentBoxShiftStates } from '@/lib/current-box-team';
import { isCompletedWashEvent } from '@/lib/wash-event-status';
import { KioskOrderClient } from './KioskOrderClient';

export default async function KioskOrderPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [shifts, employees, washEvents] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getWashEventsData(),
  ]);
  const pendingCameraVehicles = await getPendingCameraVehicles(washEvents);

  // Determine current shift type by hour
  const hour = new Date().getHours();
  const currentShiftType = (hour >= 8 && hour < 20) ? 'day' : 'night';

  // Filter out kiosk/kiosk1 (это устройства-терминалы, не сотрудники)
  const realEmployees = employees.filter(
    (e) => (e.role as string) !== 'kiosk' && (e.role as string) !== 'kiosk1'
  );
  const boxShiftStates = resolveCurrentBoxShiftStates({
    shifts,
    employees: realEmployees,
    date: today,
    shiftType: currentShiftType,
  });

  // Today's wash events
  const todayEvents = washEvents.filter(
    (event) => event.timestamp?.startsWith(today) && isCompletedWashEvent(event)
  );

  // 🔥 ФИКС 2026-08-09: shiftId вычисляется прямо здесь (resolveCurrentBoxShiftStates)
  // и ВЫБРАСЫВАЛСЯ — из состояния брали только .employees. Поэтому мойки,
  // оформленные с терминала, уходили в базу без привязки к смене: 75 записей
  // из 75 с shiftId = NULL за всю историю. Админский /workstation этот же проп
  // передаёт правильно (workstation/page.tsx:41) — расходились две страницы,
  // рендерящие один и тот же компонент.
  return (
    <KioskOrderClient
      box1Employees={boxShiftStates.box1.employees}
      box2Employees={boxShiftStates.box2.employees}
      shiftStateByBox={{
        box1: {
          shiftId: boxShiftStates.box1.shiftId,
          isShiftActive: boxShiftStates.box1.isShiftActive,
        },
        box2: {
          shiftId: boxShiftStates.box2.shiftId,
          isShiftActive: boxShiftStates.box2.isShiftActive,
        },
      }}
      todayEvents={todayEvents}
      allEmployees={realEmployees}
      initialPendingVehicles={pendingCameraVehicles}
    />
  );
}
