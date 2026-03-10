"use client";

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { WashEvent, Employee, SalaryScheme, WashComment } from '@/types';
import { format, isToday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { Pagination } from '@/components/common/Pagination';
import { normalizeLicensePlate } from '@/lib/utils';
import { EditConsumptionDialog } from './EditConsumptionDialog';
import { CommentDialog } from '@/components/common/CommentDialog';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRange } from 'react-day-picker';
import {
  BookCheck,
  Briefcase,
  Users,
  DollarSign,
  Edit,
  Wand,
  Car,
  CreditCard,
  Landmark,
  History,
  MessageSquare,
  Printer,
  Search,
  Calendar,
  Droplets
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilteredSummary {
  totalWashes: number;
  totalRevenue: number;
  totalTips: number;
  byPayment: Record<string, { count: number; amount: number }>;
}

interface ZorinWashLogClientProps {
  washEvents: WashEvent[];
  employees: Employee[];
  query: string;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onQueryChange: (query: string) => void;
  selectedEmployeeId: string;
  onEmployeeChange: (employeeId: string) => void;
  selectedPaymentMethod: string;
  onPaymentMethodChange: (method: string) => void;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  filteredSummary: FilteredSummary;
}

const paymentMethodTranslations: Record<WashEvent['paymentMethod'], string> = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
  aggregator: 'Агрегатор',
  counterAgentContract: 'Контрагент',
};

const ClientTypeIcon = ({ method }: { method: WashEvent['paymentMethod'] }) => {
  switch(method) {
    case 'cash': return <DollarSign className="h-4 w-4 text-green-500" />;
    case 'card': return <CreditCard className="h-4 w-4 text-blue-500" />;
    case 'transfer': return <Landmark className="h-4 w-4 text-purple-500" />;
    case 'aggregator': return <Briefcase className="h-4 w-4 text-indigo-500" />;
    case 'counterAgentContract': return <Users className="h-4 w-4 text-orange-500" />;
    default: return <DollarSign className="h-4 w-4" />;
  }
};

export function ZorinWashLogClient({
  washEvents,
  employees,
  query,
  currentPage,
  totalPages,
  onPageChange,
  onQueryChange,
  selectedEmployeeId,
  onEmployeeChange,
  selectedPaymentMethod,
  onPaymentMethodChange,
  dateRange,
  onDateRangeChange,
  filteredSummary
}: ZorinWashLogClientProps) {
  const employeeMap = new Map(employees.map(e => [e.id, e.fullName]));

  const paginatedEvents = washEvents;

  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="zorin-wash-log">
      {/* Print date - hidden on screen, shown on print */}
      <div className="print-date" style={{ display: 'none' }}>
        Дата печати: {currentDate}
      </div>
      {/* Filters Section */}
      <div className="zorin-filters-section">
        <div className="zorin-filters-row">
          {/* Search */}
          <div className="zorin-filter-item zorin-search-wrapper">
            <Search className="zorin-search-icon" />
            <input
              type="text"
              placeholder="Поиск по номеру, клиенту..."
              className="zorin-search-input"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </div>

          {/* Date Range */}
          <div className="zorin-filter-item">
            <DateRangePicker
              date={dateRange}
              setDate={onDateRangeChange}
            />
          </div>

          {/* Employee Filter */}
          <div className="zorin-filter-item">
            <Select value={selectedEmployeeId} onValueChange={onEmployeeChange}>
              <SelectTrigger className="w-[200px]">
                <Users className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Все сотрудники" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все сотрудники</SelectItem>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method Filter */}
          <div className="zorin-filter-item">
            <Select value={selectedPaymentMethod} onValueChange={onPaymentMethodChange}>
              <SelectTrigger className="w-[180px]">
                <DollarSign className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Все оплаты" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все оплаты</SelectItem>
                <SelectItem value="cash">Наличные</SelectItem>
                <SelectItem value="card">Карта</SelectItem>
                <SelectItem value="transfer">Перевод</SelectItem>
                <SelectItem value="aggregator">Агрегатор</SelectItem>
                <SelectItem value="counterAgentContract">Контрагент</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Print Button */}
          <div className="zorin-filter-item">
            <Button variant="outline" onClick={handlePrint} className="print-hidden">
              <Printer className="mr-2 h-4 w-4" />
              Печать
            </Button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="zorin-table-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="zorin-table-header">
                <th className="w-[110px]">Дата</th>
                <th>Клиент / Машина</th>
                <th>Услуги</th>
                <th>Исполнители</th>
                <th className="text-right">Сумма</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEvents.map((event) => {
                const formattedDate = format(new Date(event.timestamp), 'dd.MM.yyyy HH:mm', { locale: ru });
                const clientName = event.sourceName ? event.sourceName : paymentMethodTranslations[event.paymentMethod];
                const lastEdit = event.editHistory && event.editHistory.length > 0 ? event.editHistory[event.editHistory.length - 1] : null;

                return (
                  <tr key={event.id} className="zorin-table-row">
                    {/* Date Cell */}
                    <td className="zorin-table-cell zorin-date-cell">
                      <div className="flex items-start gap-1.5">
                        {lastEdit && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="zorin-date-icon history">
                                  <History className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="zorin-tooltip">
                                <p>Запись была изменена {event.editHistory?.length} раз(а).</p>
                                <p>Последнее изменение: {format(new Date(lastEdit.editedAt), 'dd.MM.yy HH:mm')}
                                   ({employeeMap.get(lastEdit.editedBy) || 'Неизвестно'})
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <div>
                          <div className="zorin-date-main">
                            {format(new Date(event.timestamp), 'dd.MM.yyyy', { locale: ru })}
                          </div>
                          <div className="zorin-date-time">
                            {format(new Date(event.timestamp), 'HH:mm', { locale: ru })}
                          </div>
                        </div>
                        <div className="zorin-date-icons">
                          {(event.driverComments && event.driverComments.length > 0) && (
                            <CommentDialog
                              event={event}
                              employeeMap={employeeMap}
                              trigger={
                                <div className="zorin-date-icon comment">
                                  <MessageSquare className="h-3 w-3" />
                                </div>
                              }
                            />
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Client/Vehicle Cell */}
                    <td className="zorin-table-cell zorin-client-cell">
                      <div className="zorin-vehicle-number">
                        <Car className="zorin-vehicle-icon" />
                        <span className="font-mono">{event.vehicleNumber}</span>
                      </div>
                      <div className="zorin-client-info">
                        <ClientTypeIcon method={event.paymentMethod} />
                        <span>{clientName}</span>
                      </div>
                    </td>

                    {/* Services Cell */}
                    <td className="zorin-table-cell zorin-services-cell">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="zorin-main-service">
                              <span className="truncate">{event.services.main.serviceName}</span>
                              {event.services.main.isCustom && (
                                <div className="zorin-custom-badge">
                                  <Wand className="h-3 w-3 mr-1" />
                                  Новая
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="zorin-tooltip">
                            <p>{event.services.main.serviceName}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      {event.services.additional.length > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="zorin-additional-services">
                                <div className="zorin-additional-badge">
                                  +{event.services.additional.length} доп. услуг(и)
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="zorin-popover">
                              <div className="zorin-popover-content">
                                <p className="zorin-popover-title">Дополнительные услуги:</p>
                                <ul className="zorin-popover-list">
                                  {event.services.additional.map((s, i) => (
                                    <li key={i} className="zorin-popover-item">
                                      <span>{s.serviceName}</span>
                                      {s.isCustom && (
                                        <div className="zorin-custom-badge">
                                          <Wand className="h-3 w-3 mr-1" />
                                          Новая
                                        </div>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      {/* Chemical consumption display */}
                      {event.chemicalConsumptionGrams && event.chemicalConsumptionGrams > 0 && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                <Droplets className="h-3 w-3" />
                                <span>{event.chemicalConsumptionGrams} гр.</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="zorin-tooltip">
                              <p>Расход химии: {event.chemicalConsumptionGrams} гр.</p>
                              {event.chemicalCostRub && (
                                <p>Стоимость: {event.chemicalCostRub.toFixed(2)} руб.</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </td>

                    {/* Employees Cell */}
                    <td className="zorin-table-cell zorin-employees-cell">
                      <div className="zorin-employee-badges">
                        {event.employeeIds.map(id => (
                          <span key={id} className="zorin-employee-badge">
                            {employeeMap.get(id)?.split(' ')[0] || 'Неизв.'}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Amount Cell */}
                    <td className="zorin-table-cell zorin-amount-cell">
                      <span className={cn("zorin-amount-value", event.refundedAt && "line-through text-red-400")}>
                        {event.totalAmount.toLocaleString('ru-RU')} руб.
                      </span>
                      {event.refundedAt && (
                        <span className="text-xs text-red-500 block">Возврат</span>
                      )}
                      {event.tips && event.tips > 0 && (
                        <span className="text-xs text-amber-600 block">+{event.tips} чай.</span>
                      )}
                      {event.washDurationSeconds && event.washDurationSeconds > 0 && (
                        <span className="text-xs text-blue-500 block">
                          {Math.floor(event.washDurationSeconds / 60)}:{(event.washDurationSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </td>

                    {/* Actions Cell */}
                    <td className="zorin-table-cell zorin-actions-cell">
                      <div className="zorin-action-buttons">
                        <EditConsumptionDialog event={event} employees={employees.filter(e => event.employeeIds.includes(e.id))} />
                        <Button variant="ghost" size="icon" asChild className="zorin-action-btn edit">
                          <Link href={`/wash-log/${event.id}/edit`} aria-label={`Редактировать мойку`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DeleteConfirmationButton
                          apiPath="/api/wash-events"
                          entityId={event.id}
                          entityName={`${event.vehicleNumber} от ${formattedDate}`}
                          toastTitle="Запись о мойке удалена"
                          toastDescription={`Запись о мойке для машины ${event.vehicleNumber} от ${formattedDate} успешно удалена.`}
                          description={
                            <>
                              Вы собираетесь безвозвратно удалить запись о мойке для машины <strong className="font-mono text-foreground">{event.vehicleNumber}</strong> от <strong className="text-foreground">{formattedDate}</strong>.
                              Это действие нельзя отменить.
                            </>
                          }
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        {filteredSummary.totalWashes > 0 && (
          <div className="zorin-summary-footer" style={{ padding: '16px 20px', borderTop: '2px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', fontSize: '14px' }}>
            <div style={{ fontWeight: 600 }}>
              Итого: {filteredSummary.totalWashes} {filteredSummary.totalWashes === 1 ? 'мойка' : filteredSummary.totalWashes < 5 ? 'мойки' : 'моек'}
            </div>
            <div style={{ fontWeight: 700, color: '#16a34a' }}>
              {filteredSummary.totalRevenue.toLocaleString('ru-RU')} руб.
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {filteredSummary.byPayment.cash && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  <DollarSign className="h-3 w-3 text-green-600" /> {filteredSummary.byPayment.cash.count} — {filteredSummary.byPayment.cash.amount.toLocaleString('ru-RU')} р.
                </span>
              )}
              {filteredSummary.byPayment.card && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#dbeafe', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  <CreditCard className="h-3 w-3 text-blue-600" /> {filteredSummary.byPayment.card.count} — {filteredSummary.byPayment.card.amount.toLocaleString('ru-RU')} р.
                </span>
              )}
              {filteredSummary.byPayment.transfer && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#f3e8ff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  <Landmark className="h-3 w-3 text-purple-600" /> {filteredSummary.byPayment.transfer.count} — {filteredSummary.byPayment.transfer.amount.toLocaleString('ru-RU')} р.
                </span>
              )}
              {filteredSummary.byPayment.aggregator && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  <Briefcase className="h-3 w-3 text-indigo-600" /> {filteredSummary.byPayment.aggregator.count} — {filteredSummary.byPayment.aggregator.amount.toLocaleString('ru-RU')} р.
                </span>
              )}
              {filteredSummary.byPayment.counterAgentContract && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffedd5', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>
                  <Users className="h-3 w-3 text-orange-600" /> {filteredSummary.byPayment.counterAgentContract.count} — {filteredSummary.byPayment.counterAgentContract.amount.toLocaleString('ru-RU')} р.
                </span>
              )}
            </div>
            {filteredSummary.totalTips > 0 && (
              <span style={{ color: '#d97706', fontWeight: 500 }}>
                Чаевые: {filteredSummary.totalTips.toLocaleString('ru-RU')} р.
              </span>
            )}
          </div>
        )}

        {/* Empty State */}
        {paginatedEvents.length === 0 && (
          <div className="zorin-empty-state">
            <div className="zorin-empty-icon">
              <BookCheck size={40} />
            </div>
            <h3 className="zorin-empty-title">
              {query ? `По запросу "${query}" ничего не найдено.` : 'Журнал моек пуст.'}
            </h3>
            <p className="zorin-empty-subtitle">
              {query ? 'Попробуйте другой поисковый запрос.' : 'Зарегистрируйте первую мойку на рабочей станции.'}
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="zorin-pagination">
            <Pagination currentPage={currentPage} totalPages={totalPages} />
          </div>
        )}
      </div>
    </div>
  );
}