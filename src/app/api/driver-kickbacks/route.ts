export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getDriverKickbacks } from '@/lib/data';
import type { DriverKickbackStatus } from '@/types';

/**
 * Phase 50 / V2-#4 split-pricing.
 *
 * GET /api/driver-kickbacks?counterAgentId=&status=&washEventId=
 *   List бонусов водителям с фильтрами. Под requireAdmin.
 *   Используется в /counter-agents/[id]/edit «Водители» tab.
 */
export async function GET(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const counterAgentId = searchParams.get('counterAgentId') || undefined;
    const statusRaw = searchParams.get('status');
    const washEventId = searchParams.get('washEventId') || undefined;

    const status = (statusRaw === 'pending' || statusRaw === 'ready' || statusRaw === 'paid')
      ? (statusRaw as DriverKickbackStatus)
      : undefined;

    const items = await getDriverKickbacks({ counterAgentId, status, washEventId });
    return NextResponse.json(items);
  } catch (error: any) {
    console.error('[GET /api/driver-kickbacks] error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
