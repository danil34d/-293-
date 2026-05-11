'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Car,
  Truck,
  Bus,
  HelpCircle,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Globe,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Clock,
  Coffee,
} from 'lucide-react';
import type { WashEvent } from '@/types';
import type { UnprocessedCameraVehicle } from '@/lib/camera-pending-range';

interface Props {
  box1Events: WashEvent[];
  box2Events: WashEvent[];
  unprocessed: UnprocessedCameraVehicle[];
}

type Tab = 'box1' | 'box2' | 'unprocessed';

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const norm = iso.includes('_') ? iso.replace('_', 'T') : iso;
  const d = new Date(norm);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function VehicleClassIcon({ cls, size = 'md' }: { cls: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
  switch ((cls || '').toLowerCase()) {
    case 'car':
      return <Car className={`${sizeClass} text-blue-600`} strokeWidth={2} />;
    case 'truck':
      return <Truck className={`${sizeClass} text-orange-600`} strokeWidth={2} />;
    case 'bus':
      return <Bus className={`${sizeClass} text-purple-600`} strokeWidth={2} />;
    default:
      return <HelpCircle className={`${sizeClass} text-gray-400`} strokeWidth={2} />;
  }
}

function PaymentIcon({ method }: { method: string | undefined }) {
  const cls = 'h-3.5 w-3.5';
  switch (method) {
    case 'cash':
      return <Banknote className={cls} />;
    case 'card':
      return <CreditCard className={cls} />;
    case 'transfer':
      return <ArrowLeftRight className={cls} />;
    case 'aggregator':
      return <Globe className={cls} />;
    case 'counterAgentContract':
      return <Building2 className={cls} />;
    default:
      return null;
  }
}

function paymentLabel(m: string | undefined): string {
  switch (m) {
    case 'cash': return 'Наличные';
    case 'card': return 'Карта';
    case 'transfer': return 'Перевод';
    case 'aggregator': return 'Агрегатор';
    case 'counterAgentContract': return 'Контрагент';
    default: return m || '';
  }
}

export function KioskHistoryClient({ box1Events, box2Events, unprocessed }: Props) {
  const [tab, setTab] = useState<Tab>('box1');

  const counts = useMemo(() => ({
    box1: box1Events.length,
    box2: box2Events.length,
    unprocessed: unprocessed.length,
  }), [box1Events, box2Events, unprocessed]);

  // Каса по боксам — отображаем в активном tab'е
  const totals = useMemo(() => ({
    box1: box1Events.reduce((s, e) => s + (e.totalAmount || 0), 0),
    box2: box2Events.reduce((s, e) => s + (e.totalAmount || 0), 0),
  }), [box1Events, box2Events]);

  return (
    <div className="flex flex-col h-full pb-[80px]">
      {/* Tabs — большие, для мокрых пальцев. Static classes (Tailwind JIT-safe). */}
      <div className="grid grid-cols-3 gap-1.5 sticky top-0 bg-gray-100/90 backdrop-blur-sm z-10 px-1 py-2">
        <TabButton
          active={tab === 'box1'}
          onClick={() => setTab('box1')}
          activeClass="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/30"
          inactiveClass="bg-white text-gray-700 ring-1 ring-gray-200"
        >
          <div className="font-bold">Бокс 1</div>
          <div className="text-xs mt-0.5 opacity-90">
            {counts.box1 > 0 ? `${counts.box1} ${counts.box1 === 1 ? 'мойка' : 'моек'}` : 'пусто'}
          </div>
        </TabButton>
        <TabButton
          active={tab === 'box2'}
          onClick={() => setTab('box2')}
          activeClass="bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30"
          inactiveClass="bg-white text-gray-700 ring-1 ring-gray-200"
        >
          <div className="font-bold">Бокс 2</div>
          <div className="text-xs mt-0.5 opacity-90">
            {counts.box2 > 0 ? `${counts.box2} ${counts.box2 === 1 ? 'мойка' : 'моек'}` : 'пусто'}
          </div>
        </TabButton>
        <TabButton
          active={tab === 'unprocessed'}
          onClick={() => setTab('unprocessed')}
          activeClass="bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-md shadow-orange-500/30"
          inactiveClass="bg-white text-gray-700 ring-1 ring-gray-200"
        >
          <div className="flex items-center justify-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-bold">Не оформлено</span>
          </div>
          <div className="text-xs mt-0.5 opacity-90">
            {counts.unprocessed > 0 ? `${counts.unprocessed} моек` : 'пусто'}
          </div>
        </TabButton>
      </div>

      {/* Mini-summary над контентом — сумма выбранного бокса */}
      {(tab === 'box1' || tab === 'box2') && counts[tab] > 0 && (
        <div className="px-3 pt-1 pb-2">
          <div className="rounded-xl bg-white px-4 py-2 ring-1 ring-gray-200 flex items-baseline justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Касса бокса
            </span>
            <span className="text-xl font-extrabold tabular-nums text-gray-900">
              {totals[tab].toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pt-1">
        {tab === 'box1' && <EventList events={box1Events} emptyText="Сегодня в боксе 1 моек ещё не было" />}
        {tab === 'box2' && <EventList events={box2Events} emptyText="Сегодня в боксе 2 моек ещё не было" />}
        {tab === 'unprocessed' && <UnprocessedList items={unprocessed} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  activeClass,
  inactiveClass,
  children,
}: {
  active: boolean;
  onClick: () => void;
  activeClass: string;
  inactiveClass: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`min-h-[60px] rounded-xl px-2 py-2 text-sm transition-all active:scale-[0.97] ${
        active ? activeClass : inactiveClass
      }`}
    >
      {children}
    </button>
  );
}

function EventList({ events, emptyText }: { events: WashEvent[]; emptyText: string }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Coffee className="h-12 w-12 mb-3 opacity-50" strokeWidth={1.5} />
        <p className="text-base">{emptyText}</p>
      </div>
    );
  }

  // Sort: новые сверху
  const sorted = [...events].sort((a, b) =>
    (b.timestamp || '').localeCompare(a.timestamp || ''),
  );

  return (
    <div className="space-y-2">
      {sorted.map((e) => (
        <div
          key={e.id}
          className="bg-white rounded-2xl p-3 ring-1 ring-gray-200 flex items-center gap-3"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
            <VehicleClassIcon cls={e.cameraSession?.vehicleClass || (e.services?.main as { vehicleClass?: string })?.vehicleClass || null} size="md" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-base font-bold text-gray-900 leading-tight">
              {e.vehicleNumber || <span className="italic font-sans text-gray-400">без номера</span>}
            </div>
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(e.timestamp)}
              </span>
              {e.paymentMethod && (
                <span className="inline-flex items-center gap-1">
                  <PaymentIcon method={e.paymentMethod} />
                  {paymentLabel(e.paymentMethod)}
                </span>
              )}
            </div>
          </div>
          {e.totalAmount > 0 && (
            <div className="text-right flex-shrink-0">
              <div className="text-lg font-extrabold tabular-nums text-emerald-600">
                {e.totalAmount.toLocaleString('ru-RU')}
              </div>
              <div className="text-[10px] font-semibold text-emerald-600/70 uppercase">руб</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function UnprocessedList({ items }: { items: UnprocessedCameraVehicle[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-emerald-500">
        <CheckCircle2 className="h-12 w-12 mb-3" strokeWidth={1.5} />
        <p className="text-base font-semibold">Все мойки оформлены</p>
        <p className="text-xs mt-1 text-gray-400">За последние 7 дней без хвостов</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((v) => (
        <div
          key={v.id}
          className="bg-white rounded-2xl p-3 ring-2 ring-orange-200 flex items-center gap-3 shadow-sm shadow-orange-100"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-orange-200">
            <VehicleClassIcon cls={v.vehicleClass} size="md" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-base font-bold text-gray-900 leading-tight">
              {v.plateNumber || <span className="italic font-sans text-gray-400 font-normal">номер не определён</span>}
            </div>
            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                Бокс {v.boxNumber}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTime(v.actualEnd || v.actualStart)}
              </span>
              <span>{Math.round(v.durationSec / 60)} мин</span>
            </div>
          </div>
          <Link
            href={buildOrderUrl(v)}
            className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white px-3 py-3 rounded-xl text-sm font-bold whitespace-nowrap min-h-[60px] min-w-[60px] flex items-center gap-1 shadow-md shadow-blue-500/30 active:scale-[0.97]"
          >
            <span>Оформить</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ))}
    </div>
  );
}

function buildOrderUrl(v: UnprocessedCameraVehicle): string {
  // 🔥 Терминал → /kiosk/order (kiosk-страница), не /workstation (employee).
  // Параметры camera* передаются как есть → ZorinWorkstationConsole в kiosk-режиме
  // подхватит их, покажет фото, plate_crop, форму оформления.
  const params = new URLSearchParams({
    box: String(v.boxNumber),
    camera: '1',
    cameraBox: String(v.boxNumber),
    cameraDir: v.dirName,
    cameraMode: 'edit',
  });
  if (v.plateNumber) params.set('cameraPlate', v.plateNumber);
  if (v.vehicleClass) params.set('cameraVehicleClass', v.vehicleClass);
  if (v.actualStart) params.set('cameraStart', v.actualStart);
  if (v.actualEnd) params.set('cameraEnd', v.actualEnd);
  return `/kiosk/order?${params.toString()}`;
}
