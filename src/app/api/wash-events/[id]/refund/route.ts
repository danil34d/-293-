export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { WashEvent } from '@/types';
import { invalidateWashEventsCache } from '@/lib/data-loader';
import { requireAuth } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'wash-events');

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;

  try {
    const { reason } = await request.json();
    const filePath = path.join(dataDir, `${id}.json`);

    const fileContent = await fs.readFile(filePath, 'utf-8');
    const washEvent: WashEvent = JSON.parse(fileContent);

    if (washEvent.refundedAt) {
      return NextResponse.json({ error: 'Возврат уже оформлен' }, { status: 400 });
    }

    washEvent.refundedAt = new Date().toISOString();
    washEvent.refundReason = reason || 'Не указана';

    await fs.writeFile(filePath, JSON.stringify(washEvent, null, 2), 'utf-8');
    await invalidateWashEventsCache();

    return NextResponse.json(washEvent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Мойка не найдена' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
