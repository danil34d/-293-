'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ShoppingBag, Building2, Zap, GitFork, ArrowRight, Truck, Edit,
} from 'lucide-react';
import type { PriceListItem, CounterAgent, Aggregator } from '@/types';

/**
 * Phase 51d / V2-#4: 4-таб UI для /price-lists.
 */

interface Props {
  retailMain: PriceListItem[];
  retailAdditional: PriceListItem[];
  counterAgents: CounterAgent[];
  aggregators: Aggregator[];
  splitServices: Array<{
    counterAgentId: string;
    counterAgentName: string;
    service: PriceListItem;
  }>;
  revenueByCounterAgent: Record<string, number>;
  revenueByAggregator: Record<string, number>;
}

type TabId = 'retail' | 'counterAgents' | 'aggregators' | 'splits';

function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}

export function PriceListsTabs({
  retailMain,
  retailAdditional,
  counterAgents,
  aggregators,
  splitServices,
  revenueByCounterAgent,
  revenueByAggregator,
}: Props) {
  const [active, setActive] = React.useState<TabId>('retail');

  const tabs: Array<{
    id: TabId;
    label: string;
    Icon: typeof ShoppingBag;
    count: number;
    color: string;
  }> = [
    {
      id: 'retail',
      label: 'Розница',
      Icon: ShoppingBag,
      count: retailMain.length + retailAdditional.length,
      color: '#10b981',
    },
    {
      id: 'counterAgents',
      label: 'Контрагенты',
      Icon: Building2,
      count: counterAgents.length,
      color: '#0088CC',
    },
    {
      id: 'aggregators',
      label: 'Агрегаторы',
      Icon: Zap,
      count: aggregators.length,
      color: '#f59e0b',
    },
    {
      id: 'splits',
      label: 'Сплиты',
      Icon: GitFork,
      count: splitServices.length,
      color: '#8b5cf6',
    },
  ];

  return (
    <div>
      {/* Tabs header */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className="px-4 py-2.5 text-[13px] font-semibold transition-colors flex items-center gap-2 -mb-px border-b-2"
              style={{
                color: isActive ? t.color : '#64748b',
                borderColor: isActive ? t.color : 'transparent',
              }}
            >
              <t.Icon className="w-4 h-4" />
              {t.label}
              <span
                className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-bold"
                style={{
                  background: isActive ? `${t.color}20` : '#f1f5f9',
                  color: isActive ? t.color : '#64748b',
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {active === 'retail' && (
        <RetailSection main={retailMain} additional={retailAdditional} />
      )}
      {active === 'counterAgents' && (
        <CounterAgentsSection
          counterAgents={counterAgents}
          revenueByCounterAgent={revenueByCounterAgent}
        />
      )}
      {active === 'aggregators' && (
        <AggregatorsSection
          aggregators={aggregators}
          revenueByAggregator={revenueByAggregator}
        />
      )}
      {active === 'splits' && <SplitsSection splitServices={splitServices} />}
    </div>
  );
}

// ─── Retail ───

function RetailSection({
  main,
  additional,
}: {
  main: PriceListItem[];
  additional: PriceListItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-start gap-2">
        <ShoppingBag className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-emerald-900 leading-snug flex-1">
          Розничный прайс — для cash / card / transfer моек. Редактируется в{' '}
          <Link href="/settings" className="underline font-bold">
            /settings
          </Link>{' '}
          (tab «Прайс-лист»). Изменения применяются только к новым мойкам — исторические цены
          сохраняются (audit-trail, Phase 41/АРХ-#18).
        </div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-[12px] font-bold transition-colors flex-shrink-0"
        >
          <Edit className="w-3.5 h-3.5" />
          Редактировать
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PriceListTable title={`Основные услуги (${main.length})`} items={main} />
        <PriceListTable title={`Доп. услуги (${additional.length})`} items={additional} />
      </div>
    </div>
  );
}

function PriceListTable({ title, items }: { title: string; items: PriceListItem[] }) {
  return (
    <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 text-[11px] uppercase tracking-wider font-bold text-slate-500">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-slate-400">пусто</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item, idx) => (
            <div
              key={`${item.serviceName}-${idx}`}
              className="px-3 py-2 flex items-center justify-between text-[13px]"
            >
              <span className="text-slate-900">{item.serviceName}</span>
              <span className="font-bold tabular-nums text-emerald-700">{fmtMoney(item.price)} ₽</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Counter-agents ───

function CounterAgentsSection({
  counterAgents,
  revenueByCounterAgent,
}: {
  counterAgents: CounterAgent[];
  revenueByCounterAgent: Record<string, number>;
}) {
  if (counterAgents.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-8 text-center text-slate-400">
        Активных контрагентов пока нет
      </div>
    );
  }
  const sorted = [...counterAgents].sort((a, b) => {
    const ra = revenueByCounterAgent[a.id] || 0;
    const rb = revenueByCounterAgent[b.id] || 0;
    return rb - ra;
  });

  return (
    <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50/60 border-b border-slate-200">
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            <th className="px-4 py-2">Контрагент</th>
            <th className="px-3 py-2 text-center">Основной прайс</th>
            <th className="px-3 py-2 text-center">Доп. услуги</th>
            <th className="px-3 py-2 text-right">Выручка 30д</th>
            <th className="px-3 py-2 text-right w-[120px]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((a) => {
            const hasSplit = (a.priceList || []).some((s) => (s as any).split?.driverBonus > 0);
            const revenue = revenueByCounterAgent[a.id] || 0;
            return (
              <tr key={a.id} className="hover:bg-slate-50/40 transition-colors">
                <td className="px-4 py-2.5 font-semibold text-slate-900">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    {a.name}
                    {hasSplit && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700">
                        <GitFork className="w-2.5 h-2.5" />
                        сплит
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center text-slate-600 tabular-nums">
                  {a.priceList?.length || 0}
                </td>
                <td className="px-3 py-2.5 text-center text-slate-600 tabular-nums">
                  {a.additionalPriceList?.length || 0}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={
                      'font-bold tabular-nums ' + (revenue > 0 ? 'text-emerald-700' : 'text-slate-300')
                    }
                  >
                    {revenue > 0 ? `${fmtMoney(revenue)} ₽` : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={`/counter-agents/${a.id}/edit`}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 text-[11px] font-bold transition-colors"
                  >
                    Прайс
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Aggregators ───

function AggregatorsSection({
  aggregators,
  revenueByAggregator,
}: {
  aggregators: Aggregator[];
  revenueByAggregator: Record<string, number>;
}) {
  const active = aggregators.filter((a) => !a.archived);
  if (active.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-8 text-center text-slate-400">
        Активных агрегаторов пока нет
      </div>
    );
  }
  const sorted = [...active].sort((a, b) => {
    const ra = revenueByAggregator[a.id] || 0;
    const rb = revenueByAggregator[b.id] || 0;
    return rb - ra;
  });

  return (
    <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50/60 border-b border-slate-200">
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-bold">
            <th className="px-4 py-2">Агрегатор</th>
            <th className="px-3 py-2">Активный прайс</th>
            <th className="px-3 py-2 text-center">Всего прайсов</th>
            <th className="px-3 py-2 text-right">Выручка 30д</th>
            <th className="px-3 py-2 text-right w-[120px]"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((a) => {
            const activeList =
              (a.priceLists || []).find((p) => p.name === a.activePriceListName) ||
              a.priceLists?.[0];
            const revenue = revenueByAggregator[a.id] || 0;
            return (
              <tr key={a.id} className="hover:bg-slate-50/40 transition-colors">
                <td className="px-4 py-2.5 font-semibold text-slate-900">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    {a.name}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">
                  {activeList ? (
                    <span className="inline-flex items-center gap-1.5">
                      {activeList.name}
                      <span className="text-[10px] text-slate-400">({activeList.services?.length || 0} услуг)</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center text-slate-600 tabular-nums">
                  {(a.priceLists || []).length}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span
                    className={
                      'font-bold tabular-nums ' + (revenue > 0 ? 'text-emerald-700' : 'text-slate-300')
                    }
                  >
                    {revenue > 0 ? `${fmtMoney(revenue)} ₽` : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={`/aggregators/${a.id}/edit`}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 text-[11px] font-bold transition-colors"
                  >
                    Прайсы
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Splits ───

function SplitsSection({
  splitServices,
}: {
  splitServices: Array<{
    counterAgentId: string;
    counterAgentName: string;
    service: PriceListItem;
  }>;
}) {
  if (splitServices.length === 0) {
    return (
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-8 text-center">
        <GitFork className="w-12 h-12 text-violet-400 mx-auto mb-3" />
        <div className="text-[14px] font-bold text-violet-900">Split-услуг пока нет</div>
        <div className="text-[12px] text-violet-700 mt-1 max-w-md mx-auto leading-snug">
          Сплит-услуга — это услуга со специальной схемой разделения дохода (фикс водителю + % мойщику + остаток мойке).
          Включить можно у любой услуги в прайс-листе контрагента — клик «+ сплит» рядом с названием.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 flex items-start gap-2">
        <GitFork className="w-4 h-4 text-violet-700 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-violet-900 leading-snug">
          <b>Сплит-услуги</b> — особое распределение дохода для B2B контрагентов.
          Контрагент платит цену → водителю фикс-бонус (DriverKickback) → мойщику % от остатка →
          мойке остаток (прибыль). Workflow: pending → ready → paid через Phase 50.
        </div>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-violet-50/60 border-b border-violet-200">
            <tr className="text-left text-[10px] uppercase tracking-wider text-violet-700 font-bold">
              <th className="px-4 py-2">Услуга</th>
              <th className="px-3 py-2">Контрагент</th>
              <th className="px-3 py-2 text-right">Цена</th>
              <th className="px-3 py-2 text-right">Водителю</th>
              <th className="px-3 py-2 text-right">Мойщику %</th>
              <th className="px-3 py-2 text-right w-[110px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-50">
            {splitServices.map((entry, idx) => {
              const sp = (entry.service as any).split;
              const total = entry.service.price;
              const driver = Number(sp?.driverBonus) || 0;
              const pct = Number(sp?.employeePct) || 0;
              const remainder = Math.max(0, total - driver);
              const employee = Math.round((remainder * pct) / 100);
              const house = remainder - employee;
              return (
                <tr key={`${entry.counterAgentId}-${idx}`} className="hover:bg-violet-50/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Truck className="w-3.5 h-3.5 text-violet-600 flex-shrink-0" />
                      <span className="font-semibold text-slate-900">{entry.service.serviceName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    <Link
                      href={`/counter-agents/${entry.counterAgentId}/edit`}
                      className="hover:underline text-blue-600"
                    >
                      {entry.counterAgentName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-violet-900">
                    {fmtMoney(total)} ₽
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 font-bold tabular-nums text-amber-700">
                      {fmtMoney(driver)} ₽
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px]">
                    <span className="text-blue-700 font-bold">{pct}%</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-blue-900 tabular-nums">{fmtMoney(employee)} ₽</span>
                    <div className="text-[10px] text-emerald-700 tabular-nums">
                      мойка: {fmtMoney(house)} ₽
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/counter-agents/${entry.counterAgentId}/edit`}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-50 hover:bg-violet-100 text-violet-700 px-2.5 py-1 text-[11px] font-bold transition-colors"
                    >
                      Edit
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
