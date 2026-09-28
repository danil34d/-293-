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
// 09.08.2026: разбор времени переехал в общий модуль, чтобы копии не разъезжались.
import { parseCameraTime, minutesAgo, formatHHmm } from '@/lib/camera-time';

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
/**
 * Ссылка «оформить» из карточки бокса. Собирает тот же набор параметров, что и
 * верхняя плашка: без них форма открывается пустой и оператор набирает номер,
 * который система уже прочитала.
 */
function buildBoxPendingHref(boxNumber: number, vehicle: PendingCameraVehicle | undefined) {
  const params = new URLSearchParams({ box: String(boxNumber) });
  if (!vehicle) return `/workstation?${params.toString()}`;
  params.set('camera', '1');
  params.set('cameraBox', String(vehicle.boxNumber ?? boxNumber));
  params.set('cameraDir', vehicle.dirName);
  params.set('cameraMode', vehicle.plateNumber ? 'checkout' : 'edit');
  if (vehicle.plateNumber) params.set('cameraPlate', vehicle.plateNumber);
  if (vehicle.vehicleClass) params.set('cameraVehicleClass', vehicle.vehicleClass);
  if (vehicle.start) params.set('cameraStart', vehicle.start);
  if (vehicle.end) params.set('cameraEnd', vehicle.end);
  return `/workstation?${params.toString()}`;
}

function estimateMinutes(serviceName: string | undefined): number {
  if (!serviceName) return 25;
  const lower = serviceName.toLowerCase();
  if (lower.includes('премиум')) return 40;
  if (lower.includes('лайт') || lower.includes('экспресс')) return 15;
  return 25;
}

// 🔥 ФИКС 2026-08-08: камера отдаёт время как '2026-08-08_16-15-33'.
// Вызывающий код делал .replace('_','T') и получал '2026-08-08T16-15-33' —
// время с дефисами вместо двоеточий, Date.parse даёт NaN. Следствия были
// видны на /operations: время всегда «—», minutesAgo возвращал Infinity,
// а Infinity > 30 метил КАЖДУЮ карточку «просрочена (Infinityм)».
// Теперь разбор здесь, вызывающим .replace() делать не нужно.
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
  label, value, icon: Icon, color, onClick, hint,
}: {
  label: string; value: string | number; icon: typeof Box; color: string;
  /** Если задан — плитка становится кнопкой (сейчас так работает «Касса смены»). */
  onClick?: () => void;
  hint?: string;
}) {
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      {...(onClick ? { type: 'button', onClick, title: hint } : {})}
      className={
        'flex items-center gap-3 text-left rounded-xl transition-colors '
        + (onClick ? 'cursor-pointer hover:bg-slate-50 -m-1.5 p-1.5' : '')
      }
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: color + '15', color }}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
        <div className="text-[20px] font-extrabold text-slate-900 tabular-nums leading-tight">
          {value}
          {onClick && <span className="ml-1.5 text-[12px] font-bold text-slate-400">›</span>}
        </div>
      </div>
    </Wrapper>
  );
}

// ─── BoxCard V2 ───
// Phase 49: status «pending» добавлен — камера видит машину в боксе, но
// мойка ещё не оформлена. Раньше показывали "свободен" + "Ожидает: ? (—)" —
// вводило в заблуждение, особенно когда грузовик прямо на видео в боксе.
type BoxStatus = 'busy' | 'pending' | 'idle' | 'offline';

const VEHICLE_CLASS_RU: Record<string, string> = {
  car: 'легковая',
  truck: 'грузовик',
  bus: 'автобус',
  van: 'микроавтобус',
};

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

  // Phase 49: 4-status heuristic с приоритетом pending над idle.
  //   нет сотрудников → offline (нет смены)
  //   последняя мойка < 30 мин назад → busy (мойка только что прошла или ещё идёт)
  //   есть pending vehicles → pending («камера видит машину, нужно оформить»)
  //   иначе → idle (свободен реально)
  const status: BoxStatus = useMemo(() => {
    if (employees.length === 0) return 'offline';
    if (lastEvent && lastEventMinAgo < 30) return 'busy';
    if (pendingVehicles.length > 0) return 'pending';
    return 'idle';
  }, [employees.length, lastEvent, lastEventMinAgo, pendingVehicles.length]);

  const isBusy = status === 'busy';
  const isPending = status === 'pending';
  const isIdle = status === 'idle';
  const isOffline = status === 'offline';

  // Phase 49: pending = amber gradient (внимание!), busy = blue, idle = green, offline = grey
  const headBg = isBusy
    ? 'linear-gradient(135deg, #0088CC 0%, #00D4FF 100%)'
    : isPending
    ? 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)'
    : isIdle
    ? 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)'
    : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';

  const statusLabel = isBusy
    ? 'идёт мойка'
    : isPending
    ? `ждёт оформления · ${pendingVehicles.length}`
    : isIdle
    ? 'свободен'
    : 'офлайн';

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
    pendingVehicles.some((v) => minutesAgo(v.start) < 60) ||
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

        {/* Pending state — Phase 49: камера видит машину, оформления нет */}
        {isPending && (() => {
          const v = pendingVehicles[0];
          const plateLabel = v.plateNumber || 'без номера';
          const plateIsKnown = !!v.plateNumber;
          const vehicleClass = v.vehicleClass ? VEHICLE_CLASS_RU[v.vehicleClass] || v.vehicleClass : null;
          // 🔥 ФИКС 2026-08-12: тут остался старый .replace('_','T'). Камера
          // отдаёт заезд как «2026-08-09_10-47-02», и такая замена давала
          // «2026-08-09T10-47-02» — всё равно нечитаемую строку. Разбор формата
          // живёт в camera-time.ts, ему нужно отдавать исходное значение.
          const startTime = v.start ? formatHHmm(v.start) : null;
          const ageMin = v.start ? minutesAgo(v.start) : null;
          return (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2 mb-2">
                <Camera className="w-5 h-5 text-amber-700 flex-shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-amber-900">
                    Машина в боксе — нужно оформить
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5">
                    {pendingVehicles.length === 1
                      ? '1 машина'
                      : `${pendingVehicles.length} машин(ы)`}{' '}
                    зафиксированы камерой
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <code
                  className={
                    'px-2 py-0.5 rounded text-[12px] font-bold tracking-wider ' +
                    (plateIsKnown ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-700 italic')
                  }
                >
                  {plateLabel}
                </code>
                {vehicleClass && (
                  <span className="text-[11px] text-amber-800">· {vehicleClass}</span>
                )}
                {startTime && (
                  <span className="text-[11px] text-amber-700">
                    · с {startTime}
                    {ageMin !== null && ageMin > 0 && ` (${ageMin}м)`}
                  </span>
                )}
              </div>
              {/* 🔥 ФИКС 2026-08-12: третья точка входа в оформление, и она
                  единственная не передавала камерный контекст — открывала
                  ПУСТУЮ форму, хотя номер ожидающей машины напечатан на бейдже
                  прямо выше. Верхняя плашка «Камеры зафиксировали» и панель
                  «Неоформленные машины» параметры передают; эта копия разошлась.
                  Тот же дефект чинили 09.08 в верхней плашке — и не заметили,
                  что рядом лежит вторая такая же ссылка. */}
              <Link
                href={buildBoxPendingHref(boxNumber, v)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-[12px] font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Оформить заказ
              </Link>
            </div>
          );
        })()}

        {/* Idle state */}
        {isIdle && (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-3 text-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
            <div className="text-[12px] font-semibold text-emerald-800">Бокс свободен</div>
            <div className="text-[10px] text-emerald-700 mt-0.5">Машин на территории не видно</div>
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
  // Phase 45: live clock + last-refresh marker
  const [now, setNow] = useState<number>(() => Date.now());
  const [lastFullRefreshAt, setLastFullRefreshAt] = useState<number>(() => Date.now());

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

  // Phase 45: tick clock каждую секунду (для отображения времени)
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  // Phase 45: full server-side refresh каждые 60s через router.refresh()
  // → переподтянет shifts/employees/events/pending заново server-side
  useEffect(() => {
    const refresh = window.setInterval(() => {
      router.refresh();
      setLastFullRefreshAt(Date.now());
    }, 60000);
    return () => window.clearInterval(refresh);
  }, [router]);

  // Phase 45: relative "обновлено N сек назад" string
  const refreshAgoSec = Math.max(0, Math.floor((now - lastFullRefreshAt) / 1000));
  const refreshAgoLabel = refreshAgoSec < 5
    ? 'только что'
    : refreshAgoSec < 60
    ? `${refreshAgoSec}с назад`
    : `${Math.floor(refreshAgoSec / 60)}м назад`;
  const nowLabel = new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // ─── computed ───
  const box1Events = todayEvents.filter((e) => e.boxNumber === 1);
  const box2Events = todayEvents.filter((e) => e.boxNumber === 2);
  const box1PendingVehicles = pendingVehicles.filter((v) => v.boxNumber === 1);
  const box2PendingVehicles = pendingVehicles.filter((v) => v.boxNumber === 2);

  const totalEmployees = box1Employees.length + box2Employees.length;
  const totalRevenue = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  // 🔥 2026-08-13: «Касса смены» была просто числом, и число это вводило в
  // заблуждение. 13.08 плитка показывала 8 828 ₽, хотя ВСЕ шесть моек были по
  // агрегатору — живых денег в кассе ноль, вся сумма записана на балансы
  // клиентов. Владелец видит «касса», а кассы нет.
  // Теперь клик раскрывает разбивку: сколько реально получено и сколько
  // числится за клиентами.
  const [cashOpen, setCashOpen] = useState(false);
  const revenueBreakdown = useMemo(() => {
    const byMethod: Record<string, { sum: number; count: number }> = {};
    for (const e of todayEvents) {
      const m = e.paymentMethod || 'cash';
      byMethod[m] = byMethod[m] || { sum: 0, count: 0 };
      byMethod[m].sum += e.totalAmount || 0;
      byMethod[m].count += 1;
    }
    const cashLike = ['cash', 'card', 'transfer'];
    const live = cashLike.reduce((s, m) => s + (byMethod[m]?.sum || 0), 0);
    const onAccount = totalRevenue - live;
    return { byMethod, live, onAccount };
  }, [todayEvents, totalRevenue]);

  // Phase 49: KPI «занято» считает как busy И pending (камера видит машину).
  // Иначе «1/2 работает» противоречит большому amber-блоку «машина ждёт оформления».
  const boxesBusy = useMemo(() => {
    let busy = 0;
    const boxPairs: Array<[WashEvent[], PendingCameraVehicle[]]> = [
      [box1Events, box1PendingVehicles],
      [box2Events, box2PendingVehicles],
    ];
    boxPairs.forEach(([events, pending]) => {
      const last = events[0] ? [...events].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))[0] : null;
      const hasRecentEvent = last && minutesAgo(last.timestamp) < 30;
      const hasPending = pending.length > 0;
      if (hasRecentEvent || hasPending) busy++;
    });
    return busy;
  }, [box1Events, box2Events, box1PendingVehicles, box2PendingVehicles]);

  const boxesTotal = washId === 'wash_1' ? 2 : 1; // wash_1 имеет 2 бокса, wash_2 пока 1

  // Pending за последние 60 минут как «overdue» если > 30 мин
  const overduePending = pendingVehicles.filter(
    (v) => minutesAgo(v.start) > 30
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
          {/* Phase 45: live clock + refresh indicator */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <div className="leading-tight">
              <div className="font-bold tabular-nums text-emerald-800">{nowLabel}</div>
              <div className="text-[9px] text-emerald-700">обновлено {refreshAgoLabel}</div>
            </div>
          </div>
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
            onClick={() => setCashOpen(true)}
            hint="Показать, сколько получено живыми деньгами, а сколько записано на балансы клиентов"
            value={`${totalRevenue.toLocaleString('ru-RU')} ₽`}
            icon={Wallet}
            color="#10b981"
          />
          <LiveKpi label="Моек завершено" value={todayEvents.length} icon={Droplets} color="#0088CC" />
        </div>
      </div>

      {/* Pending cars alert strip — Phase 45: rose-tinted + pulse если есть overdue */}
      {pendingVehicles.length > 0 && (
        <div
          className={
            'rounded-xl border p-3 transition-colors ' +
            (overduePending.length > 0
              ? 'bg-rose-50 border-rose-300'
              : 'bg-amber-50 border-amber-200')
          }
        >
          <div className="flex items-center gap-2 mb-2">
            <Camera
              className={
                'w-4 h-4 ' +
                (overduePending.length > 0 ? 'text-rose-700 animate-pulse' : 'text-amber-700')
              }
            />
            <span
              className={
                'text-[12px] uppercase tracking-wider font-bold ' +
                (overduePending.length > 0 ? 'text-rose-800' : 'text-amber-800')
              }
            >
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
              const ageMin = minutesAgo(p.start);
              const ageKnown = Number.isFinite(ageMin);
              const overdue = ageKnown && ageMin > 30;
              // ссылка ведёт в форму с подставленными данными сессии,
              // а не на пустой /workstation?box=N
              const params = new URLSearchParams({
                box: String(p.boxNumber),
                camera: '1',
                cameraBox: String(p.boxNumber),
                cameraDir: p.dirName,
                cameraMode: p.plateNumber ? 'checkout' : 'edit',
              });
              // 🔥 ФИКС 2026-08-09: номер знали, но в форму не передавали.
              // Ссылка использовала p.plateNumber для выбора режима 'checkout' и
              // печатала его в плашке, а параметр cameraPlate не ставила —
              // ZorinWorkstationConsole открывался с пустым полем и надписью
              // «Камера не распознала номер», хотя OCR прочитал его с
              // уверенностью 1.0. Оператор набирал вручную то, что система уже
              // знала. Остальные три точки входа (PendingCameraSessionsPanel,
              // KioskHistoryClient, UnprocessedClient) параметр ставят — эта
              // разъехалась с ними, потому что строит URL своей копией кода.
              if (p.plateNumber) params.set('cameraPlate', p.plateNumber);
              if (p.vehicleClass) params.set('cameraVehicleClass', p.vehicleClass);
              if (p.start) params.set('cameraStart', p.start);
              if (p.end) params.set('cameraEnd', p.end);
              return (
                <Link
                  key={p.id}
                  href={`/workstation?${params.toString()}`}
                  className={
                    'rounded-lg bg-white p-2.5 flex items-center gap-3 hover:bg-amber-50 transition-colors ' +
                    (overdue ? 'border border-rose-200' : 'border border-amber-200')
                  }
                >
                  <code className="bg-amber-100 text-slate-900 px-1.5 py-0.5 rounded text-[12px] font-bold tracking-wider">
                    {p.plateNumber || '?'}
                  </code>
                  <div className="flex-1 text-[11px] text-slate-600 min-w-0">
                    Бокс {p.boxNumber} · {formatHHmm(p.start)}
                    {overdue && <span className="ml-1 text-rose-600 font-bold">просрочена ({ageMin} мин)</span>}
                    {!ageKnown && <span className="ml-1 text-slate-400">время неизвестно</span>}
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

        {/* Разбивка кассы — открывается кликом по плитке «Касса смены» */}
        {cashOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]"
            onClick={() => setCashOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                    Касса за сегодня
                  </div>
                  <div className="text-[26px] font-extrabold text-slate-900 tabular-nums leading-tight">
                    {totalRevenue.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="text-[12px] text-slate-500">
                    {todayEvents.length} моек · средний чек{' '}
                    {todayEvents.length
                      ? Math.round(totalRevenue / todayEvents.length).toLocaleString('ru-RU')
                      : 0}{' '}
                    ₽
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCashOpen(false)}
                  className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 text-lg leading-none"
                  aria-label="Закрыть"
                >
                  ×
                </button>
              </div>

              {/* Главное разделение: что реально получено против того, что
                  записано за клиентами. Именно его не хватало на плитке. */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    Живые деньги
                  </div>
                  <div className="text-[22px] font-extrabold text-emerald-800 tabular-nums leading-tight">
                    {revenueBreakdown.live.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="text-[11px] text-emerald-700">нал · карта · перевод</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    Записано на клиентов
                  </div>
                  <div className="text-[22px] font-extrabold text-amber-800 tabular-nums leading-tight">
                    {revenueBreakdown.onAccount.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="text-[11px] text-amber-700">агрегаторы · контрагенты</div>
                </div>
              </div>

              <div className="space-y-1.5 mb-4">
                {([
                  ['cash', 'Наличные'],
                  ['card', 'Карта'],
                  ['transfer', 'Перевод'],
                  ['aggregator', 'Агрегатор'],
                  ['counterAgentContract', 'Контрагент'],
                ] as const).map(([key, label]) => {
                  const row = revenueBreakdown.byMethod[key];
                  const sum = row?.sum || 0;
                  const share = totalRevenue > 0 ? Math.round((sum / totalRevenue) * 100) : 0;
                  return (
                    <div key={key} className="flex items-center gap-3 text-[13px]">
                      <span className="w-28 shrink-0 text-slate-700">{label}</span>
                      <span className="w-14 shrink-0 text-right text-[11px] text-slate-400">
                        {row ? `${row.count} шт` : '—'}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${share}%`,
                            background: key === 'aggregator' || key === 'counterAgentContract' ? '#f59e0b' : '#10b981',
                          }}
                        />
                      </span>
                      <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-slate-900">
                        {sum.toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                  );
                })}
              </div>

              {revenueBreakdown.live === 0 && totalRevenue > 0 && (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <b>В кассе пусто.</b> Вся сегодняшняя сумма записана на балансы клиентов —
                  наличных, карты и переводов не было. Проверьте, все ли мойки оформлены
                  верным способом оплаты.
                </div>
              )}

              <div className="flex gap-2">
                <Link
                  href="/wash-log"
                  className="flex-1 rounded-lg bg-[#0088CC] px-3 py-2 text-center text-[13px] font-semibold text-white hover:bg-[#0077b3]"
                >
                  Открыть журнал моек
                </Link>
                <Link
                  href="/transactions"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Сверка кассы
                </Link>
              </div>
            </div>
          </div>
        )}

    </div>
  );
}
