"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subDays, isWithinInterval } from "date-fns";
import type { WashEvent, Expense } from "@/types";
import {
  TrendingUp, TrendingDown, Droplets, Receipt, Users, FlaskConical,
} from "lucide-react";

/**
 * Phase 35 / V2-#3: Hero KPI — 3 крупных (Выручка/Расходы/Прибыль)
 * с дельтой к прошлому периоду такой же длины, + 4 small (Моек/Чек/Сотр/Химия).
 *
 * Период берётся из URL searchParams (?from&to) — если нет, default месяц.
 */

interface Props {
  washEvents: WashEvent[];
  expenses: Expense[];
  employeesCount: number;
  chemicalStockKg: number;
}

function formatMoney(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

function inRange(ts: string | Date, from: Date, to: Date): boolean {
  return isWithinInterval(new Date(ts), { start: startOfDay(from), end: endOfDay(to) });
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export function DashboardHeroKpi({ washEvents, expenses, employeesCount, chemicalStockKg }: Props) {
  const sp = useSearchParams();
  const fromStr = sp?.get('from');
  const toStr = sp?.get('to');

  // Период: из URL или по умолчанию текущий месяц
  const from = fromStr ? new Date(fromStr) : startOfMonth(new Date());
  const to = toStr ? new Date(toStr) : endOfMonth(new Date());

  // Previous period — same length до from
  const dayMs = 86400000;
  const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / dayMs) + 1);
  const prevTo = new Date(from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (periodDays - 1) * dayMs);

  const currWashes = washEvents.filter(w => inRange(w.timestamp, from, to));
  const prevWashes = washEvents.filter(w => inRange(w.timestamp, prevFrom, prevTo));
  const currExp = expenses.filter(e => inRange(e.date, from, to));
  const prevExp = expenses.filter(e => inRange(e.date, prevFrom, prevTo));

  const sumRevenue = (arr: WashEvent[]) => arr.reduce((s, w) => s + (w.netAmount ?? w.totalAmount ?? 0), 0);
  const sumExp = (arr: Expense[]) => arr.reduce((s, e) => s + (e.amount ?? 0), 0);

  const revenue = sumRevenue(currWashes);
  const prevRevenue = sumRevenue(prevWashes);
  const expensesTotal = sumExp(currExp);
  const prevExpenses = sumExp(prevExp);
  const profit = revenue - expensesTotal;
  const prevProfit = prevRevenue - prevExpenses;

  const revenueDelta = pctChange(revenue, prevRevenue);
  const expenseDelta = pctChange(expensesTotal, prevExpenses);
  const profitDelta = pctChange(profit, prevProfit);

  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  const washCount = currWashes.length;
  const avgCheck = washCount > 0 ? Math.round(revenue / washCount) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm mb-4">
      {/* 3 hero KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiBig
          label="Выручка"
          value={`${formatMoney(revenue)} ₽`}
          delta={revenueDelta}
          color="#0088CC"
          goodWhenUp
        />
        <KpiBig
          label="Расходы"
          value={`${formatMoney(expensesTotal)} ₽`}
          delta={expenseDelta}
          color="#f59e0b"
          goodWhenUp={false}
        />
        <KpiBig
          label="Чистая прибыль"
          value={`${formatMoney(profit)} ₽`}
          delta={profitDelta}
          deltaSuffix={`· маржа ${margin}%`}
          color={profit >= 0 ? "#10b981" : "#ef4444"}
          big
          goodWhenUp
        />
      </div>

      {/* 4 small KPI */}
      <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <KpiSmall label="Моек за период" value={`${washCount}`} Icon={Droplets} />
        <KpiSmall label="Средний чек" value={avgCheck > 0 ? `${formatMoney(avgCheck)} ₽` : "—"} Icon={Receipt} />
        <KpiSmall label="Сотрудников" value={`${employeesCount}`} Icon={Users} />
        <KpiSmall
          label="Остаток химии"
          value={`${chemicalStockKg.toFixed(1)} кг`}
          Icon={FlaskConical}
          warn={chemicalStockKg < 1}
        />
      </div>
    </div>
  );
}

function KpiBig({ label, value, delta, deltaSuffix, color, big, goodWhenUp }: {
  label: string;
  value: string;
  delta: number | null;
  deltaSuffix?: string;
  color: string;
  big?: boolean;
  goodWhenUp: boolean;
}) {
  const hasDelta = delta !== null && delta !== 0;
  const isUp = (delta ?? 0) > 0;
  const goodTrend = goodWhenUp ? isUp : !isUp;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
      <div className={`${big ? "text-[34px]" : "text-[28px]"} font-extrabold mt-1 tabular-nums leading-none`} style={{ color }}>
        {value}
      </div>
      {hasDelta && (
        <div
          className="text-[11px] font-semibold mt-1.5 flex items-center gap-1"
          style={{ color: goodTrend ? "#10b981" : "#f59e0b" }}
        >
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? "+" : ""}{delta}%
          <span className="text-slate-400 font-normal ml-1">к прошлому периоду</span>
          {deltaSuffix && <span className="ml-1 text-slate-500 font-medium">{deltaSuffix}</span>}
        </div>
      )}
      {!hasDelta && deltaSuffix && (
        <div className="text-[11px] mt-1.5 text-slate-500">{deltaSuffix}</div>
      )}
    </div>
  );
}

function KpiSmall({ label, value, Icon, warn }: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  warn?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`rounded-lg w-9 h-9 flex items-center justify-center ${warn ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className={`text-[16px] font-extrabold tabular-nums ${warn ? "text-amber-700" : "text-slate-900"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
    </div>
  );
}
