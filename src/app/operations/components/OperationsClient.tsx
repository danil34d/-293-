'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity, Users, Car, Camera, Sun, Moon, Box,
  ClipboardList, BookCheck, ExternalLink, Wallet, Droplets,
  WifiOff, CheckCircle2, Plus, AlertTriangle, ChevronRight, Clock,
} from 'lucide-react';
import type { Employee, WashEvent, WashId } from '@/types';
import type { PendingCameraVehicle } from '@/lib/camera-pending';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PendingCameraSessionsPanel } from '@/components/camera/PendingCameraSessionsPanel';

interface OperationsClientProps {
  box1Employees: Employee[];
  box2Employees: Employee[];
  todayEvents: WashEvent[];
  initialPendingVehicles: PendingCameraVehicle[];
  allEmployees: Employee[];
  currentShiftType: string;
  washId: WashId;
}

// ─── helpers ───

function buildCameraStreamUrl(boxNumber: number, wide = false) {
  if (boxNumber !== 1) {
    return null;
  }

  const params = new URLSearchParams({
    width: wide ? '960' : '640',
    quality: wide ? '60' : '45',
    fps: wide ? '8' : '5',
  });

  return `/api/camera-stream/${boxNumber}?${params.toString()}`;
}

// Длительность мойки по «эвристике названия»: Лайт ≈ 15 мин, Премиум ≈ 40, остальное ≈ 25
function estimateMinutes(serviceName: string | undefined): number {
  if (!serviceName) return 25;
  const lower = serviceName.toLowerCase();
  if (lower.includes('премиум')) return 40;
  if (lower.includes('лайт') || lower.includes('экспресс')) return 15;
  return 25;
}

function minutesAgo(iso: string | undefined): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / 60000);
}

function formatHHmm(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

// ─── small components ───

function CameraPreview({ boxNumber }: { boxNumber: number }) {
  const [failed, setFailed] = useState(false);
  const streamUrl = useMemo(() => buildCameraStreamUrl(boxNumber), [boxNumber]);
  const openUrl = useMemo(() => buildCameraStreamUrl(boxNumber, true), [boxNumber]);

  if (!streamUrl || !openUrl) {
    return (
      <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center border border-white/10">
        <div className="text-center text-slate-400">
          <Camera className="h-8 w-8 mx-auto mb-1 opacity-50" />
          <p className="text-xs">Субпоток подключён только для камеры 1</p>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center border border-white/10">
        <div className="text-center text-slate-400">
          <Camera className="h-8 w-8 mx-auto mb-1 opacity-50" />
          <p className="text-xs">Не удалось открыть sub stream</p>
          <p className="text-[11px] text-slate-500 mt-1">Проверь dashboard камер на 8050</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
      <img
        src={streamUrl}
        alt={`Камера бокса ${boxNumber}`}
        className="aspect-video w-full bg-black object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80">
        камера {boxNumber} · sub
      </div>
      <a
        href={openUrl}
        target="_blank"
        rel="noreferrer"
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white/80 transition hover:bg-black/80 hover:text-white"
        title={`Открыть камеру бокса ${boxNumber}`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function LiveKpi({
  label, value, icon: Icon, color,
}: {
  label: string; value: string | number; icon: typeof Box; color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '15', color }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
        <div className="text-[20px] font-extrabold text-slate-900 tabular-nums leading-tight">{value}</div>
      </div>
    </div>
  );
}

// ─── BoxCard V2 ───

type BoxStatus = 'busy' | 'idle' | 'offline';

function BoxCard({
  boxNumber,
  washName,
  employees,
  events,
  pendingVehicles,
  allEmployees,
  onDismissed,
}: {
  boxNumber: 1 | 2;
  washName: string;
  employees: Employee[];
  events: WashEvent[];
  pendingVehicles: PendingCameraVehicle[];
  allEmployees: Employee[];
  onDismissed: (dirName: string) => void;
}) {
  // Sort events newest-first
  const sorted = useMemo(() => {
    return [...events].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [events]);

  const lastEvent = sorted[0];
  const lastEventMinAgo = lastEvent ? minutesAgo(lastEvent.timestamp) : Infinity;

  // Heuristic статус:
  //   нет сотрудников → offline (нет смены)
  //   последняя мойка < 30 мин назад → "ещё активный" (показываем как busy с recent wash)
  //   иначе → idle
  const status: BoxStatus = useMemo(() => {
    if (employees.length === 0) return 'offline';
    if (lastEvent && lastEventMinAgo < 30) return 'busy';
    return 'idle';
  }, [employees.length, lastEvent, lastEventMinAgo]);

  const isBusy = status === 'busy';
  const isIdle = status === 'idle';
  const isOffline = status === 'offline';

  const headBg = isBusy
    ? 'linear-gradient(135deg, #0088CC 0%, #00D4FF 100%)'
    : isIdle
    ? 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)'
    : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';

  const statusLabel = isBusy ? 'идёт мойка' : isIdle ? 'свободен' : 'офлайн';

  // Для busy: progress estimate
  const recentWash = isBusy ? lastEvent : null;
  const totalEst = recentWash ? estimateMinutes(recentWash.services?.main?.serviceName) : 0;
  const elapsed = recentWash ? lastEventMinAgo : 0;
  const pct = recentWash ? Math.min(100, Math.round((elapsed / totalEst) * 100)) : 0;
  const left = recentWash ? Math.max(0, totalEst - elapsed) : 0;

  const total = events.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const recentEvents = sorted.slice(0, 5);

  // Camera status: считаем "online" если есть pending за последний час или мойка < 10 мин
  const cameraOnline =
    pendingVehicles.some((v) => v.start && minutesAgo(v.start.replace('_', 'T')) < 60) ||
    (lastEvent && lastEventMinAgo < 10);
  const cameraLabel = cameraOnline ? 'online' : (lastEvent ? `${lastEventMinAgo} мин назад` : 'нет данных');

  return (
    <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden flex flex-col">
      {/* Coloured header */}
      <div className="p-4 text-white" style={{ background: headBg }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Box className="w-5 h-5 flex-shrink-0" />
            <span className="text-[16px] font-bold">Бокс {boxNumber}</span>
            <span className="text-[11px] opacity-80 truncate">· {washName}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white/20 flex-shrink-0">
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3 flex-1">
        {/* Team */}
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
            <Users className="w-3 h-3 inline mr-1" />
            Команда
          </div>
          {employees.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {employees.map((emp) => (
                <span
                  key={emp.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 text-[12px] font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {emp.fullName.split(' ').slice(0, 2).join(' ')}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-slate-400">никого · бокс не работает</div>
          )}
        </div>

        {/* Current wash (если recent) */}
        {isBusy && recentWash && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <code className="bg-amber-100 text-slate-900 px-2 py-0.5 rounded text-[13px] font-bold tracking-wider">
                {recentWash.vehicleNumber || '—'}
              </code>
              <span className="text-[14px] font-bold text-slate-900 tabular-nums">
                {(recentWash.totalAmount || 0).toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="text-[12px] text-slate-600 truncate">
              {recentWash.services?.main?.serviceName || 'Услуга'}
              {recentWash.paymentMethod === 'counterAgentContract' && recentWash.sourceName && (
                <span className="text-violet-600"> · {recentWash.sourceName}</span>
              )}
              {recentWash.paymentMethod === 'aggregator' && recentWash.sourceName && (
                <span className="text-amber-600"> · {recentWash.sourceName}</span>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-500">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Завершена <b className="text-slate-900">{elapsed} мин назад</b> · {formatHHmm(recentWash.timestamp)}
                </span>
                <span className={left < 5 ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                  оценка ~{totalEst} мин
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, background: pct > 90 ? '#10b981' : '#0088CC' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Idle state */}
        {isIdle && (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-3 text-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
            <div className="text-[12px] font-semibold text-emerald-800">Бокс свободен</div>
            {pendingVehicles.length > 0 && (
              <div className="mt-2 text-[11px] text-slate-700">
                Ожидает:{' '}
                <code className="bg-amber-100 px-1.5 py-0.5 rounded text-[11px] font-bold">
                  {pendingVehicles[0].plateNumber || '?'}
                </code>{' '}
                ({formatHHmm(pendingVehicles[0].start?.replace('_', 'T'))})
              </div>
            )}
          </div>
        )}

        {/* Offline state */}
        {isOffline && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
            <WifiOff className="w-6 h-6 text-rose-500 mx-auto mb-1" />
            <div className="text-[12px] font-semibold text-rose-800">Никто не на смене</div>
            {lastEvent && (
              <div className="text-[11px] text-rose-700 mt-0.5">
                Последняя активность {lastEventMinAgo} мин назад
              </div>
            )}
          </div>
        )}

        {/* Camera preview (только бокс 1) */}
        {boxNumber === 1 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
              <Camera className="w-3 h-3 inline mr-1" />
              Камера
            </div>
            <CameraPreview boxNumber={boxNumber} />
          </div>
        )}

        {/* Footer stats 3-col */}
        <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div>
            <div className="font-bold text-slate-900 text-[14px] tabular-nums">{events.length}</div>
            <div className="text-slate-500">моек сегодня</div>
          </div>
          <div>
            <div className="font-bold text-emerald-700 text-[14px] tabular-nums">
              {total.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-slate-500">касса</div>
          </div>
          <div>
            <div
              className={
                'font-bold text-[14px] flex items-center justify-center gap-1 ' +
                (cameraOnline ? 'text-emerald-700' : 'text-slate-500')
              }
            >
              <span
                className={
                  'w-1.5 h-1.5 rounded-full ' +
                  (cameraOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')
                }
              />
              {cameraOnline ? 'online' : 'idle'}
            </div>
            <div className="text-slate-500 truncate">{cameraLabel}</div>
          </div>
        </div>

        {/* Quick action */}
        <Link
          href={`/workstation?box=${boxNumber}`}
          className="block w-full text-center rounded-lg bg-[#0088CC] hover:bg-[#0077B5] text-white px-3 py-2 text-[13px] font-semibold transition-colors"
        >
          <ClipboardList className="w-4 h-4 inline mr-2" />
          Оформить заказ — Бокс {boxNumber}
        </Link>

        {/* Recent orders */}
        {recentEvents.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">
              Последние заказы
            </div>
            <div className="space-y-1">
              {recentEvents.map((event) => {
                const time = formatHHmm(event.timestamp);
                const names = (event.employeeIds || [])
                  .map((id) => allEmployees.find((e) => e.id === id)?.fullName?.split(' ')[0] || '')
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={event.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 text-[12px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Car className="h-3 w-3 text-slate-400 flex-shrink-0" />
                      <span className="font-medium text-slate-900">{event.vehicleNumber || '—'}</span>
                      {names && <span className="text-[11px] text-slate-500 truncate">{names}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] flex-shrink-0">
                      <span className="font-medium tabular-nums">
                        {event.totalAmount ? `${event.totalAmount} ₽` : ''}
                      </span>
                      <span className="text-slate-400">{time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pending sessions panel (deep workflow) */}
        <PendingCameraSessionsPanel
          boxNumber={boxNumber}
          pendingVehicles={pendingVehicles}
          boxEmployees={employees}
          allEmployees={allEmployees}
          basePath="/workstation"
          source="operations"
          onDismissed={onDismissed}
        />
      </div>
    </div>
  );
}

// ─── main ───

const WASH_NAMES: Record<WashId, string> = {
  wash_1: 'Мойка 1',
  wash_2: 'Мойка 2',
};

const WASH_ADDRESSES: Record<WashId, string> = {
  wash_1: 'ул. Циолковского',
  wash_2: 'ул. Мокрово',
};

export function OperationsClient({
  box1Employees,
  box2Employees,
  todayEvents,
  initialPendingVehicles,
  allEmployees,
  currentShiftType,
  washId,
}: OperationsClientProps) {
  const router = useRouter();
  const [pendingVehicles, setPendingVehicles] = useState(initialPendingVehicles);
  const handlePendingDismissed = (dirName: string) => {
    setPendingVehicles((current) => current.filter((vehicle) => vehicle.dirName !== dirName));
  };

  useEffect(() => {
    let ignore = false;

    async function loadPendingVehicles() {
      try {
        const response = await fetch('/api/camera-pending', {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) return;

        const data = (await response.json()) as { items?: PendingCameraVehicle[] };
        if (!ignore && Array.isArray(data.items)) {
          setPendingVehicles(data.items);
        }
      } catch (error) {
        console.error('Failed to refresh pending camera vehicles:', error);
      }
    }

    loadPendingVehicles();
    const intervalId = window.setInterval(loadPendingVehicles, 30000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, []);

  // ─── computed ───
  const box1Events = todayEvents.filter((e) => e.boxNumber === 1);
  const box2Events = todayEvents.filter((e) => e.boxNumber === 2);
  const box1PendingVehicles = pendingVehicles.filter((v) => v.boxNumber === 1);
  const box2PendingVehicles = pendingVehicles.filter((v) => v.boxNumber === 2);

  const totalEmployees = box1Employees.length + box2Employees.length;
  const totalRevenue = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  // Heuristic: busy = последний event в боксе < 30 мин
  const boxesBusy = useMemo(() => {
    let busy = 0;
    [box1Events, box2Events].forEach((events) => {
      const last = events[0] ? [...events].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0] : null;
      if (last && minutesAgo(last.timestamp) < 30) busy++;
    });
    return busy;
  }, [box1Events, box2Events]);

  const boxesTotal = washId === 'wash_1' ? 2 : 1; // wash_1 имеет 2 бокса, wash_2 пока 1

  // Pending за последние 60 минут как «overdue» если > 30 мин
  const overduePending = pendingVehicles.filter(
    (v) => v.start && minutesAgo(v.start.replace('_', 'T')) > 30
  );

  const isDay = currentShiftType === 'day';

  return (
    <div className="px-6 pb-12 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between pt-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-blue-600 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Что происходит прямо сейчас
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 mt-1 leading-tight">Центр управления</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(['wash_1', 'wash_2'] as WashId[]).map((wid) => (
                <button
                  key={wid}
                  type="button"
                  onClick={() =>
                    router.push(wid === 'wash_1' ? '/operations' : '/operations?wash=wash_2')
                  }
                  className="rounded-md px-3 py-1.5 text-[13px] font-semibold transition-all"
                  style={{
                    background: washId === wid ? '#fff' : 'transparent',
                    color: washId === wid ? '#0088CC' : '#64748b',
                    boxShadow: washId === wid ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                  }}
                >
                  {WASH_NAMES[wid]}
                </button>
              ))}
            </div>
            <span className="text-[12px] text-slate-500 flex items-center gap-1.5">
              {isDay ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  Дневная смена · 08:00 – 20:00
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-500" />
                  Ночная смена · 20:00 – 08:00
                </>
              )}
            </span>
            <span className="text-[12px] text-slate-400">· {WASH_ADDRESSES[washId]}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/wash-log"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center"
          >
            <BookCheck className="w-3.5 h-3.5 mr-1" /> Журнал
          </Link>
          <Link
            href="/workstation"
            className="rounded-lg bg-[#0088CC] hover:bg-[#0077B5] text-white px-3 py-2 text-[12px] font-semibold inline-flex items-center"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Оформить заказ
          </Link>
        </div>
      </div>

      {/* Live KPI strip */}
      <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <LiveKpi label="Боксов работает" value={`${boxesBusy} / ${boxesTotal}`} icon={Box} color="#0088CC" />
          <LiveKpi label="Команда на смене" value={totalEmployees} icon={Users} color="#10b981" />
          <LiveKpi
            label="Касса смены"
            value={`${totalRevenue.toLocaleString('ru-RU')} ₽`}
            icon={Wallet}
            color="#10b981"
          />
          <LiveKpi label="Моек завершено" value={todayEvents.length} icon={Droplets} color="#0088CC" />
        </div>
      </div>

      {/* Pending cars alert strip */}
      {pendingVehicles.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Camera className="w-4 h-4 text-amber-700" />
            <span className="text-[12px] uppercase tracking-wider font-bold text-amber-800">
              Камеры зафиксировали · {pendingVehicles.length} машин ждут оформления
              {overduePending.length > 0 && (
                <span className="ml-2 text-rose-700">
                  · {overduePending.length} просрочено
                </span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {pendingVehicles.slice(0, 6).map((p) => {
              const ageMin = p.start ? minutesAgo(p.start.replace('_', 'T')) : 0;
              const overdue = ageMin > 30;
              return (
                <Link
                  key={p.id}
                  href={`/workstation?box=${p.boxNumber}`}
                  className={
                    'rounded-lg bg-white p-2.5 flex items-center gap-3 hover:bg-amber-50 transition-colors ' +
                    (overdue ? 'border border-rose-200' : 'border border-amber-200')
                  }
                >
                  <code className="bg-amber-100 text-slate-900 px-1.5 py-0.5 rounded text-[12px] font-bold tracking-wider">
                    {p.plateNumber || '?'}
                  </code>
                  <div className="flex-1 text-[11px] text-slate-600 min-w-0">
                    Бокс {p.boxNumber} · {formatHHmm(p.start?.replace('_', 'T'))}
                    {overdue && <span className="ml-1 text-rose-600 font-bold">просрочена ({ageMin}м)</span>}
                  </div>
                  <span className="text-[11px] font-bold uppercase text-blue-600 inline-flex items-center">
                    оформить <ChevronRight className="w-3 h-3 ml-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
          {pendingVehicles.length > 6 && (
            <div className="mt-2 text-[11px] text-amber-700 text-center">
              +{pendingVehicles.length - 6} ещё — подробности в карточках боксов ниже
            </div>
          )}
        </div>
      )}

      {/* Boxes grid */}
      <div className={`grid grid-cols-1 ${washId === 'wash_1' ? 'lg:grid-cols-2' : ''} gap-4`}>
        {washId === 'wash_1' && (
          <BoxCard
            boxNumber={1}
            washName={WASH_NAMES[washId]}
            employees={box1Employees}
            events={box1Events}
            pendingVehicles={box1PendingVehicles}
            allEmployees={allEmployees}
            onDismissed={handlePendingDismissed}
          />
        )}
        <BoxCard
          boxNumber={2}
          washName={WASH_NAMES[washId]}
          employees={box2Employees}
          events={box2Events}
          pendingVehicles={box2PendingVehicles}
          allEmployees={allEmployees}
          onDismissed={handlePendingDismissed}
        />
      </div>

      {/* What's new strip */}
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
          <CheckCircle2 className="w-3.5 h-3.5" /> Phase 36 — что изменилось
        </div>
        <ul className="text-[12px] text-emerald-900 space-y-1 leading-relaxed">
          <li>• <b>BoxCard</b> с live-статусом — занят / свободен / офлайн по цвету шапки</li>
          <li>• <b>Текущая мойка</b> с прогресс-полосой времени и оценкой длительности</li>
          <li>• <b>Pending от камер</b> в отдельной полосе — просрочки выделены красным</li>
          <li>• <b>Live KPI</b> сверху: боксов работает, команда, касса, моек</li>
          <li>• Camera status (pulse + last-ping) — сразу видно живое устройство</li>
        </ul>
      </div>
    </div>
  );
}
