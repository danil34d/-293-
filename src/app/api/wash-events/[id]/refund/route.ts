export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { WashEvent } from '@/types';
import { invalidateWashEventsCache } from '@/lib/data';
import { readEntity, saveEntity } from '@/lib/data/write-helpers';
import { requireAuth } from '@/lib/server-auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  try {
    const { reason } = await request.json();

    const washEvent = await readEntity<WashEvent>('washEvent', id);
    if (!washEvent) {
      return NextResponse.json({ error: 'Мойка не найдена' }, { status: 404 });
    }

    if (washEvent.refundedAt) {
      return NextResponse.json({ error: 'Возврат уже оформлен' }, { status: 400 });
    }

    washEvent.refundedAt = new Date().toISOString();
    washEvent.refundReason = reason || 'Не указана';

    await saveEntity('washEvent', washEvent);
    await invalidateWashEventsCache();

    return NextResponse.json(washEvent);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
