"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Edit, WalletCards, Calendar, FileSpreadsheet, Wallet,
  User, Phone, KeyRound, Car as CarIcon, ListChecks,
  Droplets, Activity, Briefcase, Clock,
} from "lucide-react";
import { ROLE_LABELS, type Employee, type EmployeeRole, type SalaryScheme, type WashEvent } from "@/types";

/**
 * Phase 39 / V2-#9 «employees inline-expand»:
 * 3-колоночный блок раскрывается под строкой сотрудника:
 *  - col-3: Avatar + role + 4 quick action buttons (Edit/Finance/Schedule/Salary)
 *  - col-5: Профиль (login/phone/scheme/has-car) + 6 mini-stat
 *  - col-4: Последние 5 моек этого сотрудника (lazy fetch /api/wash-events)
 *
 * Wash events lazy-fetch при первом expand. Filter client-side.
 */

interface Props {
  employee: Employee;
  salaryScheme?: SalaryScheme;
  metrics?: { washesThisMonth: number; lastWashAt: string | null };
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.slice(0, 2).toUpperCase() ?? "??";
}

function avatarColor(seed: string): string {
  // Stable color from name hash
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

/**
 * Phase 46: SVG sparkline без библиотек. Принимает массив N значений,
 * рендерит как area + line внутри viewBox. Поддерживает amber/blue/green palette.
 */
function Sparkline({
  data,
  color = '#0088CC',
  height = 40,
  width = 240,
  showLabels = true,
  unit = '',
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  showLabels?: boolean;
  unit?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-[10px] text-slate-400" style={{ height }}>
        нет данных
      </div>
    );
  }
  const max = Math.max(...data, 1);
  const min = 0;
  const range = max - min || 1;
  const stepX = width / Math.max(1, data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - 4 - ((v - min) / range) * (height - 8);
      return `${x},${y}`;
    })
    .join(' ');
  const areaPoints = `0,${height} ${points} ${(data.length - 1) * stepX},${height}`;
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : 0;
  const trendUp = last >= prev;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <polygon points={areaPoints} fill={color} opacity={0.12} />
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Dot на последней точке */}
        {(() => {
          const x = (data.length - 1) * stepX;
          const y = height - 4 - ((last - min) / range) * (height - 8);
          return <circle cx={x} cy={y} r={2.5} fill={color} />;
        })()}
      </svg>
      {showLabels && (
        <div className="flex items-center justify-between text-[9px] text-slate-400 mt-0.5">
          <span>12 нед назад</span>
          <span className="tabular-nums">
            <b style={{ color }}>{last}{unit}</b>
            {data.length > 1 && (
              <span className={trendUp ? 'text-emerald-600 ml-1' : 'text-rose-600 ml-1'}>
                {trendUp ? '↑' : '↓'}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label, value, Icon, color,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500 truncate">
          {label}
        </span>
      </div>
      <div className="text-[14px] font-extrabold tabular-nums mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function ExpandedEmployee({ employee, salaryScheme, metrics }: Props) {
  // Phase 39 (was): только recent 5. Phase 46: храним все события сотрудника
  // для агрегации 12-недельной sparkline. recentEvents — derived.
  const [allEvents, setAllEvents] = React.useState<WashEvent[] | null>(null);
  const [loadingEvents, setLoadingEvents] = React.useState(false);
  const [eventsError, setEventsError] = React.useState<string | null>(null);

  // Lazy fetch wash events
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingEvents(true);
      setEventsError(null);
      try {
        const r = await fetch('/api/wash-events', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as WashEvent[];
        if (!cancelled && Array.isArray(data)) {
          // Filter to this employee + sort newest first
          const filtered = data
            .filter((e) => Array.isArray(e.employeeIds) && e.employeeIds.includes(employee.id))
            .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
          setAllEvents(filtered);
        }
      } catch (e: any) {
        if (!cancelled) setEventsError(e.message);
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  // Phase 46: derived recent 5 для списка (сохраняем backward-compat с UI)
  const events = React.useMemo(() => (allEvents ? allEvents.slice(0, 5) : null), [allEvents]);

  // Phase 46: 12-week buckets sparkline
  const weeklyBuckets = React.useMemo<number[]>(() => {
    if (!allEvents) return [];
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    // 12 buckets: index 0 = старая неделя, index 11 = текущая
    const buckets: number[] = new Array(12).fill(0);
    for (const e of allEvents) {
      const t = Date.parse(e.timestamp || '');
      if (!Number.isFinite(t)) continue;
      const weeksAgo = Math.floor((nowMs - t) / WEEK_MS);
      if (weeksAgo < 0 || weeksAgo >= 12) continue;
      buckets[11 - weeksAgo]++;
    }
    return buckets;
  }, [allEvents]);

  // Phase 46: revenue 12-week buckets (отдельно для денежного спарклайна — share of revenue)
  const weeklyRevenue = React.useMemo<number[]>(() => {
    if (!allEvents) return [];
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const buckets: number[] = new Array(12).fill(0);
    for (const e of allEvents) {
      const t = Date.parse(e.timestamp || '');
      if (!Number.isFinite(t)) continue;
      const weeksAgo = Math.floor((nowMs - t) / WEEK_MS);
      if (weeksAgo < 0 || weeksAgo >= 12) continue;
      const empCount = (e.employeeIds || []).length || 1;
      buckets[11 - weeksAgo] += (e.totalAmount || 0) / empCount; // shared revenue
    }
    return buckets.map((v) => Math.round(v));
  }, [allEvents]);

  // Computed
  const isOwner = employee.id === "emp_manager_admin";
  const isKiosk = employee.role === "kiosk";
  const isProtected = isOwner || isKiosk;
  const isArchived = !!employee.archived;
  const washesMonth = metrics?.washesThisMonth ?? 0;
  const lastWashAt = metrics?.lastWashAt ?? null;
  const lastWashFormatted = lastWashAt
    ? format(new Date(lastWashAt), 'd MMM HH:mm', { locale: ru })
    : '—';

  // Дней работает (с created_at, если есть) — пока не считаем, дату создания не храним явно
  const initials = getInitials(employee.fullName);
  const avatarBg = avatarColor(employee.fullName);

  return (
    <div className="bg-slate-50 border-l-4 border-blue-300 px-5 py-4">
      <div className="grid grid-cols-12 gap-4">
        {/* col-3: Avatar + actions */}
        <div className="col-span-12 lg:col-span-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white font-extrabold text-[20px]"
              style={{ background: avatarBg }}
            >
              {initials}
            </div>
            <div className="mt-2 font-bold text-[14px] text-gray-900 leading-tight">
              {employee.fullName}
            </div>
            <div className="mt-1 inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
              {ROLE_LABELS[(employee.role || 'employee') as EmployeeRole] ?? employee.role}
            </div>
            {isOwner && (
              <div className="mt-1 inline-flex ml-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                владелец
              </div>
            )}
          </div>

          {/* 4 quick actions */}
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {!isArchived && (
              <Link
                href={`/employees/${employee.id}/edit`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-blue-700 px-2.5 py-2 text-[12px] font-semibold transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                Профиль
              </Link>
            )}
            {!isProtected && !isArchived && (
              <Link
                href={`/employees/${employee.id}/finance`}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-emerald-700 px-2.5 py-2 text-[12px] font-semibold transition-colors"
              >
                <WalletCards className="w-3.5 h-3.5" />
                Финансы
              </Link>
            )}
            {!isProtected && !isArchived && (
              <Link
                href="/schedule"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 text-violet-700 px-2.5 py-2 text-[12px] font-semibold transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                Графиx
              </Link>
            )}
            {!isProtected && !isArchived && (
              <Link
                href="/salary-report"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white border border-gray-200 hover:border-amber-300 hover:bg-amber-50 text-amber-700 px-2.5 py-2 text-[12px] font-semibold transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                ЗП
              </Link>
            )}
          </div>
        </div>

        {/* col-5: Profile info + 6 mini-stats */}
        <div className="col-span-12 lg:col-span-5">
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-2">
            <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
              <User className="w-3 h-3 inline mr-1" /> Профиль
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
              <div className="text-gray-500 inline-flex items-center gap-1.5">
                <KeyRound className="w-3 h-3" /> Логин
              </div>
              <div className="font-medium text-gray-900">
                {employee.username ? (
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                    {employee.username}
                  </code>
                ) : (
                  <span className="text-gray-400">нет логина</span>
                )}
              </div>

              <div className="text-gray-500 inline-flex items-center gap-1.5">
                <Phone className="w-3 h-3" /> Телефон
              </div>
              <div className="font-medium text-gray-900">{employee.phone || '—'}</div>

              <div className="text-gray-500 inline-flex items-center gap-1.5">
                <Briefcase className="w-3 h-3" /> Схема ЗП
              </div>
              <div className="font-medium text-gray-900">
                {salaryScheme ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Wallet className="w-3 h-3 text-emerald-600" />
                    {salaryScheme.name}
                  </span>
                ) : (
                  <span className="text-gray-400">не назначена</span>
                )}
              </div>

              <div className="text-gray-500 inline-flex items-center gap-1.5">
                <CarIcon className="w-3 h-3" /> Авто
              </div>
              <div className="font-medium text-gray-900">
                {employee.hasCar ? (
                  <span className="text-emerald-700">✓ Есть</span>
                ) : (
                  <span className="text-gray-400">нет</span>
                )}
              </div>

              {employee.paymentDetails && (
                <>
                  <div className="text-gray-500 inline-flex items-center gap-1.5">
                    <Wallet className="w-3 h-3" /> Карта
                  </div>
                  <div className="font-medium text-gray-900 text-[11px] truncate">
                    {employee.paymentDetails}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Phase 46: 12-week sparkline (моек по неделям + выручка по неделям) */}
          {allEvents && allEvents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-3 mb-2 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 flex items-center gap-1">
                  <Droplets className="w-3 h-3 text-blue-600" />
                  Моек / неделя (12 нед)
                </div>
                <Sparkline data={weeklyBuckets} color="#0088CC" width={240} height={36} unit="" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-emerald-600" />
                  Выручка / неделя (₽)
                </div>
                <Sparkline data={weeklyRevenue} color="#10b981" width={240} height={36} unit="₽" />
              </div>
            </div>
          )}

          {/* 6 mini-stats — Phase 39 показывает то что есть */}
          <div className="grid grid-cols-3 gap-2">
            <MiniStat
              label="Моек/мес"
              value={washesMonth > 0 ? washesMonth : '—'}
              Icon={Droplets}
              color="#0369a1"
            />
            <MiniStat
              label="Активность"
              value={lastWashFormatted}
              Icon={Activity}
              color={lastWashAt ? '#15803d' : '#9ca3af'}
            />
            <MiniStat
              label="Роль"
              value={ROLE_LABELS[(employee.role || 'employee') as EmployeeRole] ?? '—'}
              Icon={Briefcase}
              color="#7c3aed"
            />
            <MiniStat
              label="Доступ"
              value={employee.username ? '✓ есть' : '— нет'}
              Icon={KeyRound}
              color={employee.username ? '#15803d' : '#92400e'}
            />
            <MiniStat
              label="Авто"
              value={employee.hasCar ? '✓ Да' : '— Нет'}
              Icon={CarIcon}
              color={employee.hasCar ? '#15803d' : '#9ca3af'}
            />
            <MiniStat
              label="Схема ЗП"
              value={salaryScheme ? '✓ Назн.' : '—'}
              Icon={Wallet}
              color={salaryScheme ? '#10b981' : '#9ca3af'}
            />
          </div>
        </div>

        {/* col-4: Recent 5 wash events */}
        <div className="col-span-12 lg:col-span-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 inline-flex items-center gap-1.5">
                <ListChecks className="w-3 h-3" /> Последние 5 моек
              </div>
              <Link
                href="/wash-log"
                className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700"
              >
                в журнал →
              </Link>
            </div>
            <div className="divide-y divide-gray-100">
              {loadingEvents && (
                <div className="px-3 py-4 text-center text-[12px] text-gray-400">
                  загрузка…
                </div>
              )}
              {eventsError && (
                <div className="px-3 py-4 text-center text-[11px] text-rose-600">
                  Не удалось загрузить: {eventsError}
                </div>
              )}
              {!loadingEvents && !eventsError && events && events.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px] text-gray-400">
                  моек ещё не было
                </div>
              )}
              {!loadingEvents && !eventsError && events && events.length > 0 && (
                events.map((e) => {
                  const time = e.timestamp
                    ? format(new Date(e.timestamp), 'd MMM HH:mm', { locale: ru })
                    : '—';
                  const amount = e.totalAmount || 0;
                  const isRetail = ['cash', 'card', 'transfer'].includes(e.paymentMethod);
                  return (
                    <div
                      key={e.id}
                      className="px-3 py-2 flex items-center gap-2 text-[12px]"
                      style={{
                        borderLeft: `3px solid ${isRetail ? '#10b981' : e.paymentMethod === 'aggregator' ? '#f59e0b' : '#8b5cf6'}`,
                      }}
                    >
                      <code className="bg-amber-50 text-gray-900 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider">
                        {e.vehicleNumber || '—'}
                      </code>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-700 truncate text-[11px]">
                          {e.services?.main?.serviceName || 'мойка'}
                          {e.sourceName && <span className="text-gray-400"> · {e.sourceName}</span>}
                        </div>
                        <div className="text-[10px] text-gray-400 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {time}
                        </div>
                      </div>
                      <span className="font-bold tabular-nums text-emerald-700 text-[12px]">
                        {amount.toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
