export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getShiftsData,
  getEmployeesData,
  getAllFinanceDataForEmployee,
} from '@/lib/data';
import { generateSalaryReport } from '@/services/salary-calculator';
import { EmployeeCabinetClient } from './components/EmployeeCabinetClient';
import { verifyCookieValue } from '@/lib/employee-auth-cookie';
import type { Shift, WashEvent, EmployeeTransaction } from '@/types';

// Heuristic: Какой shift активен прямо сейчас (для employee)
function findActiveShift(myShifts: Shift[], now: Date): Shift | null {
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const hour = now.getHours();

  // Day shift today (8-20)
  const dayToday = myShifts.find((s) => s.date === todayStr && s.shiftType === 'day');
  if (dayToday && hour >= 8 && hour < 20) return dayToday;

  // Night shift today (20-08 next day)
  const nightToday = myShifts.find((s) => s.date === todayStr && s.shiftType === 'night');
  if (nightToday && hour >= 20) return nightToday;

  // Night shift yesterday (still going at 0-8 today)
  const nightYesterday = myShifts.find((s) => s.date === yesterdayStr && s.shiftType === 'night');
  if (nightYesterday && hour < 8) return nightYesterday;

  return null;
}

// Find next upcoming shift after `now`
function findNextShift(myShifts: Shift[], now: Date, activeId?: string): Shift | null {
  const todayStr = now.toISOString().slice(0, 10);
  const future = myShifts
    .filter((s) => s.id !== activeId)
    .filter((s) => s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return future[0] || null;
}

function isToday(dateStr: string, now: Date): boolean {
  return dateStr === now.toISOString().slice(0, 10);
}

function todaysWashes(allWashes: WashEvent[], employeeId: string, now: Date): WashEvent[] {
  // Convert to Moscow time for "today" boundary
  const todayMsk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const todayStr = todayMsk.toISOString().slice(0, 10);
  return allWashes.filter((w) => {
    if (!w.employeeIds?.includes(employeeId)) return false;
    const ts = new Date(w.timestamp);
    const tsMsk = new Date(ts.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
    return tsMsk.toISOString().slice(0, 10) === todayStr;
  });
}

function thisMonthWashes(allWashes: WashEvent[], employeeId: string, now: Date): WashEvent[] {
  const todayMsk = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const monthStr = todayMsk.toISOString().slice(0, 7);
  return allWashes.filter((w) => {
    if (!w.employeeIds?.includes(employeeId)) return false;
    return new Date(w.timestamp).toISOString().slice(0, 7) === monthStr;
  });
}

function computeBalance(transactions: EmployeeTransaction[], earnedFromWashes: number): number {
  // Сумма знаком: payment/loan/purchase = -, bonus/debt_write_off = +
  const txnSum = transactions.reduce((sum, t) => {
    const sign = t.type === 'bonus' || t.type === 'debt_write_off' ? 1 : -1;
    return sum + sign * t.amount;
  }, 0);
  return earnedFromWashes + txnSum;
}

export default async function EmployeeCabinetPage() {
  const cookieStore = cookies();
  const authCookie = cookieStore.get('employee_auth_sim');
  let currentEmployeeId = '';
  let currentRole = '';

  if (authCookie?.value) {
    try {
      let rawPayload = verifyCookieValue(authCookie.value);
      if (!rawPayload) {
        rawPayload = decodeURIComponent(authCookie.value);
      }
      const authData = JSON.parse(rawPayload);
      currentEmployeeId = authData.id;
      currentRole = String(authData.role || '');
    } catch (e) {}
  }

  if (currentRole === 'kiosk' || currentRole === 'kiosk1') {
    redirect('/kiosk');
  }

  const [shifts, employees] = await Promise.all([
    getShiftsData(),
    getEmployeesData(),
  ]);

  const currentEmployee = employees.find((e) => e.id === currentEmployeeId) || null;

  // Если сотрудник не нашёлся (поломанная сессия) — рендерим клиент с null
  if (!currentEmployee) {
    return (
      <EmployeeCabinetClient
        employee={null}
        myShifts={[]}
        nextShift={null}
        activeShift={null}
        partnerName={null}
        todayEarned={0}
        todayWashCount={0}
        monthEarned={0}
        monthWashCount={0}
        monthShiftsDone={0}
        monthShiftsTarget={15}
        balance={0}
      />
    );
  }

  const now = new Date();
  const myShifts = shifts.filter((s) => s.employeeIds.includes(currentEmployeeId));
  const activeShift = findActiveShift(myShifts, now);
  const nextShift = findNextShift(myShifts, now, activeShift?.id);

  // Партнер на активной/следующей смене
  const referenceShift = activeShift || nextShift;
  const partnerName = referenceShift
    ? referenceShift.employeeIds
        .filter((id) => id !== currentEmployeeId && !!id)
        .map((id) => employees.find((e) => e.id === id)?.fullName)
        .filter(Boolean)[0] || null
    : null;

  // Финансы для сегодня/месяц
  let todayEarned = 0;
  let todayWashCount = 0;
  let monthEarned = 0;
  let monthWashCount = 0;
  let balance = 0;

  try {
    const { allWashEvents, allSchemes, initialTransactions } =
      await getAllFinanceDataForEmployee(currentEmployeeId);

    const todayList = todaysWashes(allWashEvents, currentEmployeeId, now);
    const monthList = thisMonthWashes(allWashEvents, currentEmployeeId, now);

    todayWashCount = todayList.length;
    monthWashCount = monthList.length;

    if (todayList.length) {
      const reports = await generateSalaryReport(todayList, [currentEmployee], allSchemes, undefined, employees);
      todayEarned = reports[0]?.totalEarnings ?? 0;
    }
    if (monthList.length) {
      const reports = await generateSalaryReport(monthList, [currentEmployee], allSchemes, undefined, employees);
      monthEarned = reports[0]?.totalEarnings ?? 0;
    }

    // Баланс — только за текущий месяц (txn + earned)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTxns = initialTransactions.filter((t) => new Date(t.date) >= monthStart);
    balance = computeBalance(monthTxns, monthEarned);
  } catch (e) {
    console.error('[employee/page] finance load failed', e);
  }

  // Цель смен — из preferences или дефолт 15
  const monthShiftsTarget = (currentEmployee as any).preferences?.targetShiftsPerMonth ?? 15;
  const monthStr = now.toISOString().slice(0, 7);
  const monthShiftsDone = myShifts.filter((s) => s.date.startsWith(monthStr)).length;

  return (
    <EmployeeCabinetClient
      employee={currentEmployee}
      myShifts={myShifts}
      nextShift={nextShift || null}
      activeShift={activeShift || null}
      partnerName={partnerName}
      todayEarned={todayEarned}
      todayWashCount={todayWashCount}
      monthEarned={monthEarned}
      monthWashCount={monthWashCount}
      monthShiftsDone={monthShiftsDone}
      monthShiftsTarget={monthShiftsTarget}
      balance={balance}
    />
  );
}
