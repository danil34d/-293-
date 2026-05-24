'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  Wallet, Sun, CalendarDays, BarChart3, Receipt, PlusCircle, MinusCircle,
  Gift, CircleOff, ShoppingCart, HandCoins, History, CarFront, ChevronRight,
  PiggyBank, TrendingUp, Info, Image, MessageCircle, Loader2,
} from 'lucide-react';
import type { Employee, EmployeeTransaction, WashEvent, SalaryScheme, EmployeeTransactionType } from '@/types';
import { MobileSheet } from '@/components/employee/sheets/MobileSheet';

interface Props {
  employee: Employee;
  washes: WashEvent[];                  // мои мойки этого месяца
  todayWashes: WashEvent[];             // мойки сегодня
  todayEarned: number;
  monthEarned: number;
  transactions: EmployeeTransaction[];   // транзакции этого месяца
  balance: number;
  sparkline: { date: string; amount: number }[]; // последние 11 дней
  bestDay?: { date: string; amount: number };
}

const TXN_DETAILS: Record<EmployeeTransactionType, { label: string; sign: 1 | -1; color: string; bg: string; ring: string; iconBg: string; Icon: any }> = {
  payment: { label: 'Выплата ЗП', sign: -1, color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-100', iconBg: 'from-rose-400 to-red-500', Icon: HandCoins },
  bonus: { label: 'Премия', sign: 1, color: 'text-sky-700', bg: 'bg-sky-50', ring: 'ring-sky-100', iconBg: 'from-sky-400 to-blue-500', Icon: Gift },
  loan: { label: 'Аванс / Долг', sign: -1, color: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-100', iconBg: 'from-amber-400 to-orange-500', Icon: MinusCircle },
  purchase: { label: 'Покупка', sign: -1, color: 'text-rose-700', bg: 'bg-rose-50', ring: 'ring-rose-100', iconBg: 'from-rose-400 to-red-500', Icon: ShoppingCart },
  debt_write_off: { label: 'Списание долга', sign: 1, color: 'text-teal-700', bg: 'bg-teal-50', ring: 'ring-teal-100', iconBg: 'from-teal-400 to-emerald-500', Icon: CircleOff },
};

function fmt(n: number): string {
  return Math.round(Math.abs(n)).toLocaleString('ru-RU');
}

function ruDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function ruMonth(d: Date): string {
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

export function FinanceMobile({
  employee, washes, todayWashes, todayEarned, monthEarned, transactions, balance, sparkline, bestDay,
}: Props) {
  const now = new Date();

  // Структура месяца — группируем транзакции по типу
  const txnByType = useMemo(() => {
    const map = new Map<EmployeeTransactionType, { items: EmployeeTransaction[]; total: number }>();
    for (const t of transactions) {
      const cur = map.get(t.type) || { items: [], total: 0 };
      cur.items.push(t);
      cur.total += t.amount;
      map.set(t.type, cur);
    }
    return map;
  }, [transactions]);

  const [sheetSalaryHelp, setSheetSalaryHelp] = useState(false);
  const [sheetTxn, setSheetTxn] = useState<EmployeeTransaction | null>(null);
  const [sheetAllTxns, setSheetAllTxns] = useState(false);
  const [sheetWashes, setSheetWashes] = useState(false);

  // Phase 47 / ТЕХ-#8: client-side period switcher для sparkline
  type SparkPeriod = 11 | 7 | 14 | 30;
  const [sparkPeriod, setSparkPeriod] = useState<SparkPeriod>(11);
  const [currentSparkline, setCurrentSparkline] = useState(sparkline);
  const [currentBestDay, setCurrentBestDay] = useState(bestDay);
  const [sparkLoading, setSparkLoading] = useState(false);

  // Fetch new sparkline when period changes (skip initial render — server-side gave us days=11)
  useEffect(() => {
    if (sparkPeriod === 11) {
      // Сервер уже дал 11 дней — используем как есть
      setCurrentSparkline(sparkline);
      setCurrentBestDay(bestDay);
      return;
    }
    let cancelled = false;
    setSparkLoading(true);
    fetch(`/api/employee/sparkline?days=${sparkPeriod}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.sparkline)) setCurrentSparkline(data.sparkline);
        setCurrentBestDay(data.bestDay ?? undefined);
      })
      .catch((e) => console.error('[FinanceMobile] sparkline fetch failed:', e))
      .finally(() => {
        if (!cancelled) setSparkLoading(false);
      });
    return () => { cancelled = true; };
  }, [sparkPeriod, sparkline, bestDay]);

  const heroIsPositive = balance >= 0;
  const heroGradient = heroIsPositive
    ? 'from-emerald-500 via-emerald-600 to-teal-700 shadow-emerald-500/30'
    : 'from-rose-500 via-rose-600 to-red-700 shadow-rose-500/30';

  const sparkMax = Math.max(1, ...currentSparkline.map(d => d.amount));
  const todayDateStr = now.toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl mx-auto space-y-3 px-1 pb-4">
      {/* Заголовок + Help */}
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Моя зарплата</h1>
          <p className="text-xs text-gray-500 capitalize">{ruMonth(now)}</p>
        </div>
        <button
          onClick={() => setSheetSalaryHelp(true)}
          className="flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition active:scale-95"
        >
          <Info className="h-3 w-3" />
          <span>Как считается</span>
        </button>
      </section>

      {/* HERO — Баланс */}
      <section className={`relative overflow-hidden rounded-3xl px-5 py-5 text-white shadow-xl bg-gradient-to-br ${heroGradient}`}>
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-4 bottom-2 opacity-20">
          <Wallet className="h-24 w-24 text-white" strokeWidth={1.2} />
        </div>
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/80">
            <PiggyBank className="h-3.5 w-3.5" />
            <span>{heroIsPositive ? 'К выплате' : 'Долг'} · {ruMonth(now)}</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-5xl font-extrabold drop-shadow-sm tracking-tight">
              {heroIsPositive ? '' : '−'}{fmt(balance)}
            </span>
            <span className="text-2xl font-bold text-white/80">₽</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-sm text-white/90">
            <TrendingUp className="h-4 w-4" />
            <span>{washes.length} {pluralWash(washes.length)} в этом месяце</span>
          </div>
        </div>
      </section>

      {/* Сегодня + Месяц */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSheetWashes(true)}
          className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-4 text-left shadow-sm ring-1 ring-emerald-200/50 hover:ring-emerald-400 transition active:scale-95"
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">
            <Sun className="h-3 w-3" /><span>Сегодня</span>
          </div>
          <div className="mt-2 bg-gradient-to-br from-emerald-600 to-teal-600 bg-clip-text text-3xl font-extrabold text-transparent">
            +{fmt(todayEarned)}
          </div>
          <div className="mt-1 text-[11px] font-medium text-emerald-700/70">{todayWashes.length} {pluralWash(todayWashes.length)}</div>
        </button>
        <button
          onClick={() => setSheetWashes(true)}
          className="overflow-hidden rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50 p-4 text-left shadow-sm ring-1 ring-sky-200/50 hover:ring-sky-400 transition active:scale-95"
        >
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-sky-700/80">
            <CalendarDays className="h-3 w-3" /><span>Месяц</span>
          </div>
          <div className="mt-2 bg-gradient-to-br from-sky-600 to-blue-700 bg-clip-text text-3xl font-extrabold text-transparent">
            +{fmt(monthEarned)}
          </div>
          <div className="mt-1 text-[11px] font-medium text-sky-700/70">{washes.length} {pluralWash(washes.length)}</div>
        </button>
      </div>

      {/* Sparkline — Phase 47 / ТЕХ-#8: client-side period switcher (11/7/14/30 дней) */}
      {currentSparkline.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-sm font-semibold text-gray-900">Заработок по дням</span>
              {sparkLoading && <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />}
            </div>
            <div className="flex items-center gap-1">
              {/* Period switcher 7/11/14/30 */}
              <div className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
                {([7, 11, 14, 30] as SparkPeriod[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSparkPeriod(p)}
                    disabled={sparkLoading}
                    className="rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50"
                    style={{
                      background: sparkPeriod === p ? '#fff' : 'transparent',
                      color: sparkPeriod === p ? '#0088CC' : '#64748b',
                      boxShadow: sparkPeriod === p ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    }}
                  >
                    {p}д
                  </button>
                ))}
              </div>
              {currentBestDay && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  Лучший: {ruDate(currentBestDay.date)}
                </span>
              )}
            </div>
          </div>
          <div className="flex h-20 items-end justify-between gap-1">
            {currentSparkline.map((d) => {
              const isToday = d.date === todayDateStr;
              const heightPct = Math.round((d.amount / sparkMax) * 100);
              const opacity = d.amount === 0 ? 0.3 : 1;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1 cursor-default min-w-0" title={`${ruDate(d.date)}: ${fmt(d.amount)} ₽`}>
                  <div
                    className={isToday ? 'w-full rounded-md ring-2 ring-blue-400' : 'w-full rounded-md'}
                    style={{
                      height: `${Math.max(heightPct, 4)}%`,
                      background: isToday ? 'linear-gradient(to top, #3b82f6, #6366f1)' : 'linear-gradient(to top, #10b981, #14b8a6)',
                      opacity,
                    }}
                  />
                  {/* Phase 47: для 30д показываем число только каждые ~5 баров чтобы не было каши */}
                  {(currentSparkline.length <= 14 || new Date(d.date).getDate() % 5 === 0) && (
                    <span className={`text-[9px] ${isToday ? 'font-bold text-blue-600' : 'text-gray-400'}`}>
                      {new Date(d.date).getDate().toString().padStart(2, '0')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Структура месяца */}
      {(washes.length > 0 || transactions.length > 0) && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-purple-100">
              <Receipt className="h-4 w-4 text-indigo-600" />
            </div>
            <span className="text-sm font-semibold text-gray-900">Структура месяца</span>
          </div>
          <div className="space-y-2">
            {/* Начислено за мойки — синтетическая запись */}
            {monthEarned > 0 && (
              <button
                onClick={() => setSheetWashes(true)}
                className="flex w-full items-center justify-between rounded-xl bg-emerald-50 p-2.5 text-left ring-1 ring-emerald-100 hover:bg-emerald-100 transition active:scale-[0.99]"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500">
                    <PlusCircle className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900">Начислено за мойки</div>
                    <div className="text-[10px] text-gray-500">{washes.length} {pluralWash(washes.length)} → детали</div>
                  </div>
                </div>
                <div className="text-sm font-bold text-emerald-700">+{fmt(monthEarned)} ₽</div>
              </button>
            )}
            {/* Транзакции по типам */}
            {Array.from(txnByType.entries()).map(([type, { items, total }]) => {
              const def = TXN_DETAILS[type];
              if (!def) return null;
              const Icon = def.Icon;
              return (
                <button
                  key={type}
                  onClick={() => setSheetTxn(items[0])}
                  className={`flex w-full items-center justify-between rounded-xl ${def.bg} p-2.5 text-left ring-1 ${def.ring} hover:opacity-90 transition active:scale-[0.99]`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${def.iconBg}`}>
                      <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-900">{def.label}</div>
                      <div className="text-[10px] text-gray-500">
                        {items.length === 1 ? ruDate(items[0].date) : `${items.length} операций`}
                      </div>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${def.color}`}>
                    {def.sign === 1 ? '+' : '−'}{fmt(total)} ₽
                  </div>
                </button>
              );
            })}
            {washes.length === 0 && transactions.length === 0 && (
              <p className="text-center text-sm text-gray-500 py-4">В этом месяце пока нет операций</p>
            )}
          </div>
        </section>
      )}

      {/* Шорткат: все транзакции */}
      {transactions.length > 0 && (
        <button
          onClick={() => setSheetAllTxns(true)}
          className="group flex w-full items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 hover:ring-blue-300 transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100">
              <History className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">Все транзакции</div>
              <div className="text-[11px] text-gray-500">{transactions.length} в {ruMonth(now)}</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-1 transition" />
        </button>
      )}

      {washes.length > 0 && (
        <button
          onClick={() => setSheetWashes(true)}
          className="group flex w-full items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 hover:ring-blue-300 transition"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-teal-100">
              <CarFront className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-gray-900">История моек</div>
              <div className="text-[11px] text-gray-500">{washes.length} {pluralWash(washes.length)} · детали по каждой</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-400 group-hover:translate-x-1 transition" />
        </button>
      )}

      {/* ─── SHEETS ─── */}
      <SalaryExplanationSheet open={sheetSalaryHelp} onClose={() => setSheetSalaryHelp(false)} />
      {sheetTxn && (
        <TransactionDetailSheet
          transaction={sheetTxn}
          onClose={() => setSheetTxn(null)}
        />
      )}
      <AllTransactionsSheet
        open={sheetAllTxns}
        onClose={() => setSheetAllTxns(false)}
        transactions={transactions}
        onTxnTap={(t) => { setSheetAllTxns(false); setTimeout(() => setSheetTxn(t), 100); }}
      />
      <WashHistorySheet
        open={sheetWashes}
        onClose={() => setSheetWashes(false)}
        washes={washes}
        todayWashes={todayWashes}
        employeeId={employee.id}
      />
    </div>
  );
}

// ─── Sheets ────────────────────────────────────────────

function SalaryExplanationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <MobileSheet open={open} onOpenChange={(o) => !o && onClose()} title="Как считается зарплата">
      <div className="space-y-3">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-4 ring-1 ring-emerald-200">
          <div className="mb-1 text-[11px] font-bold uppercase text-emerald-700">Формула</div>
          <div className="text-sm font-mono text-gray-800">баланс = (% от моек) + премии − долги − покупки</div>
        </div>
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Примеры расчёта</div>
          <div className="space-y-1.5 text-sm">
            <div className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
              <div className="font-semibold text-gray-900">Мойка «Лайт» 700₽ один</div>
              <div className="mt-1 font-mono text-xs text-gray-600">700 × 30% = <b className="text-emerald-700">210 ₽</b></div>
            </div>
            <div className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
              <div className="font-semibold text-gray-900">«Премиум» 1500₽ с напарником</div>
              <div className="mt-1 font-mono text-xs text-gray-600">1500 × 30% ÷ 2 = <b className="text-emerald-700">225 ₽</b></div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <div className="font-semibold text-amber-900">Через агрегатор</div>
              <div className="mt-1 text-xs text-amber-700">% берётся от агрегаторской цены</div>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="w-full rounded-xl bg-blue-600 px-5 py-3 font-bold text-white shadow-md shadow-blue-500/30">Понятно</button>
      </div>
    </MobileSheet>
  );
}

function TransactionDetailSheet({ transaction, onClose }: { transaction: EmployeeTransaction; onClose: () => void }) {
  const def = TXN_DETAILS[transaction.type];
  if (!def) return null;
  const Icon = def.Icon;
  return (
    <MobileSheet open onOpenChange={(o) => !o && onClose()} title="Детали транзакции">
      <div className="space-y-3">
        <div className={`rounded-2xl ${def.bg} p-4 ring-1 ${def.ring}`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${def.iconBg} shadow-md`}>
              <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">{def.label}</div>
              <div className="text-xs text-gray-600">{ruDate(transaction.date)}</div>
            </div>
          </div>
          <div className={`mt-3 text-3xl font-extrabold ${def.color}`}>
            {def.sign === 1 ? '+' : '−'}{fmt(transaction.amount)} ₽
          </div>
        </div>
        {transaction.description && (
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <div className="text-xs text-gray-500 mb-1">Описание</div>
            <div className="text-gray-800">{transaction.description}</div>
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200">Закрыть</button>
      </div>
    </MobileSheet>
  );
}

function AllTransactionsSheet({ open, onClose, transactions, onTxnTap }: {
  open: boolean; onClose: () => void; transactions: EmployeeTransaction[]; onTxnTap: (t: EmployeeTransaction) => void;
}) {
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <MobileSheet open={open} onOpenChange={(o) => !o && onClose()} title="Все транзакции" description={`${sorted.length} операций`}>
      <div className="space-y-1.5">
        {sorted.map(t => {
          const def = TXN_DETAILS[t.type];
          if (!def) return null;
          const Icon = def.Icon;
          return (
            <button
              key={t.id}
              onClick={() => onTxnTap(t)}
              className={`flex w-full items-center justify-between rounded-xl ${def.bg} p-2.5 text-left ring-1 ${def.ring} hover:opacity-90 transition active:scale-[0.99]`}
            >
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${def.iconBg}`}>
                  <Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-900">{def.label}</div>
                  <div className="text-[10px] text-gray-500">{ruDate(t.date)}{t.description ? ` · ${t.description}` : ''}</div>
                </div>
              </div>
              <div className={`text-sm font-bold ${def.color}`}>
                {def.sign === 1 ? '+' : '−'}{fmt(t.amount)} ₽
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && <p className="text-center text-sm text-gray-500 py-4">Нет транзакций</p>}
      </div>
    </MobileSheet>
  );
}

function WashHistorySheet({ open, onClose, washes, todayWashes, employeeId }: {
  open: boolean; onClose: () => void; washes: WashEvent[]; todayWashes: WashEvent[]; employeeId: string;
}) {
  const [filter, setFilter] = useState<'today' | 'month'>('today');
  const list = filter === 'today' ? todayWashes : washes;
  const sorted = [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <MobileSheet open={open} onOpenChange={(o) => !o && onClose()} title="История моек" description={`${sorted.length} ${pluralWash(sorted.length)}`}>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => setFilter('today')}
          className={`rounded-xl px-3 py-2 text-xs font-bold transition ${filter === 'today' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >Сегодня · {todayWashes.length}</button>
        <button
          onClick={() => setFilter('month')}
          className={`rounded-xl px-3 py-2 text-xs font-bold transition ${filter === 'month' ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >Месяц · {washes.length}</button>
      </div>
      <div className="space-y-1.5">
        {sorted.map(w => {
          const time = new Date(w.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
          const teamSize = (w.employeeIds?.filter(id => id !== '' && id !== 'emp_kiosk') || []).length;
          const myShare = teamSize > 0 ? Math.round((w.totalAmount * 0.3) / teamSize) : 0;
          return (
            <div key={w.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-gray-200">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-sky-100">
                <CarFront className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{w.vehicleNumber}</span>
                  {w.boxNumber && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${w.boxNumber === 1 ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      Б{w.boxNumber}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500">{time} · {w.services?.main?.serviceName || '?'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{fmt(w.totalAmount)} ₽</div>
                {myShare > 0 && <div className="text-[10px] text-emerald-600">+{fmt(myShare)} моё</div>}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="text-center text-sm text-gray-500 py-4">Нет моек</p>}
      </div>
    </MobileSheet>
  );
}

function pluralWash(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return 'моек';
  if (last === 1) return 'мойка';
  if (last >= 2 && last <= 4) return 'мойки';
  return 'моек';
}
