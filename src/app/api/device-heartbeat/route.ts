/**
 * Device heartbeat endpoint.
 *
 * APK (kiosk + personal flavor) бьёт сюда каждые 60 секунд
 * (см. HeartbeatService.java в D:\автомойка\ANDROID\APK-PROJECT\).
 * До 2026-05-04 endpoint не существовал — APK получал 404.
 *
 * Хранение: in-memory Map. При рестарте сервера — сбрасывается,
 * через минуту терминал восстановит свою запись.
 *
 * GET — нужен для UI «активные устройства» (см. /api/device-heartbeat/list)
 * POST — приём heartbeat от APK
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

interface DeviceHeartbeat {
  employeeId: string;
  username: string;
  role: string;
  fullName: string;
  ip: string;
  userAgent: string;
  appVersion: string | null;
  lastSeen: string; // ISO
  firstSeen: string; // ISO
  count: number;
}

// In-memory storage. Map<employeeId, DeviceHeartbeat>
// Экспортируем для /api/device-heartbeat/list
export const heartbeats = new Map<string, DeviceHeartbeat>();

function extractIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  // APK может слать пустой body — это нормально. Тело опционально.
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const appVersion =
    typeof body.version === 'string'
      ? body.version
      : typeof body.appVersion === 'string'
        ? body.appVersion
        : null;

  const ip = extractIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const now = new Date().toISOString();

  const existing = heartbeats.get(auth.id);
  const record: DeviceHeartbeat = {
    employeeId: auth.id,
    username: auth.username,
    role: String(auth.role),
    fullName: auth.fullName || auth.username,
    ip,
    userAgent: userAgent.substring(0, 200),
    appVersion,
    lastSeen: now,
    firstSeen: existing?.firstSeen || now,
    count: (existing?.count || 0) + 1,
  };

  heartbeats.set(auth.id, record);

  return NextResponse.json({
    ok: true,
    lastSeen: now,
    count: record.count,
  });
}

export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Возвращает текущий статус ВЫЗЫВАЮЩЕГО устройства
  const own = heartbeats.get(auth.id);
  return NextResponse.json({
    own: own || null,
    serverTime: new Date().toISOString(),
  });
}
