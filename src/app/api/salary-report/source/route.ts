export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import {
  getAllEmployeeTransactions,
  getEmployeesData,
  getSalarySchemesData,
  getViolationsData,
  getWashEventsData,
} from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { withoutPassword } from '@/lib/employee-safe';

/**
 * Исходные данные для /salary-report (расчёт идёт в браузере).
 *
 * 🔥 ФИКС 2026-09-28: раньше SalaryReportClient вызывал функции data-loader
 * напрямую — они были server actions без проверки роли и отдавали сотрудников
 * вместе с паролями. Теперь только через этот роут и только админу.
 */
export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const [employees, washEvents, schemes, transactions, violations] = await Promise.all([
      getEmployeesData(),
      getWashEventsData(),
      getSalarySchemesData(),
      getAllEmployeeTransactions(),
      getViolationsData(),
    ]);
    return NextResponse.json({
      employees: employees.map(withoutPassword),
      washEvents,
      schemes,
      transactions,
      violations,
    });
  } catch (error) {
    console.error('[salary-report/source] ошибка чтения:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
