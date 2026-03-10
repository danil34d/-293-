export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { Aggregator } from '@/types';
import { invalidateAggregatorsCache } from '@/lib/data-loader';
import { requireAuth } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'aggregators');

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  try {
    const { activePriceListName } = await request.json();
    const filePath = path.join(dataDir, `${id}.json`);

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const aggregator: Aggregator = JSON.parse(fileContent);

    // Проверяем что такой прайс-лист существует
    const exists = aggregator.priceLists.some(pl => pl.name === activePriceListName);
    if (!exists) {
      return NextResponse.json({ error: 'Прайс-лист не найден' }, { status: 400 });
    }

    aggregator.activePriceListName = activePriceListName;

    await fs.writeFile(filePath, JSON.stringify(aggregator, null, 2), 'utf-8');
    invalidateAggregatorsCache();

    return NextResponse.json(aggregator);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Агрегатор не найден' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
