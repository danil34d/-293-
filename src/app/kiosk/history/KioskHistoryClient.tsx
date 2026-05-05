'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
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

function vehicleClassIcon(cls: string | null): string {
  switch ((cls || '').toLowerCase()) {
    case 'car': return '🚗';
    case 'truck': return '🚛';
    case 'bus': return '🚌';
    default: return '❓';
  }
}

export function KioskHistoryClient({ box1Events, box2Events, unprocessed }: Props) {
  const [tab, setTab] = useState<Tab>('box1');

  const counts = useMemo(() => ({
    box1: box1Events.length,
    box2: box2Events.length,
    unprocessed: unprocessed.length,
  }), [box1Events, box2Events, unprocessed]);

  return (
    <div className="flex flex-col h-full pb-[80px]">
      {/* Tabs — большие, для мокрых пальцев */}
      <div className="grid grid-cols-3 gap-1 p-2 sticky top-0 bg-gray-100 z-10">
        {([
          { id: 'box1' as Tab, label: 'Бокс 1', count: counts.box1, color: 'blue' },
          { id: 'box2' as Tab, label: 'Бокс 2', count: counts.box2, color: 'green' },
          { id: 'unprocessed' as Tab, label: '⚠ Не оформлено', count: counts.unprocessed, color: 'orange' },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[64px] rounded-lg px-2 py-2 text-sm font-bold transition-all ${
              tab === t.id
                ? `bg-${t.color}-600 text-white shadow-lg`
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            <div>{t.label}</div>
            <div className="text-xs mt-0.5 opacity-90">
              {t.count > 0 ? `${t.count} ${t.count === 1 ? 'мойка' : 'моек'}` : 'пусто'}
            </div>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pt-2">
        {tab === 'box1' && <EventList events={box1Events} emptyText="Сегодня в боксе 1 моек ещё не было" />}
        {tab === 'box2' && <EventList events={box2Events} emptyText="Сегодня в боксе 2 моек ещё не было" />}
        {tab === 'unprocessed' && <UnprocessedList items={unprocessed} />}
      </div>
    </div>
  );
}

function EventList({ events, emptyText }: { events: WashEvent[]; emptyText: string }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-5xl mb-3">😴</span>
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
          className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 flex items-center gap-3"
        >
          <div className="text-3xl">{vehicleClassIcon(e.services?.main?.vehicleClass || null)}</div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-base font-bold text-gray-900">
              {e.vehicleNumber || '(без номера)'}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {formatTime(e.timestamp)}
              {e.totalAmount > 0 && <span className="ml-2">• {e.totalAmount}₽</span>}
              {e.paymentMethod && <span className="ml-2">• {paymentLabel(e.paymentMethod)}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function UnprocessedList({ items }: { items: UnprocessedCameraVehicle[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <span className="text-5xl mb-3">✅</span>
        <p className="text-base font-medium">Все мойки оформлены</p>
        <p className="text-xs mt-1">За последние 7 дней без хвостов</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((v) => (
        <div
          key={v.id}
          className="bg-white rounded-lg p-3 shadow-sm border-2 border-orange-200 flex items-center gap-3"
        >
          <div className="text-3xl">{vehicleClassIcon(v.vehicleClass)}</div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-base font-bold text-gray-900">
              {v.plateNumber || <span className="italic text-gray-400 font-normal">номер не определён</span>}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              Бокс {v.boxNumber} • {formatTime(v.actualEnd || v.actualStart)} • {Math.round(v.durationSec / 60)} мин
            </div>
          </div>
          <Link
            href={buildOrderUrl(v)}
            className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-bold whitespace-nowrap min-h-[56px] flex items-center"
          >
            🚀 Оформить
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

function paymentLabel(m: string): string {
  switch (m) {
    case 'cash': return '💵 Наличные';
    case 'card': return '💳 Карта';
    case 'transfer': return '📲 Перевод';
    case 'aggregator': return '🚖 Агрегатор';
    case 'counterAgentContract': return '📜 Контрагент';
    default: return m;
  }
}
