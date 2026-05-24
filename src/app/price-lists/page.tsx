export const dynamic = 'force-dynamic';

import Link from 'next/link';
import {
  ListChecks, ShoppingBag, Building2, Zap, GitFork,
  ArrowRight, AlertTriangle, Truck,
} from 'lucide-react';
import {
  getRetailPriceConfig,
  getActiveCounterAgentsData,
  getAggregatorsData,
  getWashEventsData,
} from '@/lib/data';
import type { PriceListItem, CounterAgent, Aggregator, WashEvent } from '@/types';
import { PriceListsTabs } from './components/PriceListsTabs';

/**
 * Phase 51d / V2-#4 split-pricing: overview page для всех прайс-листов.
 *
 * 4 секции (Tabs):
 *  - Розница (retailPriceConfig) → link на /settings для edit
 *  - Контрагенты — таблица 18+ counterAgents с count услуг + revenue 30d
 *  - Агрегаторы — таблица с active price list name + count lists
 *  - Сплиты — все услуги с split.driverBonus > 0, сгруппированы по контрагенту
 *    (требует Phase 51e split поле в PriceListItem)
 */
export default async function PriceListsPage() {
  let retailConfig;
  let counterAgents: CounterAgent[] = [];
  let aggregators: Aggregator[] = [];
  let washEvents: WashEvent[] = [];
  let fetchError: string | null = null;

  try {
    [retailConfig, counterAgents, aggregators, washEvents] = await Promise.all([
      getRetailPriceConfig(),
      getActiveCounterAgentsData(),
      getAggregatorsData(),
      getWashEventsData(),
    ]);
  } catch (e: any) {
    fetchError = e.message || 'Не удалось загрузить прайс-листы';
  }

  if (fetchError) {
    return (
      <div className="px-6 py-8">
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-2 max-w-3xl">
          <AlertTriangle className="w-5 h-5 text-rose-700 flex-shrink-0" />
          <div>
            <div className="text-[14px] font-bold text-rose-900">Ошибка загрузки</div>
            <div className="text-[12px] text-rose-800 mt-1">{fetchError}</div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Computed для табов ───

  // 30-day revenue per CounterAgent and per Aggregator
  const monthCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = washEvents.filter((e) => {
    const t = Date.parse(e.timestamp || '');
    return Number.isFinite(t) && t >= monthCutoff;
  });

  const revenueByCounterAgent = new Map<string, number>();
  const revenueByAggregator = new Map<string, number>();
  for (const e of recent) {
    if (e.paymentMethod === 'counterAgentContract' && e.sourceId) {
      revenueByCounterAgent.set(
        e.sourceId,
        (revenueByCounterAgent.get(e.sourceId) || 0) + (e.totalAmount || 0)
      );
    } else if (e.paymentMethod === 'aggregator' && e.sourceId) {
      revenueByAggregator.set(
        e.sourceId,
        (revenueByAggregator.get(e.sourceId) || 0) + (e.totalAmount || 0)
      );
    }
  }

  // Split services: ищем во всех priceList контрагентов услуги со split.driverBonus > 0
  const splitServices: Array<{
    counterAgentId: string;
    counterAgentName: string;
    service: PriceListItem;
  }> = [];
  for (const agent of counterAgents) {
    const all = [...(agent.priceList || []), ...(agent.additionalPriceList || [])];
    for (const svc of all) {
      const sp = (svc as any).split;
      if (sp && Number(sp.driverBonus) > 0) {
        splitServices.push({
          counterAgentId: agent.id,
          counterAgentName: agent.name,
          service: svc,
        });
      }
    }
  }

  return (
    <div className="zorin-page px-6 pb-12 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-end justify-between pt-4 pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-bold text-blue-600 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5" />
            Сводный обзор по всем прайс-листам
          </div>
          <h1 className="text-[26px] font-bold text-slate-900 mt-1 leading-tight">
            Прайс-листы
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Розница / Контрагенты / Агрегаторы / Сплиты — единая точка входа.
          </p>
        </div>
      </div>

      {/* Tabs client component */}
      <PriceListsTabs
        retailMain={retailConfig?.mainPriceList || []}
        retailAdditional={retailConfig?.additionalPriceList || []}
        counterAgents={counterAgents}
        aggregators={aggregators}
        splitServices={splitServices}
        revenueByCounterAgent={Object.fromEntries(revenueByCounterAgent)}
        revenueByAggregator={Object.fromEntries(revenueByAggregator)}
      />
    </div>
  );
}
