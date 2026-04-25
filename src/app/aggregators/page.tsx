
export const dynamic = 'force-dynamic';

import "@/styles/aggregators.css";
import Link from 'next/link';
import { PlusCircle, Edit, Star, Briefcase, WalletCards, Scale, AlertTriangle } from 'lucide-react';
import type { Aggregator, NamedPriceList } from '@/types';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { getAggregatorsData } from '@/lib/data';
import { SetActivePriceButton } from './components/SetActivePriceButton';


export default async function AggregatorsPage() {
  let aggregators: Aggregator[] = [];
  let fetchError: string | null = null;

  try {
    aggregators = await getAggregatorsData();
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список агрегаторов.";
  }
  
  const getActivePriceList = (aggregator: Aggregator): NamedPriceList | null => {
    if (!aggregator.priceLists || aggregator.priceLists.length === 0) return null;
    return aggregator.priceLists.find(pl => pl.name === aggregator.activePriceListName) || aggregator.priceLists[0];
  }
  
  return (
    <div className="aggregators">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Агрегаторы</h1>
            <p>Управляйте вашими партнерствами с агрегаторами и их ценами.</p>
          </div>
          <Link href="/aggregators/new" className="add-aggregator-btn">
            <PlusCircle className="h-4 w-4" />
            Добавить нового агрегатора
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

      {/* Aggregators Table */}
      <div className="aggregators-table-card">
        <div className="overflow-x-auto">
          <table className="aggregators-table">
            <thead>
              <tr className="aggregators-table-header">
                <th className="w-[450px]">Название агрегатора / Реквизиты</th>
                <th className="text-center">Кол-во машин</th>
                <th>Прайс-листы</th>
                <th className="text-center">Баланс</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
                      <tbody>
              {!fetchError && aggregators.map((aggregator) => {
                const activePriceList = getActivePriceList(aggregator);
                return (
                <tr key={aggregator.id} className="aggregators-table-row">
                  <td className="aggregators-table-cell align-top">
                    <div className="aggregator-name">{aggregator.name}</div>
                    <div className="company-details">
                      {(aggregator.companies || []).map((company, index) => (
                        <div key={index}>
                          {company.companyName && <p><strong>{company.companyName}</strong></p>}
                          {company.legalAddress && <p>Адрес: {company.legalAddress}</p>}
                          {company.inn && <p>ИНН: {company.inn}</p>}
                          {company.customerName && <p>Контакт: {company.customerName}</p>}
                          {company.phone && <p>Телефон: {company.phone}</p>}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="aggregators-table-cell text-center align-top">
                    <div className="cars-count">{aggregator.cars.length}</div>
                  </td>
                  <td className="aggregators-table-cell align-top">
                    {aggregator.priceLists && aggregator.priceLists.length > 0 ? (
                      <div className="price-lists-popover">
                        <button className="price-lists-trigger">
                          <span>{aggregator.priceLists.length} прайс-листов</span>
                          {activePriceList && (
                            <div className="active-price-badge">
                              <Star className="h-3 w-3 text-yellow-500" />
                              Активен: {activePriceList.name} ({activePriceList.services.length} услуг)
                            </div>
                          )}
                        </button>
                        <div className="popover-content">
                           <div className="tabs">
                             <div className="tabs-list">
                               {aggregator.priceLists.map(pl => (
                                 <button key={pl.name} className="tabs-trigger">{pl.name}</button>
                               ))}
                             </div>
                             {aggregator.priceLists.map(pl => (
                              <div key={pl.name} className="tabs-content">
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                  <h4 style={{ margin: 0 }}>Прайс-лист "{pl.name}"</h4>
                                  <SetActivePriceButton
                                    aggregatorId={aggregator.id}
                                    priceListName={pl.name}
                                    isActive={activePriceList?.name === pl.name}
                                  />
                                </div>
                                <div className="scroll-area">
                                  <div className="price-list-items">
                                      {pl.services.map(p => (
                                          <div key={p.serviceName} className="price-list-item">
                                              <span className="price-list-name">{p.serviceName}</span>
                                              <span className="price-list-price">{p.price} руб.</span>
                                          </div>
                                      ))}
                                      {pl.services.length === 0 && <div className="empty-price-list">В этом прайс-листе нет услуг.</div>}
                                  </div>
                                </div>
                              </div>
                             ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Прайс-листы не заданы</span>
                    )}
                  </td>
                  <td className="aggregators-table-cell text-center align-top">
                    <div className={`balance-display ${(aggregator.balance ?? 0) < 0 ? 'negative' : 'positive'}`}>
                      <Scale className="h-4 w-4"/>
                      <span>{(aggregator.balance ?? 0).toLocaleString('ru-RU')}</span>
                    </div>
                  </td>
                  <td className="aggregators-table-cell text-right align-top">
                    <div className="action-buttons">
                      <Link href={`/aggregators/${aggregator.id}/finance`} className="action-btn" aria-label={`Финансы ${aggregator.name}`}>
                        <WalletCards className="h-4 w-4" />
                      </Link>
                      <Link href={`/aggregators/${aggregator.id}/edit`} className="action-btn" aria-label={`Редактировать ${aggregator.name}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      <DeleteConfirmationButton
                        apiPath="/api/aggregators"
                        entityId={aggregator.id}
                        entityName={aggregator.name}
                        toastTitle="Агрегатор удален"
                        toastDescription={`Агрегатор "${aggregator.name}" успешно удален.`}
                        description={
                          <>
                            Вы собираетесь безвозвратно удалить агрегатора <strong>{aggregator.name}</strong>.
                            Это действие нельзя отменить.
                          </>
                        }
                        trigger={
                          <button className="action-btn danger" aria-label={`Удалить ${aggregator.name}`}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              )})}
              {!fetchError && aggregators.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Briefcase className="h-12 w-12" />
                      </div>
                      <div className="empty-title">Агрегаторы не найдены</div>
                      <div className="empty-subtitle">Добавьте своего первого агрегатора</div>
                      <Link href="/aggregators/new" className="empty-action-btn">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Добавить агрегатора
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
