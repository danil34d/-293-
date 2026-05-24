'use client';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Bell, BellDot, Home, CalendarDays, Wallet, ClipboardList } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { isKiosk } from '@/lib/employee-role';
import { EmployeeAvatar } from '@/components/employee/EmployeeAvatar';
import { LogoutConfirmSheet } from '@/components/employee/sheets/LogoutConfirmSheet';
import { NotificationsSheet, type NotificationItem } from '@/components/employee/sheets/NotificationsSheet';

/** Формат уведомления, который отдаёт GET /api/employee/notifications. */
interface ApiNotificationItem {
  id: string;
  type: 'swap-incoming' | 'request-approved' | 'request-rejected' | 'shift-assigned' | 'info';
  title: string;
  body?: string;
  createdAt: string;
  link?: string;
  level?: 'info' | 'warn' | 'success';
}

/** «N мин/час/дн назад» для краткой ленты уведомлений. */
function timeAgo(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.round(diffMs / 60_000);
    if (min < 1) return 'Только что';
    if (min < 60) return `${min} мин назад`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} ч назад`;
    const d = Math.round(hr / 24);
    if (d === 1) return 'Вчера';
    if (d < 7) return `${d} дн назад`;
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/** API-формат → UI-формат для существующего NotificationsSheet. */
function toUiNotification(api: ApiNotificationItem): NotificationItem {
  // 'shift-assigned' UI пока не знает — мапим на 'request-approved' (sky/blue стиль)
  const kindMap: Record<ApiNotificationItem['type'], NotificationItem['kind']> = {
    'swap-incoming': 'swap-incoming',
    'request-approved': 'request-approved',
    'request-rejected': 'request-rejected',
    'shift-assigned': 'request-approved',
    info: 'info',
  };
  return {
    id: api.id,
    kind: kindMap[api.type] ?? 'info',
    title: api.title,
    subtitle: api.body,
    ago: timeAgo(api.createdAt),
    href: api.link,
  };
}

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const { logout, employee } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [bellOpen, setBellOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/employee/notifications', { credentials: 'include' });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: ApiNotificationItem[] };
      const items = Array.isArray(data.items) ? data.items.map(toUiNotification) : [];
      setNotifications(items);
    } catch {
      // молчим — bell просто останется без счётчика
    }
  }, []);

  useEffect(() => {
    if (!employee?.id) return;
    if (isKiosk(employee)) return;
    fetchNotifications();
    // лёгкий пуллинг каждые 60 сек, пока вкладка открыта
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [employee?.id, employee, fetchNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    const ids = notifications.map((n) => n.id);
    if (ids.length === 0) return;
    setNotifications([]);
    try {
      await fetch('/api/employee/notifications/mark-read', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // если упало — при следующем GET список снова появится, не критично
    }
  }, [notifications]);

  if (pathname === '/login') {
    return <>{children}</>;
  }

  // Kiosk should not see employee layout — redirect to /kiosk
  if (isKiosk(employee)) {
    router.push('/kiosk');
    return null;
  }

  const isHome = pathname === '/employee';
  const isWorkstation = pathname.includes('/workstation');
  const isFinance = pathname.includes('/finance');
  const isSchedule = pathname.includes('/schedule');

  const navItems = [
    { href: '/employee', icon: Home, label: 'Главная', active: isHome, accent: 'blue' as const },
    { href: '/employee/schedule', icon: CalendarDays, label: 'График', active: isSchedule, accent: 'blue' as const, badge: notifications.length > 0 },
    { href: '/employee/workstation', icon: ClipboardList, label: 'Заказы', active: isWorkstation, accent: 'blue' as const },
    { href: '/employee/finance', icon: Wallet, label: 'Зарплата', active: isFinance, accent: 'emerald' as const },
  ];

  const fullName = employee?.fullName || 'Сотрудник';
  const seed = employee?.id || fullName;
  const hasNotifications = notifications.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top header — compact mobile */}
      <header className="sticky top-0 z-30 border-b border-white/40 bg-white/85 backdrop-blur-md shadow-sm">
        <div className="flex h-14 items-center justify-between px-3">
          <div className="flex items-center gap-2 min-w-0">
            <EmployeeAvatar seed={seed} fullName={fullName} size="sm" ring />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Сотрудник</span>
              <span className="text-sm font-bold text-gray-900 truncate">{fullName}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setBellOpen(true)}
              aria-label="Уведомления"
              className="relative flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-blue-50 transition"
            >
              {hasNotifications ? <BellDot className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {hasNotifications && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                  <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">
                    {notifications.length}
                  </span>
                </span>
              )}
            </button>
            <div className="mx-1 h-6 w-px bg-gray-200" />
            <button
              type="button"
              onClick={() => setLogoutOpen(true)}
              aria-label="Выход"
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              {/* lucide LogOut import optional - using inline svg via Bell? — оставим текст */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20 p-4">{children}</main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="grid max-w-lg mx-auto grid-cols-4 gap-1 px-2 py-2">
          {navItems.map(({ href, icon: Icon, label, active, accent, badge }) => {
            const activeColor = active
              ? accent === 'emerald'
                ? 'text-emerald-600'
                : 'text-blue-600'
              : 'text-gray-500 hover:text-gray-800';
            const indicatorGradient =
              accent === 'emerald'
                ? 'from-emerald-500 to-teal-600'
                : 'from-blue-500 to-indigo-600';
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition min-w-[60px]',
                  activeColor,
                )}
              >
                {active && (
                  <span
                    className={cn(
                      'absolute -top-0.5 h-1 w-8 rounded-full bg-gradient-to-r',
                      indicatorGradient,
                    )}
                  />
                )}
                <Icon
                  className={cn('h-5 w-5', active && 'scale-110')}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span
                  className={cn(
                    'text-[11px]',
                    active ? 'font-bold' : 'font-medium',
                  )}
                >
                  {label}
                </span>
                {badge && !active && (
                  <span className="absolute right-3 top-1 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Sheets */}
      <LogoutConfirmSheet
        open={logoutOpen}
        onOpenChange={setLogoutOpen}
        onConfirm={logout}
        username={employee?.username}
      />
      <NotificationsSheet
        open={bellOpen}
        onOpenChange={setBellOpen}
        items={notifications}
        onMarkAllRead={handleMarkAllRead}
      />
    </div>
  );
}
