/**
 * Kiosk auto-login endpoint (без пароля).
 *
 * Зачем: терминал общего пользования (TECNO BG6 в боксе) — это
 * НЕ человек, а МЕТКА устройства. Пароль в нём — антипаттерн.
 *
 * Как работает:
 *  1. APK прошит на http://192.168.1.150:3000/k → page.tsx → этот endpoint
 *  2. Endpoint проверяет: запрос с LAN IP (192.168.1.0/24) или с Tailscale (100.x)?
 *  3. Если да — выдаёт cookie kiosk1 без пароля → редирект на /kiosk
 *  4. Если нет (открыли через интернет) — 403 + текст «открой через локальную сеть»
 *
 * Безопасность:
 *  - LAN-trust: физический доступ в бокс контролируется (терминал прибит к стене)
 *  - В будущем заменить на device-token (см. backlog)
 *  - НЕ принимает username/password — только LAN IP
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEmployeesData } from '@/lib/data';
import { serializeEmployeeAuthCookie } from '@/lib/employee-auth-cookie';

export const dynamic = 'force-dynamic';

const LAN_IP_REGEX = /^192\.168\.1\.\d{1,3}$/;
const TAILSCALE_IP_REGEX = /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function isTrustedNetwork(ip: string): boolean {
  if (LOCALHOST_IPS.has(ip)) return true;
  if (LAN_IP_REGEX.test(ip)) return true;
  if (TAILSCALE_IP_REGEX.test(ip)) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (!isTrustedNetwork(ip)) {
    return NextResponse.json(
      {
        error: 'Kiosk auto-login доступен только из локальной сети автомойки',
        hint: 'Откройте через 192.168.1.150 (LAN) или Tailscale',
        yourIp: ip,
      },
      { status: 403 },
    );
  }

  // Ищем терминал-устройство в БД (запись с username='kiosk', role='kiosk1')
  const employees = await getEmployeesData();
  const kioskDevice =
    employees.find((e) => (e.role as string) === 'kiosk1') ||
    employees.find((e) => e.username === 'kiosk');

  if (!kioskDevice) {
    return NextResponse.json(
      { error: 'Терминал-устройство не зарегистрировано в БД (нужна запись role=kiosk1)' },
      { status: 500 },
    );
  }

  const { password: _pwd, ...deviceData } = kioskDevice;
  const cookieValue = JSON.stringify(deviceData);
  const cookie = serializeEmployeeAuthCookie(request, cookieValue);

  // 302 редирект на главную терминала
  const redirectUrl = new URL('/kiosk', request.url);
  const response = NextResponse.redirect(redirectUrl, 302);
  response.headers.set('Set-Cookie', cookie);
  return response;
}
