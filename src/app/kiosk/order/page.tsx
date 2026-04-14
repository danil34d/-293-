export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { getShiftsData, getEmployeesData } from '@/lib/data-loader';
import { KioskOrderClient } from './KioskOrderClient';

export default async function KioskOrderPage() {
  const today = new Date().toISOString().slice(0, 10);

  const [shifts, employees] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
  ]);

  // Today's shifts at wash_1
  const todayWash1Shifts = shifts.filter(s => s.date === today && s.washId === 'wash_1');

  // Determine current shift type by hour
  const hour = new Date().getHours();
  const currentShiftType = (hour >= 8 && hour < 20) ? 'day' : 'night';

  // Get employees for each box from schedule
  const box1Shifts = todayWash1Shifts.filter(s => s.boxNumber === 1 && s.shiftType === currentShiftType);
  const box2Shifts = todayWash1Shifts.filter(s => s.boxNumber === 2 && s.shiftType === currentShiftType);

  const box1EmployeeIds = Array.from(new Set(box1Shifts.flatMap(s => s.employeeIds)));
  const box2EmployeeIds = Array.from(new Set(box2Shifts.flatMap(s => s.employeeIds)));

  // Filter out kiosk accounts
  const realEmployees = employees.filter(e => e.role !== 'kiosk');

  const box1Employees = box1EmployeeIds
    .map(id => realEmployees.find(e => e.id === id))
    .filter(Boolean) as typeof realEmployees;

  const box2Employees = box2EmployeeIds
    .map(id => realEmployees.find(e => e.id === id))
    .filter(Boolean) as typeof realEmployees;

  return (
    <KioskOrderClient
      box1Employees={box1Employees}
      box2Employees={box2Employees}
    />
  );
}
