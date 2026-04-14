export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData } from '@/lib/data-loader';
import { ZorinWorkstationConsole } from '@/components/employee/ZorinWorkstationConsole';

interface Props {
  searchParams: { box?: string };
}

export default async function AdminWorkstationPage({ searchParams }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  const [shifts, employees] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
  ]);

  // Today's shifts at wash_1
  const todayWash1Shifts = shifts.filter(s => s.date === today && s.washId === 'wash_1');

  // Current shift type by hour
  const hour = new Date().getHours();
  const currentShiftType = (hour >= 8 && hour < 20) ? 'day' : 'night';

  // Employees per box from schedule
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

  // Pre-select box from query param
  const initialBox = searchParams.box === '2' ? 2 : searchParams.box === '1' ? 1 : undefined;

  return (
    <ZorinWorkstationConsole
      scheduleByBox={{ box1: box1Employees, box2: box2Employees }}
      initialBoxNumber={initialBox}
    />
  );
}
