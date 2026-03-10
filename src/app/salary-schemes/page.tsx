
export const dynamic = 'force-dynamic';

import "@/styles/salary-schemes.css";
import Link from 'next/link';
import { PlusCircle, Edit, Wallet, Percent, ListTodo, Globe, AlertTriangle } from 'lucide-react';
import type { SalaryScheme, Aggregator, CounterAgent } from '@/types';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { getSalarySchemesData, getAggregatorsData, getCounterAgentsData } from '@/lib/data-loader';


export default async function SalarySchemesPage() {
  let schemes: SalaryScheme[] = [];
  let aggregators: Aggregator[] = [];
  let counterAgents: CounterAgent[] = [];
  let fetchError: string | null = null;

  try {
    [schemes, aggregators, counterAgents] = await Promise.all([
      getSalarySchemesData(),
      getAggregatorsData(),
      getCounterAgentsData(),
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить данные.";
  }

  // Helper function to dynamically find the source name
  const getRateSourceName = (scheme: SalaryScheme): string => {
    const source = scheme.rateSource;
    if (!source) return 'Все прайс-листы (Универсальная)';

    if (source.type === 'retail') {
      return 'Розничный прайс-лист (Наличка)';
    }
    if (source.type === 'counterAgent') {
      const agent = counterAgents.find(a => a.id === source.id);
      return agent?.name || 'Не найден';
    }
    if (source.type === 'aggregator') {
      const aggregator = aggregators.find(a => a.id === source.id);
      if (!aggregator) return 'Не найден';
      return `${aggregator.name} (${source.priceListName || 'Активный'})`;
    }
    return 'Неизвестный источник';
  };


  return (
    <div className="salary-schemes">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Схемы зарплат</h1>
            <p>Управляйте схемами расчета зарплаты для сотрудников.</p>
          </div>
          <Link href="/salary-schemes/new" className="add-scheme-btn">
            <PlusCircle className="h-4 w-4" />
            Создать схему
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

      {/* Schemes Table */}
      <div className="schemes-table-card">
        <div className="overflow-x-auto">
          <table className="schemes-table">
            <thead>
              <tr className="schemes-table-header">
                <th>Название схемы</th>
                <th>Тип</th>
                <th>Значение</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
                    <tbody>
              {!fetchError && schemes.map((scheme) => (
                <tr key={scheme.id} className="schemes-table-row">
                  <td className="schemes-table-cell">
                    <div className="scheme-name">{scheme.name}</div>
                  </td>
                  <td className="schemes-table-cell">
                     <div className="scheme-type-badge">
                      {scheme.type === 'percentage' ? (
                        <>
                         <Percent className="h-3 w-3" /> Процент
                        </>
                      ) : (
                        <>
                         <ListTodo className="h-3 w-3" /> Ставка
                        </>
                      )}
                     </div>
                  </td>
                  <td className="schemes-table-cell">
                    {scheme.type === 'percentage'
                      ? (
                        <div className="scheme-details">
                          {scheme.percentage}% от выручки {scheme.fixedDeduction && <span>(вычет <strong>{scheme.fixedDeduction} руб.</strong>)</span>}
                        </div>
                      )
                      : (
                          <div className="scheme-details with-icon">
                              {!scheme.rateSource && <Globe className="h-4 w-4" />}
                              <span>{scheme.rates?.length || 0} услуг по ставке из "<strong>{getRateSourceName(scheme)}</strong>"</span>
                          </div>
                        )
                    }
                  </td>
                  <td className="schemes-table-cell text-right">
                    <div className="action-buttons">
                      <Link href={`/salary-schemes/${scheme.id}/edit`} className="action-btn" aria-label={`Редактировать ${scheme.name}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      <DeleteConfirmationButton
                        apiPath="/api/salary-schemes"
                        entityId={scheme.id}
                        entityName={scheme.name}
                        toastTitle="Схема удалена"
                        toastDescription={`Схема "${scheme.name}" успешно удалена.`}
                        description={
                          <>
                            Вы собираетесь безвозвратно удалить схему зарплаты <strong>{scheme.name}</strong>.
                            Это действие нельзя отменить.
                          </>
                        }
                        trigger={
                          <button className="action-btn danger" aria-label={`Удалить ${scheme.name}`}>
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
              {!fetchError && schemes.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Wallet className="h-12 w-12" />
                      </div>
                      <div className="empty-title">Схемы зарплат не найдены</div>
                      <div className="empty-subtitle">Создайте свою первую схему</div>
                      <Link href="/salary-schemes/new" className="empty-action-btn">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Создать схему
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
