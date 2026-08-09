"use client";

import { useState, useMemo } from 'react';
import type { WashEvent, Employee } from '@/types';
import { ZorinWashLogClient } from './ZorinWashLogClient';
import { TodaySummary } from './TodaySummary';
import { isToday, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { isCompletedWashEvent } from '@/lib/wash-event-status';

// Normalize vehicle number: convert Cyrillic to Latin and uppercase
const cyrillicToLatin: Record<string, string> = {
  'А': 'A', 'а': 'A',
  'В': 'B', 'в': 'B',
  'Е': 'E', 'е': 'E',
  'К': 'K', 'к': 'K',
  'М': 'M', 'м': 'M',
  'Н': 'H', 'н': 'H',
  'О': 'O', 'о': 'O',
  'Р': 'P', 'р': 'P',
  'С': 'C', 'с': 'C',
  'Т': 'T', 'т': 'T',
  'У': 'Y', 'у': 'Y',
  'Х': 'X', 'х': 'X',
};

function normalizeVehicleNumber(input: string): string {
  return input
    .split('')
    .map(char => cyrillicToLatin[char] || char.toUpperCase())
    .join('');
}

function getEventTimelineDate(event: WashEvent): Date {
  const sourceValue = event.logTimeline?.entryAt || event.logTimeline?.exitAt || event.timestamp;
  const parsed = new Date(sourceValue);
  return Number.isNaN(parsed.getTime()) ? new Date(event.timestamp) : parsed;
}

export interface TodayEarning {
  employeeId: string;
  employeeName: string;
  totalEarnings: number;
  washes: number;
}

interface WashLogPageWrapperProps {
  initialWashEvents: WashEvent[];
  initialEmployees: Employee[];
  /** Настоящий заработок за сегодня по схемам, считается на сервере. */
  todayEarnings?: TodayEarning[];
}

export function WashLogPageWrapper({ initialWashEvents, initialEmployees, todayEarnings = [] }: WashLogPageWrapperProps) {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const ITEMS_PER_PAGE = 20;

  // Filter wash events based on all filters
  const filteredEvents = useMemo(() => {
    return initialWashEvents
      .filter(event => {
      // Text search filter (with vehicle number normalization)
        if (query.trim()) {
        const searchLower = query.trim().toLowerCase();
        const normalizedSearch = normalizeVehicleNumber(query.trim());
        const normalizedVehicle = normalizeVehicleNumber(event.vehicleNumber || '');

        // Search by vehicle number (normalized)
        const vehicleMatch = normalizedVehicle.includes(normalizedSearch);

        // Search by source name (aggregator or counter agent name)
        const sourceMatch = event.sourceName?.toLowerCase().includes(searchLower);

        // Search by payment method translation
        const paymentMethod = event.paymentMethod || '';
        const paymentTranslations: Record<string, string> = {
          cash: 'наличные',
          card: 'карта',
          transfer: 'перевод',
          aggregator: 'агрегатор',
          counterAgentContract: 'контрагент',
        };
        const paymentMatch = paymentTranslations[paymentMethod]?.includes(searchLower);

          if (!vehicleMatch && !sourceMatch && !paymentMatch) return false;
        }

      // Employee filter
        if (selectedEmployeeId !== 'all') {
          if (!event.employeeIds?.includes(selectedEmployeeId)) return false;
        }

      // Payment method filter
        if (selectedPaymentMethod !== 'all') {
          if (event.paymentMethod !== selectedPaymentMethod) return false;
        }

      // Date range filter
        if (dateRange?.from || dateRange?.to) {
          const eventDate = getEventTimelineDate(event);
          if (dateRange.from && dateRange.to) {
            if (!isWithinInterval(eventDate, {
              start: startOfDay(dateRange.from),
              end: endOfDay(dateRange.to)
            })) return false;
          } else if (dateRange.from) {
            if (eventDate < startOfDay(dateRange.from)) return false;
          } else if (dateRange.to) {
            if (eventDate > endOfDay(dateRange.to)) return false;
          }
        }

        return true;
      })
      .sort((left, right) => getEventTimelineDate(right).getTime() - getEventTimelineDate(left).getTime());
  }, [initialWashEvents, query, selectedEmployeeId, selectedPaymentMethod, dateRange]);

  // Итоги по отфильтрованным данным
  const filteredSummary = useMemo(() => {
    const completedEvents = filteredEvents.filter(isCompletedWashEvent);
    const totalWashes = completedEvents.length;
    const totalRevenue = completedEvents.reduce((sum, e) => sum + e.totalAmount, 0);
    const totalTips = completedEvents.reduce((sum, e) => sum + (e.tips || 0), 0);
    const byPayment: Record<string, { count: number; amount: number }> = {};
    completedEvents.forEach(e => {
      if (!byPayment[e.paymentMethod]) byPayment[e.paymentMethod] = { count: 0, amount: 0 };
      byPayment[e.paymentMethod].count++;
      byPayment[e.paymentMethod].amount += e.totalAmount;
    });
    return { totalWashes, totalRevenue, totalTips, byPayment };
  }, [filteredEvents]);

  // Pagination
  const totalPages = Math.ceil(filteredEvents.length / ITEMS_PER_PAGE);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEvents.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEvents, currentPage]);

  // Calculate today's summary
  const todayEvents = useMemo(() => {
    return initialWashEvents.filter(event => isToday(getEventTimelineDate(event)));
  }, [initialWashEvents]);

  // 🔥 ФИКС 2026-08-09: «Всего моек» ДВОИЛОСЬ. Считалось как сумма моек по
  // каждому сотруднику, поэтому мойка с двумя исполнителями попадала в итог
  // дважды: 09.08 в базе было 8 завершённых моек, а сводка показывала 15.
  // Средний чек следом врал: 835 ₽ вместо 1565 ₽. Выручка при этом сходилась
  // (доли делились на число исполнителей), из-за чего ошибку и не замечали.
  // Теперь мойки и выручка считаются по СОБЫТИЯМ, а не по людям.
  const todayTotals = useMemo(() => {
    const completed = todayEvents.filter(isCompletedWashEvent);
    const revenue = completed.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
    return {
      revenue,
      washes: completed.length,
      averageCheck: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
    };
  }, [todayEvents]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleQueryChange = (newQuery: string) => {
    // Keep original query - normalization happens in filter for vehicle numbers only
    setQuery(newQuery);
    setCurrentPage(1);
  };

  const handleEmployeeChange = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setCurrentPage(1);
  };

  const handleDateRangeChange = (range: DateRange | undefined) => {
    setDateRange(range);
    setCurrentPage(1);
  };

  const handlePaymentMethodChange = (method: string) => {
    setSelectedPaymentMethod(method);
    setCurrentPage(1);
  };

  return (
    <div className="wash-log">
      <TodaySummary totals={todayTotals} earnings={todayEarnings} />

      <ZorinWashLogClient
        washEvents={paginatedEvents}
        employees={initialEmployees}
        query={query}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        onQueryChange={handleQueryChange}
        selectedEmployeeId={selectedEmployeeId}
        onEmployeeChange={handleEmployeeChange}
        selectedPaymentMethod={selectedPaymentMethod}
        onPaymentMethodChange={handlePaymentMethodChange}
        dateRange={dateRange}
        onDateRangeChange={handleDateRangeChange}
        filteredSummary={filteredSummary}
      />
    </div>
  );
}
