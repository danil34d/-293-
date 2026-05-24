export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { CounterAgent, CounterAgentDriver } from '@/types';
import { invalidateCounterAgentsCache } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';
import { saveEntity, readEntity } from '@/lib/data/write-helpers';

/**
 * Phase 60c — POST /api/counter-agents/[id]/drivers/save-signature
 *
 * Сохраняет образец цифровой росписи водителя на CounterAgent.drivers[*].signature.
 * Вызывается с терминала (любой сотрудник) после регистрации мойки, если водитель
 * расписался и у него ещё нет сохранённой росписи.
 *
 * Body:
 *   { driverName: string, signature: string, phone?: string, overwrite?: boolean }
 *
 * Поведение:
 *   - find driver по name (case-insensitive trim)
 *   - если найден и (!driver.signature || overwrite) → set signature
 *   - если не найден → добавляем нового водителя { name, phone?, signature }
 *   - если найден с уже сохранённой росписью и !overwrite → ничего не делаем (200 unchanged)
 *
 * НЕ требует admin (нужно с kiosk/workstation).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Counter-agent ID is required' }, { status: 400 });
  }

  let body: { driverName?: string; signature?: string; phone?: string; overwrite?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const driverName = (body.driverName || '').trim();
  const signature = (body.signature || '').trim();
  if (!driverName) {
    return NextResponse.json({ error: 'driverName required' }, { status: 400 });
  }
  if (!signature || !signature.startsWith('data:image/')) {
    return NextResponse.json({ error: 'signature must be a valid dataURL' }, { status: 400 });
  }

  try {
    const agent = await readEntity<CounterAgent>('counterAgent', id);
    if (!agent) {
      return NextResponse.json({ error: 'Counter-agent not found' }, { status: 404 });
    }

    const drivers: CounterAgentDriver[] = Array.isArray(agent.drivers) ? [...agent.drivers] : [];
    const normalizedTarget = driverName.toLowerCase();
    const existingIdx = drivers.findIndex(d => (d.name || '').trim().toLowerCase() === normalizedTarget);

    let action: 'created' | 'updated' | 'unchanged' = 'unchanged';

    if (existingIdx === -1) {
      // нового водителя добавляем с росписью
      drivers.push({
        id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: driverName,
        phone: body.phone || undefined,
        signature,
      });
      action = 'created';
    } else {
      const driver = drivers[existingIdx];
      if (!driver.signature || body.overwrite) {
        drivers[existingIdx] = {
          ...driver,
          // обогащаем телефоном если раньше не было
          phone: driver.phone || body.phone || undefined,
          signature,
        };
        action = 'updated';
      }
      // если signature уже есть и не overwrite — оставляем как было
    }

    if (action !== 'unchanged') {
      await saveEntity('counterAgent', { ...agent, drivers });
      await invalidateCounterAgentsCache();
    }

    return NextResponse.json({ ok: true, action, driverCount: drivers.length });
  } catch (error: any) {
    console.error(`[Phase 60c] save-signature failed for counter-agent ${id}:`, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
