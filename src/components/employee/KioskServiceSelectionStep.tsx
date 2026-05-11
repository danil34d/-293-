'use client';

/**
 * KioskServiceSelectionStep — новый UI шага «Выберите услуги» для kiosk-режима.
 *
 * Заменяет старый JSX в ZorinWorkstationConsole при isKioskMode={true}.
 * Дизайн соответствует прототипу: D:\Users\S\Desktop\КЛОД-ДИЗАЙН\Терминал-Оформить-СЕРВИСЫ-V2.html
 *
 * Что отличается от старого UI:
 *  - Контекстная плашка сверху (что оформляем — номер, бокс, клиент)
 *  - Топ-3 quick-pick карточки большие
 *  - Карточки услуг в 1-2 строки (имя слева, цена справа крупная)
 *  - Поиск свёрнут в кнопку «Найти» (если ≤ 8 услуг)
 *  - Sticky bottom-bar «Выбрано N · SUM ₽ → Далее»
 *  - Lucide иконки вместо emoji
 *
 * Логика state остаётся в родителе (ZorinWorkstationConsole). Этот компонент —
 * чистая презентация с callbacks.
 */

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Timer,
  Truck,
  Globe,
  Building2,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Search,
  X,
  Plus,
  Trash2,
  ArrowRight,
  Repeat,
  Zap,
  Droplets,
} from 'lucide-react';

import type { PriceListItem } from '@/types';

/** Совместимо с PriceListItem из types — используем напрямую */
type ServiceOption = PriceListItem;

/** Минимум полей выбранной услуги */
interface SelectedServiceItem {
  id: string;
  serviceName: string;
  price: number;
}

export type KioskClientType = 'retail' | 'aggregator' | 'counterAgent';
export type KioskPaymentMethod =
  | 'cash'
  | 'card'
  | 'transfer'
  | 'aggregator'
  | 'counterAgentContract';

interface KioskServiceSelectionStepProps {
  // === Контекст: что оформляем ===
  vehicleNumber: string;
  boxNumber: number;
  /** Например: «ДС (Дорожная сеть)», «ООО Логистик», «Розница: Наличные» */
  clientTypeLabel: string;
  /** Тип клиента для иконки */
  clientType: KioskClientType;
  paymentMethod: KioskPaymentMethod;

  // === Таймер ===
  /** Готовая строка типа "00:09" */
  timerLabel: string;

  // === Услуги ===
  services: ServiceOption[];
  selectedServices: SelectedServiceItem[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  /** Тап на услугу — toggle selection (родитель решает add или remove) */
  onServiceToggle: (service: ServiceOption) => void;
  onServiceRemove: (id: string) => void;

  // === Дополнительные предопределённые услуги (chips) ===
  predefinedExtraServices?: ServiceOption[];

  // === Repeat visit (последняя мойка этой машины) ===
  lastWashServices?: { serviceName: string }[];
  onRepeatLast?: () => void;

  // === Custom доп. услуга ===
  canAddCustomServices?: boolean;
  customExtraServiceName?: string;
  customExtraServicePrice?: string;
  onCustomNameChange?: (v: string) => void;
  onCustomPriceChange?: (v: string) => void;
  onAddCustomService?: () => void;

  // === Sticky bottom: итог + переход ===
  totalAmount: number;
  showPrices: boolean;
  onProceed: () => void;
}

export function KioskServiceSelectionStep({
  vehicleNumber,
  boxNumber,
  clientTypeLabel,
  clientType,
  timerLabel,
  services,
  selectedServices,
  searchQuery,
  onSearchChange,
  onServiceToggle,
  onServiceRemove,
  predefinedExtraServices,
  lastWashServices,
  onRepeatLast,
  canAddCustomServices,
  customExtraServiceName,
  customExtraServicePrice,
  onCustomNameChange,
  onCustomPriceChange,
  onAddCustomService,
  totalAmount,
  showPrices,
  onProceed,
}: KioskServiceSelectionStepProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) return services;
    const q = searchQuery.toLowerCase().trim();
    return services.filter((s) =>
      String(s.serviceName).toLowerCase().includes(q),
    );
  }, [services, searchQuery]);

  // Топ-3 quick-pick: первые 3 услуги (на будущее можно сделать по analytics)
  const top3 = services.slice(0, 3);
  const hasTop3 = !searchQuery && top3.length === 3;

  const isSelected = (name: string) =>
    selectedServices.some((s) => s.serviceName === name);

  const selectedCountLabel =
    selectedServices.length === 1
      ? '1 услуга'
      : selectedServices.length >= 2 && selectedServices.length <= 4
        ? `${selectedServices.length} услуги`
        : `${selectedServices.length} услуг`;

  return (
    <div className="space-y-3 pb-32">
      {/* ─── 1. КОНТЕКСТНАЯ ПЛАШКА: что оформляем ───────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-3 ring-1 ring-blue-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider font-bold text-blue-700">
            Оформляем мойку
          </span>
          <span className="flex items-center gap-1 text-xs font-mono text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
            <Timer className="h-3 w-3" />
            {timerLabel}
          </span>
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <ClientTypeIcon type={clientType} />
          <span className="font-mono text-xl font-extrabold text-gray-900 tracking-wider">
            {vehicleNumber || '(номер не введён)'}
          </span>
          <span className="text-xs font-medium text-gray-500">·</span>
          <span className="text-xs font-semibold text-gray-700">
            Бокс {boxNumber}
          </span>
        </div>
        <div className="mt-1 text-xs text-blue-700/80 font-medium flex items-center gap-1">
          <ClientLabelIcon type={clientType} />
          {clientTypeLabel}
        </div>
      </div>

      {/* ─── 2. ПОВТОРНЫЙ ВИЗИТ ─────────────────────────────── */}
      {lastWashServices && lastWashServices.length > 0 && onRepeatLast && (
        <div className="rounded-2xl bg-amber-50 ring-1 ring-amber-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wider">
                <Repeat className="h-3.5 w-3.5" />
                Повторный визит
              </div>
              <p className="text-xs text-amber-700/90 mt-1 line-clamp-2">
                В прошлый раз: {lastWashServices.map((s) => s.serviceName).join(', ')}
              </p>
            </div>
            <button
              onClick={onRepeatLast}
              className="flex-shrink-0 rounded-xl bg-amber-500 text-white px-3 py-2 text-xs font-bold shadow-sm shadow-amber-500/30 active:scale-95 inline-flex items-center gap-1"
            >
              <Repeat className="h-3.5 w-3.5" />
              Повторить
            </button>
          </div>
        </div>
      )}

      {/* ─── 3. ТОП-3 QUICK-PICK (только если нет поиска) ───── */}
      {hasTop3 && (
        <div>
          <div className="mb-1.5 px-1 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-amber-500" />
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              Часто выбирают
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {top3.map((service) => {
              const selected = isSelected(service.serviceName);
              return (
                <button
                  key={service.serviceName}
                  onClick={() => onServiceToggle(service)}
                  className={
                    selected
                      ? 'rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400 active:scale-[0.97] text-left'
                      : 'rounded-xl bg-white p-3 ring-1 ring-gray-200 active:scale-[0.97] text-left'
                  }
                >
                  <div className="text-sm font-extrabold leading-tight line-clamp-2">
                    {shortenServiceName(service.serviceName)}
                  </div>
                  {showPrices && (
                    <div
                      className={
                        'text-xs mt-1.5 font-bold ' +
                        (selected ? 'text-white/90' : 'text-emerald-600')
                      }
                    >
                      {Math.round(service.price)} ₽
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 4. SEARCH (collapsible) ──────────────────────── */}
      <div>
        <div className="mb-1.5 px-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            {searchQuery
              ? `Найдено: ${filteredServices.length} из ${services.length}`
              : `Все услуги (${services.length})`}
          </span>
          {(!searchOpen && !searchQuery && services.length > 3) && (
            <button
              onClick={() => setSearchOpen(true)}
              className="text-[10px] uppercase tracking-wider text-blue-600 font-bold flex items-center gap-1 active:scale-95"
            >
              <Search className="h-3 w-3" />
              Найти
            </button>
          )}
        </div>

        {(searchOpen || searchQuery) && (
          <div className="mb-2 relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Введите название услуги..."
              autoFocus
              className="w-full rounded-xl border-2 border-blue-300 bg-white pl-9 pr-9 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={() => {
                onSearchChange('');
                setSearchOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 hover:bg-gray-100 active:scale-90"
              aria-label="Закрыть поиск"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        )}

        {/* ─── 5. СПИСОК УСЛУГ (компактные карточки) ───────── */}
        <div className="space-y-1.5">
          {filteredServices.length > 0 ? (
            filteredServices.map((service) => {
              const selected = isSelected(service.serviceName);
              return (
                <button
                  key={service.serviceName}
                  onClick={() => onServiceToggle(service)}
                  className={
                    selected
                      ? 'w-full rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 ring-2 ring-blue-500 p-3 flex items-center gap-3 shadow-sm shadow-blue-200 active:scale-[0.99]'
                      : 'w-full rounded-xl bg-white ring-1 ring-gray-200 p-3 flex items-center gap-3 active:bg-gray-50 text-left'
                  }
                >
                  <div
                    className={
                      'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ' +
                      (selected
                        ? 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/40'
                        : 'bg-gray-100')
                    }
                  >
                    {selected ? (
                      <CheckCircle2
                        className="h-5 w-5 text-white"
                        strokeWidth={3}
                      />
                    ) : (
                      <Droplets className="h-4 w-4 text-gray-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className={
                        'text-sm font-semibold leading-snug text-left ' +
                        (selected ? 'text-gray-900' : 'text-gray-900')
                      }
                    >
                      {service.serviceName}
                    </div>
                  </div>
                  {showPrices && (
                    <div className="text-right flex-shrink-0">
                      <div
                        className={
                          'text-base font-extrabold tabular-nums ' +
                          (selected ? 'text-blue-700' : 'text-emerald-600')
                        }
                      >
                        {Math.round(service.price)}
                      </div>
                      <div
                        className={
                          'text-[10px] font-bold ' +
                          (selected ? 'text-blue-600' : 'text-emerald-600/70')
                        }
                      >
                        ₽
                      </div>
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-4 text-center">
              <Search className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-amber-900">
                {services.length === 0
                  ? 'Для этого клиента нет доступных услуг'
                  : 'Ничего не найдено'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => onSearchChange('')}
                  className="text-xs text-amber-700 mt-1 underline"
                >
                  Сбросить поиск
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── 6. ДОП. УСЛУГИ (chips) ───────────────────────── */}
      {predefinedExtraServices && predefinedExtraServices.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Дополнительно
          </div>
          <div className="flex flex-wrap gap-1.5">
            {predefinedExtraServices.map((service) => {
              const selected = isSelected(service.serviceName);
              return (
                <button
                  key={service.serviceName}
                  onClick={() => onServiceToggle(service)}
                  className={
                    selected
                      ? 'rounded-full bg-blue-500 ring-2 ring-blue-400 px-3 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1 active:scale-95'
                      : 'rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 inline-flex items-center gap-1 active:scale-95'
                  }
                >
                  {selected ? (
                    <CheckCircle2 className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  <span>{service.serviceName}</span>
                  {showPrices && (
                    <span
                      className={
                        'ml-0.5 font-bold ' +
                        (selected ? 'text-white' : 'text-emerald-600')
                      }
                    >
                      +{Math.round(service.price)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 7. ВЫБРАННЫЕ УСЛУГИ (если есть) ──────────────── */}
      {selectedServices.length > 0 && (
        <div>
          <div className="mb-1.5 px-1 text-[10px] uppercase tracking-wider text-blue-700 font-bold">
            Выбрано
          </div>
          <div className="space-y-1.5">
            {selectedServices.map((service, idx) => (
              <div
                key={service.id}
                className="rounded-xl bg-blue-50 ring-1 ring-blue-200 px-3 py-2 flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-blue-600 flex-shrink-0" strokeWidth={3} />
                <span className="text-sm font-semibold text-gray-900 flex-1 min-w-0">
                  {service.serviceName}
                  {idx === 0 && (
                    <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 uppercase tracking-wider">
                      главное
                    </span>
                  )}
                </span>
                {showPrices && (
                  <span className="text-sm font-extrabold tabular-nums text-blue-700">
                    {Math.round(service.price)} ₽
                  </span>
                )}
                <button
                  onClick={() => onServiceRemove(service.id)}
                  className="rounded-lg p-1.5 hover:bg-red-50 active:scale-90"
                  aria-label="Убрать услугу"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── 8. CUSTOM СВОЯ УСЛУГА ────────────────────────── */}
      {canAddCustomServices && onCustomNameChange && onCustomPriceChange && onAddCustomService && (
        <div className="rounded-xl bg-gray-50 ring-1 ring-gray-200 p-3 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
            Своя доп. услуга
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <input
              value={customExtraServiceName ?? ''}
              onChange={(e) => onCustomNameChange(e.target.value)}
              placeholder="Название"
              className="col-span-2 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
            {showPrices && (
              <input
                type="number"
                value={customExtraServicePrice ?? ''}
                onChange={(e) => onCustomPriceChange(e.target.value)}
                placeholder="Цена"
                min="0"
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            )}
          </div>
          <button
            onClick={onAddCustomService}
            className="w-full rounded-xl bg-gray-200 hover:bg-gray-300 py-2 text-xs font-bold text-gray-700 active:scale-95 inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить
          </button>
        </div>
      )}

      {/* ─── 9. STICKY BOTTOM-BAR «Итого + Далее» ─────────── */}
      {selectedServices.length > 0 && (
        <>
          <div
            className="fixed bottom-[64px] left-0 right-0 z-40 mx-auto"
            style={{
              maxWidth: '672px' /* max-w-2xl */,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <div className="bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">
                    Выбрано: {selectedCountLabel}
                  </div>
                  {showPrices ? (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold tabular-nums bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                        {totalAmount.toLocaleString('ru-RU')}
                      </span>
                      <span className="text-sm font-bold text-emerald-700">₽</span>
                    </div>
                  ) : (
                    <div className="text-base font-bold text-gray-700">
                      По договору
                    </div>
                  )}
                </div>
                <button
                  onClick={onProceed}
                  className="rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 px-5 py-3.5 text-white shadow-lg shadow-emerald-500/40 active:scale-[0.97] flex items-center gap-2 min-h-[56px]"
                >
                  <span className="text-base font-extrabold">Далее</span>
                  <ArrowRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Декоративная иконка для контекстной плашки */
function ClientTypeIcon({ type }: { type: KioskClientType }) {
  const cls = 'h-5 w-5';
  switch (type) {
    case 'aggregator':
      return <Truck className={cls + ' text-orange-600'} />;
    case 'counterAgent':
      return <Building2 className={cls + ' text-violet-600'} />;
    default:
      return <Truck className={cls + ' text-blue-600'} />;
  }
}

function ClientLabelIcon({ type }: { type: KioskClientType }) {
  const cls = 'h-3 w-3 inline mr-0.5';
  switch (type) {
    case 'aggregator':
      return <Globe className={cls} />;
    case 'counterAgent':
      return <Building2 className={cls} />;
    default:
      return <Banknote className={cls} />;
  }
}

/** Сокращает длинное название услуги для quick-pick карточки.
 * Удаляет «- категория 1», «грузовика», лишние пробелы. */
function shortenServiceName(name: string): string {
  return name
    .replace(/\s*-\s*категория\s+\d+/gi, '')
    .replace(/Мойка грузовика,\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
