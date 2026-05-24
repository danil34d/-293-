export const dynamic = 'force-dynamic';

import "@/styles/expenses.css";
import Link from 'next/link';
import { PlusCircle, Edit, ShoppingCart, TrendingUp, Scale, Droplets, AlertTriangle, Link2, AlertOctagon } from 'lucide-react';
import type { Expense, WashEvent, StockMovement } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { getExpensesData, getWashEventsData, getInventory, getStockMovementsData } from '@/lib/data';

// Phase 31 / V2-#14: helper для определения химических закупок
function isChemicalPurchase(e: Expense): boolean {
  const cat = (e.category || '').toLowerCase();
  return cat.includes('хими') || cat === 'chemical';
}

// Phase 31: detection «Расходы ↔ Склад» drift в кг
// expensePurchaseKg = sum quantities в кг chemical purchases (unit normalized)
// stockLedgerKg = sum StockMovement purchase amounts (grams → кг)
// driftKg = expense − ledger. Положительный = склад не учёл закупку (Phase 24a реверс работает,
// orphan возможен из старых удалений). Отрицательный — наоборот (backfill дал двойной счёт).
function computeStockDrift(expenses: Expense[], movements: StockMovement[]): {
  driftKg: number;
  expensePurchaseKg: number;
  stockLedgerKg: number;
} {
  const expensePurchaseKg = expenses
    .filter(isChemicalPurchase)
    .reduce((s, e) => {
      const unit = (e.unit || '').trim().toLowerCase();
      const qty = Number(e.quantity ?? 0) || 0;
      if (unit.startsWith('кг') || unit.startsWith('kg')) return s + qty;
      if (unit.startsWith('г') || unit.startsWith('g')) return s + qty / 1000;
      if (unit.startsWith('л') || unit.startsWith('l')) return s + qty; // ~1л = 1кг для химии
      return s; // unit unknown — пропустим
    }, 0);

  const stockLedgerKg = movements
    .filter(m => m.type === 'purchase' && m.amount > 0)
    .reduce((s, m) => s + (m.amount > 1000 ? m.amount / 1000 : m.amount), 0);
  // ↑ amount хранится в граммах для chemical (Phase 16 backfill, * 1000). Если же материал
  // не в граммах а в шт — берём как есть. Эвристика: >1000 значит граммы.

  const driftKg = Math.round((expensePurchaseKg - stockLedgerKg) * 100) / 100;
  return { driftKg, expensePurchaseKg, stockLedgerKg };
}

export default async function ExpensesPage() {
  let expenses: Expense[] = [];
  let washEvents: WashEvent[] = [];
  let inventory: { chemicalStockGrams: number } = { chemicalStockGrams: 0 };
  let movements: StockMovement[] = [];
  let fetchError: string | null = null;

  try {
    [expenses, washEvents, inventory, movements] = await Promise.all([
        getExpensesData(),
        getWashEventsData(),
        getInventory(),
        getStockMovementsData().catch(() => [] as StockMovement[]),
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить финансовые данные.";
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalRevenue = washEvents.reduce((sum, event) => sum + (event.netAmount ?? event.totalAmount), 0);
  const profit = totalRevenue - totalExpenses;

  // Phase 31: drift detection
  const drift = computeStockDrift(expenses, movements);
  const showDriftBanner = Math.abs(drift.driftKg) >= 0.1; // показываем если расхождение >= 100гр

  return (
    <div className="expenses">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Расходы и рентабельность</h1>
            <p>Управляйте операционными расходами и отслеживайте общую прибыльность.</p>
          </div>
          <Link href="/expenses/new" className="add-expense-btn">
            <PlusCircle className="h-4 w-4" />
            Добавить расход
          </Link>
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

      {/* Phase 31 / V2-#14: Drift banner — расхождение «Расходы ↔ Склад» по химии */}
      {showDriftBanner && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="text-[13px] font-bold text-rose-900">
              ⚠️ Расхождение «Расходы ↔ Склад»: {Math.abs(drift.driftKg).toFixed(1)} кг химии
              {drift.driftKg > 0 ? ' (расходы > склад)' : ' (склад > расходы)'}
            </div>
            <div className="text-[11px] text-rose-800 mt-1 leading-snug">
              По расходам химии закуплено <b>{drift.expensePurchaseKg.toFixed(1)} кг</b>,
              в журнале склада зафиксировано <b>{drift.stockLedgerKg.toFixed(1)} кг</b>.
              {drift.driftKg > 0 ? (
                <> Возможно есть Expense без связанного StockMovement — запустите <Link href="/inventory" className="underline font-bold">Backfill закупок химии</Link> в /inventory.</>
              ) : (
                <> Возможно есть orphan StockMovement (старое удаление Expense без atomic-реверса) — проверьте <Link href="/inventory" className="underline font-bold">Orphan-связи склада</Link> в /inventory.</>
              )}
            </div>
          </div>
          <Link href="/inventory" className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 text-[12px] font-bold flex items-center gap-1.5 flex-shrink-0">
            Открыть склад →
          </Link>
        </div>
      )}

      {/* Profitability Dashboard */}
      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">Общая выручка</div>
            <TrendingUp className="dashboard-card-icon revenue" />
          </div>
          <div className="dashboard-card-value revenue">
            {totalRevenue.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </div>
          <div className="dashboard-card-description">За все время (за вычетом комиссий)</div>
        </div>

        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">Всего расходов</div>
            <ShoppingCart className="dashboard-card-icon expenses" />
          </div>
          <div className="dashboard-card-value expenses">
            {totalExpenses.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </div>
          <div className="dashboard-card-description">За все время</div>
        </div>

        <div className="dashboard-card profit">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">Прибыль</div>
            <Scale className="dashboard-card-icon profit" />
          </div>
          <div className={`dashboard-card-value profit ${profit >= 0 ? 'positive' : 'negative'}`}>
            {profit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          </div>
          <div className="dashboard-card-description">Выручка - Расходы</div>
        </div>

        <div className="dashboard-card inventory">
          <div className="dashboard-card-header">
            <div className="dashboard-card-title">Остаток химии на складе</div>
            <Droplets className="dashboard-card-icon inventory" />
          </div>
          <div className="dashboard-card-value inventory">
            {(inventory.chemicalStockGrams / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кг
          </div>
          <div className="dashboard-card-description">На основе занесенных закупок</div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="expenses-table-card">
        <div className="expenses-table-header">
          <h2 className="expenses-table-title">Журнал расходов</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="expenses-table">
            <thead>
              <tr className="expenses-table-header-row">
                <th className="w-[120px]">Дата</th>
                <th>Описание</th>
                <th>Детали</th>
                <th className="text-right">Сумма</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {!fetchError && expenses.map((expense) => (
                <tr key={expense.id} className="expenses-table-row">
                  <td className="expenses-table-cell font-medium">
                    {format(new Date(expense.date), 'dd.MM.yyyy', { locale: ru })}
                  </td>
                  <td className="expenses-table-cell">
                    <div className="expense-description">{expense.description}</div>
                    <div className="category-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{expense.category}</span>
                      {/* Phase 31: 🔗 badge для chemical expenses — atomic с StockMovement (Phase 24a) */}
                      {isChemicalPurchase(expense) && (
                        <span
                          title="Atomic-связь со складом: DELETE расхода атомарно реверсирует StockMovement (Phase 24a)"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 10, fontWeight: 700, color: '#0e7490', background: '#ecfeff',
                            padding: '1px 6px', borderRadius: 4, border: '1px solid #67e8f9',
                          }}
                        >
                          <Link2 style={{ width: 10, height: 10 }} /> склад
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="expenses-table-cell expense-details">
                    {expense.quantity && expense.pricePerUnit ? (
                      <span>{expense.quantity} {expense.unit || 'шт.'} × {expense.pricePerUnit.toLocaleString('ru-RU')} руб.</span>
                    ) : '-'}
                  </td>
                  <td className="expenses-table-cell text-right">
                    <div className="amount-display">
                      - {expense.amount.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                    </div>
                  </td>
                  <td className="expenses-table-cell text-right">
                    <div className="action-buttons">
                      <Link href={`/expenses/${expense.id}/edit`} className="action-btn" aria-label={`Редактировать ${expense.description}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      <DeleteConfirmationButton
                        apiPath="/api/expenses"
                        entityId={expense.id}
                        entityName={`расход "${expense.description}"`}
                        toastTitle="Расход удален"
                        toastDescription={`Запись о расходе "${expense.description}" успешно удалена.`}
                        description={
                          <>
                            Вы собираетесь безвозвратно удалить запись о расходе <strong>{expense.description}</strong> на сумму {expense.amount} руб.
                            Это действие нельзя отменить.
                          </>
                        }
                        trigger={
                          <button className="action-btn danger" aria-label={`Удалить ${expense.description}`}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!fetchError && expenses.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <ShoppingCart className="h-12 w-12" />
                      </div>
                      <div className="empty-title">Записей о расходах нет</div>
                      <div className="empty-subtitle">Добавьте первую запись</div>
                      <Link href="/expenses/new" className="empty-action-btn">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Добавить запись
                      </Link>
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