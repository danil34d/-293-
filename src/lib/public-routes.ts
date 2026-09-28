export function isLoginPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && pathname.startsWith('/login');
}

export function isWallboardPath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && (pathname.startsWith('/wallboard') || pathname.startsWith('/status'));
}

export function isPublicAppPath(pathname: string | null | undefined): boolean {
  return isLoginPath(pathname) || isWallboardPath(pathname);
}

/**
 * Страницы, куда пускают не-админа (кабинет сотрудника, терминал, вход, табло).
 * Всё остальное — админка. Общее правило для middleware (сервер) и AppLayout (браузер).
 *
 * 🔥 ФИКС 2026-09-28: раньше было pathname.startsWith('/employee') — под это
 * подходил и /employees (админский список сотрудников с паролями), и сотрудника
 * туда пускало. Сравниваем по сегменту пути.
 */
const NON_ADMIN_SECTIONS = ['/employee', '/kiosk', '/login', '/wallboard', '/status', '/k'];

export function isNonAdminAppPath(pathname: string | null | undefined): boolean {
  if (typeof pathname !== 'string') return false;
  return NON_ADMIN_SECTIONS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
