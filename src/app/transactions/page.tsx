
export const dynamic = 'force-dynamic';

import "@/styles/transactions.css";
import Link from 'next/link';
import {
  PlusCircle, Edit, DollarSign, CreditCard, Landmark, ListChecks,
  Car, Users, AlertTriangle, Coins, Calculator, CreditCard as CardIcon,
  Banknote, ArrowRightLeft, Zap, Briefcase, TrendingUp, TrendingDown,
  Info, ShieldCheck, Download, ArrowRight,
} from 'lucide-react';
import type { WashEvent, PaymentType, Employee, Expense } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  getWashEventsData, getEmployeesData, getExpensesData,
} from '@/lib/data';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { TransactionsPeriodSwitcher } from './components/TransactionsPeriodSwitcher';


const PaymentTypeIcon = ({ type }: { type: PaymentType }) => {
  switch (type) {
    case 'cash': return <DollarSign className={`payment-type-icon cash`} />;
    case 'card': return <CreditCard className={`payment-type-icon card`} />;
    case 'transfer': return <Landmark className={`payment-type-icon transfer`} />;
    default: return null;
  }
};

const paymentTypeTranslations: Record<PaymentType, string> = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
};

// ─── helpers ───

function parseDateOrDefault(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function inRange(iso: string | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= from.getTime() && t <= to.getTime();
}

interface Props {
  searchParams?: { from?: string; to?: string };
}

export default async function TransactionsPage({ searchParams }: Props) {
  // Period: дефолт сегодня (start day → end day)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const from = parseDateOrDefault(searchParams?.from, todayStart);
  const to = parseDateOrDefault(searchParams?.to, todayEnd);

  let allWashEvents: WashEvent[] = [];
  let employees: Employee[] = [];
  let expenses: Expense[] = [];
  let fetchError: string | null = null;

  try {
    [allWashEvents, employees, expenses] = await Promise.all([
      getWashEventsData(),
      getEmployeesData(),
      getExpensesData(),
    ]);
  } catch (error: any) {
    fetchError = error.message || 'Не удалось загрузить данные.';
  }

  // Period filter
  const periodWashEvents = allWashEvents.filter((e) => inRange(e.timestamp, from, to));
  const periodExpenses = expenses.filter((e) => inRange(e.date, from, to));

  // Retail = cash/card/transfer (для таблицы внизу, как было)
  const retailWashEvents = periodWashEvents.filter(
    (event) =>
      event.paymentMethod === 'cash' ||
      event.paymentMethod === 'card' ||
      event.paymentMethod === 'transfer'
  );

  const employeeMap = new Map(employees.map((e) => [e.id, e.fullName]));

  // ─── breakdown по методам (включая агрегатор и договор) ───
  const groupByMethod = (method: WashEvent['paymentMethod']) => {
    const filtered = periodWashEvents.filter((e) => e.paymentMethod === method && !e.refundedAt);
    return {
      count: filtered.length,
      sum: filtered.reduce((s, e) => s + (e.totalAmount || 0), 0),
      netSum: filtered.reduce((s, e) => s + (e.netAmount ?? e.totalAmount ?? 0), 0),
      acquiringFee: filtered.reduce((s, e) => s + (e.acquiringFee || 0), 0),
    };
  };

  const cashGroup = groupByMethod('cash');
  const cardGroup = groupByMethod('card');
  const transferGroup = groupByMethod('transfer');
  const aggregatorGroup = groupByMethod('aggregator');
  const contractGroup = groupByMethod('counterAgentContract');

  // Топ-1 имя для агрегатор/договор (для extra-строки)
  const topSourceName = (method: WashEvent['paymentMethod']) => {
    const evts = periodWashEvents.filter((e) => e.paymentMethod === method);
    if (evts.length === 0) return null;
    const counts: Record<string, number> = {};
    evts.forEach((e) => {
      const n = e.sourceName || '—';
      counts[n] = (counts[n] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  };
  const aggrTop = topSourceName('aggregator');
  const contrTop = topSourceName('counterAgentContract');

  // ─── итоги ───
  const totalRevenue =
    cashGroup.sum + cardGroup.sum + transferGroup.sum + aggregatorGroup.sum + contractGroup.sum;
  const totalCount =
    cashGroup.count + cardGroup.count + transferGroup.count + aggregatorGroup.count + contractGroup.count;
  const totalAcquiring = cardGroup.acquiringFee;
  const totalNet = totalRevenue - totalAcquiring;
  const totalTips = retailWashEvents.reduce((s, e) => s + (e.tips || 0), 0);
  const refundedCount = retailWashEvents.filter((e) => e.refundedAt).length;
  const avgCheck = totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0;

  // ─── cash reconciliation (упрощённая) ───
  // У Expense нет paymentMethod — показываем ВСЕ расходы периода как ориентир
  const totalExpenses = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expectedCash = cashGroup.sum - totalExpenses; // упрощённо: касса − все расходы
  // Без реальных startCash/endCash отображаем как «ориентир»

  // ─── period label ───
  const isToday =
    from.toDateString() === todayStart.toDateString() &&
    to.toDateString() === todayEnd.toDateString();
  const periodLabel = isToday
    ? `Сегодня · ${format(from, 'd MMMM', { locale: ru })}`
    : `${format(from, 'd MMM', { locale: ru })} – ${format(to, 'd MMM', { locale: ru })}`;

  return (
    <div className="transactions">
      {/* Page Header — V2 style */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <div className="text-[11px] uppercase tracking-wider font-bold text-blue-600 flex items-center gap-1.5 mb-1">
              <CreditCard className="w-3.5 h-3.5" />
              Кассовая сверка · срез по WashEvent
            </div>
            <h1>Розничные транзакции</h1>
            <p>Сверка кассы по периодам · cash / card / transfer / aggregator / contract</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <TransactionsPeriodSwitcher />
          </div>
        </div>
      </div>

      {/* Info banner — указание что страница read-only срез */}
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 flex items-start gap-3 mb-4">
        <Info className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-blue-900 leading-snug">
          Эта страница — <b>срез</b> данных WashEvent по способам оплаты за период <b>{periodLabel}</b>.
          Транзакции редактируются в{' '}
          <Link href="/wash-log" className="text-blue-700 underline font-bold">
            /wash-log
          </Link>
          . Здесь только просмотр и сверка кассы.
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <div className="alert error">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <div className="alert-title">Ошибка загрузки</div>
            <div className="alert-description">{fetchError}</div>
          </div>
        </div>
      )}

      {/* Cash reconciliation block */}
      {!fetchError && cashGroup.count > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[14px] font-bold text-slate-900">Сверка кассы · {periodLabel}</div>
              <div className="text-[11px] text-slate-500">
                Упрощённая модель: cash washes − все расходы периода
              </div>
            </div>
            <span
              className={
                'text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 ' +
                (expectedCash < 0
                  ? 'bg-rose-100 text-rose-800'
                  : expectedCash < 1000
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800')
              }
            >
              {expectedCash < 0
                ? 'Расходы превышают кассу'
                : expectedCash < 1000
                ? 'Низкий остаток'
                : 'Касса в норме'}
            </span>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />+ Выручка наличными ({cashGroup.count} моек)
              </span>
              <span className="font-bold tabular-nums text-emerald-700">
                +{cashGroup.sum.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-700">
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" />− Все расходы периода ({periodExpenses.length})
              </span>
              <span className="font-bold tabular-nums text-rose-700">
                −{totalExpenses.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="border-t border-slate-200 pt-2 mt-2 flex items-center justify-between">
              <span className="font-bold text-slate-900">Ориентир кассы</span>
              <span className="font-extrabold text-[16px] tabular-nums text-slate-900">
                {expectedCash.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mt-3 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] text-amber-900 leading-snug">
              <b>Упрощённая сверка.</b> Полная требует Prisma-миграции (`Expense.paymentMethod` +{' '}
              `CashRegister` модель с startCash/endCash) — отложено до решения владельца. Сейчас «Все
              расходы периода» включают безнал/перевод, что может занижать ориентир.
            </div>
          </div>
        </div>
      )}

      {/* 5 method cards — V2 layout */}
      {!fetchError && totalCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <MethodCard
            label="Наличные"
            value={cashGroup.sum}
            count={cashGroup.count}
            icon={<Banknote className="w-3.5 h-3.5" />}
            color="#10b981"
          />
          <MethodCard
            label="Карта"
            value={cardGroup.sum}
            count={cardGroup.count}
            icon={<CreditCard className="w-3.5 h-3.5" />}
            color="#0088CC"
            extra={cardGroup.acquiringFee > 0 ? `−${cardGroup.acquiringFee.toFixed(0)} ₽ эквайринг` : undefined}
          />
          <MethodCard
            label="Перевод"
            value={transferGroup.sum}
            count={transferGroup.count}
            icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
            color="#3b82f6"
          />
          <MethodCard
            label="Агрегатор"
            value={aggregatorGroup.sum}
            count={aggregatorGroup.count}
            icon={<Zap className="w-3.5 h-3.5" />}
            color="#f59e0b"
            extra={aggrTop ?? undefined}
          />
          <MethodCard
            label="Договор"
            value={contractGroup.sum}
            count={contractGroup.count}
            icon={<Briefcase className="w-3.5 h-3.5" />}
            color="#8b5cf6"
            extra={contrTop ?? undefined}
          />
        </div>
      )}

      {/* Total summary block — V2 style */}
      {!fetchError && totalCount > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-5 mb-4 flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              Общая выручка
            </div>
            <div className="text-[32px] font-extrabold text-slate-900 tabular-nums mt-1">
              {totalRevenue.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-[12px] text-slate-500 mt-0.5">
              {totalCount} моек · средний чек {avgCheck.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          {totalAcquiring > 0 && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Эквайринг
              </div>
              <div className="text-[18px] font-bold text-rose-700 tabular-nums">
                −{totalAcquiring.toLocaleString('ru-RU')} ₽
              </div>
            </div>
          )}
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
              К получению
            </div>
            <div className="text-[20px] font-extrabold text-emerald-700 tabular-nums">
              {totalNet.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          {totalTips > 0 && (
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                Чаевые
              </div>
              <div className="text-[16px] font-bold text-amber-700 tabular-nums">
                +{totalTips.toLocaleString('ru-RU')} ₽
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phase 38 changes summary */}
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 mb-4">
        <div className="text-[11px] uppercase tracking-wider font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
          <ShieldCheck className="w-3.5 h-3.5" /> Phase 38 — что изменилось
        </div>
        <ul className="text-[12px] text-emerald-900 space-y-1 leading-relaxed">
          <li>• <b>Period switcher</b> (Сегодня / Неделя / Месяц) — URL ?from=&to=</li>
          <li>• <b>5 method cards</b>: добавлены Агрегатор и Договор с топ-источником</li>
          <li>• <b>Упрощённая cash reconciliation</b>: cash washes − все расходы → ориентир</li>
          <li>• <b>Total summary</b> с эквайрингом и «К получению»</li>
          <li>• Таблица retail-транзакций (cash/card/transfer) сохранена ниже для редактирования</li>
        </ul>
      </div>

      {/* Retail Transactions Table — сохраняем для редактирования */}
      <div className="transactions-table-card">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-slate-500" />
            Розничные транзакции периода ({retailWashEvents.length})
          </div>
          <Link
            href="/wash-log"
            className="text-[11px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            Все мойки <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="transactions-table">
            <thead>
              <tr className="transactions-table-header">
                <th className="w-[180px]">Дата</th>
                <th>Гос. номер</th>
                <th>Тип оплаты</th>
                <th>Исполнители</th>
                <th className="text-right">Сумма</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {!fetchError &&
                retailWashEvents.map((transaction) => {
                  const formattedDate = format(new Date(transaction.timestamp), 'dd.MM.yyyy HH:mm', {
                    locale: ru,
                  });
                  const paymentType = transaction.paymentMethod as PaymentType;
                  return (
                    <tr key={transaction.id} className="transactions-table-row">
                      <td className="transactions-table-cell">{formattedDate}</td>
                      <td className="transactions-table-cell">
                        <div className="vehicle-number">{transaction.vehicleNumber}</div>
                      </td>
                      <td className="transactions-table-cell">
                        <div className={`payment-type-badge ${paymentType}`}>
                          <PaymentTypeIcon type={paymentType} />
                          {paymentTypeTranslations[paymentType]}
                        </div>
                      </td>
                      <td className="transactions-table-cell">
                        <div className="employee-badges">
                          {transaction.employeeIds.map((id) => (
                            <span key={id} className="employee-badge">
                              {employeeMap.get(id)?.split(' ')[0] || 'Неизв.'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="transactions-table-cell text-right">
                        <div
                          className={`amount-display${
                            transaction.refundedAt ? ' line-through text-red-400' : ''
                          }`}
                        >
                          {transaction.totalAmount.toFixed(2)} руб.
                        </div>
                        {transaction.refundedAt && (
                          <div style={{ fontSize: '11px', color: '#ef4444' }}>Возврат</div>
                        )}
                        {transaction.tips && transaction.tips > 0 && (
                          <div style={{ fontSize: '11px', color: '#d97706' }}>+{transaction.tips} чай.</div>
                        )}
                      </td>
                      <td className="transactions-table-cell text-right">
                        <div className="action-buttons">
                          <Link
                            href={`/wash-log/${transaction.id}/edit`}
                            className="action-btn"
                            aria-label={`Редактировать мойку ${transaction.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Link>
                          <DeleteConfirmationButton
                            apiPath="/api/wash-events"
                            entityId={transaction.id}
                            entityName={`${transaction.vehicleNumber} от ${formattedDate}`}
                            toastTitle="Транзакция удалена"
                            toastDescription={`Транзакция для машины ${transaction.vehicleNumber} от ${formattedDate} успешно удалена.`}
                            description={
                              <>
                                Вы собираетесь безвозвратно удалить транзакцию для машины{' '}
                                <strong className="vehicle-number">{transaction.vehicleNumber}</strong>{' '}
                                от <strong>{formattedDate}</strong>. Это действие нельзя отменить.
                              </>
                            }
                            trigger={
                              <button
                                className="action-btn danger"
                                aria-label={`Удалить транзакцию ${transaction.id}`}
                              >
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!fetchError && retailWashEvents.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <ListChecks className="h-12 w-12" />
                      </div>
                      <div className="empty-title">Транзакции не найдены за период</div>
                      <div className="empty-subtitle">
                        Зарегистрируйте розничную мойку на рабочей станции — или измените период.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MethodCard inline component ───

function MethodCard({
  label,
  value,
  count,
  icon,
  color,
  extra,
}: {
  label: string;
  value: number;
  count: number;
  icon: React.ReactNode;
  color: string;
  extra?: string;
}) {
  return (
    <div className="rounded-xl bg-white shadow-sm border border-slate-200 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: color + '15', color }}
        >
          {icon}
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</span>
      </div>
      <div className="text-[20px] font-extrabold tabular-nums" style={{ color }}>
        {value.toLocaleString('ru-RU')}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5 truncate">
        {count} моек{extra ? ' · ' + extra : ''}
      </div>
    </div>
  );
}
