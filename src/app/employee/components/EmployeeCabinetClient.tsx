'use client';

import Link from 'next/link';
import {
  Sun,
  Moon,
  PlayCircle,
  Clock,
  MapPin,
  Wallet,
  Repeat2,
  ArrowRight,
  ClipboardList,
  CarFront,
  TrendingUp,
  CalendarDays,
} from 'lucide-react';
import type { Employee, Shift } from '@/types';

interface Props {
  employee: Employee | null;
  myShifts: Shift[];
  activeShift: Shift | null;
  nextShift: Shift | null;
  partnerName: string | null;
  todayEarned: number;
  todayWashCount: number;
  monthEarned: number;
  monthWashCount: number;
  monthShiftsDone: number;
  monthShiftsTarget: number;
  balance: number;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  // Стандартный формат "Фамилия Имя [Отчество]" — берём 2-й элемент
  return parts[1] || parts[0] || 'друг';
}

function fmtMinutesLeft(end: string, now: Date): { hours: number; minutes: number } {
  // end = "20:00"
  const [hh, mm] = end.split(':').map(Number);
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1); // night shift wrap
  const diffMin = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  return { hours: Math.floor(diffMin / 60), minutes: diffMin % 60 };
}

function fmtRubles(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

function fmtKilo(n: number): { val: string; suffix: string } {
  if (Math.abs(n) >= 10000) {
    return { val: (n / 1000).toFixed(1).replace('.0', ''), suffix: 'k' };
  }
  return { val: Math.round(n).toLocaleString('ru-RU'), suffix: '' };
}

function ruDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

export function EmployeeCabinetClient({
  employee,
  activeShift,
  nextShift,
  partnerName,
  todayEarned,
  todayWashCount,
  monthEarned,
  monthWashCount,
  monthShiftsDone,
  monthShiftsTarget,
  balance,
}: Props) {
  if (!employee) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <div className="rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200">
          <p className="text-base font-semibold text-amber-900">Не удалось загрузить профиль</p>
          <p className="mt-1 text-sm text-amber-700">Попробуйте войти заново</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const greeting = getGreeting();
  const name = firstName(employee.fullName);
  const isOnShift = !!activeShift;
  const left = activeShift ? fmtMinutesLeft(activeShift.endTime, now) : null;
  const monthGoalPct = Math.min(100, Math.round((monthShiftsDone / monthShiftsTarget) * 100));
  const balanceK = fmtKilo(balance);

  // Цвет hero: дневная (blue→indigo), ночная (indigo→purple), без смены (slate)
  const heroGradient = isOnShift
    ? activeShift!.shiftType === 'night'
      ? 'from-indigo-600 via-purple-700 to-purple-900'
      : 'from-blue-500 via-blue-600 to-indigo-700'
    : 'from-slate-500 via-slate-600 to-slate-800';

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-1 pb-4">
      {/* HERO: greeting + контекст смены */}
      <section
        className={`relative overflow-hidden rounded-3xl px-5 py-5 text-white shadow-xl shadow-blue-500/30 bg-gradient-to-br ${heroGradient}`}
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-4 bottom-2 opacity-20 pointer-events-none">
          {isOnShift && activeShift!.shiftType === 'night' ? (
            <Moon className="h-24 w-24 text-white" strokeWidth={1.2} />
          ) : (
            <Sun className="h-24 w-24 text-white" strokeWidth={1.2} />
          )}
        </div>
        <div className="relative">
          {isOnShift ? (
            <>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/80">
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Идёт смена</span>
              </div>
              <div className="mt-1 text-2xl font-extrabold leading-tight drop-shadow-sm">
                {greeting}, {name}!
              </div>
              {left && (
                <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                  <Clock className="h-4 w-4" />
                  <span>
                    Осталось <b>{left.hours}ч {left.minutes}м</b> · до {activeShift!.endTime}
                  </span>
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-sm text-white/90">
                <MapPin className="h-4 w-4" />
                <span>
                  Бокс {activeShift!.boxNumber}
                  {partnerName && <> · напарник {partnerName.split(' ')[0]} {partnerName.split(' ')[1]?.[0] || ''}.</>}
                </span>
              </div>
            </>
          ) : nextShift ? (
            <>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/80">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Следующая смена</span>
              </div>
              <div className="mt-1 text-2xl font-extrabold leading-tight drop-shadow-sm">
                {greeting}, {name}!
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm text-white/90">
                {nextShift.shiftType === 'night' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                <span>
                  {ruDate(nextShift.date)} · {nextShift.startTime}–{nextShift.endTime}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-white/90">
                <MapPin className="h-4 w-4" />
                <span>Бокс {nextShift.boxNumber}{partnerName && <> · с {partnerName.split(' ')[1] || partnerName}</>}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/80">
                <Sun className="h-3.5 w-3.5" />
                <span>Сегодня без смены</span>
              </div>
              <div className="mt-1 text-2xl font-extrabold leading-tight drop-shadow-sm">
                {greeting}, {name}!
              </div>
              <div className="mt-2 text-sm text-white/80">
                Можно отдохнуть 🌴 или взять доп. смену в графике
              </div>
            </>
          )}
        </div>
      </section>

      {/* СЕГОДНЯ ЗАРАБОТАЛ */}
      <Link
        href="/employee/finance"
        className="block w-full overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm ring-1 ring-emerald-200/50 hover:ring-emerald-400 transition active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 shadow-md shadow-emerald-500/30">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-700/80">
                Сегодня заработал
              </div>
              <div className="text-xs text-emerald-700/60">
                {todayWashCount === 0
                  ? 'пока 0 моек'
                  : `${todayWashCount} ${pluralWash(todayWashCount)} · ср. ${todayWashCount > 0 ? Math.round(todayEarned / todayWashCount) : 0} ₽`}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-3xl font-extrabold text-transparent">
              {todayEarned > 0 ? '+' : ''}{fmtRubles(todayEarned)}
            </div>
            <div className="text-xs font-semibold text-emerald-600">→ Подробно</div>
          </div>
        </div>
      </Link>

      {/* ГЛАВНЫЙ CTA */}
      <Link
        href="/employee/workstation"
        className="group relative block min-h-[100px] overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-700 px-5 py-5 shadow-xl shadow-blue-500/30 transition-all duration-200 hover:shadow-2xl hover:shadow-blue-500/40"
      >
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30 pointer-events-none">
          <CarFront className="h-20 w-20 text-white" strokeWidth={1.5} />
        </div>
        <div className="relative flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/80">
            <ClipboardList className="h-3.5 w-3.5" />
            <span>Главное действие</span>
          </div>
          <div className="text-2xl font-extrabold text-white drop-shadow-sm">Оформить мойку</div>
          <div className="flex items-center gap-1 text-sm text-white/80">
            <span>Открыть workstation</span>
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </div>
        </div>
      </Link>

      {/* МАЙ В ЦИФРАХ */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-purple-100">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
            </div>
            <span className="font-semibold text-gray-900">{ruMonth(now)} в цифрах</span>
          </div>
          <Link
            href="/employee/finance"
            className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
          >
            Подробно →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link
            href="/employee/schedule"
            className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-100 p-3 text-center ring-1 ring-blue-200 hover:ring-blue-400 transition active:scale-95"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700/70">Смен</div>
            <div className="mt-1 bg-gradient-to-br from-blue-600 to-sky-700 bg-clip-text text-2xl font-extrabold leading-none text-transparent">
              {monthShiftsDone}
            </div>
            <div className="mt-0.5 text-[10px] font-medium text-blue-600/70">из {monthShiftsTarget}</div>
          </Link>
          <Link
            href="/employee/finance"
            className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-100 p-3 text-center ring-1 ring-indigo-200 hover:ring-indigo-400 transition active:scale-95"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700/70">Моек</div>
            <div className="mt-1 bg-gradient-to-br from-indigo-600 to-purple-700 bg-clip-text text-2xl font-extrabold leading-none text-transparent">
              {monthWashCount}
            </div>
            <div className="mt-0.5 text-[10px] font-medium text-indigo-600/70">всего</div>
          </Link>
          <Link
            href="/employee/finance"
            className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 p-3 text-center ring-1 ring-emerald-200 hover:ring-emerald-400 transition active:scale-95"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/70">К выплате</div>
            <div className="mt-1 bg-gradient-to-br from-emerald-600 to-teal-700 bg-clip-text text-2xl font-extrabold leading-none text-transparent">
              {balanceK.val}
              {balanceK.suffix && <span className="text-base">{balanceK.suffix}</span>}
            </div>
            <div className="mt-0.5 text-[10px] font-medium text-emerald-600/70">₽</div>
          </Link>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-gray-600">Цель месяца</span>
            <span className="font-bold text-gray-800">
              {monthGoalPct}% · {monthShiftsDone}/{monthShiftsTarget}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all"
              style={{ width: `${monthGoalPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* СЛЕДУЮЩАЯ СМЕНА (если активной нет) */}
      {!isOnShift && nextShift && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
                <CalendarDays className="h-4 w-4 text-amber-600" />
              </div>
              <span className="font-semibold text-gray-900">Следующая смена</span>
            </div>
            <Link
              href="/employee/schedule"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Календарь →
            </Link>
          </div>
          <Link
            href="/employee/schedule"
            className="block rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200 transition hover:bg-blue-50 hover:ring-blue-300 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-gray-900">
                  {ruDate(nextShift.date)} · {nextShift.shiftType === 'day' ? 'Дневная' : 'Ночная'}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600">
                  {nextShift.shiftType === 'day' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                  <span>
                    {nextShift.startTime}–{nextShift.endTime} · Бокс {nextShift.boxNumber}
                    {partnerName && <> · +{partnerName.split(' ')[1] || partnerName}</>}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </div>
          </Link>
        </section>
      )}
    </div>
  );
}

function pluralWash(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'моек';
  if (last === 1) return 'мойка';
  if (last >= 2 && last <= 4) return 'мойки';
  return 'моек';
}

function ruMonth(d: Date): string {
  const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return months[d.getMonth()];
}
