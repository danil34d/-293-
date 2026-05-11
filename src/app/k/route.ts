/**
 * /k — короткий URL входа для терминала (Route Handler).
 *
 * Прошить в APK как стартовый: http://192.168.1.150:3000/k
 *
 * Behavior:
 *  • LAN (192.168.1.*) или Tailscale (100.x) → выдаём cookie kiosk1 + 302 → /kiosk
 *  • С интернета → 403 + понятная HTML-страница с объяснением
 *
 * Это Route Handler (не Page), потому что:
 *  - Server Component не может set cookies (Next.js read-only)
 *  - redirect() из next/navigation не работает к /api/*
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

function htmlResponse(title: string, body: string, status = 403): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #f3f4f6;
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);
            padding: 32px; max-width: 480px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: #111827; }
    p { font-size: 14px; color: #6b7280; line-height: 1.5; margin: 8px 0; }
    .ip { font-family: monospace; font-size: 12px; color: #9ca3af; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);

  if (!isTrustedNetwork(ip)) {
    return htmlResponse(
      'Терминал — нет доступа',
      `<div class="icon">🔒</div>
       <h1>Терминал работает только в локальной сети</h1>
       <p>Эта страница доступна только когда устройство подключено к Wi-Fi автомойки
       (192.168.1.*) или через Tailscale.</p>
       <p class="ip">Ваш IP: ${ip}</p>`,
      403,
    );
  }

  // Trusted IP — ищем kiosk-устройство в БД
  const employees = await getEmployeesData();
  const kioskDevice =
    employees.find((e) => (e.role as string) === 'kiosk1') ||
    employees.find((e) => e.username === 'kiosk');

  if (!kioskDevice) {
    return htmlResponse(
      'Терминал не зарегистрирован',
      `<div class="icon">⚠</div>
       <h1>Терминал-устройство не зарегистрирован</h1>
       <p>В БД отсутствует запись с role='kiosk1'. Обратитесь к администратору.</p>`,
      500,
    );
  }

  const { password: _, ...deviceData } = kioskDevice;
  const cookieValue = JSON.stringify(deviceData);
  const cookie = serializeEmployeeAuthCookie(request, cookieValue);

  // 302 редирект на главную терминала.
  // 🔥 ФИКС 1.6.0: request.url отдаёт http://0.0.0.0:3000 (адрес биндинга,
  // не клиентский) → WebView не мог подключиться → белый экран.
  // Берём хост из заголовка Host, который клиент реально использовал.
  const hostHeader = request.headers.get('host') || '192.168.1.150:3000';
  const protocol = request.headers.get('x-forwarded-proto')
    || (request.url.startsWith('https') ? 'https' : 'http');
  const redirectUrl = `${protocol}://${hostHeader}/kiosk`;

  const response = NextResponse.redirect(redirectUrl, 302);
  response.headers.set('Set-Cookie', cookie);
  return response;
}
