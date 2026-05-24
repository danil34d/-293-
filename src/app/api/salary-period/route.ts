export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getSalaryPeriod } from '@/lib/data';

/**
 * GET /api/salary-period?month=2026-05
 *
 * Возвращает статус закрытия периода ЗП для указанного месяца.
 * Используется UI на /salary-report (SafetyBar + button "Закрыть период")
 * и UI на /wash-log/[id]/edit (показать warning если период закрыт).
 *
 * Auth: requireAuth (любой залогиненный сотрудник может прочесть).
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const month = request.nextUrl.searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Query parameter `month` is required, format YYYY-MM' },
      { status: 400 }
    );
  }

  try {
    const period = await getSalaryPeriod(month);
    if (!period) {
      return NextResponse.json({ month, closed: false });
    }
    return NextResponse.json({
      month: period.month,
      closed: !!period.closed,
      closedBy: period.closedBy ?? null,
      closedAt: period.closedAt ?? null,
    });
  } catch (error: any) {
    console.error(`Error fetching salary period for ${month}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
