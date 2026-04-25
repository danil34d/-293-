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

  // Filter out kiosk accounts
  const realEmployees = employees.filter(e => e.role !== 'kiosk');
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

  return (
    <KioskOrderClient
      box1Employees={boxShiftStates.box1.employees}
      box2Employees={boxShiftStates.box2.employees}
      todayEvents={todayEvents}
      allEmployees={realEmployees}
      initialPendingVehicles={pendingCameraVehicles}
    />
  );
}
