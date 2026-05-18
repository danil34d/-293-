'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, PlusCircle, Edit, Users, ListChecks, Cog, Scale, WalletCards, AlertTriangle, Archive, RotateCcw, HandCoins, Building2, Car as CarIcon, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { CounterAgent } from '@/types';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { SafetyBar } from '@/components/admin';
import { PaymentModal } from './PaymentModal';
import { ExpandedCounterAgent } from './ExpandedCounterAgent';

type BalanceFilter = 'all' | 'prepaid' | 'debt';

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU');
}

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
function normalizePlate(plate: string | undefined | null): string {
  if (!plate) return '';
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
  for (const company of (agent.companies || [])) {
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
  for (const car of (agent.cars || [])) {
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
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all');
  const [paymentTarget, setPaymentTarget] = useState<CounterAgent | null>(null);
  // Phase 34: inline-expand state — id раскрытого контрагента (null = ничего не раскрыто)
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const visibleAgents = useMemo(() => {
    return viewAgents.filter(agent => {
      if (!agentMatchesSearch(agent, searchQuery)) return false;
      const bal = Number(agent.balance ?? 0);
      if (balanceFilter === 'prepaid' && bal <= 0) return false;
      if (balanceFilter === 'debt' && bal >= 0) return false;
      return true;
    });
  }, [viewAgents, searchQuery, balanceFilter]);

  // Count matched agents per view for tabs (без balance фильтра — таб всегда показывает фактический total)
  const activeCount = searchQuery
    ? activeAgents.filter(a => agentMatchesSearch(a, searchQuery)).length
    : activeAgents.length;
  const archivedCount = searchQuery
    ? archivedAgents.filter(a => agentMatchesSearch(a, searchQuery)).length
    : archivedAgents.length;
  const allCount = searchQuery
    ? sortedAgents.filter(a => agentMatchesSearch(a, searchQuery)).length
    : sortedAgents.length;

  // Phase 25b: aggregate KPI tiles from active agents (Predoplate / Debt / Cars)
  const kpi = useMemo(() => {
    const prepaid = activeAgents.filter(a => Number(a.balance ?? 0) > 0);
    const debt    = activeAgents.filter(a => Number(a.balance ?? 0) < 0);
    const totalPrepaid = prepaid.reduce((s, a) => s + Number(a.balance ?? 0), 0);
    const totalDebt    = debt.reduce((s, a) => s + Number(a.balance ?? 0), 0); // отрицательное
    const totalCars    = activeAgents.reduce((s, a) => s + (a.cars?.length ?? 0), 0);
    return {
      activeCount: activeAgents.length,
      prepaidCount: prepaid.length,
      debtCount: debt.length,
      totalPrepaid,
      totalDebt,
      totalCars,
    };
  }, [activeAgents]);

  // Counts по balance-фильтрам — для пилов
  const filterCounts = useMemo(() => ({
    all: viewAgents.filter(a => agentMatchesSearch(a, searchQuery)).length,
    prepaid: viewAgents.filter(a => agentMatchesSearch(a, searchQuery) && Number(a.balance ?? 0) > 0).length,
    debt: viewAgents.filter(a => agentMatchesSearch(a, searchQuery) && Number(a.balance ?? 0) < 0).length,
  }), [viewAgents, searchQuery]);

  return (
    <div className="counter-agents">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <div className="text-[10px] uppercase tracking-wider font-bold text-amber-600 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3 h-3" /> Правка баланса только через «Добавить платёж» (audit-trail)
            </div>
            <h1>Контрагенты</h1>
            <p>Управляйте вашими корпоративными клиентами, их автопарками и индивидуальными прайс-листами.</p>
          </div>
          <Link href="/counter-agents/new" className="add-agent-btn">
            <PlusCircle className="h-4 w-4" />
            Добавить нового агента
          </Link>
        </div>

        {/* Phase 25b: SafetyBar — overview state */}
        <div className="mt-4">
          <SafetyBar
            level={kpi.debtCount > 0 ? 'warn' : 'info'}
            items={[
              { icon: 'building-2', label: 'Активных', value: `${kpi.activeCount}` },
              { icon: 'hand-coins', label: 'Предоплата',
                value: kpi.prepaidCount > 0 ? `${kpi.prepaidCount} · +${formatMoney(kpi.totalPrepaid)} ₽` : '—' },
              { icon: 'alert-triangle', label: 'Долги',
                value: kpi.debtCount > 0 ? `${kpi.debtCount} · ${formatMoney(kpi.totalDebt)} ₽` : '—' },
            ]}
          />
        </div>

        {/* Phase 25b: 4 KPI tiles */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile label="Всего активных" value={`${kpi.activeCount}`}
            sub={archivedAgents.length > 0 ? `+${archivedAgents.length} в архиве` : 'архив пуст'}
            Icon={Building2} color="#0088CC" />
          <KpiTile label="С предоплатой" value={`${kpi.prepaidCount}`}
            sub={`+${formatMoney(kpi.totalPrepaid)} ₽`}
            Icon={HandCoins} color="#10b981" />
          <KpiTile label="С долгом" value={`${kpi.debtCount}`}
            sub={`${formatMoney(kpi.totalDebt)} ₽`}
            Icon={AlertTriangle} color={kpi.debtCount > 0 ? "#f59e0b" : "#94a3b8"} />
          <KpiTile label="Машин в автопарках" value={`${kpi.totalCars}`}
            sub={kpi.activeCount > 0 ? `~${Math.round(kpi.totalCars / kpi.activeCount)} на агента` : '—'}
            Icon={CarIcon} color="#8b5cf6" />
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

        {/* Phase 25b: Balance filter row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Баланс:</span>
          {(['all', 'prepaid', 'debt'] as const).map(id => {
            const labels: Record<typeof id, string> = {
              all: 'Все балансы',
              prepaid: 'С предоплатой',
              debt: 'С долгом',
            };
            const counts: Record<typeof id, number> = filterCounts;
            const isActive = balanceFilter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setBalanceFilter(id)}
                className={`rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#0088CC] text-white border-[#0088CC]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {labels[id]}
                <span className={`text-[10px] ${isActive ? 'opacity-80' : 'opacity-60'}`}>{counts[id]}</span>
              </button>
            );
          })}
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
              {!fetchError && visibleAgents.map((agent) => {
                const bal = Number(agent.balance ?? 0);
                const isDebt = bal < 0;
                const isExpanded = expandedId === agent.id;
                return (
                <React.Fragment key={agent.id}>
                <tr
                  className="agents-table-row cursor-pointer"
                  style={
                    isExpanded
                      ? { background: 'rgba(239, 246, 255, 0.85)' }
                      : isDebt && !agent.archived
                      ? { background: 'rgba(254, 242, 242, 0.5)' }
                      : undefined
                  }
                  onClick={(e) => {
                    // Не раскрывать при клике на actions ячейку (кнопки внутри)
                    const target = e.target as HTMLElement;
                    if (target.closest('.action-buttons') || target.closest('a') || target.closest('button')) return;
                    setExpandedId(isExpanded ? null : agent.id);
                  }}>
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
                      {/* Phase 34: chevron toggle */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : agent.id); }}
                        className="action-btn"
                        style={{ color: '#64748b' }}
                        aria-label={isExpanded ? 'Свернуть карточку' : 'Раскрыть карточку'}
                        title={isExpanded ? 'Свернуть' : 'Раскрыть карточку'}
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {!agent.archived && (
                        <button
                          type="button"
                          onClick={() => setPaymentTarget(agent)}
                          className="action-btn"
                          style={{ color: '#10b981' }}
                          aria-label={`Добавить платёж для ${agent.name}`}
                          title="Добавить платёж (audit-trail)"
                        >
                          <HandCoins className="h-4 w-4" />
                        </button>
                      )}
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
                {isExpanded && (
                  <tr>
                    <td colSpan={6} className="agents-table-cell" style={{ background: 'rgba(248, 250, 252, 0.8)', padding: '12px 16px' }}>
                      <ExpandedCounterAgent
                        agent={agent}
                        onPay={() => setPaymentTarget(agent)}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
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

      {/* Phase 25b: PaymentModal — записывает ClientTransaction(type='payment') с audit-меткой */}
      <PaymentModal
        agent={paymentTarget}
        open={!!paymentTarget}
        onOpenChange={(o) => { if (!o) setPaymentTarget(null); }}
        onPaymentRecorded={() => {
          // soft refresh — обновим страницу чтобы balance актуализировался из БД
          if (typeof window !== 'undefined') window.location.reload();
        }}
      />
    </div>
  );
}

// Phase 25b: KPI tile с иконкой
function KpiTile({ label, value, sub, Icon, color }: {
  label: string;
  value: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{label}</div>
          <div className="text-[22px] font-extrabold tabular-nums mt-1" style={{ color }}>{value}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: color + '15', color }}>
          <Icon className="h-4 w-4" />
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
