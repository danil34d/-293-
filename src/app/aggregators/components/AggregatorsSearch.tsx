'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, X, PlusCircle, Edit, Star, Briefcase, WalletCards, Scale, AlertTriangle, Archive, RotateCcw, Zap, Car as CarIcon, ListChecks, Calendar as CalendarIcon, HandCoins } from 'lucide-react';
import type { Aggregator, NamedPriceList } from '@/types';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { SetActivePriceButton } from './SetActivePriceButton';
import { SwitchPriceModal } from './SwitchPriceModal';
import { SafetyBar } from '@/components/admin';

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU');
}

type AggregatorsView = 'active' | 'archived' | 'all';

function normalize(str: string | undefined | null): string {
  return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizePlate(plate: string | undefined | null): string {
  if (!plate) return '';
  const map: Record<string, string> = {
    '\u0430': 'a', '\u0432': 'b', '\u0435': 'e', '\u043a': 'k', '\u043c': 'm', '\u043d': 'h',
    '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0442': 't', '\u0443': 'y', '\u0445': 'x',
  };
  return plate.toLowerCase().replace(/\s+/g, '').split('').map(ch => map[ch] || ch).join('');
}

function aggregatorMatchesSearch(agg: Aggregator, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;

  if (normalize(agg.name).includes(q)) return true;

  for (const company of (agg.companies || [])) {
    if (normalize(company.inn).includes(q)) return true;
    if (normalize(company.phone).includes(q)) return true;
    if (normalize(company.companyName).includes(q)) return true;
    if (normalize(company.customerName).includes(q)) return true;
  }

  const normalizedQuery = normalizePlate(query);
  for (const car of (agg.cars || [])) {
    if (normalizePlate(car.licensePlate).includes(normalizedQuery)) return true;
  }

  return false;
}

function getActivePriceList(aggregator: Aggregator): NamedPriceList | null {
  if (!aggregator.priceLists || aggregator.priceLists.length === 0) return null;
  return aggregator.priceLists.find(pl => pl.name === aggregator.activePriceListName) || aggregator.priceLists[0];
}

interface AggregatorsSearchProps {
  allAggregators: Aggregator[];
  fetchError: string | null;
}

export default function AggregatorsSearch({ allAggregators, fetchError }: AggregatorsSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<AggregatorsView>('active');
  // Phase 27a: state модала смены прайса — в parent чтобы не закрывался
  // вместе с popover при клике на «Сделать активным»
  const [switchTarget, setSwitchTarget] = useState<{ aggregator: Aggregator; priceListName: string } | null>(null);

  const sortedAggregators = useMemo(() =>
    [...allAggregators].sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [allAggregators]
  );

  const activeAggregators = useMemo(() => sortedAggregators.filter(a => !a.archived), [sortedAggregators]);
  const archivedAggregators = useMemo(() => sortedAggregators.filter(a => a.archived), [sortedAggregators]);

  const viewAggregators = currentView === 'archived'
    ? archivedAggregators
    : currentView === 'all'
      ? sortedAggregators
      : activeAggregators;

  const visibleAggregators = useMemo(() =>
    viewAggregators.filter(agg => aggregatorMatchesSearch(agg, searchQuery)),
    [viewAggregators, searchQuery]
  );

  const activeCount = searchQuery
    ? activeAggregators.filter(a => aggregatorMatchesSearch(a, searchQuery)).length
    : activeAggregators.length;
  const archivedCount = searchQuery
    ? archivedAggregators.filter(a => aggregatorMatchesSearch(a, searchQuery)).length
    : archivedAggregators.length;
  const allCount = searchQuery
    ? sortedAggregators.filter(a => aggregatorMatchesSearch(a, searchQuery)).length
    : sortedAggregators.length;

  // Phase 27b: KPI tiles aggregation from active aggregators
  const kpi = useMemo(() => {
    const active = sortedAggregators.filter(a => !a.archived);
    const debt = active.filter(a => Number(a.balance ?? 0) < 0);
    const totalDebt = debt.reduce((s, a) => s + Number(a.balance ?? 0), 0);
    const totalCars = active.reduce((s, a) => s + (a.cars?.length ?? 0), 0);
    const totalPriceLists = active.reduce((s, a) => s + (a.priceLists?.length ?? 0), 0);
    return {
      activeCount: active.length,
      archivedCount: sortedAggregators.length - active.length,
      debtCount: debt.length,
      totalDebt,
      totalCars,
      totalPriceLists,
    };
  }, [sortedAggregators]);

  return (
    <div className="aggregators">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <div className="text-[10px] uppercase tracking-wider font-bold text-amber-600 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3 h-3" /> Смена активного прайса меняет расчёт для всех будущих моек
            </div>
            <h1>Агрегаторы</h1>
            <p>Партнёры-маркетплейсы (Яндекс, ДС). Они присылают клиентов и платят процент.</p>
          </div>
          <Link href="/aggregators/new" className="add-aggregator-btn">
            <PlusCircle className="h-4 w-4" />
            Добавить нового агрегатора
          </Link>
        </div>

        {/* Phase 27b: SafetyBar */}
        <div className="mt-4">
          <SafetyBar
            level={kpi.debtCount > 0 ? 'warn' : 'info'}
            items={[
              { icon: 'zap', label: 'Активных', value: `${kpi.activeCount}` },
              { icon: 'car', label: 'Машин в автопарках', value: `${kpi.totalCars}` },
              { icon: 'alert-triangle', label: 'Долги',
                value: kpi.debtCount > 0 ? `${kpi.debtCount} · ${formatMoney(kpi.totalDebt)} ₽` : '—' },
            ]}
          />
        </div>

        {/* Phase 27b: 4 KPI tiles */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTileAg label="Агрегаторов" value={`${kpi.activeCount}`}
            sub={kpi.archivedCount > 0 ? `+${kpi.archivedCount} в архиве` : 'архив пуст'}
            Icon={Zap} color="#0088CC" />
          <KpiTileAg label="Машин" value={`${kpi.totalCars}`}
            sub={kpi.activeCount > 0 ? `~${Math.round(kpi.totalCars / kpi.activeCount)} на агрегатор` : '—'}
            Icon={CarIcon} color="#8b5cf6" />
          <KpiTileAg label="С долгом" value={`${kpi.debtCount}`}
            sub={kpi.debtCount > 0 ? `${formatMoney(kpi.totalDebt)} ₽` : 'все в нуле'}
            Icon={AlertTriangle} color={kpi.debtCount > 0 ? "#f59e0b" : "#94a3b8"} />
          <KpiTileAg label="Прайс-листов" value={`${kpi.totalPriceLists}`}
            sub={`всего вариантов цен`}
            Icon={ListChecks} color="#10b981" />
        </div>

        {/* Search */}
        <div className="search-section" style={{ marginTop: '1rem' }}>
          <div className="search-input-wrapper">
            <Search className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Поиск по названию, ИНН, номеру машины..."
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
              Найдено: {visibleAggregators.length} из {viewAggregators.length}
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
              {!fetchError && visibleAggregators.map((aggregator) => {
                const activePriceList = getActivePriceList(aggregator);
                return (
                <tr key={aggregator.id} className="aggregators-table-row">
                  <td className="aggregators-table-cell align-top">
                    <div className="aggregator-name">{aggregator.name}</div>
                    {aggregator.archived && (
                      <div className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                        Архив
                      </div>
                    )}
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
                                  <h4 style={{ margin: 0 }}>Прайс-лист &quot;{pl.name}&quot;</h4>
                                  <SetActivePriceButton
                                    aggregator={aggregator}
                                    priceListName={pl.name}
                                    isActive={activePriceList?.name === pl.name}
                                    onRequestSwitch={(agg, name) => setSwitchTarget({ aggregator: agg, priceListName: name })}
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
                    <div className={`balance-display ${(aggregator.balance ?? 0) < 0 ? 'negative' : (aggregator.balance ?? 0) === 0 ? '' : 'positive'}`}>
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
                      {!aggregator.archived ? (
                        <DeleteConfirmationButton
                          apiPath="/api/aggregators"
                          entityId={aggregator.id}
                          entityName={aggregator.name}
                          method="PATCH"
                          requestBody={{ archived: true }}
                          toastTitle="Агрегатор архивирован"
                          toastDescription={`Агрегатор "${aggregator.name}" перенесен в архив.`}
                          description={
                            <>Агрегатор <strong>{aggregator.name}</strong> будет скрыт из активного списка, но все его данные и история сохранятся.</>
                          }
                          confirmLabel="В архив"
                          errorTitle="Ошибка архивации"
                          trigger={
                            <button className="action-btn" aria-label={`Архивировать ${aggregator.name}`}>
                              <Archive className="h-4 w-4" />
                            </button>
                          }
                        />
                      ) : (
                        <>
                          <DeleteConfirmationButton
                            apiPath="/api/aggregators"
                            entityId={aggregator.id}
                            entityName={aggregator.name}
                            method="PATCH"
                            requestBody={{ archived: false }}
                            toastTitle="Агрегатор восстановлен"
                            toastDescription={`Агрегатор "${aggregator.name}" возвращен в активный список.`}
                            description={
                              <>Агрегатор <strong>{aggregator.name}</strong> снова появится в активном списке и будет доступен для работы.</>
                            }
                            confirmLabel="Восстановить"
                            errorTitle="Ошибка восстановления"
                            trigger={
                              <button className="action-btn" aria-label={`Восстановить ${aggregator.name}`}>
                                <RotateCcw className="h-4 w-4" />
                              </button>
                            }
                          />
                          <DeleteConfirmationButton
                            apiPath="/api/aggregators"
                            entityId={aggregator.id}
                            entityName={aggregator.name}
                            toastTitle="Агрегатор удален"
                            toastDescription={`Агрегатор "${aggregator.name}" удален окончательно.`}
                            description={
                              <>Вы собираетесь безвозвратно удалить архивного агрегатора <strong>{aggregator.name}</strong>. Это действие нельзя отменить.</>
                            }
                            trigger={
                              <button className="action-btn danger" aria-label={`Удалить ${aggregator.name}`}>
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
              )})}
              {!fetchError && visibleAggregators.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <Briefcase className="h-12 w-12" />
                      </div>
                      {searchQuery ? (
                        <>
                          <div className="empty-title">Ничего не найдено</div>
                          <div className="empty-subtitle">Попробуйте изменить поисковый запрос.</div>
                          <button onClick={() => setSearchQuery('')} className="empty-action-btn">
                            <X className="h-4 w-4 mr-2" style={{ display: 'inline' }} />
                            Очистить поиск
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="empty-title">Агрегаторы ��е найдены</div>
                          <div className="empty-subtitle">Добавьте своего первого агрегатора</div>
                          <Link href="/aggregators/new" className="empty-action-btn">
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Добавить агрегатора
                          </Link>
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

      {/* Phase 27a: SwitchPriceModal — рендерится в parent чтобы не unmount-иться с popover */}
      <SwitchPriceModal
        aggregator={switchTarget?.aggregator ?? null}
        targetPriceListName={switchTarget?.priceListName ?? null}
        open={!!switchTarget}
        onOpenChange={(o) => { if (!o) setSwitchTarget(null); }}
      />
    </div>
  );
}

// Phase 27b: KPI tile with icon — same pattern as CounterAgentsSearch
function KpiTileAg({ label, value, sub, Icon, color }: {
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
