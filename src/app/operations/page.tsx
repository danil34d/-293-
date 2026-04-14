export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData, getWashEventsData } from '@/lib/data-loader';
import { OperationsClient } from './components/OperationsClient';

export default async function OperationsPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [shifts, employees, washEvents] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
    getWashEventsData(),
  ]);

  // Today's shifts at wash_1
  const todayWash1Shifts = shifts.filter(s => s.date === today && s.washId === 'wash_1');

  // Determine current shift type
  const hour = new Date().getHours();
  const currentShiftType = (hour >= 8 && hour < 20) ? 'day' : 'night';

  // Employees per box
  const box1Shifts = todayWash1Shifts.filter(s => s.boxNumber === 1 && s.shiftType === currentShiftType);
  const box2Shifts = todayWash1Shifts.filter(s => s.boxNumber === 2 && s.shiftType === currentShiftType);

  const box1EmployeeIds = Array.from(new Set(box1Shifts.flatMap(s => s.employeeIds)));
  const box2EmployeeIds = Array.from(new Set(box2Shifts.flatMap(s => s.employeeIds)));

  const realEmployees = employees.filter(e => e.role !== 'kiosk');

  const box1Employees = box1EmployeeIds
    .map(id => realEmployees.find(e => e.id === id))
    .filter(Boolean) as typeof realEmployees;

  const box2Employees = box2EmployeeIds
    .map(id => realEmployees.find(e => e.id === id))
    .filter(Boolean) as typeof realEmployees;

  // Today's wash events
  const todayEvents = washEvents.filter(e => e.timestamp?.startsWith(today));

  return (
    <OperationsClient
      box1Employees={box1Employees}
      box2Employees={box2Employees}
      todayEvents={todayEvents}
      allEmployees={realEmployees}
      currentShiftType={currentShiftType}
    />
  );
}
