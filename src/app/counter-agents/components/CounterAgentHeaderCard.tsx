'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2, Wallet, Car, ListChecks, Users, FileText, Receipt,
  HandCoins, BarChart3, FolderOpen, Sparkles, AlertTriangle, Star,
} from 'lucide-react';
import type { CounterAgent, WashEvent, OurCompany, ClientTransaction } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PaymentModal } from './PaymentModal';
import { MonthlyReportButton } from './MonthlyReportButton';

/**
 * Phase 59-ui-a: Header-карточка-сводка на странице редактирования контрагента.
 *
 * Показывает ключевые метрики чтобы владелец одним взглядом понимал состояние:
 *  - Имя + бейдж ИП-исполнителя
 *  - Баланс (долг/предоплата/ноль)
 *  - Мойки за текущий месяц (кол-во + сумма)
 *  - Автопарк (число машин)
 *  - Прайс (число услуг + сколько split)
 *  - Водители (число + pending DriverKickback)
 *  - Быстрые кнопки: + Платёж / Финансы / Счёт за месяц / Отчёт за месяц / Документы
 */

interface Props {
  agent: CounterAgent;
  agentId: string;
  /** Все мойки (родитель уже передаёт), чтобы посчитать метрики за месяц без дополнительного fetch. */
  washEvents: WashEvent[];
  ourCompany?: OurCompany | null;
  /** Кол-во DriverKickback со статусом pending — родитель уже подтягивает для badge таба Водители. */
  pendingKickbacks?: number | null;
  /** Phase 59-report-month: транзакции для кнопки «Отчёт за месяц». */
  transactions?: ClientTransaction[];
  /** Phase 59-report-kickbacks: список DriverKickback для секции в отчёте. */
  driverKickbacks?: Array<{ driverName: string; amount: number; status: string; washEventId: string }>;
  onNavigateTab?: (tab: 'finance' | 'documents' | 'invoices') => void;
}

const formatMoney = (n: number) => n.toLocaleString('ru-RU') + ' ₽';
const formatNumber = (n: number) => n.toLocaleString('ru-RU');

function getBalanceTone(balance: number): { label: string; cls: string; hint: string } {
  if (balance < 0) return { label: 'Долг', cls: 'bg-rose-50 text-rose-700 border-rose-200', hint: 'Контрагент должен' };
  if (balance > 0) return { label: 'Предоплата', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', hint: 'Запас оплаты' };
  return { label: 'Ноль', cls: 'bg-slate-50 text-slate-700 border-slate-200', hint: 'Расчёты закрыты' };
}

export function CounterAgentHeaderCard({
  agent,
  agentId,
  washEvents,
  ourCompany,
  pendingKickbacks,
  transactions = [],
  driverKickbacks,
}: Props) {
  const router = useRouter();
  const [paymentOpen, setPaymentOpen] = React.useState(false);

  // ─── Метрики за текущий календарный месяц ────────────────────
  const monthMetrics = React.useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    let count = 0;
    let revenue = 0;
    washEvents.forEach((we) => {
      // Атрибут источника — counterAgentId внутри payment-method='counterAgentContract'.
      // В data-loader / pg-adapter поле называется `sourceId` после mapping.
      const linkedId = (we as any).counterAgentId ?? (we as any).sourceId;
      if (linkedId !== agentId) return;
      const ts = new Date(we.timestamp).getTime();
      if (!Number.isFinite(ts) || ts < start || ts > end) return;
      count += 1;
      revenue += we.totalAmount ?? 0;
    });
    return { count, revenue };
  }, [washEvents, agentId]);

  // ─── Прайс: общее число + сколько split (с water-bonus) ────────
  const priceStats = React.useMemo(() => {
    const list = agent.priceList || [];
    const splitCount = list.filter((s: any) => s?.split?.driverBonus > 0).length;
    return { total: list.length, splitCount };
  }, [agent.priceList]);

  const carsCount = (agent.cars || []).length;
  const driversCount = (agent.drivers || []).length;
  const balance = (agent.balance ?? 0) as number;
  const balanceTone = getBalanceTone(balance);

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 md:p-5 shadow-sm">
      {/* Header line: name + ИП badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-500" />
          <h1 className="text-xl font-bold text-slate-900">{agent.name}</h1>
          {agent.archived && (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
              <AlertTriangle className="w-3 h-3 mr-1" /> в архиве
            </Badge>
          )}
        </div>
        {ourCompany && (
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
            title="Это ИП-исполнитель для всех платежей по этому контрагенту"
          >
            <span className="text-indigo-500">От имени ИП:</span>
            <span className="font-bold">{ourCompany.shortName}</span>
            {ourCompany.isPrimary && <Star className="w-3 h-3 text-amber-500 fill-amber-400" />}
          </Link>
        )}
      </div>

      {/* Metrics grid 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
        {/* Balance */}
        <div className={`rounded-xl border p-3 ${balanceTone.cls}`}>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold opacity-70">
            <Wallet className="w-3 h-3" /> Баланс
          </div>
          <div className="text-xl font-extrabold tabular-nums mt-1">
            {formatMoney(Math.abs(balance))}
          </div>
          <div className="text-[11px] opacity-80 mt-0.5">{balanceTone.label} · {balanceTone.hint}</div>
        </div>

        {/* Month wash count + revenue */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-blue-700">
            <BarChart3 className="w-3 h-3" /> Этот месяц
          </div>
          <div className="text-xl font-extrabold tabular-nums mt-1 text-blue-900">
            {monthMetrics.count} <span className="text-[12px] font-semibold text-blue-700">{monthMetrics.count === 1 ? 'мойка' : monthMetrics.count >= 2 && monthMetrics.count <= 4 ? 'мойки' : 'моек'}</span>
          </div>
          <div className="text-[11px] text-blue-700/80 mt-0.5">{formatMoney(monthMetrics.revenue)} выручки</div>
        </div>

        {/* Autopark */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-emerald-700">
            <Car className="w-3 h-3" /> Автопарк
          </div>
          <div className="text-xl font-extrabold tabular-nums mt-1 text-emerald-900">
            {formatNumber(carsCount)} <span className="text-[12px] font-semibold text-emerald-700">{carsCount === 1 ? 'машина' : carsCount >= 2 && carsCount <= 4 ? 'машины' : 'машин'}</span>
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">
            Прайс: {priceStats.total} услуг{priceStats.splitCount > 0 && <> · {priceStats.splitCount} split 🔀</>}
          </div>
        </div>

        {/* Drivers + pending kickbacks */}
        <div className={`rounded-xl border p-3 ${pendingKickbacks && pendingKickbacks > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-slate-50/40'}`}>
          <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold ${pendingKickbacks && pendingKickbacks > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
            <Users className="w-3 h-3" /> Водители
          </div>
          <div className={`text-xl font-extrabold tabular-nums mt-1 ${pendingKickbacks && pendingKickbacks > 0 ? 'text-amber-900' : 'text-slate-900'}`}>
            {formatNumber(driversCount)}
          </div>
          <div className={`text-[11px] mt-0.5 ${pendingKickbacks && pendingKickbacks > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
            {pendingKickbacks === null
              ? 'загрузка кикбеков...'
              : (pendingKickbacks ?? 0) > 0
                ? <><b>{pendingKickbacks}</b> кикбек{pendingKickbacks === 1 ? '' : (pendingKickbacks ?? 0) >= 2 && (pendingKickbacks ?? 0) <= 4 ? 'а' : 'ов'} ждут оплаты</>
                : 'Все кикбеки выплачены'}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 h-9"
          onClick={() => setPaymentOpen(true)}
          disabled={agent.archived}
          title={agent.archived ? 'Контрагент в архиве — платежи отключены' : 'Записать платёж от контрагента'}
        >
          <HandCoins className="w-4 h-4 mr-1.5" /> + Платёж
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => router.push(`/counter-agents/${agentId}/finance`)}
        >
          <Wallet className="w-4 h-4 mr-1.5" /> Финансы
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => router.push('/invoices')}
          title="Перейти к счетам (выбрать «Создать счёт»)"
        >
          <Receipt className="w-4 h-4 mr-1.5" /> Счёт за месяц
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 text-slate-500"
          disabled
          title="В разработке: автогенерация .docx договора / приложений / ведомости"
        >
          <FileText className="w-4 h-4 mr-1.5" /> Документы
          <span className="ml-1.5 text-[9px] rounded-full bg-slate-200 px-1.5 py-0.5 font-bold">скоро</span>
        </Button>
        {/* Phase 59-report-month: client-side .md generation */}
        <MonthlyReportButton
          agent={agent}
          washEvents={washEvents}
          transactions={transactions}
          ourCompany={ourCompany}
          driverKickbacks={driverKickbacks}
        />
      </div>

      {/* Payment modal — re-uses existing component from /counter-agents list */}
      <PaymentModal
        agent={agent}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        onPaymentRecorded={() => {
          // После платежа обновим страницу, чтобы balance подтянулся
          router.refresh();
        }}
      />
    </div>
  );
}
