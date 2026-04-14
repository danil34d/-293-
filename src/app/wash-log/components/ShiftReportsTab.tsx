"use client";

import { useState, useMemo } from 'react';
import type { Employee } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users, DollarSign, Car } from 'lucide-react';

interface ShiftReport {
  id: string;
  date: string;
  shiftType: string;
  boxNumber: number;
  shiftId?: string;
  data: {
    shiftId: string;
    employeeIds: string[];
    startedAt: string;
    closedAt: string;
    totalWashes: number;
    totalAmount: number;
    byPaymentMethod?: Record<string, { count: number; amount: number }>;
    chemicalConsumptionGrams?: number;
  };
  createdAt: string;
}

interface ShiftReportsTabProps {
  reports: ShiftReport[];
  employees: Employee[];
}

export function ShiftReportsTab({ reports, employees }: ShiftReportsTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(e => map.set(e.id, e.fullName));
    return map;
  }, [employees]);

  // Normalize: old reports may not have 'date', derive from closedAt
  const normalizedReports = useMemo(() => {
    return reports.map(r => {
      if (r.date) return r;
      // Derive date from closedAt or createdAt
      const fallback = r.data?.closedAt || r.createdAt || '';
      const derived = fallback ? fallback.slice(0, 10) : '';
      return { ...r, date: derived };
    });
  }, [reports]);

  const filteredReports = useMemo(() => {
    return normalizedReports.filter(r => r.date?.startsWith(selectedMonth));
  }, [normalizedReports, selectedMonth]);

  const summary = useMemo(() => {
    let totalWashes = 0;
    let totalAmount = 0;
    filteredReports.forEach(r => {
      totalWashes += r.data.totalWashes || 0;
      totalAmount += r.data.totalAmount || 0;
    });
    return { totalShifts: filteredReports.length, totalWashes, totalAmount };
  }, [filteredReports]);

  const formatTime = (iso: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch { return '—'; }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-6">
      {/* Month selector */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Месяц:</label>
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Calendar className="h-4 w-4" />
            Всего смен
          </div>
          <div className="text-2xl font-bold">{summary.totalShifts}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Car className="h-4 w-4" />
            Всего моек
          </div>
          <div className="text-2xl font-bold">{summary.totalWashes}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <DollarSign className="h-4 w-4" />
            Общая выручка
          </div>
          <div className="text-2xl font-bold">{summary.totalAmount.toLocaleString('ru-RU')} ₽</div>
        </div>
      </div>

      {/* Reports table */}
      {filteredReports.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          Нет отчётов по сменам за выбранный период
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Тип</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Бокс</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Сотрудники</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Время</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Моек</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Выручка</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{formatDate(report.date)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={report.shiftType === 'day' ? 'default' : 'secondary'}>
                      {report.shiftType === 'day' ? 'День' : 'Ночь'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">Бокс {report.boxNumber}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {report.data.employeeIds?.map(eid => (
                        <Badge key={eid} variant="outline" className="text-xs">
                          {employeeMap.get(eid) || eid.slice(0, 8)}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTime(report.data.startedAt)} — {formatTime(report.data.closedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{report.data.totalWashes}</td>
                  <td className="px-4 py-3 text-right font-medium">{(report.data.totalAmount || 0).toLocaleString('ru-RU')} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
