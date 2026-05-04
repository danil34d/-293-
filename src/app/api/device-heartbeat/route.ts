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

// In-memory storage. Map<key, DeviceHeartbeat>
// key = "auth:<employeeId>" или "anon:<deviceId>"
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
  // Двухрежимный auth:
  //   1. Cookie auth (нормальный путь — для будущего APK или Web-клиента)
  //   2. Anonymous device — если cookie не прислан, идентифицируем по X-Device-Id
  //      (текущий APK 1.5.5 не парсит наш cookie-формат, баг HeartbeatService.java)
  const auth = requireAuth();
  const isAuthenticated = !(auth instanceof NextResponse);

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

  // Identity:
  // - если auth есть → employeeId + username + role + fullName из cookie
  // - иначе → X-Device-Id заголовок или body.deviceId, role='unknown'
  let identity: {
    key: string;
    employeeId: string;
    username: string;
    role: string;
    fullName: string;
  };

  if (isAuthenticated) {
    const a = auth as Exclude<typeof auth, NextResponse>;
    identity = {
      key: `auth:${a.id}`,
      employeeId: a.id,
      username: a.username,
      role: String(a.role),
      fullName: a.fullName || a.username,
    };
  } else {
    const deviceId =
      request.headers.get('x-device-id') ||
      (typeof body.deviceId === 'string' ? body.deviceId : null) ||
      `anon:${ip}`;
    identity = {
      key: `anon:${deviceId}`,
      employeeId: deviceId,
      username: '(anonymous)',
      role: 'unknown',
      fullName: 'Anonymous device',
    };
  }

  const existing = heartbeats.get(identity.key);
  const record: DeviceHeartbeat = {
    employeeId: identity.employeeId,
    username: identity.username,
    role: identity.role,
    fullName: identity.fullName,
    ip,
    userAgent: userAgent.substring(0, 200),
    appVersion,
    lastSeen: now,
    firstSeen: existing?.firstSeen || now,
    count: (existing?.count || 0) + 1,
  };

  heartbeats.set(identity.key, record);

  return NextResponse.json({
    ok: true,
    lastSeen: now,
    count: record.count,
    authenticated: isAuthenticated,
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
