'use client';

/**
 * Phase 60d — DriverComboBox
 *
 * Умный селектор водителя для шага Подтверждение на терминале (split-услуги).
 *
 * Поведение:
 *   — Если водителей ≤ 6 → показываем pills (как было)
 *   — Если водителей > 6 → search-input + dropdown с фильтрацией по name/phone/plate
 *
 * Доп. фишки:
 *   — Если plate совпадает с одним из driver.plates → этот водитель показывается первым с бэйджем «по номеру»
 *   — Кнопка «✓ есть роспись» на каждом — клик подгружает name + signature
 *   — Кнопка «×» — сброс выбора
 *   — При вводе нового ФИО вручную (которого нет в списке) — search просто закрывается
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronDown, CheckCircle2 } from 'lucide-react';

export interface DriverOption {
  id?: string;
  name: string;
  phone?: string;
  position?: string;
  plates?: string[];
  signature?: string;
}

interface Props {
  drivers: DriverOption[];
  selectedName: string;
  vehiclePlate?: string;
  onPick: (driver: DriverOption) => void;
  onClear: () => void;
}

const PILL_THRESHOLD = 6;

function normalizePlate(p: string): string {
  return (p || '').replace(/\s+/g, '').toUpperCase();
}

export default function DriverComboBox({ drivers, selectedName, vehiclePlate, onPick, onClear }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Закрываем dropdown по клику вне
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Сортировка: совпадение по plate → совпадение по query → есть signature → name
  const sorted = useMemo(() => {
    const normPlate = vehiclePlate ? normalizePlate(vehiclePlate) : '';
    const q = query.trim().toLowerCase();
    const list = drivers.filter(d => {
      if (!q) return true;
      const hay = [d.name, d.phone, d.position, ...(d.plates || [])].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    list.sort((a, b) => {
      const aPlate = (a.plates || []).some(p => normalizePlate(p) === normPlate) ? 1 : 0;
      const bPlate = (b.plates || []).some(p => normalizePlate(p) === normPlate) ? 1 : 0;
      if (aPlate !== bPlate) return bPlate - aPlate;
      const aSig = a.signature ? 1 : 0;
      const bSig = b.signature ? 1 : 0;
      if (aSig !== bSig) return bSig - aSig;
      return a.name.localeCompare(b.name, 'ru');
    });
    return list;
  }, [drivers, query, vehiclePlate]);

  const platMatch = useMemo(() => {
    if (!vehiclePlate) return null;
    const norm = normalizePlate(vehiclePlate);
    return drivers.find(d => (d.plates || []).some(p => normalizePlate(p) === norm)) || null;
  }, [drivers, vehiclePlate]);

  // Авто-выбор водителя по plate, если ничего не выбрано и plate match есть
  useEffect(() => {
    if (!selectedName && platMatch) {
      onPick(platMatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platMatch?.name]);

  // Pills вариант — для маленьких списков
  if (drivers.length <= PILL_THRESHOLD) {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((d, i) => {
            const active = selectedName.trim() === d.name.trim();
            const hasSignature = !!d.signature;
            const isPlateMatch = platMatch && platMatch.name === d.name;
            return (
              <button
                key={d.id ?? `${d.name}-${i}`}
                type="button"
                onClick={() => onPick(d)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition active:scale-95 flex items-center gap-1 ${
                  active
                    ? 'bg-indigo-100 ring-2 ring-indigo-400 text-indigo-800 shadow-sm'
                    : 'bg-white ring-1 ring-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
                title={[d.phone, d.position, isPlateMatch && '⭐ по номеру машины', hasSignature ? '✓ есть образец росписи' : ''].filter(Boolean).join(' · ')}
              >
                {isPlateMatch && <span className="text-amber-500">⭐</span>}
                {d.name}
                {hasSignature && <span className="text-[10px] text-emerald-600">✓</span>}
              </button>
            );
          })}
          {selectedName && (
            <button
              type="button"
              onClick={onClear}
              className="px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-slate-100"
              title="Сбросить выбор"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-slate-500 italic">
          ⭐ — закреплён за этой машиной · ✓ — есть сохранённая роспись
        </p>
      </div>
    );
  }

  // ComboBox вариант — для больших списков
  const selectedDriver = drivers.find(d => d.name === selectedName);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          placeholder={`Поиск среди ${drivers.length} водителей по ФИО / телефону / номеру…`}
          value={open ? query : (selectedName || '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          className="zorin-input pr-16"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {selectedDriver?.signature && (
            <CheckCircle2 size={14} className="text-emerald-500" />
          )}
          {selectedName && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear(); setQuery(''); setOpen(false); }}
              className="text-slate-400 hover:text-slate-700"
              title="Сбросить"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-slate-400 hover:text-slate-700"
          >
            <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-72 overflow-auto">
          {sorted.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400 italic">
              Ничего не найдено. Введите ФИО вручную в поле ниже.
            </div>
          ) : (
            <ul>
              {sorted.map((d, i) => {
                const active = selectedName.trim() === d.name.trim();
                const isPlateMatch = platMatch && platMatch.name === d.name;
                return (
                  <li key={d.id ?? `${d.name}-${i}`}>
                    <button
                      type="button"
                      onClick={() => { onPick(d); setOpen(false); setQuery(''); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 flex items-center justify-between gap-2 ${
                        active ? 'bg-indigo-100 font-semibold' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isPlateMatch && <span className="text-amber-500" title="закреплён за этой машиной">⭐</span>}
                        <span className="text-slate-800">{d.name}</span>
                        {d.position && <span className="text-[10px] text-slate-500">· {d.position}</span>}
                        {d.phone && <span className="text-[10px] text-slate-400">· {d.phone}</span>}
                      </span>
                      {d.signature && <CheckCircle2 size={12} className="text-emerald-500" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-slate-100 px-3 py-1.5 bg-slate-50">
            <p className="text-[9px] text-slate-500 italic">
              ⭐ закреплён за номером · ✓ есть образец росписи
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
