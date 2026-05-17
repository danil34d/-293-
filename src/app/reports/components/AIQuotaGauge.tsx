"use client";

import * as React from "react";
import { Brain, AlertTriangle, Info } from "lucide-react";
import { HazardPill } from "@/components/admin";

interface QuotaStats {
  perEmployeeLimit: number;
  dailyTotalLimit: number;
  activeEmployees: number;
  callsLastHour: number;
  callsLastDay: number;
}

// Phase 24c / V2-#13: AI quota gauge for /reports.
// Показывает usage за день (global) — главное чтобы владелец видел сколько Gemini-вызовов
// сделано и сколько $ примерно потрачено.
//
// Тарифы Gemini 1.5 Flash (приблизительно):
//   - Input: $0.075 / 1M tokens
//   - Output: $0.30 / 1M tokens
//   - Один отчёт ~5000 tokens in + 1500 out → ~$0.0008 (~0.07₽)
//
// При лимите 1000 вызовов/день = max $0.80 в день = ~24$ /мес. Безопасно.

const COST_PER_CALL_USD = 0.0008; // консервативная оценка для Gemini 1.5 Flash

export function AIQuotaGauge({ compact = false }: { compact?: boolean }) {
  const [stats, setStats] = React.useState<QuotaStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/ai-assistant/quota")
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(e => console.error("Failed to fetch AI quota:", e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-[12px] text-slate-500 px-4 py-2">Загружаю квоту…</div>;
  }
  if (!stats) {
    return null;
  }

  const dayPct = stats.dailyTotalLimit > 0
    ? Math.round((stats.callsLastDay / stats.dailyTotalLimit) * 100)
    : 0;
  const hourPct = stats.perEmployeeLimit > 0
    ? Math.round((stats.callsLastHour / stats.perEmployeeLimit) * 100)
    : 0;
  const dayRemaining = Math.max(0, stats.dailyTotalLimit - stats.callsLastDay);
  const spentUSD = stats.callsLastDay * COST_PER_CALL_USD;
  const projectedUSD = stats.dailyTotalLimit * COST_PER_CALL_USD;

  const warn = dayPct > 80;
  const critical = dayPct > 95;

  if (compact) {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[12px]">
        <Brain className="w-3.5 h-3.5 text-violet-600" />
        <span className="text-slate-600">AI:</span>
        <span className={`font-bold ${critical ? "text-rose-600" : warn ? "text-amber-600" : "text-violet-700"}`}>
          {stats.callsLastDay}/{stats.dailyTotalLimit}
        </span>
        <span className="text-slate-500">·</span>
        <span className="text-slate-600">~${spentUSD.toFixed(3)}</span>
        {critical && <HazardPill level="critical">квота</HazardPill>}
        {warn && !critical && <HazardPill level="warn">{`${100 - dayPct}%`}</HazardPill>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="grid grid-cols-12 gap-4 items-center">
        <div className="col-span-7">
          <div className="flex items-baseline justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-600" />
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                AI-квота · использовано сегодня
              </span>
              {critical && <HazardPill level="critical">квота на исходе</HazardPill>}
              {warn && !critical && <HazardPill level="warn">осталось мало</HazardPill>}
            </div>
            <span className="text-[14px] font-bold tabular-nums text-slate-900">
              {stats.callsLastDay} / {stats.dailyTotalLimit}
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min(100, dayPct)}%`,
                background: critical ? "#ef4444" : warn ? "#f59e0b" : "#8b5cf6",
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>Сброс каждые 24 часа · in-memory (restart обнуляет)</span>
            <span>
              Осталось <b className="text-slate-900">{dayRemaining}</b> вызовов
            </span>
          </div>
        </div>

        <div className="col-span-3 border-l border-slate-100 pl-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
            Потрачено ≈
          </div>
          <div className="text-[22px] font-extrabold text-slate-900 tabular-nums mt-1">
            ${spentUSD.toFixed(3)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            из ${projectedUSD.toFixed(2)} max
          </div>
        </div>

        <div className="col-span-2 border-l border-slate-100 pl-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
            За час
          </div>
          <div className="text-[18px] font-extrabold text-slate-900 tabular-nums mt-1">
            {stats.callsLastHour}/{stats.perEmployeeLimit}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            на пользователя
          </div>
        </div>
      </div>

      {warn && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-2.5 flex items-start gap-2 text-[12px] text-amber-900">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <b>Осталось менее 20% дневной квоты.</b> Если активно генерируете отчёты —
            следующие могут попасть в 429. Лимит сбрасывается каждые 24 часа автоматически.
          </div>
        </div>
      )}
      {critical && (
        <div className="mt-3 rounded-lg bg-rose-50 border border-rose-200 p-2.5 flex items-start gap-2 text-[12px] text-rose-900">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div>
            <b>Квота почти исчерпана ({dayPct}%).</b> Новые AI-вызовы будут отклонены с 429
            до сброса. Чтобы изменить лимит — env <code className="text-[11px] bg-rose-100 px-1 rounded">AI_RATE_LIMIT_DAILY_TOTAL</code>.
          </div>
        </div>
      )}
    </div>
  );
}
