export const dynamic = 'force-dynamic';

import "@/styles/expenses.css";
import Link from 'next/link';
import { PlusCircle, Edit, ShoppingCart, TrendingUp, Scale, Droplets, AlertTriangle } from 'lucide-react';
import type { Expense, WashEvent } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { getExpensesData, getWashEventsData, getInventory } from '@/lib/data-loader';

export default async function ExpensesPage() {
  let expenses: Expense[] = [];
  let washEvents: WashEvent[] = [];
  let inventory: { chemicalStockGrams: number } = { chemicalStockGrams: 0 };
  let fetchError: string | null = null;

  try {
    [expenses, washEvents, inventory] = await Promise.all([
        getExpensesData(),
        getWashEventsData(),
        getInventory(),
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить финансовые данные.";
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalRevenue = washEvents.reduce((sum, event) => sum + (event.netAmount ?? event.totalAmount), 0);
  const profit = totalRevenue - totalExpenses;

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
                    <div className="category-badge">{expense.category}</div>
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