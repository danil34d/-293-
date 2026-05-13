export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { closeSalaryPeriod, openSalaryPeriod, getSalaryPeriod } from '@/lib/data';

/**
 * POST /api/salary-period/close
 * Body: { month: "2026-05", action?: "close" | "open" }
 *
 * Закрывает (или открывает) период ЗП. После закрытия:
 *  - PUT /api/wash-events/[id] и DELETE /api/wash-events/[id] для wash-events
 *    с timestamp.slice(0,7) === month возвращают 423 Locked.
 *  - Выплаты ЗП (POST /api/employees/[id]/transactions) НЕ блокируются
 *    (решение владельца: только WashEvent edit/delete).
 *
 * Owner: Менеджер Про. Auth: requireAdmin.
 *
 * См. АРХИТЕКТУРНЫЕ-НАХОДКИ #6: «post-payment edit WashEvent ломает баланс».
 */
export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { month?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const month = body.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Body must include `month` in format YYYY-MM' },
      { status: 400 }
    );
  }

  const action = body.action === 'open' ? 'open' : 'close';

  try {
    if (action === 'open') {
      await openSalaryPeriod(month);
      return NextResponse.json({ message: 'Период открыт', month, closed: false });
    } else {
      await closeSalaryPeriod(month, (auth as any).id);
      const updated = await getSalaryPeriod(month);
      return NextResponse.json({
        message: 'Период закрыт',
        month: updated?.month,
        closed: true,
        closedBy: updated?.closedBy,
        closedAt: updated?.closedAt,
      });
    }
  } catch (error: any) {
    console.error(`Error ${action} salary period ${month}:`, error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
