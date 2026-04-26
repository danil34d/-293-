export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getEmployeeTransactions, getAllEmployeeTransactions, getWashEventsData, getEmployeesData, getSalarySchemesData, getViolationsData } from '@/lib/data';
import { generateSalaryReport } from '@/services/salary-calculator';
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';

export async function GET() {
  const empId = 'emp_1765740000001_kostylev_v';
  const [allTx, allWash, employees, schemes, violations] = await Promise.all([
    getAllEmployeeTransactions(),
    getWashEventsData(),
    getEmployeesData(),
    getSalarySchemesData(),
    getViolationsData(),
  ]);
  const emp = employees.find((e: any) => e.id === empId);
  const periodStart = startOfDay(startOfMonth(new Date()));
  const periodEnd = endOfDay(endOfMonth(new Date()));
  const empTx = allTx.filter((t: any) => t.employeeId === empId);
  const periodTx = empTx.filter((t: any) => {
    const d = new Date(t.date);
    return d >= periodStart && d <= periodEnd;
  });
  const paymentsForPeriod = periodTx.filter((t: any) => t.type === 'payment').reduce((s: number, t: any) => s + t.amount, 0);
  const periodWash = allWash.filter((w: any) => w.employeeIds?.includes(empId) && new Date(w.timestamp) >= periodStart && new Date(w.timestamp) <= periodEnd);
  const periodViol = violations.filter((v: any) => v.employeeId === empId && v.date && new Date(v.date + 'T00:00:00') >= periodStart && new Date(v.date + 'T00:00:00') <= periodEnd);
  const report = (await generateSalaryReport(periodWash, [emp as any], schemes, periodViol))[0];
  return NextResponse.json({
    DATA_SOURCE: process.env.DATA_SOURCE ?? '<unset>',
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    transactionCount: empTx.length,
    periodTransactionCount: periodTx.length,
    paymentsForPeriod,
    transactions: empTx,
    earnings: report?.totalEarnings ?? 0,
    penalties: report?.totalPenalties ?? 0,
    earningsForPeriod: (report?.totalEarnings ?? 0) - (report?.totalPenalties ?? 0),
    payable: 0 + ((report?.totalEarnings ?? 0) - (report?.totalPenalties ?? 0)) - paymentsForPeriod,
  });
}
