"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
} from "date-fns";

/**
 * Phase 38 / V2-#12: Period switcher для /transactions.
 * Меняет URL ?from=&to= → server component перечитывает данные.
 */

const PRESETS: Array<{ id: string; label: string; getRange: () => [Date, Date] }> = [
  { id: 'today', label: 'Сегодня', getRange: () => [startOfDay(new Date()), endOfDay(new Date())] },
  { id: 'week',  label: 'Неделя',  getRange: () => [startOfWeek(new Date(), { weekStartsOn: 1 }), endOfWeek(new Date(), { weekStartsOn: 1 })] },
  { id: 'month', label: 'Месяц',   getRange: () => [startOfMonth(new Date()), endOfMonth(new Date())] },
];

function isoNoMs(d: Date): string {
  return d.toISOString();
}

export function TransactionsPeriodSwitcher() {
  const router = useRouter();
  const sp = useSearchParams();
  const currentFrom = sp?.get('from');
  const currentTo = sp?.get('to');

  const activePreset = React.useMemo(() => {
    if (!currentFrom || !currentTo) return 'today'; // дефолт
    const f = new Date(currentFrom).getTime();
    const t = new Date(currentTo).getTime();
    for (const p of PRESETS) {
      const [pf, pt] = p.getRange();
      if (Math.abs(pf.getTime() - f) < 60000 && Math.abs(pt.getTime() - t) < 60000) {
        return p.id;
      }
    }
    return null;
  }, [currentFrom, currentTo]);

  function selectPreset(presetId: string) {
    const p = PRESETS.find(x => x.id === presetId);
    if (!p) return;
    const [from, to] = p.getRange();
    const params = new URLSearchParams(sp?.toString() ?? '');
    params.set('from', isoNoMs(from));
    params.set('to', isoNoMs(to));
    router.replace(`/transactions?${params.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {PRESETS.map(p => {
        const isActive = activePreset === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPreset(p.id)}
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all"
            style={{
              background: isActive ? '#fff' : 'transparent',
              color: isActive ? '#0088CC' : '#64748b',
              boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
