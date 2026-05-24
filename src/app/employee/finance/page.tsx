export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { Employee, WashEvent } from '@/types';
import { verifyCookieValue } from '@/lib/employee-auth-cookie';
import { getAllFinanceDataForEmployee } from '@/lib/data';
import { generateSalaryReport } from '@/services/salary-calculator';
import { FinanceMobile } from './components/FinanceMobile';

async function getCurrentEmployee(): Promise<Employee | null> {
  const cookieStore = cookies();
  const c = cookieStore.get('employee_auth_sim');
  if (!c?.value) return null;
  try {
    let raw = verifyCookieValue(c.value);
    if (!raw) raw = decodeURIComponent(c.value);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isMyMonthWash(w: WashEvent, empId: string, monthStr: string): boolean {
  if (!w.employeeIds?.includes(empId)) return false;
  const mskMonth = new Date(w.timestamp).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }).slice(0, 7);
  return mskMonth === monthStr;
}

function isMyTodayWash(w: WashEvent, empId: string, todayStr: string): boolean {
  if (!w.employeeIds?.includes(empId)) return false;
  const mskDate = new Date(w.timestamp).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  return mskDate === todayStr;
}

export default async function MyFinancePage() {
  const employee = await getCurrentEmployee();
  if (!employee) {
    return (
      <div className="container mx-auto py-8 max-w-md">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Доступ запрещён</AlertTitle>
          <AlertDescription>Войдите в систему заново.</AlertDescription>
        </Alert>
      </div>
    );
  }
  if ((employee.role as string) === 'kiosk' || (employee.role as string) === 'kiosk1') {
    redirect('/kiosk');
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
  const monthStr = todayStr.slice(0, 7);

  let washes: WashEvent[] = [];
  let todayWashes: WashEvent[] = [];
  let todayEarned = 0;
  let monthEarned = 0;
  let transactions: any[] = [];
  let balance = 0;
  let sparkline: { date: string; amount: number }[] = [];
  let bestDay: { date: string; amount: number } | undefined;

  try {
    const { allWashEvents, allSchemes, initialTransactions, allEmployees } = await getAllFinanceDataForEmployee(employee.id);

    washes = allWashEvents.filter(w => isMyMonthWash(w, employee.id, monthStr));
    todayWashes = washes.filter(w => isMyTodayWash(w, employee.id, todayStr));

    if (todayWashes.length) {
      const r = await generateSalaryReport(todayWashes, [employee], allSchemes, undefined, allEmployees);
      todayEarned = r[0]?.totalEarnings ?? 0;
    }
    if (washes.length) {
      const r = await generateSalaryReport(washes, [employee], allSchemes, undefined, allEmployees);
      monthEarned = r[0]?.totalEarnings ?? 0;
    }

    // Текущие месячные транзакции (по дате)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    transactions = initialTransactions.filter(t => new Date(t.date) >= monthStart);

    // Баланс
    const txnSum = transactions.reduce((s: number, t: any) => {
      const sign = (t.type === 'bonus' || t.type === 'debt_write_off') ? 1 : -1;
      return s + sign * t.amount;
    }, 0);
    balance = monthEarned + txnSum;

    // Sparkline — последние 11 дней
    const days: string[] = [];
    for (let i = 10; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days.push(d.toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' }));
    }
    const groupByDay = new Map<string, WashEvent[]>();
    for (const w of washes) {
      const dateStr = new Date(w.timestamp).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
      if (days.includes(dateStr)) {
        const arr = groupByDay.get(dateStr) || [];
        arr.push(w);
        groupByDay.set(dateStr, arr);
      }
    }
    sparkline = await Promise.all(days.map(async (d) => {
      const dayWashes = groupByDay.get(d) || [];
      if (!dayWashes.length) return { date: d, amount: 0 };
      const r = await generateSalaryReport(dayWashes, [employee], allSchemes, undefined, allEmployees);
      return { date: d, amount: Math.round(r[0]?.totalEarnings ?? 0) };
    }));
    if (sparkline.length) {
      bestDay = sparkline.reduce((b, c) => (c.amount > b.amount ? c : b), sparkline[0]);
      if (bestDay.amount === 0) bestDay = undefined;
    }
  } catch (e) {
    console.error('[finance] load failed', e);
  }

  return (
    <FinanceMobile
      employee={employee}
      washes={washes}
      todayWashes={todayWashes}
      todayEarned={todayEarned}
      monthEarned={monthEarned}
      transactions={transactions}
      balance={balance}
      sparkline={sparkline}
      bestDay={bestDay}
    />
  );
}
