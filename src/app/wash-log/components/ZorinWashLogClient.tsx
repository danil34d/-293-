"use client";

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { isDismissedWashEvent, isRestoredWashEvent } from '@/lib/wash-event-status';
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
  Droplets,
  RotateCcw,
  Ban,
  Image as ImageIcon
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

interface CameraPreviewState {
  vehicleNumber: string;
  title: string;
  currentUrl: string | null;
  fallbackUrl: string | null;
}

function getDisplayDate(event: WashEvent): Date {
  const sourceValue = event.logTimeline?.entryAt || event.logTimeline?.exitAt || event.timestamp;
  const parsed = new Date(sourceValue);
  return Number.isNaN(parsed.getTime()) ? new Date(event.timestamp) : parsed;
}

function getDisplayExitDate(event: WashEvent): Date | null {
  if (!event.logTimeline?.exitAt) {
    return null;
  }

  const parsed = new Date(event.logTimeline.exitAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDurationShort(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) {
    return null;
  }

  const wholeSeconds = Math.round(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const restSeconds = wholeSeconds % 60;

  if (hours > 0) {
    return `${hours}ч ${minutes}м`;
  }

  if (minutes > 0) {
    return `${minutes}м ${restSeconds.toString().padStart(2, '0')}с`;
  }

  return `${restSeconds}с`;
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
  const router = useRouter();
  const { toast } = useToast();
  const employeeMap = new Map(employees.map(e => [e.id, e.fullName]));
  const [restoringEventId, setRestoringEventId] = useState<string | null>(null);
  const [cameraPreview, setCameraPreview] = useState<CameraPreviewState | null>(null);

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

  async function handleRestoreDismissed(event: WashEvent) {
    setRestoringEventId(event.id);
    try {
      const response = await fetch(`/api/wash-events/${event.id}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Не удалось прочитать запись перед восстановлением.');
      }

      const eventToUpdate = await response.json();
      const updateResponse = await fetch(`/api/wash-events/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...eventToUpdate,
          status: 'restored',
          restoration: {
            restoredAt: new Date().toISOString(),
          },
        }),
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json().catch(() => ({}));
        throw new Error(
          typeof errorData?.error === 'string'
            ? errorData.error
            : 'Не удалось вернуть запись в неоформленные машины.'
        );
      }

      toast({
        title: 'Запись возвращена',
        description: `Сессия ${event.vehicleNumber} снова может появиться в очереди на оформление.`,
      });
      router.refresh();
    } catch (error: any) {
      console.error('Failed to restore dismissed wash event:', error);
      toast({
        title: 'Не удалось вернуть запись',
        description: error?.message || 'Ошибка при восстановлении отменённой сессии.',
        variant: 'destructive',
      });
    } finally {
      setRestoringEventId(null);
    }
  }

  function getCameraMediaUrls(event: WashEvent) {
    const dirName = String(event.cameraSession?.dirName || '').trim();
    const boxNumber = event.cameraSession?.boxNumber || event.boxNumber;

    if (!dirName || !boxNumber) {
      return null;
    }

    const base = `/api/camera-session-media?box=${boxNumber}&dirName=${encodeURIComponent(dirName)}`;
    return {
      plateUrl: `${base}&kind=plate`,
      thumbnailUrl: `${base}&kind=thumbnail`,
    };
  }

  function openCameraPreview(event: WashEvent) {
    const urls = getCameraMediaUrls(event);
    if (!urls) {
      toast({
        title: 'Фото сессии недоступно',
        description: 'У этой записи нет привязки к камерной сессии.',
        variant: 'destructive',
      });
      return;
    }

    setCameraPreview({
      vehicleNumber: event.vehicleNumber,
      title: event.cameraSession?.dirName || 'Камерная сессия',
      currentUrl: urls.plateUrl,
      fallbackUrl: urls.thumbnailUrl,
    });
  }

  function handleCameraPreviewError() {
    setCameraPreview((prev) => {
      if (!prev) return prev;
      if (prev.currentUrl && prev.fallbackUrl && prev.currentUrl !== prev.fallbackUrl) {
        return { ...prev, currentUrl: prev.fallbackUrl, fallbackUrl: null };
      }
      return { ...prev, currentUrl: null, fallbackUrl: null };
    });
  }

  return (
    <div className="zorin-wash-log">
      <Dialog
        open={Boolean(cameraPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setCameraPreview(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Фото сессии {cameraPreview?.vehicleNumber ? `— ${cameraPreview.vehicleNumber}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {cameraPreview?.title && (
              <div className="text-sm text-muted-foreground">{cameraPreview.title}</div>
            )}
            {cameraPreview?.currentUrl ? (
              <img
                src={cameraPreview.currentUrl}
                alt={cameraPreview?.vehicleNumber || 'Фото сессии'}
                className="max-h-[70vh] w-full rounded-md border object-contain bg-slate-50"
                onError={handleCameraPreviewError}
              />
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Не удалось загрузить `plate.jpg` и `thumbnail.jpg` для этой сессии.
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Сначала пробуем `plate.jpg` после OCR. Если OCR-картинки ещё нет, показываем `thumbnail.jpg`,
              который сохраняется во время записи сессии.
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                const entryDate = getDisplayDate(event);
                const exitDate = getDisplayExitDate(event);
                const formattedDate = format(entryDate, 'dd.MM.yyyy HH:mm', { locale: ru });
                const cameraWashDuration = formatDurationShort(event.logTimeline?.washDurationSeconds);
                const cameraSessionDuration = formatDurationShort(event.logTimeline?.sessionDurationSeconds);
                const isDismissed = isDismissedWashEvent(event);
                const isRestored = isRestoredWashEvent(event);
                const clientName = isDismissed
                  ? 'Не мылась'
                  : isRestored
                    ? 'Возвращена в неоформленные'
                    : event.sourceName ? event.sourceName : paymentMethodTranslations[event.paymentMethod];
                const lastEdit = event.editHistory && event.editHistory.length > 0 ? event.editHistory[event.editHistory.length - 1] : null;
                const hasCameraSession = Boolean(getCameraMediaUrls(event));

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
                            {format(entryDate, 'dd.MM.yyyy', { locale: ru })}
                          </div>
                          <div className="zorin-date-time">
                            {format(entryDate, 'HH:mm', { locale: ru })}
                          </div>
                          {cameraWashDuration && (
                            <div className="text-[11px] text-blue-600 leading-tight mt-1">
                              Мылась: {cameraWashDuration}
                            </div>
                          )}
                          {!cameraWashDuration && cameraSessionDuration && (
                            <div className="text-[11px] text-slate-500 leading-tight mt-1">
                              Сессия: {cameraSessionDuration}
                            </div>
                          )}
                          {exitDate && (
                            <div className="text-[11px] text-slate-500 leading-tight">
                              Выехала: {format(exitDate, 'HH:mm', { locale: ru })}
                            </div>
                          )}
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
                        {hasCameraSession && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            onClick={() => openCameraPreview(event)}
                            title="Открыть фото камерной сессии"
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isDismissed && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                            <Ban className="mr-1 h-3 w-3" />
                            Не мылась
                          </span>
                        )}
                        {isRestored && (
                          <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Возвращена
                          </span>
                        )}
                      </div>
                      <div className="zorin-client-info">
                        <ClientTypeIcon method={event.paymentMethod} />
                        <span>{clientName}</span>
                      </div>
                      {event.dismissal && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Удалил: {event.dismissal.dismissedByEmployeeName || employeeMap.get(event.dismissal.dismissedByEmployeeId) || 'Неизвестно'} · {format(new Date(event.dismissal.dismissedAt), 'dd.MM HH:mm', { locale: ru })}
                        </div>
                      )}
                      {event.restoration?.restoredAt && (
                        <div className="mt-1 text-xs text-amber-700">
                          Возвращена в очередь: {format(new Date(event.restoration.restoredAt), 'dd.MM HH:mm', { locale: ru })}
                        </div>
                      )}
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
                      {isDismissed && (
                        <span className="text-xs text-rose-500 block">Заехала и уехала без мойки</span>
                      )}
                      {isRestored && (
                        <span className="text-xs text-amber-600 block">Возвращена в неоформленные</span>
                      )}
                      {event.refundedAt && (
                        <span className="text-xs text-red-500 block">Возврат</span>
                      )}
                      {event.tips && event.tips > 0 && (
                        <span className="text-xs text-amber-600 block">+{event.tips} чай.</span>
                      )}
                      {cameraWashDuration && (
                        <span className="text-xs text-blue-600 block">Время мойки: {cameraWashDuration}</span>
                      )}
                      {event.washDurationSeconds && event.washDurationSeconds > 0 && (
                        <span className="text-xs text-blue-500 block">
                          Таймер заказа: {Math.floor(event.washDurationSeconds / 60)}:{(event.washDurationSeconds % 60).toString().padStart(2, '0')}
                        </span>
                      )}
                    </td>

                    {/* Actions Cell */}
                    <td className="zorin-table-cell zorin-actions-cell">
                      <div className="zorin-action-buttons">
                        <EditConsumptionDialog event={event} employees={employees.filter(e => event.employeeIds.includes(e.id))} />
                        {isDismissed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="zorin-action-btn edit"
                            onClick={() => handleRestoreDismissed(event)}
                            disabled={restoringEventId === event.id}
                            title="Вернуть в неоформленные"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
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
