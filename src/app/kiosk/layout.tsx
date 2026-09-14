'use client';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { LogOut, Monitor, Home, ClipboardList, XCircle, History, Calendar } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function KioskLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isEndingShift, setIsEndingShift] = useState(false);
  const [endingBox, setEndingBox] = useState<number | null>(null);
  // 🔥 2026-08-09: закрытие смены необратимо, а подтверждения не было. Пока
  // кнопка была заглушкой, это ничем не грозило; теперь она реально закрывает.
  const [confirmBox, setConfirmBox] = useState<number | null>(null);
  // 2026-09-14: «Выход» стоял вплотную к «Б2» и срабатывал с первого касания —
  // промах мокрым пальцем выкидывал терминал на /login посреди смены.
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isHome = pathname === '/kiosk';
  const isOrder = pathname.includes('/order');
  const isHistory = pathname.includes('/history');
  const isSchedule = pathname.includes('/schedule');

  // 🔥 ФИКС 2026-08-09: кнопка была НАРИСОВАННОЙ. Обработчик чистил
  // sessionStorage и показывал зелёный тост «смена завершена», не отправляя на
  // сервер ничего — с 14.04 (коммит fcb06c2) и ни разу не менялся. Оператор был
  // уверен, что закрыл смену; в БД она оставалась active навсегда. Отсюда шесть
  // смен, висящих с 26 апреля, и всего 4 ShiftReport за историю: отчёт создаётся
  // только внутри PUT /api/workstation/shift, который никто не вызывал.
  // Теперь закрываем по-настоящему и показываем итог, а при ошибке — ошибку.
  const handleEndBoxShift = async (boxNumber: number) => {
    setIsEndingShift(true);
    setEndingBox(boxNumber);
    try {
      // Спрашиваем сервер, какая смена открыта именно в ЭТОМ боксе.
      // sessionStorage тут не источник правды: ключ один на оба бокса.
      const stateResponse = await fetch('/api/workstation/shift');
      if (!stateResponse.ok) {
        toast({
          title: 'Смена НЕ закрыта',
          description: 'Не удалось получить состояние смен. Попробуйте ещё раз.',
          variant: 'destructive',
        });
        return;
      }
      const state = await stateResponse.json();
      const boxState = boxNumber === 2 ? state?.box2 : state?.box1;
      const shiftId: string | null = boxState?.shiftId ?? null;

      if (!shiftId || !boxState?.isShiftActive) {
        toast({
          title: `Бокс ${boxNumber}: открытой смены нет`,
          description: Array.isArray(state?.orphanActive) && state.orphanActive.length > 0
            ? `Закрывать нечего. Есть незакрытые смены прошлых дней (${state.orphanActive.length}) — их закрывает владелец в админке.`
            : 'Закрывать нечего — смена в этом боксе не начиналась.',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch('/api/workstation/shift', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast({
          title: 'Смена НЕ закрыта',
          description: err?.error || `Сервер ответил ${response.status}. Смена осталась открытой.`,
          variant: 'destructive',
        });
        return;
      }

      const result = await response.json().catch(() => ({}));
      const summary = result?.summary;

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('isShiftActive');
        sessionStorage.removeItem('activeShiftId');
        sessionStorage.removeItem('selectedEmployees');
      }

      toast({
        title: `Бокс ${boxNumber} — смена закрыта`,
        description: summary
          ? `Моек: ${summary.totalWashes ?? 0}, на сумму ${(summary.totalAmount ?? 0).toLocaleString('ru-RU')} ₽. Отчёт сохранён.`
          : 'Отчёт по смене сохранён.',
      });
      window.location.href = '/kiosk';
    } catch (error) {
      toast({
        title: 'Смена НЕ закрыта',
        description: 'Нет связи с сервером. Смена осталась открытой, попробуйте ещё раз.',
        variant: 'destructive',
      });
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
          <div className="flex items-center gap-1.5">
            <BoxShiftButton
              boxNumber={1}
              isLoading={isEndingShift && endingBox === 1}
              disabled={isEndingShift}
              onClick={() => setConfirmBox(1)}
            />
            <BoxShiftButton
              boxNumber={2}
              isLoading={isEndingShift && endingBox === 2}
              disabled={isEndingShift}
              onClick={() => setConfirmBox(2)}
            />
            <div className="mx-3 h-8 w-px bg-gray-200" />
            <button
              onClick={() => setConfirmLogout(true)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100"
              aria-label="Выход"
            >
              <LogOut className="h-5 w-5" />
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

      {/* 🔥 2026-08-09: подтверждение перед необратимым действием. Смену
          закрывают мокрыми руками на телефоне у стены — промах по кнопке
          стоил бы закрытой смены и отчёта, который уже не переоткрыть. */}
      <AlertDialog open={confirmBox !== null} onOpenChange={(o) => { if (!o) setConfirmBox(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить смену — Бокс {confirmBox}?</AlertDialogTitle>
            <AlertDialogDescription>
              Смена закроется, будет сохранён отчёт: касса, разбивка по оплатам,
              чаевые, расход химии. <b>Отменить это будет нельзя.</b>
              <br /><br />
              Закрывайте, только когда бокс действительно закончил работу.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[48px]">Нет, продолжаем работу</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[48px] bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                const box = confirmBox;
                setConfirmBox(null);
                if (box) handleEndBoxShift(box);
              }}
            >
              Да, завершить смену
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Выйти из терминала?</AlertDialogTitle>
            <AlertDialogDescription>
              Откроется страница входа, и оформлять мойки на этом телефоне будет нельзя,
              пока в терминал снова не войдут. Смены при этом не закрываются.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[48px]">Нет, остаться</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[48px] bg-red-600 hover:bg-red-700"
              onClick={() => {
                setConfirmLogout(false);
                logout();
              }}
            >
              Да, выйти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        'flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-all',
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
