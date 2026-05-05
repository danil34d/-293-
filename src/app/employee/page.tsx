export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getShiftsData, getEmployeesData } from '@/lib/data';
import { EmployeeCabinetClient } from './components/EmployeeCabinetClient';
import { verifyCookieValue } from '@/lib/employee-auth-cookie';

export default async function EmployeeCabinetPage() {
  const cookieStore = cookies();
  const authCookie = cookieStore.get('employee_auth_sim');
  let currentEmployeeId = '';
  let currentRole = '';

  if (authCookie?.value) {
    try {
      // Try signed cookie first, then fall back to unsigned (backward compat)
      let rawPayload = verifyCookieValue(authCookie.value);
      if (!rawPayload) {
        rawPayload = decodeURIComponent(authCookie.value);
      }
      const authData = JSON.parse(rawPayload);
      currentEmployeeId = authData.id;
      currentRole = String(authData.role || '');
    } catch (e) {}
  }

  // 🔥 Терминалы (kiosk/kiosk1) НЕ должны видеть employee-cabinet — это интерфейс для людей.
  // Редирект на /kiosk где специальный UI для устройства.
  if (currentRole === 'kiosk' || currentRole === 'kiosk1') {
    redirect('/kiosk');
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
