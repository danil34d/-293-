export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { markDriverKickbacksReady } from '@/lib/data';

/**
 * Phase 50 / V2-#4.
 *
 * POST /api/driver-kickbacks/ready
 * Body: { ids: string[] }
 *
 * Bulk pending → ready (Q2 рекомендация: менеджер выбирает после оплаты
 * счёта контрагентом — частичная оплата ОК, не блокируем).
 *
 * Под requireAdmin.
 */
export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Передайте массив ids' }, { status: 400 });
    }

    const updated = await markDriverKickbacksReady(ids);

    console.log(
      `[driver-kickbacks/ready] admin=${auth.id} перевёл pending→ready: ${updated} из ${ids.length} запрошенных`
    );

    return NextResponse.json({ updated, requested: ids.length });
  } catch (error: any) {
    console.error('[POST /api/driver-kickbacks/ready] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
