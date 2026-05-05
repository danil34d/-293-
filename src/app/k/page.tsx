/**
 * /k — короткий URL входа для терминала.
 *
 * Прошить в APK как стартовый: http://192.168.1.150:3000/k
 *
 * Поведение:
 *  • Если уже есть валидная cookie kiosk-сессии → middleware не пропустит сюда (т.к. /k публичный, средневейр пропустит, но мы сами проверим)
 *  • Если запрос с LAN/Tailscale → выдаём cookie + редирект /kiosk
 *  • Если из интернета → JSON 403 от kiosk-init
 *
 * Этот server-component делает ВСЁ сам (минуя /api/* которые
 * не работают через redirect() в App Router).
 */
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getEmployeesData } from '@/lib/data';
import { signCookieValue } from '@/lib/employee-auth-cookie';

export const dynamic = 'force-dynamic';

const LAN_IP_REGEX = /^192\.168\.1\.\d{1,3}$/;
const TAILSCALE_IP_REGEX = /^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', 'localhost']);

function getClientIp(): string {
  const h = headers();
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

function isTrustedNetwork(ip: string): boolean {
  if (LOCALHOST_IPS.has(ip)) return true;
  if (LAN_IP_REGEX.test(ip)) return true;
  if (TAILSCALE_IP_REGEX.test(ip)) return true;
  return false;
}

export default async function KioskShortcutPage() {
  const ip = getClientIp();

  if (!isTrustedNetwork(ip)) {
    // Открыли с интернета — показываем сообщение
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="text-xl font-bold mb-2">Терминал доступен только в локальной сети</h1>
          <p className="text-sm text-gray-600 mb-4">
            Эта страница работает только когда устройство подключено к Wi-Fi автомойки
            (192.168.1.*) или через Tailscale.
          </p>
          <p className="text-xs text-gray-400">Ваш IP: {ip}</p>
        </div>
      </div>
    );
  }

  // Trusted IP — выдаём cookie kiosk1 и редиректим
  const employees = await getEmployeesData();
  const kioskDevice =
    employees.find((e) => (e.role as string) === 'kiosk1') ||
    employees.find((e) => e.username === 'kiosk');

  if (!kioskDevice) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md text-center text-red-700">
          <div className="text-4xl mb-3">⚠</div>
          <h1 className="text-xl font-bold mb-2">Терминал не зарегистрирован</h1>
          <p className="text-sm">
            В БД отсутствует запись с role=&apos;kiosk1&apos;. Обратитесь к администратору.
          </p>
        </div>
      </div>
    );
  }

  // Создаём подписанную cookie
  const { password: _, ...deviceData } = kioskDevice;
  const cookieValue = JSON.stringify(deviceData);
  const signed = signCookieValue(cookieValue);

  // Set cookie через next/headers cookies()
  const cookieStore = cookies();
  cookieStore.set('employee_auth_sim', signed, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // неделя
  });

  // Редирект на главную терминала
  redirect('/kiosk');
}
