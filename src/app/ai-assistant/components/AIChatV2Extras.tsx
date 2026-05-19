'use client';

import { useEffect, useState } from 'react';
import { Gauge, ShieldCheck, Bot, Sparkles } from 'lucide-react';

/**
 * Phase 37 / V2-#24: AI Chat V2 polish — header pill, rate-limit bar,
 * security banner и suggested prompts для пустого чата.
 *
 * Endpoint: GET /api/ai-assistant/quota →
 *   { perEmployeeLimit, dailyTotalLimit, callsLastHour, callsLastDay, activeEmployees }
 */

interface QuotaStats {
  perEmployeeLimit: number;
  dailyTotalLimit: number;
  callsLastHour: number;
  callsLastDay: number;
  activeEmployees: number;
}

// ─── RateLimitBar ───

export function RateLimitBar() {
  const [stats, setStats] = useState<QuotaStats | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch('/api/ai-assistant/quota', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as QuotaStats;
        if (!ignore) setStats(data);
      } catch {
        // silent
      }
    }
    load();
    const interval = window.setInterval(load, 30000);
    return () => {
      ignore = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!stats) {
    return (
      <div className="rounded-lg border border-gray-200 px-3 py-1.5 inline-flex items-center gap-2 bg-white">
        <Gauge className="w-3.5 h-3.5 text-slate-400" />
        <div className="text-[11px] text-slate-400">квота…</div>
      </div>
    );
  }

  // Дневная квота важнее (общий лимит на 200/день) — её и показываем
  const used = stats.callsLastDay;
  const limit = stats.dailyTotalLimit;
  const pct = Math.round((used / limit) * 100);
  const warn = pct > 70;
  const critical = pct > 95;

  const colourClass = critical ? 'text-rose-700' : warn ? 'text-amber-700' : 'text-emerald-700';
  const iconClass = critical ? 'text-rose-600' : warn ? 'text-amber-600' : 'text-emerald-600';

  return (
    <div className="rounded-lg border border-gray-200 px-3 py-1.5 inline-flex items-center gap-2 bg-white">
      <Gauge className={'w-3.5 h-3.5 ' + iconClass} />
      <div className="text-[11px] leading-tight">
        <div className="text-slate-500 font-bold uppercase tracking-wider text-[9px] leading-none">
          AI квота · день
        </div>
        <div className={'tabular-nums font-bold ' + colourClass}>
          {used}/{limit}{' '}
          <span className="text-slate-400 font-normal">· {stats.callsLastHour}/час</span>
        </div>
      </div>
    </div>
  );
}

// ─── SecurityBanner ───

export function SecurityBanner() {
  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-3">
      <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
      <div className="text-[12px] text-emerald-900 leading-snug">
        <b>API-ключ хранится на сервере</b>, в браузер не отправляется.
        Запросы помощника логируются в audit-журнал (anonymized).
      </div>
    </div>
  );
}

// ─── HeaderPill ───

export function HeaderPill({ hourlyLimit }: { hourlyLimit?: number }) {
  return (
    <div className="text-[11px] uppercase tracking-wider font-bold text-violet-600 flex items-center gap-1.5">
      <Bot className="w-3.5 h-3.5" />
      GPT-4o-mini · ProxyAPI · rate-limit {hourlyLimit ?? 30}/час
    </div>
  );
}

// ─── SuggestedPrompts ───

const DEFAULT_PROMPTS = [
  'Кто лидер по выручке в текущем месяце?',
  'Сколько химии хватит при текущем расходе?',
  'У каких клиентов накопился долг?',
  'Какой средний чек по агрегаторам?',
  'Какие аномалии в мойках за последнюю неделю?',
  'Как улучшить прибыльность услуг?',
];

export function SuggestedPrompts({
  onSelect,
  visible,
}: {
  onSelect: (prompt: string) => void;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/40">
      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3 h-3 text-violet-500" />
        Попробуйте спросить
      </div>
      <div className="flex flex-wrap gap-2">
        {DEFAULT_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className="rounded-full bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 px-3 py-1.5 text-[12px] font-medium transition-colors text-left"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
