'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, PlusCircle, Edit, Users, ListChecks, Cog, Scale, WalletCards, AlertTriangle, Archive, RotateCcw } from 'lucide-react';
import type { CounterAgent } from '@/types';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';

type CounterAgentsView = 'active' | 'archived' | 'all';

function getViewLabel(view: CounterAgentsView) {
  switch (view) {
    case 'archived': return 'архивных';
    case 'all': return 'всех';
    default: return 'активных';
  }
}

// Normalize text for search: lowercase, trim, remove extra spaces
function normalize(str: string | undefined | null): string {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Normalize plate number: remove spaces, convert Cyrillic to Latin for comparison
function normalizePlate(plate: string): string {
  const map: Record<string, string> = {
    'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h',
    'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
  };
  return plate.toLowerCase().replace(/\s+/g, '').split('').map(ch => map[ch] || ch).join('');
}

function agentMatchesSearch(agent: CounterAgent, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;

  // Search in agent name
  if (normalize(agent.name).includes(q)) return true;

  // Search in companies
  for (const company of agent.companies) {
    if (normalize(company.inn).includes(q)) return true;
    if (normalize(company.phone).includes(q)) return true;
    if (normalize(company.companyName).includes(q)) return true;
    if (normalize(company.customerName).includes(q)) return true;
    if (normalize(company.email).includes(q)) return true;
    if (normalize(company.kpp).includes(q)) return true;
    if (normalize(company.ownerName).includes(q)) return true;
  }

  // Search in cars (plate numbers)
  const normalizedQuery = normalizePlate(query);
  for (const car of agent.cars) {
    if (normalizePlate(car.licensePlate).includes(normalizedQuery)) return true;
  }

  return false;
}

interface CounterAgentsSearchProps {
  allAgents: CounterAgent[];
  initialView: CounterAgentsView;
  fetchError: string | null;
}

export default function CounterAgentsSearch({ allAgents, initialView, fetchError }: CounterAgentsSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<CounterAgentsView>(initialView);

  const sortedAgents = useMemo(() =>
    [...allAgents].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [allAgents]
  );

  const activeAgents = useMemo(() => sortedAgents.filter(a => !a.archived), [sortedAgents]);
  const archivedAgents = useMemo(() => sortedAgents.filter(a => a.archived), [sortedAgents]);

  const viewAgents = currentView === 'archived'
    ? archivedAgents
    : currentView === 'all'
      ? sortedAgents
      : activeAgents;

  const visibleAgents = useMemo(() =>
    viewAgents.filter(agent => agentMatchesSearch(agent, searchQuery)),
    [viewAgents, searchQuery]
  );

  // Count matched agents per view for tabs
  const activeCount = searchQuery
    ? activeAgents.filter(a => agentMatchesSearch(a, searchQuery)).length
    : activeAgents.length;
  const archivedCount = searchQuery
    ? archivedAgents.filter(a => agentMatchesSearch(a, searchQuery)).length
    : archivedAgents.length;
  const allCount = searchQuery
    ? sortedAgents.filter(a => agentMatchesSearch(a, searchQuery)).length
    : sortedAgents.length;

  return (
    <div className="counter-agents">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Контрагенты</h1>
            <p>Управляйте вашими корпоративными клиентами, их автопарками и индивидуальными прайс-листами.</p>
          </div>
          <Link href="/counter-agents/new" className="add-agent-btn">
            <PlusCircle className="h-4 w-4" />
            Добавить нового агента
          </Link>
        </div>

        {/* Search */}
        <div className="search-section">
          <div className="search-input-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Поиск по ИНН, номеру машины, телефону, названию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')}>
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="search-results-count">
              Найдено: {visibleAgents.length} из {viewAgents.length}
            </div>
          )}
        </div>

        {/* View tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCurrentView('active')}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${currentView === 'active' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
          >
            Активные ({activeCount})
          </button>
          <button
            onClick={() => setCurrentView('archived')}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${currentView === 'archived' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
          >
            Архив ({archivedCount})
          </button>
          <button
            onClick={() => setCurrentView('all')}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${currentView === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
          >
            Все ({allCount})
          </button>
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

      {/* Agents Table */}
      <div className="agents-table-card">
        <div className="overflow-x-auto">
          <table className="agents-table">
            <thead>
              <tr className="agents-table-header">
                <th className="w-[250px] min-w-[200px]">Имя агента</th>
                <th className="min-w-[400px]">Компании / Реквизиты</th>
                <th className="text-center">Машин</th>
                <th className="text-center">Услуг в прайсе</th>
                <th className="text-center">Баланс</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {!fetchError && visibleAgents.map((agent) => (
                <tr key={agent.id} className="agents-table-row">
                  <td className="agents-table-cell align-top">
                    <div className="agent-name">{highlightMatch(agent.name, searchQuery)}</div>
                    {agent.archived && (
                      <div className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        Архив
                      </div>
                    )}
                  </td>
                  <td className="agents-table-cell align-top">
                    <div className="company-details">
                      {agent.companies.map((company, index) => (
                        <div key={index}>
                          <p><strong>{highlightMatch(company.companyName || 'Компания не указана', searchQuery)}</strong></p>
                          {company.legalAddress && <p>Адрес: {company.legalAddress}</p>}
                          {company.inn && <p>ИНН: {highlightMatch(company.inn, searchQuery)}</p>}
                          {company.customerName && <p>Контакт: {highlightMatch(company.customerName, searchQuery)}</p>}
                          {company.phone && <p>Телефон: {highlightMatch(company.phone, searchQuery)}</p>}
                          {index < agent.companies.length - 1 && <div className="separator"></div>}
                        </div>
                      ))}
                    </div>

                    {/* Cars preview when searching by plate */}
                    {searchQuery && agent.cars.length > 0 && (() => {
                      const nq = normalizePlate(searchQuery);
                      const matchedCars = agent.cars.filter(c => normalizePlate(c.licensePlate).includes(nq));
                      if (matchedCars.length === 0) return null;
                      return (
                        <div className="settings-section">
                          <div className="settings-title">
                            <span>Найденные машины:</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {matchedCars.slice(0, 5).map((car, i) => (
                              <span key={i} className="badge primary">{car.licensePlate}</span>
                            ))}
                            {matchedCars.length > 5 && (
                              <span className="badge neutral">+{matchedCars.length - 5}</span>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {(agent.additionalPriceList && agent.additionalPriceList.length > 0) || (agent.allowCustomServices !== undefined) ? (
                      <div className="settings-section">
                        <div className="settings-title">
                          <Cog className="h-3 w-3" />
                          Произвольные доп. услуги:
                        </div>
                        <div className={`badge ${(agent.allowCustomServices === undefined || agent.allowCustomServices === true) ? 'success' : 'danger'}`}>
                          {(agent.allowCustomServices === undefined || agent.allowCustomServices === true) ? "Разрешены" : "Запрещены"}
                        </div>
                        {agent.additionalPriceList && agent.additionalPriceList.length > 0 && (
                          <ul className="services-list">
                            {agent.additionalPriceList.map(item => (
                              <li key={item.serviceName}>{item.serviceName} ({item.price} руб.)</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td className="agents-table-cell text-center align-top">
                    <div className="cars-count">{agent.cars.length}</div>
                  </td>
                  <td className="agents-table-cell text-center align-top">
                    {agent.priceList && agent.priceList.length > 0 ? (
                      <div className="services-count">
                        <ListChecks className="h-3 w-3" />
                        {agent.priceList.length}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="agents-table-cell text-center align-top">
                    <div className={`balance-display ${(agent.balance ?? 0) < 0 ? 'negative' : 'positive'}`}>
                      <Scale className="h-4 w-4"/>
                      <span>{(agent.balance ?? 0).toLocaleString('ru-RU')}</span>
                    </div>
                  </td>
                  <td className="agents-table-cell text-right align-top">
                    <div className="action-buttons">
                      <Link href={`/counter-agents/${agent.id}/finance`} className="action-btn" aria-label={`Финансы ${agent.name}`}>
                        <WalletCards className="h-4 w-4" />
                      </Link>
                      <Link href={`/counter-agents/${agent.id}/edit`} className="action-btn" aria-label={`Редактировать ${agent.name}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      {!agent.archived ? (
                        <DeleteConfirmationButton
                          apiPath="/api/counter-agents"
                          entityId={agent.id}
                          entityName={agent.name}
                          method="PATCH"
                          requestBody={{ archived: true }}
                          toastTitle="Контрагент архивирован"
                          toastDescription={`Контрагент "${agent.name}" перенесен в архив.`}
                          description={
                            <>Контрагент <strong>{agent.name}</strong> будет скрыт из активного списка, но все его данные и история сохранятся.</>
                          }
                          confirmLabel="В архив"
                          errorTitle="Ошибка архивации"
                          trigger={
                            <button className="action-btn" aria-label={`Архивировать ${agent.name}`}>
                              <Archive className="h-4 w-4" />
                            </button>
                          }
                        />
                      ) : (
                        <>
                          <DeleteConfirmationButton
                            apiPath="/api/counter-agents"
                            entityId={agent.id}
                            entityName={agent.name}
                            method="PATCH"
                            requestBody={{ archived: false }}
                            toastTitle="Контрагент восстановлен"
                            toastDescription={`Контрагент "${agent.name}" возвращен в активный список.`}
                            description={
                              <>Контрагент <strong>{agent.name}</strong> снова появится в активном списке и будет доступен для работы.</>
                            }
                            confirmLabel="Восстановить"
                            errorTitle="Ошибка восстановления"
                            trigger={
                              <button className="action-btn" aria-label={`Восстановить ${agent.name}`}>
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            }
                          />
                          <DeleteConfirmationButton
                            apiPath="/api/counter-agents"
                            entityId={agent.id}
                            entityName={agent.name}
                            toastTitle="Контрагент удален"
                            toastDescription={`Контрагент "${agent.name}" удален окончательно.`}
                            description={
                              <>Вы собираетесь безвозвратно удалить архивного контрагента <strong>{agent.name}</strong>. Это действие нельзя отменить.</>
                            }
                            trigger={
                              <button className="action-btn danger" aria-label={`Удалить ${agent.name}`}>
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            }
                          />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!fetchError && visibleAgents.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Users className="h-12 w-12" />
                      </div>
                      {searchQuery ? (
                        <>
                          <div className="empty-title">Ничего не найдено</div>
                          <div className="empty-subtitle">
                            Попробуйте изменить поисковый запрос или очистить фильтр.
                          </div>
                          <button onClick={() => setSearchQuery('')} className="empty-action-btn">
                            <X className="h-4 w-4 mr-2" style={{ display: 'inline' }} />
                            Очистить поиск
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="empty-title">Список {getViewLabel(currentView)} контрагентов пуст</div>
                          <div className="empty-subtitle">
                            {currentView === 'active'
                              ? 'Добавьте своего первого контрагента или откройте архив.'
                              : currentView === 'archived'
                                ? 'Архивных контрагентов пока нет.'
                                : 'Контрагенты пока не созданы.'}
                          </div>
                          {currentView !== 'archived' && (
                            <Link href="/counter-agents/new" className="empty-action-btn">
                              <PlusCircle className="h-4 w-4 mr-2" />
                              Добавить контрагента
                            </Link>
                          )}
                        </>
                      )}
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

// Highlight matching text in search results
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const q = query.toLowerCase().trim();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
