export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { getShiftsData, getEmployeesData } from '@/lib/data-loader';
import { EmployeeCabinetClient } from './components/EmployeeCabinetClient';

export default async function EmployeeCabinetPage() {
  const cookieStore = cookies();
  const authCookie = cookieStore.get('employee_auth_sim');
  let currentEmployeeId = '';

  if (authCookie?.value) {
    try {
      const decoded = decodeURIComponent(authCookie.value);
      const authData = JSON.parse(decoded);
      currentEmployeeId = authData.id;
    } catch (e) {}
  }

  const [shifts, employees] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
  ]);

  const currentEmployee = employees.find(e => e.id === currentEmployeeId) || null;

  // Today and tomorrow shifts for this employee
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const myShifts = shifts.filter(s => s.employeeIds.includes(currentEmployeeId));
  const todayShift = myShifts.find(s => s.date === todayStr);
  const tomorrowShift = myShifts.find(s => s.date === tomorrowStr);

  // Count shifts this month
  const monthStr = todayStr.slice(0, 7);
  const monthShifts = myShifts.filter(s => s.date.startsWith(monthStr));

  return (
    <EmployeeCabinetClient
      employee={currentEmployee}
      todayShift={todayShift || null}
      tomorrowShift={tomorrowShift || null}
      monthShiftCount={monthShifts.length}
      employees={employees}
    />
  );
}
