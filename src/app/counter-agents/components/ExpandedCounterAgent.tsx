"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  HandCoins, FileSpreadsheet, WalletCards, Pencil, AlertTriangle,
  Car as CarIcon, ListChecks, Receipt, TrendingUp, Droplets, Calendar,
  Building2, Phone, Mail, MapPin, Cog,
} from "lucide-react";
import type { CounterAgent, ClientTransaction } from "@/types";

/**
 * Phase 34 / V2 «counter-agents inline-expand»:
 * 3-колоночный блок раскрывается под строкой контрагента:
 *  - col-3: Балланс card + 4 action buttons (Платёж/Счёт/Финансы/Профиль)
 *  - col-5: Реквизиты + 6 mini-stat карточек
 *  - col-4: Последние 5 операций (ClientTransaction) с цветной полоской слева
 *
 * Транзакции lazy-fetch при первом expand: GET /api/client-transactions/[id].
 */

interface Props {
  agent: CounterAgent;
  onPay: () => void;
}

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

function MiniStat({ label, value, Icon, color }: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2">
      <div className="flex items-center gap-1.5">
        <Icon className="w-3 h-3" style={{ color }} />
        <span className="text-[9px] uppercase tracking-wider font-bold text-gray-500">{label}</span>
      </div>
      <div className="text-[14px] font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

export function ExpandedCounterAgent({ agent, onPay }: Props) {
  const [transactions, setTransactions] = React.useState<ClientTransaction[] | null>(null);
  const [loadingTx, setLoadingTx] = React.useState(false);
  const [txError, setTxError] = React.useState<string | null>(null);

  // Lazy fetch транзакций при mount (т.е. при первом expand)
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingTx(true);
      setTxError(null);
      try {
        const r = await fetch(`/api/client-transactions/${agent.id}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setTransactions(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (!cancelled) setTxError(e.message);
      } finally {
        if (!cancelled) setLoadingTx(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [agent.id]);

  const balance = Number(agent.balance ?? 0);
  const balanceColor = balance > 0 ? "#10b981" : balance < 0 ? "#ef4444" : "#64748b";
  const isDebt = balance < 0;

  // Company info — первая компания (если есть)
  const c0 = agent.companies?.[0] ?? null;

  // Метрики
  const carsCount = agent.cars?.length ?? 0;
  const priceCount = (agent.priceList?.length ?? 0) + (agent.additionalPriceList?.length ?? 0);

  // Последние 5 операций (newest first — обычно так уже идут из API)
  const recentTx = React.useMemo(() => {
    if (!transactions) return [];
    return [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [transactions]);

  // Last payment for sub-text
  const lastPayment = React.useMemo(() => {
    return recentTx.find(t => t.type === "payment" && t.amount > 0);
  }, [recentTx]);

  // Avg check (приближённо из ClientTransaction'ов с описанием «Мойка»)
  const washTx = React.useMemo(() => {
    if (!transactions) return [];
    return transactions.filter(t => t.amount < 0 && /мойк|wash/i.test(t.description ?? ""));
  }, [transactions]);

  const avgCheck = washTx.length > 0
    ? Math.round(washTx.reduce((s, t) => s + Math.abs(t.amount), 0) / washTx.length)
    : 0;

  // First seen — самая старая транзакция
  const firstSeen = React.useMemo(() => {
    if (!transactions || transactions.length === 0) return null;
    const oldest = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )[0];
    return oldest ? new Date(oldest.date) : null;
  }, [transactions]);

  // Washes last 30 days
  const washes30d = React.useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return washTx.filter(t => new Date(t.date).getTime() >= cutoff).length;
  }, [washTx]);

  // Monthly turnover ~ sum моек за 30 дней (приближённо)
  const monthlyTurnover = React.useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return washTx
      .filter(t => new Date(t.date).getTime() >= cutoff)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
  }, [washTx]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-1">
      {/* LEFT col-3: balance & actions */}
      <div className="lg:col-span-3 space-y-3">
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: balanceColor + "30" }}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Текущий баланс</div>
          <div className="text-[28px] font-extrabold tabular-nums mt-1" style={{ color: balanceColor }}>
            {balance > 0 ? "+" : ""}{formatMoney(balance)} ₽
          </div>
          {lastPayment && (
            <div className="text-[11px] text-gray-500 mt-1">
              Посл. платёж: {formatMoney(lastPayment.amount)} ₽, {format(new Date(lastPayment.date), "d MMM", { locale: ru })}
            </div>
          )}
          {isDebt && (
            <div className="mt-2 px-2 py-1 rounded bg-rose-100 text-rose-800 text-[11px] font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Долг по оплате
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onPay}
            disabled={!!agent.archived}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 text-[12px] font-bold flex items-center gap-2 text-left transition-colors"
          >
            <HandCoins className="w-3.5 h-3.5" />
            Добавить платёж
          </button>
          <Link
            href={`/counter-agents/${agent.id}/finance`}
            className="w-full rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 text-[12px] font-semibold flex items-center gap-2 text-left transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Сформировать счёт
          </Link>
          <Link
            href={`/counter-agents/${agent.id}/finance`}
            className="w-full rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 text-[12px] font-semibold flex items-center gap-2 text-left transition-colors"
          >
            <WalletCards className="w-3.5 h-3.5" />
            Финансы (полная)
          </Link>
          <Link
            href={`/counter-agents/${agent.id}/edit`}
            className="w-full rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 text-[12px] font-semibold flex items-center gap-2 text-left transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Профиль, реквизиты
          </Link>
        </div>
      </div>

      {/* MIDDLE col-5: contact + mini-stats */}
      <div className="lg:col-span-5 space-y-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2 flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Реквизиты и контакты
          </div>
          {c0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
              {c0.companyName && (
                <div className="col-span-2 text-[13px] font-bold text-slate-900 truncate">
                  {c0.companyName}
                </div>
              )}
              {c0.inn && (
                <div><span className="text-gray-500">ИНН:</span> <code className="bg-gray-100 px-1 rounded text-[10px]">{c0.inn}</code></div>
              )}
              {c0.kpp && (
                <div><span className="text-gray-500">КПП:</span> <code className="bg-gray-100 px-1 rounded text-[10px]">{c0.kpp}</code></div>
              )}
              {c0.legalAddress && (
                <div className="col-span-2 flex items-start gap-1 truncate"><MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" /><span className="text-gray-700 truncate" title={c0.legalAddress}>{c0.legalAddress}</span></div>
              )}
              {c0.customerName && (
                <div><span className="text-gray-500">Контакт:</span> <span className="text-gray-900 font-medium">{c0.customerName}</span></div>
              )}
              {c0.phone && (
                <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" /><span className="text-gray-900 font-medium">{c0.phone}</span></div>
              )}
              {c0.email && (
                <div className="col-span-2 flex items-center gap-1 truncate"><Mail className="w-3 h-3 text-gray-400 flex-shrink-0" /><span className="text-gray-900 font-medium truncate">{c0.email}</span></div>
              )}
              <div className="col-span-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    agent.allowCustomServices !== false
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  <Cog className="w-3 h-3" />
                  Произв. услуги: {agent.allowCustomServices !== false ? "разрешены" : "запрещены"}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-[12px] text-gray-400 italic">Реквизиты не указаны</div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Машин в парке" value={carsCount} Icon={CarIcon} color="#0088CC" />
          <MiniStat label="Услуг в прайсе" value={priceCount} Icon={ListChecks} color="#8b5cf6" />
          <MiniStat label="Средний чек" value={avgCheck > 0 ? `${formatMoney(avgCheck)} ₽` : "—"} Icon={Receipt} color="#10b981" />
          <MiniStat label="Оборот / мес" value={monthlyTurnover > 0 ? `${(monthlyTurnover / 1000).toFixed(1)}к ₽` : "—"} Icon={TrendingUp} color="#0088CC" />
          <MiniStat label="Моек за 30д" value={washes30d} Icon={Droplets} color="#0088CC" />
          <MiniStat label="Клиент с" value={firstSeen ? format(firstSeen, "LLL yyyy", { locale: ru }) : "—"} Icon={Calendar} color="#64748b" />
        </div>
      </div>

      {/* RIGHT col-4: recent operations */}
      <div className="lg:col-span-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Последние операции</span>
            <Link
              href={`/counter-agents/${agent.id}/finance`}
              className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700"
            >
              все →
            </Link>
          </div>
          <div className="divide-y divide-gray-100 max-h-[260px] overflow-y-auto">
            {loadingTx && (
              <div className="px-3 py-4 text-center text-[11px] text-gray-500">Загружаю транзакции…</div>
            )}
            {txError && (
              <div className="px-3 py-4 text-center text-[11px] text-rose-600">Ошибка: {txError}</div>
            )}
            {!loadingTx && !txError && recentTx.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-gray-400">Нет операций</div>
            )}
            {recentTx.map((t) => {
              const isCredit = t.amount > 0;
              const color = isCredit ? "#10b981" : "#ef4444";
              return (
                <div key={t.id} className="px-3 py-2 flex items-center gap-2">
                  <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-gray-900 truncate" title={t.description}>
                      {t.description || (isCredit ? "Оплата" : "Списание")}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {format(new Date(t.date), "d MMM", { locale: ru })}
                    </div>
                  </div>
                  <div
                    className="text-[12px] font-bold tabular-nums flex-shrink-0"
                    style={{ color }}
                  >
                    {isCredit ? "+" : "−"}{formatMoney(Math.abs(t.amount))} ₽
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
