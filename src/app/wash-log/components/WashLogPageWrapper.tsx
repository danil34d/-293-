"use client";

import { useState, useMemo } from 'react';
import type { WashEvent, Employee } from '@/types';
import { ZorinWashLogClient } from './ZorinWashLogClient';
import { TodaySummary } from './TodaySummary';
import { isToday, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

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

interface WashLogPageWrapperProps {
  initialWashEvents: WashEvent[];
  initialEmployees: Employee[];
}

export function WashLogPageWrapper({ initialWashEvents, initialEmployees }: WashLogPageWrapperProps) {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const ITEMS_PER_PAGE = 20;

  // Filter wash events based on all filters
  const filteredEvents = useMemo(() => {
    return initialWashEvents.filter(event => {
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
        const eventDate = new Date(event.timestamp);
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
    });
  }, [initialWashEvents, query, selectedEmployeeId, selectedPaymentMethod, dateRange]);

  // Итоги по отфильтрованным данным
  const filteredSummary = useMemo(() => {
    const totalWashes = filteredEvents.length;
    const totalRevenue = filteredEvents.reduce((sum, e) => sum + e.totalAmount, 0);
    const totalTips = filteredEvents.reduce((sum, e) => sum + (e.tips || 0), 0);
    const byPayment: Record<string, { count: number; amount: number }> = {};
    filteredEvents.forEach(e => {
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
    return initialWashEvents.filter(event => isToday(new Date(event.timestamp)));
  }, [initialWashEvents]);

  const todayReport = useMemo(() => {
    // Build simple report matching TodaySummary expectations
    const employeesWorkedToday = new Set<string>();

    todayEvents.forEach(event => {
      event.employeeIds?.forEach(id => employeesWorkedToday.add(id));
    });

    return Array.from(employeesWorkedToday).map(empId => {
      const empEvents = todayEvents.filter(e => e.employeeIds?.includes(empId));
      const totalPay = empEvents.reduce((sum, e) => {
        // Divide total amount by number of employees on that wash
        const empCount = e.employeeIds?.length || 1;
        return sum + (e.totalAmount / empCount);
      }, 0);

      return {
        grossPay: totalPay,
        completedWashes: empEvents.length
      };
    });
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
      <TodaySummary reportData={todayReport} />

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
