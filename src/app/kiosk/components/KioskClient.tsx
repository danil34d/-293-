'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Users,
  AlertTriangle,
  ClipboardList,
  Sun,
  Moon,
  CarFront,
  ArrowRight,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Building2,
} from 'lucide-react';
import type { Employee } from '@/types';

interface CashBreakdown {
  cash: number;       // Наличные
  card: number;       // Карта
  transfer: number;   // Перевод
  cashless: number;   // Безнал (агрегатор + контрагент)
}

interface KioskClientProps {
  todayEmployeeIds: string[];
  employees: Employee[];           // только реальные люди (без kiosk/kiosk1)
  shiftCount: number;
  box1Count: number;
  box2Count: number;
  shiftTotal: number;              // только мойки текущей смены (приватность)
  shiftLabel: string;              // 'дневной смены' / 'ночной смены'
  isDayShift: boolean;
  cashBreakdown: CashBreakdown;
  unprocessedCount: number;
}

/**
 * Возвращает инициалы человека для аватара: "Иванов И.И." → "ИИ"
 */
function getInitials(fullName: string | undefined, fallback: string = '?'): string {
  if (!fullName) return fallback;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || fallback;
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Стабильный цвет для аватара по hash от ID
 * (один и тот же сотрудник всегда одного цвета, без рандома между рендерами)
 */
function getAvatarGradient(id: string): string {
  const palettes = [
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-violet-500 to-purple-600',
    'from-cyan-500 to-blue-600',
    'from-lime-500 to-green-600',
    'from-fuchsia-500 to-rose-600',
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return palettes[Math.abs(h) % palettes.length];
}

export function KioskClient({
  todayEmployeeIds,
  employees,
  shiftCount,
  box1Count,
  box2Count,
  shiftTotal,
  shiftLabel,
  isDayShift,
  cashBreakdown,
  unprocessedCount,
}: KioskClientProps) {
  const todayPeople = employees.filter((e) => todayEmployeeIds.includes(e.id));

  // Живые часы (только клиент). Отдельные time + date для крупного отображения.
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTimeStr(d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
      setDateStr(
        d.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' }),
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-1">
      {/* ─── HERO: время + смена + разбивка кассы по 4 типам оплаты ─────── */}
      <section
        className={`relative overflow-hidden rounded-3xl px-5 py-4 text-white shadow-lg ${
          isDayShift
            ? 'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700'
            : 'bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900'
        }`}
      >
        {/* Большая декоративная sun/moon в углу (по handoff: 128px, opacity 20%) */}
        <div className="pointer-events-none absolute -right-4 -top-4 opacity-20">
          {isDayShift ? (
            <Sun className="h-28 w-28 text-white" strokeWidth={1.5} />
          ) : (
            <Moon className="h-28 w-28 text-white" strokeWidth={1.5} />
          )}
        </div>

        {/* Верх: caption + время + дата + (КАССА справа) */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/90">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>{isDayShift ? 'Дневная смена' : 'Ночная смена'}</span>
            </div>
            <div className="mt-1 text-[40px] font-extrabold leading-none tabular-nums">
              {timeStr || '--:--'}
            </div>
            <div className="mt-1 text-[13px] text-white/80">{dateStr}</div>
          </div>
        </div>

        {/* Разделитель */}
        <div className="relative my-3 border-t border-white/15" />

        {/* Касса смены — заголовок + крупная сумма */}
        <div className="relative mb-2 flex items-baseline justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-white/90">
            Касса смены
          </div>
          <div className="text-2xl font-extrabold tabular-nums">
            {shiftTotal.toLocaleString('ru-RU')} ₽
          </div>
        </div>

        {/* 4 плитки разбивки по типам оплаты (как в handoff) */}
        <div className="relative grid grid-cols-4 gap-1.5">
          <PaymentTile icon={<Banknote className="h-3.5 w-3.5" />} label="Нал" value={cashBreakdown.cash} />
          <PaymentTile icon={<CreditCard className="h-3.5 w-3.5" />} label="Карта" value={cashBreakdown.card} />
          <PaymentTile icon={<ArrowLeftRight className="h-3.5 w-3.5" />} label="Перевод" value={cashBreakdown.transfer} />
          <PaymentTile icon={<Building2 className="h-3.5 w-3.5" />} label="Безнал" value={cashBreakdown.cashless} />
        </div>
      </section>

      {/* ─── Кто сегодня на смене (avatar-чипы) ──────────────────────── */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <span className="font-semibold text-gray-900">Сегодня на смене</span>
          </div>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
            {todayPeople.length}
          </span>
        </div>
        {todayPeople.length === 0 ? (
          <p className="text-sm italic text-gray-400">— нет запланированных смен —</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {todayPeople.map((emp) => (
              <div
                key={emp.id}
                className="group flex items-center gap-2 rounded-full bg-gray-50 py-1 pl-1 pr-3 ring-1 ring-gray-200 transition hover:bg-gray-100 hover:ring-blue-300"
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(
                    emp.id,
                  )} text-[11px] font-bold text-white shadow-sm`}
                >
                  {getInitials(emp.fullName, emp.username?.[0]?.toUpperCase() || '?')}
                </div>
                <span className="text-sm font-semibold text-gray-800">
                  {emp.fullName?.split(' ').slice(0, 2).join(' ') || emp.username}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── ГЛАВНЫЙ CTA — оформить мойку (большой, нельзя промахнуться) ── */}
      <Link
        href="/kiosk/order"
        className="group relative block min-h-[100px] overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 px-5 py-5 shadow-xl shadow-blue-500/30 transition-all duration-200 hover:shadow-2xl hover:shadow-blue-500/40 active:scale-[0.99]"
      >
        {/* Subtle pulse-ring при hover (без CSS keyframes — Tailwind animate) */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl transition-opacity group-hover:bg-white/20" />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 transition-all group-hover:translate-x-1 group-hover:opacity-50">
          <CarFront className="h-20 w-20 text-white" strokeWidth={1.5} />
        </div>
        <div className="relative flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80">
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Главное действие</span>
          </div>
          <div className="text-2xl font-extrabold text-white drop-shadow-sm">
            Оформить машину
          </div>
          <div className="flex items-center gap-1 text-sm text-white/80">
            <span>Большая кнопка для мокрых рук</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </div>
        </div>
      </Link>

      {/* ─── 3 плитки: всего / Бокс 1 / Бокс 2 ─────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryTile
          label="Всего"
          value={shiftCount}
          sublabel="моек"
          variant="neutral"
        />
        <SummaryTile
          label="Бокс 1"
          value={box1Count}
          sublabel="моек"
          variant="blue"
          href="/kiosk/order?box=1"
        />
        <SummaryTile
          label="Бокс 2"
          value={box2Count}
          sublabel="моек"
          variant="green"
          href="/kiosk/order?box=2"
        />
      </div>

      {/* ─── Алерт о неоформленных (с пульсом если есть) ─────────────── */}
      {unprocessedCount > 0 && (
        <Link
          href="/kiosk/history"
          className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 p-4 shadow-sm ring-2 ring-orange-300 transition hover:from-amber-100 hover:to-orange-200 active:scale-[0.99]"
        >
          {/* Пульсирующий индикатор */}
          <div className="absolute right-4 top-4">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-orange-400 opacity-75" />
              <div className="relative h-3 w-3 rounded-full bg-orange-500" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-md shadow-orange-500/40">
              <AlertTriangle className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-orange-900">
                Неоформленных моек:{' '}
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-sm text-white shadow-sm">
                  {unprocessedCount}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-orange-800/80">
                <span>Тапните чтобы оформить</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
}

/**
 * Плитка-метрика. Кликабельная если задан href.
 * Цветовые варианты: neutral (серый), blue (бокс 1), green (бокс 2)
 */
function SummaryTile({
  label,
  value,
  sublabel,
  variant,
  href,
}: {
  label: string;
  value: number;
  sublabel: string;
  variant: 'neutral' | 'blue' | 'green';
  href?: string;
}) {
  const styles = {
    neutral: {
      bg: 'bg-white ring-gray-200',
      label: 'text-gray-500',
      value: 'text-gray-800',
      sublabel: 'text-gray-400',
      hover: '',
    },
    blue: {
      bg: 'bg-gradient-to-br from-blue-50 to-sky-100 ring-blue-200',
      label: 'text-blue-700/70',
      value: 'bg-gradient-to-br from-blue-600 to-sky-700 bg-clip-text text-transparent',
      sublabel: 'text-blue-600/70',
      hover: 'hover:ring-blue-400 hover:shadow-md hover:shadow-blue-500/10 active:scale-[0.97]',
    },
    green: {
      bg: 'bg-gradient-to-br from-emerald-50 to-teal-100 ring-emerald-200',
      label: 'text-emerald-700/70',
      value: 'bg-gradient-to-br from-emerald-600 to-teal-700 bg-clip-text text-transparent',
      sublabel: 'text-emerald-600/70',
      hover:
        'hover:ring-emerald-400 hover:shadow-md hover:shadow-emerald-500/10 active:scale-[0.97]',
    },
  }[variant];

  const Inner = (
    <>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
        {label}
      </div>
      <div className={`mt-1 text-3xl font-extrabold leading-none ${styles.value}`}>{value}</div>
      <div className={`mt-1 text-[10px] font-medium ${styles.sublabel}`}>{sublabel}</div>
    </>
  );

  const className = `rounded-2xl p-3 text-center min-h-[88px] ring-1 transition ${styles.bg} ${styles.hover}`;

  if (href) {
    return (
      <Link href={href} className={className + ' block'}>
        {Inner}
      </Link>
    );
  }
  return <div className={className}>{Inner}</div>;
}

/**
 * Плитка типа оплаты внутри Hero (Нал / Карта / Перевод / Безнал).
 * Активная (есть сумма) — bg более яркий, иначе приглушённая.
 * По handoff: rounded-xl px-2 py-1.5, число 12px extrabold tabular-nums.
 */
function PaymentTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const hasValue = value > 0;
  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition ${
        hasValue ? 'bg-white/14' : 'bg-white/6 opacity-55'
      }`}
      style={{
        backgroundColor: hasValue ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-white/85">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xs font-extrabold tabular-nums leading-tight">
        {value.toLocaleString('ru-RU')}
      </div>
    </div>
  );
}
