export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData, getWashEventsData } from '@/lib/data';
import { getPendingCameraVehicles } from '@/lib/camera-pending';
import { resolveCurrentBoxShiftStates } from '@/lib/current-box-team';
import { isCompletedWashEvent } from '@/lib/wash-event-status';
import { OperationsClient } from './components/OperationsClient';
import type { WashId } from '@/types';

interface Props {
  searchParams: { wash?: string };
}

export default async function OperationsPage({ searchParams }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const washId: WashId = searchParams.wash === 'wash_2' ? 'wash_2' : 'wash_1';

  const [shifts, employees, washEvents] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getWashEventsData(),
  ]);

  const pendingCameraVehicles = await getPendingCameraVehicles(washEvents);

  // Determine current shift type
  const hour = new Date().getHours();
  const currentShiftType = (hour >= 8 && hour < 20) ? 'day' : 'night';

  const realEmployees = employees.filter(e => e.role !== 'kiosk');
  const boxShiftStates = resolveCurrentBoxShiftStates({
    shifts,
    employees: realEmployees,
    date: today,
    shiftType: currentShiftType,
    washId,
  });

  // Today's wash events
  const todayEvents = washEvents.filter(
    (event) => event.timestamp?.startsWith(today) && isCompletedWashEvent(event)
  );

  return (
    <OperationsClient
      box1Employees={boxShiftStates.box1.employees}
      box2Employees={boxShiftStates.box2.employees}
      todayEvents={todayEvents}
      initialPendingVehicles={pendingCameraVehicles}
      allEmployees={realEmployees}
      currentShiftType={currentShiftType}
      washId={washId}
    />
  );
}
