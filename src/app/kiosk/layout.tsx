'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { LogOut, Monitor, Home, ClipboardList, XCircle } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function KioskLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isEndingShift, setIsEndingShift] = useState(false);

  const isHome = pathname === '/kiosk';
  const isOrder = pathname.includes('/order');

  const handleEndShift = async () => {
    setIsEndingShift(true);
    try {
      // Clear kiosk session data
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isShiftActive');
        sessionStorage.removeItem('activeShiftId');
        sessionStorage.removeItem('selectedEmployees');
        sessionStorage.removeItem('selectedBoxNumber');
      }
      toast({ title: 'Смена завершена', description: 'Данные смены очищены.' });
      // Redirect to kiosk home
      window.location.href = '/kiosk';
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось завершить смену.', variant: 'destructive' });
    } finally {
      setIsEndingShift(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Kiosk header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-blue-600" />
          <h1 className="text-base font-bold text-gray-800">Терминал — Мойка 1</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEndShift}
            disabled={isEndingShift}
            className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-800 transition-colors font-medium"
          >
            <XCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Завершить смену</span>
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-red-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Выход</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-20 p-4">{children}</main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t shadow-lg">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          <Link
            href="/kiosk"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-lg transition-colors',
              isHome ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
            )}
          >
            <Home className={cn('h-5 w-5', isHome && 'stroke-[2.5]')} />
            <span className={cn('text-[11px]', isHome ? 'font-semibold' : 'font-medium')}>Главная</span>
          </Link>
          <Link
            href="/kiosk/order"
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 px-4 py-2 rounded-lg transition-colors',
              isOrder ? 'text-blue-600' : 'text-gray-500 hover:text-gray-800'
            )}
          >
            <ClipboardList className={cn('h-5 w-5', isOrder && 'stroke-[2.5]')} />
            <span className={cn('text-[11px]', isOrder ? 'font-semibold' : 'font-medium')}>Оформить</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
