export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { payDriverKickback } from '@/lib/data';

/**
 * Phase 50 / V2-#4.
 *
 * POST /api/driver-kickbacks/[id]/pay
 *
 * Переводит status='ready' → 'paid' в одной транзакции:
 *   1. DriverKickback.status='paid', paidAt=now, paidBy=auth.id
 *   2. NEW Expense(category='driver-kickback', amount, description)
 *
 * Если status НЕ 'ready' — 409 с пояснением (защита от случайной выплаты
 * до подтверждения оплаты контрагентом).
 *
 * Под requireAdmin.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'ID kickback required' }, { status: 400 });
    }

    const result = await payDriverKickback(id, auth.id);

    console.log(
      `[driver-kickbacks/pay] admin=${auth.id} выплатил ${result.kickback.driverName} (${result.kickback.amount}₽), expense=${result.expenseId}`
    );

    return NextResponse.json({
      kickback: result.kickback,
      expenseId: result.expenseId,
    });
  } catch (error: any) {
    console.error(`[POST /api/driver-kickbacks/${params.id}/pay] error:`, error);
    // Если status not ready — adapter кинул Error
    if (error.message?.includes("ожидался 'ready'")) {
      return NextResponse.json(
        {
          error: error.message,
          hint: 'Сначала переведите бонус в "ready" через /api/driver-kickbacks/ready после получения оплаты от контрагента.',
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
