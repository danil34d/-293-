/**
 * Список всех устройств отбивавшихся heartbeat'ами с момента старта сервера.
 * Доступно только admin/kiosk1.
 *
 * Использование:
 *   GET /api/device-heartbeat/list
 *   →  { devices: [...], serverTime, totalActiveLast5Min, totalActiveLast1Hour }
 *
 * Для админ-панели «активные устройства» (TODO).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { hasAdminAccess, isKiosk } from '@/lib/employee-role';
import { heartbeats } from '../route';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (!hasAdminAccess(auth) && !isKiosk(auth) && (auth.role as string) !== 'kiosk1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = Date.now();
  const FIVE_MIN = 5 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;

  const devices = Array.from(heartbeats.values())
    .map((d) => ({
      ...d,
      ageSec: Math.round((now - new Date(d.lastSeen).getTime()) / 1000),
    }))
    .sort((a, b) => a.ageSec - b.ageSec);

  const activeLast5Min = devices.filter((d) => now - new Date(d.lastSeen).getTime() < FIVE_MIN).length;
  const activeLast1Hour = devices.filter((d) => now - new Date(d.lastSeen).getTime() < ONE_HOUR).length;

  return NextResponse.json({
    devices,
    totalDevices: devices.length,
    activeLast5Min,
    activeLast1Hour,
    serverTime: new Date().toISOString(),
  });
}
