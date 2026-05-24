'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Calendar, Search, Filter, ChevronRight, Sparkles } from 'lucide-react';
import type { WashEvent } from '@/types';

/**
 * Phase 59-ui-b: таб «Мойки» в /counter-agents/[id]/edit.
 *
 * Список моек данного контрагента с фильтрами по периоду + по машине.
 * Источник — washEvents (родитель уже подтянул всю историю).
 * Никаких новых fetch'ей — работаем с уже загруженным массивом.
 */

interface Props {
  agentId: string;
  agentName: string;
  washEvents: WashEvent[];
}

const formatMoney = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

type PeriodFilter = 'all' | 'currentMonth' | 'last30' | 'last90';

function applyPeriod(washes: WashEvent[], period: PeriodFilter): WashEvent[] {
  if (period === 'all') return washes;
  const now = Date.now();
  let since: number;
  if (period === 'currentMonth') {
    const d = new Date();
    since = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  } else if (period === 'last30') {
    since = now - 30 * 24 * 3600 * 1000;
  } else {
    since = now - 90 * 24 * 3600 * 1000;
  }
  return washes.filter(w => new Date(w.timestamp).getTime() >= since);
}

export function CounterAgentWashesTab({ agentId, agentName, washEvents }: Props) {
  const [period, setPeriod] = React.useState<PeriodFilter>('currentMonth');
  const [plateFilter, setPlateFilter] = React.useState('');

  const filtered = React.useMemo(() => {
    // 1) Только мойки этого контрагента
    const own = washEvents.filter(w => {
      const linked = (w as any).counterAgentId ?? (w as any).sourceId;
      return linked === agentId;
    });
    // 2) По периоду
    const byPeriod = applyPeriod(own, period);
    // 3) По плате
    const q = plateFilter.trim().toUpperCase();
    const byPlate = q
      ? byPeriod.filter(w => (w.vehicleNumber || '').toUpperCase().includes(q))
      : byPeriod;
    // Сортировка свежие сверху
    return byPlate.slice().sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [washEvents, agentId, period, plateFilter]);

  const totalRevenue = React.useMemo(
    () => filtered.reduce((s, w) => s + (w.totalAmount ?? 0), 0),
    [filtered]
  );

  function renderServices(w: WashEvent): React.ReactNode {
    const list: { name: string; price: number; isSplit: boolean }[] = [];
    if (w.services?.main?.serviceName) {
      list.push({
        name: w.services.main.serviceName,
        price: w.services.main.price ?? 0,
        isSplit: !!(w.services.main as any)?.split?.driverBonus,
      });
    }
    if (Array.isArray(w.services?.additional)) {
      w.services.additional.forEach(s => list.push({
        name: s.serviceName ?? '',
        price: s.price ?? 0,
        isSplit: !!(s as any)?.split?.driverBonus,
      }));
    }
    // Группируем по name+price для отображения «×N»
    const groups = new Map<string, { name: string; count: number; total: number; isSplit: boolean }>();
    list.forEach(s => {
      const key = `${s.name}|${s.price}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        existing.total += s.price;
      } else {
        groups.set(key, { name: s.name, count: 1, total: s.price, isSplit: s.isSplit });
      }
    });
    return (
      <div className="flex flex-wrap gap-1">
        {Array.from(groups.values()).map((g, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ${
              g.isSplit ? 'bg-violet-50 text-violet-700 border border-violet-200' : 'bg-slate-100 text-slate-700'
            }`}
            title={`${g.name} — ${formatMoney(g.total)}`}
          >
            {g.isSplit && <Sparkles className="w-2.5 h-2.5" />}
            <span>{g.name}</span>
            {g.count > 1 && <span className="font-bold">×{g.count}</span>}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-[12px] font-semibold text-slate-700">Период:</span>
        </div>
        {([
          ['currentMonth', 'Текущий месяц'],
          ['last30', '30 дней'],
          ['last90', '90 дней'],
          ['all', 'Всё время'],
        ] as [PeriodFilter, string][]).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPeriod(k)}
            className={
              'px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ' +
              (period === k
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50')
            }
          >
            {label}
          </button>
        ))}
        <div className="ml-2 flex items-center gap-1.5 flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Фильтр по ГРН (например T326)"
            value={plateFilter}
            onChange={(e) => setPlateFilter(e.target.value)}
            className="flex-1 px-2 py-1 text-[12px] border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50/40 border border-blue-100">
        <div className="text-[12px] text-blue-900">
          Найдено: <b>{filtered.length}</b> мойк{filtered.length === 1 ? 'а' : filtered.length >= 2 && filtered.length <= 4 ? 'и' : ''}
        </div>
        <div className="text-[13px] font-bold text-blue-900 tabular-nums">
          Σ {formatMoney(totalRevenue)}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Нет моек для «{agentName}» с этими фильтрами</p>
          {period !== 'all' && (
            <button onClick={() => setPeriod('all')} className="mt-2 text-[12px] text-indigo-600 hover:underline">
              Показать всё время →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((w) => (
            <Link
              key={w.id}
              href={`/wash-log`}
              className="block rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {w.vehicleNumber}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {format(new Date(w.timestamp), 'dd MMM yyyy · HH:mm', { locale: ru })}
                    </span>
                    {w.boxNumber && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                        бокс {w.boxNumber}
                      </span>
                    )}
                  </div>
                  {renderServices(w)}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-base font-bold tabular-nums text-emerald-700">
                    {formatMoney(w.totalAmount ?? 0)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="pt-2 text-[11px] text-slate-500 text-center">
        Для деталей / редактирования — перейти в <Link href="/wash-log" className="text-indigo-600 hover:underline">/wash-log</Link>
      </div>
    </div>
  );
}
