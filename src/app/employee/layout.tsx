'use client';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Home, CalendarDays, Wallet, ClipboardList } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { isKiosk } from '@/lib/employee-role';

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const { logout, employee } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

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
    { href: '/employee', icon: Home, label: 'Главная', active: isHome },
    { href: '/employee/schedule', icon: CalendarDays, label: 'График', active: isSchedule },
    { href: '/employee/workstation', icon: ClipboardList, label: 'Заказы', active: isWorkstation },
    { href: '/employee/finance', icon: Wallet, label: 'Зарплата', active: isFinance },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top header — compact for mobile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-800 truncate max-w-[200px]">
            {employee?.fullName || 'Сотрудник'}
          </h1>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Выход</span>
        </button>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20 p-4">{children}</main>

      {/* Bottom navigation — mobile-first */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-lg">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map(({ href, icon: Icon, label, active }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg transition-colors min-w-[60px]',
                active
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-800'
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
              <span className={cn('text-[11px]', active ? 'font-semibold' : 'font-medium')}>{label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
