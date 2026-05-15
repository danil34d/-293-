export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { WashEvent } from '@/types';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, readEntity } from '@/lib/data/write-helpers';
import { invalidateWashEventsCache } from '@/lib/data';

/**
 * POST /api/wash-events/[id]/restore
 *
 * Phase 12 / finding #41: восстановление dismissed мойки.
 *
 * Сценарий: сотрудник пометил машину «уехала не помывшись» (`status='dismissed'`),
 * потом передумал — клиент всё-таки помылся, надо оформить нормально.
 * Раньше — только psql вручную, теперь — кнопка «Восстановить» в /wash-log.
 *
 * Что делает:
 *  - Читает WashEvent
 *  - Если status='dismissed' → переводит в 'restored' + restoration meta
 *  - Иначе 400 (нечего восстанавливать)
 *
 * После restore админ переходит в /wash-log/[id]/edit и заполняет реальную
 * услугу/сумму. Restored проходит isCompletedWashEvent → попадает в ZP-расчёт.
 *
 * Auth: requireAdmin (только админ может перевести dismissed→restored).
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash event ID is required' }, { status: 400 });
  }

  try {
    const existing = await readEntity<WashEvent>('washEvent', id);
    if (!existing) {
      return NextResponse.json({ error: 'Wash event not found' }, { status: 404 });
    }
    if (existing.status !== 'dismissed') {
      return NextResponse.json({
        error: 'Только dismissed мойки можно восстановить',
        currentStatus: existing.status ?? 'completed',
      }, { status: 400 });
    }

    const updated: WashEvent = {
      ...existing,
      status: 'restored',
      restoration: {
        restoredAt: new Date().toISOString(),
      },
    };

    await saveEntity('washEvent', updated);
    await invalidateWashEventsCache();

    return NextResponse.json({
      message: 'Wash event restored',
      event: updated,
      hint: 'Теперь откройте /wash-log/[id]/edit чтобы заполнить услугу и сумму.',
    });
  } catch (error: any) {
    console.error(`Error restoring wash event ${id}:`, error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
