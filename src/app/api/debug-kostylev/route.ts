export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getEmployeeTransactions, getAllEmployeeTransactions } from '@/lib/data';

export async function GET() {
  const direct = await getEmployeeTransactions('emp_1765740000001_kostylev_v');
  const all = await getAllEmployeeTransactions();
  const fromAll = all.filter((t) => t.employeeId === 'emp_1765740000001_kostylev_v');
  return NextResponse.json({
    DATA_SOURCE: process.env.DATA_SOURCE ?? '<unset>',
    directCount: direct.length,
    direct,
    fromAllCount: fromAll.length,
    fromAll,
  });
}
