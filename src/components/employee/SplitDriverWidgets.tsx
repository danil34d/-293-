'use client';

import * as React from 'react';
import { GitFork, User, Phone, X, ChevronRight, Truck } from 'lucide-react';
import type { CounterAgent, CounterAgentDriver, PriceListItem } from '@/types';
import { normalizeLicensePlate } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/**
 * Phase 51c / V2-#4 split-pricing — UI компоненты для /workstation.
 *
 * SplitDriverCard:
 *   Фиолетовая карточка «Сплит-услуга: водитель обязателен» на шаге Подтверждение.
 *   Появляется автоматически если среди выбранных услуг есть split.driverBonus > 0.
 *   - Если водитель не выбран → CTA «Выбрать водителя →»
 *   - Если выбран → показывает name + phone + кнопка «Изменить»
 *
 * DriverPickerModal:
 *   Список CounterAgent.drivers + опция «Новый водитель» inline.
 *   Бейдж «ЭТА МАШИНА» если plate matches.
 */

// ─── SplitDriverCard ───

export function SplitDriverCard({
  washServices,
  counterAgent,
  normalizedVehicleNumber,
  selectedDriver,
  onPickDriver,
  onClearDriver,
}: {
  washServices: Array<PriceListItem & { id: string }>;
  counterAgent: CounterAgent | null | undefined;
  normalizedVehicleNumber: string;
  selectedDriver: { name: string; phone?: string } | null;
  onPickDriver: () => void;
  onClearDriver: () => void;
}) {
  const splitServices = washServices.filter((s) => (s as any).split?.driverBonus > 0);
  if (splitServices.length === 0) return null;

  // Sum driverBonus от всех split-услуг (на одну мойку может быть несколько)
  const totalDriverBonus = splitServices.reduce(
    (sum, s) => sum + (Number((s as any).split?.driverBonus) || 0),
    0
  );

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50/60 p-3 my-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center flex-shrink-0">
          <GitFork className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold text-violet-900">
            Сплит-услуга: водитель обязателен
          </div>
          <div className="text-[11px] text-violet-700 mt-0.5 leading-snug">
            {splitServices.length === 1
              ? `«${splitServices[0].serviceName}» — водителю фиксированный бонус ${totalDriverBonus}₽ после оплаты счёта.`
              : `${splitServices.length} услуг(и) — суммарный бонус водителю ${totalDriverBonus}₽.`}
          </div>

          {selectedDriver ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white border border-violet-200 px-3 py-2">
              <User className="w-4 h-4 text-violet-700 flex-shrink-0" />
              <div className="text-[13px] font-bold text-slate-900">{selectedDriver.name}</div>
              {selectedDriver.phone && (
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {selectedDriver.phone}
                </span>
              )}
              <button
                type="button"
                onClick={onPickDriver}
                className="ml-2 text-[11px] font-semibold text-violet-700 hover:text-violet-900"
              >
                изменить
              </button>
              <button
                type="button"
                onClick={onClearDriver}
                className="text-rose-500 hover:text-rose-700"
                title="Очистить выбор"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onPickDriver}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 text-[13px] font-bold transition-colors"
            >
              <User className="w-4 h-4" />
              Выбрать водителя
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {counterAgent && (!counterAgent.drivers || counterAgent.drivers.length === 0) && !selectedDriver && (
            <div className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ℹ В справочнике контрагента нет водителей. Введите ФИО вручную в модале.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DriverPickerModal ───

export function DriverPickerModal({
  open,
  onOpenChange,
  counterAgent,
  normalizedVehicleNumber,
  onPick,
  newDriverName,
  setNewDriverName,
  newDriverPhone,
  setNewDriverPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  counterAgent: CounterAgent | null | undefined;
  normalizedVehicleNumber: string;
  onPick: (driver: { name: string; phone?: string }) => void;
  newDriverName: string;
  setNewDriverName: (v: string) => void;
  newDriverPhone: string;
  setNewDriverPhone: (v: string) => void;
}) {
  const drivers: CounterAgentDriver[] = counterAgent?.drivers || [];
  const normalizedPlate = normalizedVehicleNumber
    ? normalizeLicensePlate(normalizedVehicleNumber)
    : '';

  function handlePickExisting(d: CounterAgentDriver) {
    onPick({ name: d.name, phone: d.phone });
    onOpenChange(false);
  }

  function handleAddNew() {
    const name = newDriverName.trim();
    if (name.length < 2) return;
    onPick({ name, phone: newDriverPhone.trim() || undefined });
    onOpenChange(false);
    setNewDriverName('');
    setNewDriverPhone('');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="w-5 h-5 text-violet-700" />
            Выбор водителя
          </DialogTitle>
          <DialogDescription>
            Выберите водителя из списка контрагента или добавьте нового. Бонус создаётся как pending,
            выплачивается после оплаты счёта.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Existing drivers list */}
          {drivers.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">
                Водители контрагента ({drivers.length})
              </div>
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {drivers.map((d, idx) => {
                  const plateMatch = (d.plates || []).some(
                    (p) => normalizeLicensePlate(p) === normalizedPlate
                  );
                  return (
                    <button
                      key={`${d.name}-${idx}`}
                      type="button"
                      onClick={() => handlePickExisting(d)}
                      className="w-full rounded-lg border p-3 text-left hover:bg-violet-50 hover:border-violet-300 transition-colors"
                      style={{
                        background: plateMatch ? 'rgba(245, 158, 11, 0.06)' : '#fff',
                        borderColor: plateMatch ? '#fcd34d' : '#e2e8f0',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-violet-600 flex-shrink-0" />
                        <span className="font-bold text-[14px] text-slate-900">{d.name}</span>
                        {plateMatch && (
                          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[9px] font-bold uppercase tracking-wider">
                            <Truck className="w-3 h-3" />
                            эта машина
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        {d.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {d.phone}
                          </span>
                        )}
                        {(d.plates || []).length > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Truck className="w-3 h-3" />
                            {(d.plates || []).join(', ')}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add new driver inline */}
          <div className="rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/40 p-3">
            <div className="text-[10px] uppercase tracking-wider font-bold text-violet-700 mb-2">
              + Новый водитель
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">ФИО *</label>
                <input
                  type="text"
                  value={newDriverName}
                  onChange={(e) => setNewDriverName(e.target.value)}
                  placeholder="Сидоров Пётр Анатольевич"
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-violet-500"
                  autoFocus={drivers.length === 0}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Телефон</label>
                <input
                  type="text"
                  value={newDriverPhone}
                  onChange={(e) => setNewDriverPhone(e.target.value)}
                  placeholder="+7 999 ..."
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-violet-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddNew}
                disabled={newDriverName.trim().length < 2}
                className="w-full rounded-md bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white px-3 py-2 text-[12px] font-bold transition-colors"
              >
                Добавить и выбрать
              </button>
            </div>
            <div className="mt-2 text-[10px] text-slate-500 leading-snug">
              Новый водитель привязан только к этой мойке — в справочник CounterAgent добавьте его
              через /counter-agents/[id]/edit → Автопарк → Водители.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
