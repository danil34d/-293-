export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData, getWashEventsData } from '@/lib/data';
import { KioskClient } from './components/KioskClient';

export default async function KioskPage() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [shifts, employees, washEvents] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getWashEventsData(),
  ]);

  // Shifts for today and tomorrow at wash_1
  const todayShifts = shifts.filter(s => s.date === todayStr && s.washId === 'wash_1');
  const tomorrowShifts = shifts.filter(s => s.date === tomorrowStr && s.washId === 'wash_1');

  // Today's employees from schedule
  const todayEmployeeIds = Array.from(new Set(todayShifts.flatMap(s => s.employeeIds)));

  // Recent wash events (today) for history
  const todayEvents = washEvents.filter(e => {
    if (!e.timestamp) return false;
    return e.timestamp.startsWith(todayStr);
  });

  return (
    <KioskClient
      todayShifts={todayShifts}
      tomorrowShifts={tomorrowShifts}
      todayEmployeeIds={todayEmployeeIds}
      employees={employees}
      todayEvents={todayEvents}
    />
  );
}
