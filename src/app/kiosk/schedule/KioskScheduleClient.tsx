'use client';

import { useState } from 'react';
import { Calendar, Sun, Moon, ChevronDown, ChevronUp, Info } from 'lucide-react';

interface ShiftSlotData {
  date: string;
  shiftType: 'day' | 'night';
  box1Names: string[];
  box2Names: string[];
}

interface Props {
  slots: ShiftSlotData[];
  todayStr: string;
  isDayShiftActive: boolean;
}

export function KioskScheduleClient({ slots, todayStr, isDayShiftActive }: Props) {
  // Раздельная state для свёрнутости каждой пустой карточки
  const [expandedEmpty, setExpandedEmpty] = useState<Set<string>>(new Set());

  const toggleEmpty = (key: string) => {
    setExpandedEmpty((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full pb-[80px] px-1 pt-1 space-y-2 overflow-y-auto">
      {/* Заголовок */}
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-md shadow-violet-500/30">
          <Calendar className="h-5 w-5 text-white" strokeWidth={2.5} />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Кто работает</h2>
      </div>

      {/* Карточки слотов */}
      {slots.map((slot) => {
        const isToday = slot.date === todayStr;
        const isActiveNow =
          isToday && ((slot.shiftType === 'day') === isDayShiftActive);
        const isEmpty = slot.box1Names.length === 0 && slot.box2Names.length === 0;
        const slotKey = `${slot.date}-${slot.shiftType}`;

        if (isEmpty && !isActiveNow) {
          // Свёрнутая пустая карточка — одна строка
          const isOpen = expandedEmpty.has(slotKey);
          return (
            <CollapsedEmpty
              key={slotKey}
              slot={slot}
              isToday={isToday}
              isOpen={isOpen}
              onToggle={() => toggleEmpty(slotKey)}
            />
          );
        }

        return (
          <SlotCard
            key={slotKey}
            slot={slot}
            isToday={isToday}
            isActiveNow={isActiveNow}
          />
        );
      })}

      {/* Подсказка */}
      <div className="rounded-xl bg-blue-50 ring-1 ring-blue-200 px-3 py-2.5 text-xs text-blue-900 mt-2 flex items-start gap-2">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
        <span>
          Для изменения смен — обращайтесь к администратору.
        </span>
      </div>
    </div>
  );
}

function SlotCard({
  slot,
  isToday,
  isActiveNow,
}: {
  slot: ShiftSlotData;
  isToday: boolean;
  isActiveNow: boolean;
}) {
  const dateLabel = isToday ? 'Сегодня' : 'Завтра';
  const isDay = slot.shiftType === 'day';

  // Static classes — Tailwind JIT safe
  const containerClasses = isActiveNow
    ? isDay
      ? 'bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 ring-2 ring-amber-400 shadow-md shadow-amber-200'
      : 'bg-gradient-to-br from-indigo-50 via-purple-50 to-indigo-50 ring-2 ring-indigo-400 shadow-md shadow-indigo-200'
    : isDay
      ? 'bg-amber-50 ring-1 ring-amber-200'
      : 'bg-indigo-50 ring-1 ring-indigo-200';

  return (
    <div className={`rounded-2xl p-3 space-y-2 transition-all ${containerClasses}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
              isDay ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
          >
            {isDay ? (
              <Sun className="h-4 w-4 text-white" strokeWidth={2.5} />
            ) : (
              <Moon className="h-4 w-4 text-white" strokeWidth={2.5} />
            )}
          </div>
          <div className="text-base font-bold text-gray-900">
            {dateLabel} <span className="font-medium text-gray-600">·</span> {isDay ? 'День' : 'Ночь'}
          </div>
          {isActiveNow && (
            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
              Сейчас
            </span>
          )}
        </div>
        <div className="text-xs font-medium text-gray-500 tabular-nums">
          {isDay ? '08:00 – 20:00' : '20:00 – 08:00'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <BoxBlock label="Бокс 1" names={slot.box1Names} accent="blue" />
        <BoxBlock label="Бокс 2" names={slot.box2Names} accent="emerald" />
      </div>
    </div>
  );
}

function BoxBlock({
  label,
  names,
  accent,
}: {
  label: string;
  names: string[];
  accent: 'blue' | 'emerald';
}) {
  // Static accent
  const labelClass = accent === 'blue' ? 'text-blue-700' : 'text-emerald-700';
  return (
    <div className="bg-white rounded-xl px-2.5 py-2 ring-1 ring-gray-200">
      <div className={`text-[10px] font-bold uppercase tracking-wider ${labelClass} mb-0.5`}>
        {label}
      </div>
      {names.length === 0 ? (
        <div className="text-sm text-gray-400 italic">— нет смены</div>
      ) : (
        <div className="text-sm font-semibold text-gray-900 leading-snug">
          {names.join(', ')}
        </div>
      )}
    </div>
  );
}

function CollapsedEmpty({
  slot,
  isToday,
  isOpen,
  onToggle,
}: {
  slot: ShiftSlotData;
  isToday: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const dateLabel = isToday ? 'Сегодня' : 'Завтра';
  const isDay = slot.shiftType === 'day';

  return (
    <div className="rounded-2xl bg-gray-50 ring-1 ring-gray-200 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 active:bg-gray-100 transition"
      >
        <div className="flex items-center gap-2">
          {isDay ? (
            <Sun className="h-4 w-4 text-gray-400" />
          ) : (
            <Moon className="h-4 w-4 text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-500">
            {dateLabel} · {isDay ? 'День' : 'Ночь'}
          </span>
          <span className="text-xs italic text-gray-400">— нет смен</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-2">
          <BoxBlock label="Бокс 1" names={[]} accent="blue" />
          <BoxBlock label="Бокс 2" names={[]} accent="emerald" />
        </div>
      )}
    </div>
  );
}
