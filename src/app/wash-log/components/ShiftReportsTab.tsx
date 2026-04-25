"use client";

import { useMemo, useState } from 'react';
import type { Employee } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, DollarSign, Car } from 'lucide-react';

interface ShiftReportRecord {
  id: string;
  date?: string;
  shiftType?: string;
  boxNumber?: number;
  shiftId?: string;
  createdAt?: string;
  startedAt?: string;
  closedAt?: string;
  employeeIds?: string[];
  employeeNames?: string[];
  totalWashes?: number;
  totalAmount?: number;
  data?: {
    shiftId?: string;
    employeeIds?: string[];
    employeeNames?: string[];
    startedAt?: string;
    closedAt?: string;
    totalWashes?: number;
    totalAmount?: number;
  };
}

interface NormalizedShiftReport {
  id: string;
  date: string;
  shiftType: string;
  boxNumber: number;
  employeeIds: string[];
  employeeNames: string[];
  startedAt: string;
  closedAt: string;
  totalWashes: number;
  totalAmount: number;
  sortTimestamp: number;
  durationMs: number | null;
  isTechnicalEmptyKiosk: boolean;
  isComputed: boolean;
}

interface ShiftReportsTabProps {
  reports: ShiftReportRecord[];
  employees: Employee[];
}

const TECHNICAL_EMPTY_KIOSK_SHIFT_MS = 15 * 60 * 1000;

function parseTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const parsed = parseTimestamp(iso);
  if (parsed === null) return '—';

  return new Date(parsed).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) {
    return '—';
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}ч ${String(minutes).padStart(2, '0')}м`;
  }

  if (minutes > 0) {
    return `${minutes}м ${String(seconds).padStart(2, '0')}с`;
  }

  return `${seconds}с`;
}

function deriveDate(report: ShiftReportRecord): string {
  if (report.date) return report.date;

  const fallback = report.data?.closedAt || report.closedAt || report.data?.startedAt || report.startedAt || report.createdAt || '';
  return fallback ? fallback.slice(0, 10) : '';
}

export function ShiftReportsTab({ reports, employees }: ShiftReportsTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach((employee) => map.set(employee.id, employee));
    return map;
  }, [employees]);

  const normalizedReports = useMemo<NormalizedShiftReport[]>(() => {
    return reports.map((report) => {
      const startedAt = report.data?.startedAt || report.startedAt || '';
      const closedAt = report.data?.closedAt || report.closedAt || '';
      const employeeIds = report.data?.employeeIds || report.employeeIds || [];
      const employeeNames = report.data?.employeeNames || report.employeeNames || [];
      const totalWashes = report.data?.totalWashes ?? report.totalWashes ?? 0;
      const totalAmount = report.data?.totalAmount ?? report.totalAmount ?? 0;
      const startedTs = parseTimestamp(startedAt);
      const closedTs = parseTimestamp(closedAt);
      const sortTimestamp = closedTs ?? startedTs ?? parseTimestamp(report.createdAt) ?? 0;
      const durationMs = startedTs !== null && closedTs !== null ? Math.max(0, closedTs - startedTs) : null;
      const kioskOnly = employeeIds.length > 0 && employeeIds.every((employeeId) => employeeMap.get(employeeId)?.role === 'kiosk');

      const isComputed = report.id.startsWith('computed_');

      return {
        id: report.id,
        date: deriveDate(report),
        shiftType: report.shiftType || 'day',
        boxNumber: report.boxNumber || 1,
        employeeIds,
        employeeNames,
        startedAt,
        closedAt,
        totalWashes,
        totalAmount,
        sortTimestamp,
        durationMs,
        isTechnicalEmptyKiosk: kioskOnly
          && totalWashes === 0
          && totalAmount === 0
          && durationMs !== null
          && durationMs <= TECHNICAL_EMPTY_KIOSK_SHIFT_MS,
        isComputed,
      };
    });
  }, [employeeMap, reports]);

  const monthReports = useMemo(() => {
    return normalizedReports
      .filter((report) => report.date.startsWith(selectedMonth))
      .sort((left, right) => right.sortTimestamp - left.sortTimestamp);
  }, [normalizedReports, selectedMonth]);

  const hiddenTechnicalCount = useMemo(() => (
    monthReports.filter((report) => report.isTechnicalEmptyKiosk).length
  ), [monthReports]);

  const filteredReports = useMemo(() => (
    monthReports.filter((report) => !report.isTechnicalEmptyKiosk)
  ), [monthReports]);

  const summary = useMemo(() => {
    let totalWashes = 0;
    let totalAmount = 0;
    filteredReports.forEach((report) => {
      totalWashes += report.totalWashes || 0;
      totalAmount += report.totalAmount || 0;
    });

    return {
      totalShifts: filteredReports.length,
      totalWashes,
      totalAmount,
    };
  }, [filteredReports]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Месяц:</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {hiddenTechnicalCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Скрыто {hiddenTechnicalCount} техническ{hiddenTechnicalCount === 1 ? 'ая' : 'ие'} пуст{hiddenTechnicalCount === 1 ? 'ая' : 'ые'} смен{hiddenTechnicalCount === 1 ? 'а' : 'ы'} терминала без моек и выручки.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            Всего смен
          </div>
          <div className="text-2xl font-bold">{summary.totalShifts}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
            <Car className="h-4 w-4" />
            Всего моек
          </div>
          <div className="text-2xl font-bold">{summary.totalWashes}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
            <DollarSign className="h-4 w-4" />
            Общая выручка
          </div>
          <div className="text-2xl font-bold">{summary.totalAmount.toLocaleString('ru-RU')} ₽</div>
        </div>
      </div>

      {filteredReports.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
          Нет нормальных отчётов по сменам за выбранный период
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Дата</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Тип</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Бокс</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Сотрудники</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Время</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Моек</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Выручка</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => {
                const visibleEmployees = report.employeeIds.filter((employeeId) => employeeMap.get(employeeId)?.role !== 'kiosk');
                const employeeIdsToRender = visibleEmployees.length > 0 ? visibleEmployees : report.employeeIds;

                return (
                  <tr key={report.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">{formatDate(report.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge variant={report.shiftType === 'day' ? 'default' : 'secondary'}>
                          {report.shiftType === 'day' ? 'День' : 'Ночь'}
                        </Badge>
                        {report.isComputed && (
                          <span className="text-[10px] text-gray-400">расписание</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">Бокс {report.boxNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {employeeIdsToRender.length > 0 ? employeeIdsToRender.map((employeeId, index) => {
                          const employee = employeeMap.get(employeeId);
                          const fallbackName = report.employeeNames[index];
                          return (
                            <Badge key={`${report.id}-${employeeId}-${index}`} variant="outline" className="text-xs">
                              {employee?.fullName || fallbackName || employeeId.slice(0, 8)}
                            </Badge>
                          );
                        }) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {report.isComputed && !report.startedAt ? (
                        <div className="text-xs text-gray-400">
                          По расписанию: {report.shiftType === 'day' ? '08:00 — 20:00' : '20:00 — 08:00'}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(report.startedAt)} — {formatTime(report.closedAt)}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            Длительность: {formatDuration(report.durationMs)}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{report.totalWashes}</td>
                    <td className="px-4 py-3 text-right font-medium">{(report.totalAmount || 0).toLocaleString('ru-RU')} ₽</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
