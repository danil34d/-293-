"use client";

import * as React from "react";
import type { WashEvent, CounterAgent, Aggregator } from "@/types";
import { Users, TrendingUp, Receipt, Repeat, Info, ShieldCheck } from "lucide-react";
import { isWithinInterval, startOfDay, endOfDay, getDay } from "date-fns";

/**
 * Phase 28b / V2-#20 — Client Analytics enhancements:
 * - 4 KPI tiles (Всего клиентов / Выручка / Средний чек / Удержание)
 * - SegmentDonut: Розница / Контрагенты / Агрегаторы
 * - DayHeatmap: 7 дней недели, intensity по среднему числу моек
 *
 * Read-only, computed client-side из переданных washEvents за период.
 */

interface Props {
  washEvents: WashEvent[];
  counterAgents: CounterAgent[];
  aggregators: Aggregator[];
  periodFrom: Date | null;
  periodTo: Date | null;
}

interface SegmentRow {
  id: string;
  label: string;
  count: number;
  revenue: number;
  color: string;
}

const COLORS = {
  retail: "#0088CC",
  counterAgent: "#8b5cf6",
  aggregator: "#f59e0b",
};

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

function inPeriod(ts: string | Date, from: Date | null, to: Date | null): boolean {
  if (!from || !to) return true;
  return isWithinInterval(new Date(ts), { start: startOfDay(from), end: endOfDay(to) });
}

export function ClientAnalyticsExtras({ washEvents, counterAgents, aggregators, periodFrom, periodTo }: Props) {
  const stats = React.useMemo(() => {
    const events = washEvents.filter(e => inPeriod(e.timestamp, periodFrom, periodTo));

    // Сегменты — Розница / Контрагенты / Агрегаторы
    const retailEvents = events.filter(e => !(e as any).counterAgentId && !(e as any).aggregatorId);
    const counterAgentEvents = events.filter(e => !!(e as any).counterAgentId);
    const aggregatorEvents = events.filter(e => !!(e as any).aggregatorId);

    const sumRevenue = (arr: WashEvent[]) => arr.reduce((s, w) => s + (w.netAmount ?? w.totalAmount ?? 0), 0);

    const segments: SegmentRow[] = [
      {
        id: "retail",
        label: "Розница",
        count: retailEvents.length,
        revenue: sumRevenue(retailEvents),
        color: COLORS.retail,
      },
      {
        id: "counterAgent",
        label: "Контрагенты",
        count: counterAgentEvents.length,
        revenue: sumRevenue(counterAgentEvents),
        color: COLORS.counterAgent,
      },
      {
        id: "aggregator",
        label: "Агрегаторы",
        count: aggregatorEvents.length,
        revenue: sumRevenue(aggregatorEvents),
        color: COLORS.aggregator,
      },
    ];

    const totalRevenue = segments.reduce((s, x) => s + x.revenue, 0);
    const totalWashes = events.length;
    const avgCheck = totalWashes > 0 ? totalRevenue / totalWashes : 0;

    // Уникальные клиенты — sourceId + 'retail' для розницы
    const uniqueClientIds = new Set<string>();
    for (const e of events) {
      if ((e as any).counterAgentId) uniqueClientIds.add(`cta_${(e as any).counterAgentId}`);
      else if ((e as any).aggregatorId) uniqueClientIds.add(`agg_${(e as any).aggregatorId}`);
      else uniqueClientIds.add(`retail_${e.vehicleNumber || "anon"}`);
    }
    const totalClients = uniqueClientIds.size;

    // Heatmap по дням недели — сколько моек каждый день недели за период
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun=0..Sat=6
    for (const e of events) {
      const d = new Date(e.timestamp);
      dayCounts[d.getDay()] += 1;
    }
    // Reorder Mon-Sun (Russian week order)
    const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayValues = [1, 2, 3, 4, 5, 6, 0].map(i => dayCounts[i]);
    const maxDay = Math.max(...dayValues, 1);
    const heatmap = dayLabels.map((label, i) => ({
      label,
      count: dayValues[i],
      intensity: dayValues[i] / maxDay,
    }));
    const bestDayIdx = dayValues.indexOf(Math.max(...dayValues));
    const worstDayIdx = dayValues.indexOf(Math.min(...dayValues));

    // Удержание (LTV approx) — клиенты с >1 визита за период
    const visitsPerClient = new Map<string, number>();
    for (const e of events) {
      let key: string;
      if ((e as any).counterAgentId) key = `cta_${(e as any).counterAgentId}`;
      else if ((e as any).aggregatorId) key = `agg_${(e as any).aggregatorId}`;
      else key = `retail_${e.vehicleNumber || "anon"}`;
      visitsPerClient.set(key, (visitsPerClient.get(key) ?? 0) + 1);
    }
    const returningClients = Array.from(visitsPerClient.values()).filter(v => v > 1).length;
    const retentionPct = totalClients > 0 ? Math.round((returningClients / totalClients) * 100) : 0;

    return {
      segments,
      totalRevenue,
      totalWashes,
      avgCheck,
      totalClients,
      retentionPct,
      heatmap,
      dayLabels,
      bestDayIdx,
      worstDayIdx,
    };
  }, [washEvents, periodFrom, periodTo]);

  return (
    <div className="space-y-4 mb-6">
      {/* 4 KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTileC
          label="Всего клиентов"
          value={`${stats.totalClients}`}
          sub={stats.totalWashes > 0 ? `${stats.totalWashes} моек за период` : "нет моек"}
          Icon={Users}
          color="#0088CC"
        />
        <KpiTileC
          label="Общая выручка"
          value={stats.totalRevenue >= 1000 ? `${(stats.totalRevenue / 1000).toFixed(0)}к ₽` : `${formatMoney(stats.totalRevenue)} ₽`}
          sub={`${formatMoney(stats.totalRevenue)} ₽`}
          Icon={TrendingUp}
          color="#10b981"
        />
        <KpiTileC
          label="Средний чек"
          value={`${formatMoney(stats.avgCheck)} ₽`}
          sub="по всем сегментам"
          Icon={Receipt}
          color="#f59e0b"
        />
        <KpiTileC
          label="Удержание"
          value={`${stats.retentionPct}%`}
          sub="клиентов с >1 визита"
          Icon={Repeat}
          color="#8b5cf6"
        />
      </div>

      {/* Donut + Top sections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[13px] font-bold text-slate-900">Структура выручки</span>
              <span className="text-[11px] text-slate-500">по сегментам</span>
            </div>
            <PieSegments segments={stats.segments} total={stats.totalRevenue} />
            <div className="mt-4 space-y-2">
              {stats.segments.map(s => {
                const pct = stats.totalRevenue > 0 ? Math.round((s.revenue / stats.totalRevenue) * 100) : 0;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-[12px] font-bold text-slate-900 flex-1">{s.label}</span>
                    <span className="text-[11px] text-slate-500 tabular-nums">{s.count} моек</span>
                    <span className="text-[12px] font-bold text-slate-900 tabular-nums w-[80px] text-right">
                      {formatMoney(s.revenue)} ₽
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 tabular-nums w-[40px] text-right">
                      {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[13px] font-bold text-slate-900">Загрузка по дням недели</span>
              <span className="text-[11px] text-slate-500">сумма за период</span>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {stats.heatmap.map((d, i) => (
                <div
                  key={d.label}
                  className="rounded-lg p-3 text-center"
                  style={{
                    background: `rgba(0, 136, 204, ${d.intensity * 0.3 + 0.05})`,
                    border: "1px solid rgba(0,136,204,0.2)",
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{d.label}</div>
                  <div className="text-[20px] font-extrabold tabular-nums mt-1 text-[#0088CC]">{d.count}</div>
                  <div className="text-[10px] text-slate-500">моек</div>
                </div>
              ))}
            </div>
            {stats.totalWashes > 0 && (
              <div className="mt-3 text-[11px] text-slate-600 flex items-center gap-1.5">
                <Info className="w-3 h-3" />
                Пик: <b className="text-slate-900">{stats.dayLabels[stats.bestDayIdx]}</b>.
                Тихо: <b className="text-slate-900">{stats.dayLabels[stats.worstDayIdx]}</b>.
                Поможет планировать смены и закупки.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info banner — что эта страница показывает */}
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-emerald-900 leading-snug">
          <b>Read-only · только наблюдение.</b> Все цифры computed из WashEvent за выбранный период.
          Удержание считается как % клиентов с более чем 1 визитом (для розницы группировка по vehicleNumber).
        </div>
      </div>
    </div>
  );
}

function KpiTileC({ label, value, sub, Icon, color }: {
  label: string;
  value: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
          <div className="text-[22px] font-extrabold tabular-nums mt-1" style={{ color }}>{value}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: color + '15', color }}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function PieSegments({ segments, total }: { segments: SegmentRow[]; total: number }) {
  if (total === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-[12px] text-slate-400">
        Нет данных за период
      </div>
    );
  }
  let offset = 0;
  const circumference = 2 * Math.PI * 80;
  return (
    <div className="flex items-center justify-center">
      <svg viewBox="0 0 200 200" className="w-48 h-48 -rotate-90">
        <circle cx="100" cy="100" r="80" fill="none" stroke="#f1f5f9" strokeWidth="28" />
        {segments.filter(s => s.revenue > 0).map(s => {
          const ratio = s.revenue / total;
          const dash = ratio * circumference;
          const el = (
            <circle key={s.id} cx="100" cy="100" r="80" fill="none" stroke={s.color} strokeWidth="28"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset} />
          );
          offset += dash;
          return el;
        })}
        <text x="100" y="100" textAnchor="middle" dominantBaseline="middle" transform="rotate(90 100 100)"
          className="font-extrabold" style={{ fontSize: 20, fill: '#0f172a' }}>
          {total >= 1000 ? `${(total / 1000).toFixed(0)}к ₽` : `${Math.round(total)} ₽`}
        </text>
      </svg>
    </div>
  );
}
