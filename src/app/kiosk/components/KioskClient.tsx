'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Users,
  AlertTriangle,
  ClipboardList,
  Wallet,
  Sun,
  Moon,
  CarFront,
  ArrowRight,
} from 'lucide-react';
import type { Employee } from '@/types';

interface KioskClientProps {
  todayEmployeeIds: string[];
  employees: Employee[];           // только реальные люди (без kiosk/kiosk1)
  shiftCount: number;
  box1Count: number;
  box2Count: number;
  shiftTotal: number;              // только мойки текущей смены (приватность)
  shiftLabel: string;              // 'дневной смены' / 'ночной смены'
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
  unprocessedCount,
}: KioskClientProps) {
  const todayPeople = employees.filter((e) => todayEmployeeIds.includes(e.id));
  const isDayShift = shiftLabel.includes('дневной');

  // Живые часы (только клиент)
  const [now, setNow] = useState<string>('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) +
          ' · ' +
          d.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: 'short' }),
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-1">
      {/* ─── HERO: контекстная плашка с временем и сменой ─────────────── */}
      <section
        className={`relative overflow-hidden rounded-2xl px-4 py-3 text-white shadow-md ${
          isDayShift
            ? 'bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700'
            : 'bg-gradient-to-br from-slate-800 via-indigo-900 to-purple-900'
        }`}
      >
        {/* Декоративные кружки в углу — глубина без тяжести */}
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
        <div className="absolute -right-2 -bottom-2 h-16 w-16 rounded-full bg-white/5" />
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/80">
              {isDayShift ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              <span>{isDayShift ? 'Дневная смена' : 'Ночная смена'}</span>
            </div>
            <div className="mt-1 text-lg font-bold leading-tight">{now || '...'}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wider text-white/80">Касса смены</div>
            <div className="text-2xl font-extrabold leading-tight">
              {shiftTotal.toLocaleString('ru-RU')} ₽
            </div>
          </div>
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

      {/* ─── Касса смены (детальная плашка с акцентом) ──────────────── */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 via-emerald-50 to-teal-50 p-4 shadow-sm ring-1 ring-emerald-200/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 shadow-md shadow-emerald-500/30">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-700/80">
                Касса {shiftLabel}
              </div>
              <div className="text-xs text-emerald-700/60">только текущая смена</div>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-3xl font-extrabold text-transparent">
              {shiftTotal.toLocaleString('ru-RU')}
            </div>
            <div className="text-xs font-semibold text-emerald-600">рублей</div>
          </div>
        </div>
      </section>

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
