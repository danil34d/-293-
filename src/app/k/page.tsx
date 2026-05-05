/**
 * /k — короткий URL входа для терминала.
 *
 * Прошить в APK как стартовый: http://192.168.1.150:3000/k
 *
 * Поведение:
 *  • Если LAN/Tailscale → редирект через /api/auth/kiosk-init → cookie → /kiosk
 *  • Если cookie уже есть и валидна → middleware перенесёт сразу на /kiosk
 *  • Если запрос с интернета (не trusted) → JSON 403 от kiosk-init
 *
 * Эта страница НЕ рендерится — она просто middleware для прокидывания на init endpoint.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function KioskShortcutPage() {
  redirect('/api/auth/kiosk-init');
}
