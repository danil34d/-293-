
export const dynamic = 'force-dynamic';

import "@/styles/transactions.css";
import Link from 'next/link';
import { PlusCircle, Edit, DollarSign, CreditCard, Landmark, ListChecks, Car, Users, AlertTriangle, Coins, Calculator } from 'lucide-react';
import type { WashEvent, PaymentType, Employee } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getWashEventsData, getEmployeesData } from '@/lib/data';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';


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


export default async function TransactionsPage() {
  let retailWashEvents: WashEvent[] = [];
  let employees: Employee[] = [];
  let fetchError: string | null = null;
  
  try {
    const [allWashEvents, allEmployees] = await Promise.all([
      getWashEventsData(),
      getEmployeesData()
    ]);
    retailWashEvents = allWashEvents.filter(event => 
      event.paymentMethod === 'cash' || event.paymentMethod === 'card' || event.paymentMethod === 'transfer'
    );
    employees = allEmployees;
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список транзакций.";
  }
  
  const employeeMap = new Map(employees.map(e => [e.id, e.fullName]));

  // Кассовая сверка — итоги по типам оплаты
  const cashTotal = retailWashEvents.filter(e => e.paymentMethod === 'cash' && !e.refundedAt).reduce((s, e) => s + e.totalAmount, 0);
  const cardTotal = retailWashEvents.filter(e => e.paymentMethod === 'card' && !e.refundedAt).reduce((s, e) => s + e.totalAmount, 0);
  const transferTotal = retailWashEvents.filter(e => e.paymentMethod === 'transfer' && !e.refundedAt).reduce((s, e) => s + e.totalAmount, 0);
  const totalTips = retailWashEvents.reduce((s, e) => s + (e.tips || 0), 0);
  const refundedCount = retailWashEvents.filter(e => e.refundedAt).length;
  const grandTotal = cashTotal + cardTotal + transferTotal;

  return (
    <div className="transactions">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Розничные транзакции</h1>
            <p>Отслеживайте платежи от прямых клиентов (наличные, карта, перевод).</p>
          </div>
        </div>
      </div>

      {/* Кассовая сверка */}
      {!fetchError && retailWashEvents.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div style={{ flex: '1', minWidth: '140px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign className="h-3 w-3" /> Наличные
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#15803d' }}>{cashTotal.toLocaleString('ru-RU')} р.</div>
          </div>
          <div style={{ flex: '1', minWidth: '140px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CreditCard className="h-3 w-3" /> Карта
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#1d4ed8' }}>{cardTotal.toLocaleString('ru-RU')} р.</div>
          </div>
          <div style={{ flex: '1', minWidth: '140px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: '#7c3aed', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Landmark className="h-3 w-3" /> Перевод
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#6d28d9' }}>{transferTotal.toLocaleString('ru-RU')} р.</div>
          </div>
          {totalTips > 0 && (
            <div style={{ flex: '1', minWidth: '140px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '12px 16px' }}>
              <div style={{ fontSize: '12px', color: '#d97706', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Coins className="h-3 w-3" /> Чаевые
              </div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#b45309' }}>{totalTips.toLocaleString('ru-RU')} р.</div>
            </div>
          )}
          <div style={{ flex: '1', minWidth: '140px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', color: '#475569', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calculator className="h-3 w-3" /> Итого
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>{grandTotal.toLocaleString('ru-RU')} р.</div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{retailWashEvents.length} транзакций{refundedCount > 0 ? ` (${refundedCount} возвр.)` : ''}</div>
          </div>
        </div>
      )}

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

      {/* Transactions Table */}
      <div className="transactions-table-card">
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
              {!fetchError && retailWashEvents.map((transaction) => {
                  const formattedDate = format(new Date(transaction.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru });
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
                        {transaction.employeeIds.map(id => (
                            <span key={id} className="employee-badge">
                              {employeeMap.get(id)?.split(' ')[0] || 'Неизв.'}
                            </span>
                        ))}
                      </div>
                    </td>
                    <td className="transactions-table-cell text-right">
                      <div className={`amount-display${transaction.refundedAt ? ' line-through text-red-400' : ''}`}>{transaction.totalAmount.toFixed(2)} руб.</div>
                      {transaction.refundedAt && <div style={{ fontSize: '11px', color: '#ef4444' }}>Возврат</div>}
                      {transaction.tips && transaction.tips > 0 && <div style={{ fontSize: '11px', color: '#d97706' }}>+{transaction.tips} чай.</div>}
                    </td>
                    <td className="transactions-table-cell text-right">
                      <div className="action-buttons">
                        <Link href={`/wash-log/${transaction.id}/edit`} className="action-btn" aria-label={`Редактировать мойку ${transaction.id}`}>
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
                              Вы собираетесь безвозвратно удалить транзакцию для машины <strong className="vehicle-number">{transaction.vehicleNumber}</strong> от <strong>{formattedDate}</strong>.
                              Это действие нельзя отменить.
                            </>
                          }
                          trigger={
                            <button className="action-btn danger" aria-label={`Удалить транзакцию ${transaction.id}`}>
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                      <div className="empty-title">Транзакции не найдены</div>
                      <div className="empty-subtitle">Зарегистрируйте розничную мойку на рабочей станции, и она появится здесь.</div>
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
