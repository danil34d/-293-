'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { LogOut, Monitor, Home, ClipboardList, XCircle, History, Calendar } from 'lucide-react';
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
  const isHistory = pathname.includes('/history');
  const isSchedule = pathname.includes('/schedule');

  const handleEndBoxShift = async (boxNumber: number) => {
    setIsEndingShift(true);
    setEndingBox(boxNumber);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isShiftActive');
        sessionStorage.removeItem('activeShiftId');
        sessionStorage.removeItem('selectedEmployees');
      }
      toast({
        title: `Бокс ${boxNumber} — смена завершена`,
        description: 'Данные смены очищены. Следующая команда загрузится из графика.',
      });
      window.location.href = '/kiosk';
    } catch (error) {
      toast({ title: 'Ошибка', description: 'Не удалось завершить смену.', variant: 'destructive' });
    } finally {
      setIsEndingShift(false);
      setEndingBox(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header — glass с лёгким размытием. Прилегает к safe-area телефона. */}
      <header
        className="sticky top-0 z-30 border-b border-white/40 bg-white/85 backdrop-blur-md shadow-sm"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <div className="flex items-center justify-between px-3 py-2">
          {/* Лого слева */}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/30">
              <Monitor className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                Терминал
              </span>
              <span className="text-sm font-bold text-gray-900">Мойка 1</span>
            </div>
          </div>

          {/* Действия справа */}
          <div className="flex items-center gap-1">
            <BoxShiftButton
              boxNumber={1}
              isLoading={isEndingShift && endingBox === 1}
              disabled={isEndingShift}
              onClick={() => handleEndBoxShift(1)}
            />
            <BoxShiftButton
              boxNumber={2}
              isLoading={isEndingShift && endingBox === 2}
              disabled={isEndingShift}
              onClick={() => handleEndBoxShift(2)}
            />
            <div className="mx-1 h-6 w-px bg-gray-200" />
            <button
              onClick={logout}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100"
              aria-label="Выход"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Выход</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 px-3 pb-24 pt-3">{children}</main>

      {/* Bottom navigation — floating glass-bar с активным акцентом */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/50 bg-white/90 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.05)]"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {[
            { href: '/kiosk', label: 'Главная', icon: Home, active: isHome },
            { href: '/kiosk/order', label: 'Оформить', icon: ClipboardList, active: isOrder },
            { href: '/kiosk/history', label: 'История', icon: History, active: isHistory },
            { href: '/kiosk/schedule', label: 'График', icon: Calendar, active: isSchedule },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'group relative flex min-h-[64px] flex-col items-center justify-center gap-0.5 py-2 transition-all',
                  tab.active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-700',
                )}
              >
                {/* Активный индикатор сверху */}
                {tab.active && (
                  <span className="absolute top-0 h-1 w-10 rounded-b-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                )}
                <Icon
                  className={cn(
                    'h-6 w-6 transition-transform',
                    tab.active && 'scale-110 stroke-[2.5]',
                  )}
                />
                <span className={cn('text-[11px]', tab.active ? 'font-bold' : 'font-medium')}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/**
 * Кнопка завершения смены бокса в шапке.
 * Изолированный компонент чтобы цвета и states были одинаковые для бокса 1 и 2.
 */
function BoxShiftButton({
  boxNumber,
  isLoading,
  disabled,
  onClick,
}: {
  boxNumber: number;
  isLoading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all',
        'text-orange-700 hover:bg-orange-50 active:bg-orange-100',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        isLoading && 'animate-pulse',
      )}
      aria-label={`Завершить смену бокс ${boxNumber}`}
    >
      <XCircle className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Бокс {boxNumber}</span>
      <span className="sm:hidden">Б{boxNumber}</span>
    </button>
  );
}
