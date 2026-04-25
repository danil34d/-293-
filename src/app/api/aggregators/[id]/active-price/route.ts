export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Aggregator } from '@/types';
import { invalidateAggregatorsCache } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';
import { readEntity, saveEntity } from '@/lib/data/write-helpers';

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  try {
    const { activePriceListName } = await request.json();

    const aggregator = await readEntity<Aggregator>('aggregator', id);
    if (!aggregator) {
      return NextResponse.json({ error: 'Агрегатор не найден' }, { status: 404 });
    }

    // Проверяем что такой прайс-лист существует
    const exists = aggregator.priceLists.some(pl => pl.name === activePriceListName);
    if (!exists) {
      return NextResponse.json({ error: 'Прайс-лист не найден' }, { status: 400 });
    }

    aggregator.activePriceListName = activePriceListName;

    await saveEntity('aggregator', aggregator);
    invalidateAggregatorsCache();

    return NextResponse.json(aggregator);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
