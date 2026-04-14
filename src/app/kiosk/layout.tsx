'use client';
import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
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
  const [endingBox, setEndingBox] = useState<number | null>(null);

  const isHome = pathname === '/kiosk';
  const isOrder = pathname.includes('/order');

  const handleEndBoxShift = async (boxNumber: number) => {
    setIsEndingShift(true);
    setEndingBox(boxNumber);
    try {
      if (typeof window !== 'undefined') {
        // Clear only the data for this specific box
        sessionStorage.removeItem('isShiftActive');
        sessionStorage.removeItem('activeShiftId');
        sessionStorage.removeItem('selectedEmployees');
        // Keep selectedBoxNumber — don't clear it
      }
      toast({
        title: `Бокс ${boxNumber} — смена завершена`,
        description: 'Данные смены очищены. Следующая команда загрузится из графика.',
      });
      // Redirect to kiosk home
      window.location.href = '/kiosk';
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось завершить смену.', variant: 'destructive' });
    } finally {
      setIsEndingShift(false);
      setEndingBox(null);
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
        <div className="flex items-center gap-1.5">
          {/* End shift per box */}
          <button
            onClick={() => handleEndBoxShift(1)}
            disabled={isEndingShift}
            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 transition-colors font-medium px-1.5 py-1 rounded hover:bg-orange-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Бокс 1</span>
            <span className="sm:hidden">Б1</span>
          </button>
          <button
            onClick={() => handleEndBoxShift(2)}
            disabled={isEndingShift}
            className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 transition-colors font-medium px-1.5 py-1 rounded hover:bg-orange-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Бокс 2</span>
            <span className="sm:hidden">Б2</span>
          </button>
          <span className="text-gray-300 mx-0.5">|</span>
          <button
            onClick={logout}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 transition-colors px-1.5 py-1"
          >
            <LogOut className="h-3.5 w-3.5" />
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
