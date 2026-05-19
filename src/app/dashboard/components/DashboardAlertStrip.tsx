"use client";

import * as React from "react";
import Link from "next/link";
import type { WashEvent } from "@/types";
import {
  AlertTriangle, AlertOctagon, Info, ChevronRight, Droplets, Brain, ClipboardList,
} from "lucide-react";

/**
 * Phase 35 / V2-#3: Alert-полоса на дашборде.
 * Показывает ТОЛЬКО актуальные тревоги (если все ок — ничего не рендерится).
 * 4 источника:
 *  - Остаток химии < 1кг (warn) или отрицательный (critical)
 *  - Неоформленные мойки от камер за последние 24ч (если есть API) — TODO когда подключим /api/camera-pending
 *  - AI квота > 80% (warn) / > 95% (critical) — fetch /api/ai-assistant/quota
 *  - WashEvent созданные после закрытия периода (critical — расхождение ЗП)
 */

interface Alert {
  level: 'critical' | 'warn' | 'info';
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  href: string;
  routeLabel: string;
}

const HAZARD_COLORS = {
  critical: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  warn:     { bg: '#fffbeb', text: '#92400e', border: '#fcd34d' },
  info:     { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
};

interface Props {
  inventory: { chemicalStockGrams: number };
  washEvents: WashEvent[];
}

export function DashboardAlertStrip({ inventory, washEvents }: Props) {
  const [aiQuotaPct, setAiQuotaPct] = React.useState<number | null>(null);

  // Lazy fetch AI quota (read-only, не блокирует первый render)
  React.useEffect(() => {
    fetch('/api/ai-assistant/quota')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.dailyTotalLimit > 0) {
          const pct = Math.round((data.callsLastDay / data.dailyTotalLimit) * 100);
          setAiQuotaPct(pct);
        }
      })
      .catch(() => { /* silent */ });
  }, []);

  const alerts: Alert[] = React.useMemo(() => {
    const list: Alert[] = [];

    // Остаток химии
    const chemKg = (inventory?.chemicalStockGrams ?? 0) / 1000;
    if (chemKg < 0) {
      list.push({
        level: 'critical',
        icon: AlertOctagon,
        text: `Остаток химии отрицательный (${chemKg.toFixed(1)} кг) — рассинхрон журнала, нужен Backfill`,
        href: '/inventory',
        routeLabel: '/inventory',
      });
    } else if (chemKg < 1) {
      list.push({
        level: 'warn',
        icon: AlertTriangle,
        text: `Остаток химии ${chemKg.toFixed(1)} кг — пополнить в ближайшие дни`,
        href: '/inventory',
        routeLabel: '/inventory',
      });
    }

    // Мойки в закрытом периоде (Phase 8-12 ставит флаг createdInClosedPeriod)
    const lockedEdits = washEvents.filter(w => (w as any).createdInClosedPeriod).length;
    if (lockedEdits > 0) {
      list.push({
        level: 'critical',
        icon: AlertOctagon,
        text: `${lockedEdits} ${lockedEdits === 1 ? 'мойка оформлена' : 'моек оформлено'} в закрытом периоде — проверьте /wash-log`,
        href: '/wash-log',
        routeLabel: '/wash-log',
      });
    }

    // AI квота
    if (aiQuotaPct !== null) {
      if (aiQuotaPct >= 95) {
        list.push({
          level: 'critical',
          icon: Brain,
          text: `AI-квота ${aiQuotaPct}% — новые отчёты будут заблокированы (429)`,
          href: '/reports',
          routeLabel: '/reports',
        });
      } else if (aiQuotaPct >= 80) {
        list.push({
          level: 'warn',
          icon: Brain,
          text: `AI-квота ${aiQuotaPct}% использовано сегодня`,
          href: '/reports',
          routeLabel: '/reports',
        });
      }
    }

    return list;
  }, [inventory, washEvents, aiQuotaPct]);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-4">
      {alerts.map((a, i) => {
        const c = HAZARD_COLORS[a.level];
        const Icon = a.icon;
        return (
          <Link
            key={i}
            href={a.href}
            className="w-full rounded-xl px-4 py-2.5 flex items-center gap-3 transition-all hover:opacity-90"
            style={{ background: c.bg, border: `1px solid ${c.border}` }}
          >
            <Icon className="w-4 h-4 flex-shrink-0" style={{ color: c.text }} />
            <span className="text-[13px] font-medium flex-1" style={{ color: c.text }}>
              {a.text}
            </span>
            <span className="text-[11px] font-mono opacity-60" style={{ color: c.text }}>
              {a.routeLabel}
            </span>
            <ChevronRight className="w-3.5 h-3.5" style={{ color: c.text }} />
          </Link>
        );
      })}
    </div>
  );
}
