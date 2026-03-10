'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DateRange } from 'react-day-picker';
import { subDays, startOfDay, endOfDay, isWithinInterval, format, eachDayOfInterval } from 'date-fns';
import { ru } from 'date-fns/locale';

import type { WashEvent, Aggregator, CounterAgent, Employee, Expense, EmployeeTransaction } from "@/types";
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { ZorinPageHeader } from '@/components/dashboard/ZorinPageHeader';
import { ZorinMetricCard } from '@/components/dashboard/ZorinMetricCard';
import { ZorinCharts } from '@/components/dashboard/ZorinCharts';
import { ZorinRecentActivity } from '@/components/dashboard/ZorinRecentActivity';
import { ZorinEmployeePerformance } from '@/components/dashboard/ZorinEmployeePerformance';
import { ZorinProfitChart } from '@/components/dashboard/ZorinProfitChart';
import { ZorinChemicalChart } from '@/components/dashboard/ZorinChemicalChart';
import { RevenueDetailsDialog } from "./RevenueDetailsDialog";
import { ProfitDetailsDialog } from "./ProfitDetailsDialog";
import {
  TrendingUp,
  ShoppingCart,
  Scale,
  Users,
  Warehouse,
  Droplets
} from "lucide-react";
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ZorinDashboardClientProps {
  washEvents: WashEvent[];
  aggregators: Aggregator[];
  counterAgents: CounterAgent[];
  employees: Employee[];
  expenses: Expense[];
  inventory: { chemicalStockGrams: number };
  employeeTransactions: EmployeeTransaction[];
  dateRange: {
    from?: string;
    to?: string;
  };
}

const CHART_COLORS = {
  retail: "#0088cc",      // ZORIN primary blue
  aggregator: "#00d4ff",   // Light blue
  counterAgent: "#f59e0b", // Orange
  other: "#94a3b8",        // Gray
};

export function ZorinDashboardClient({
  washEvents: initialWashEvents,
  aggregators,
  counterAgents,
  employees,
  expenses: initialExpenses,
  inventory,
  employeeTransactions: initialEmployeeTransactions,
  dateRange: initialDateRange
}: ZorinDashboardClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>(() => {
    if (initialDateRange.from && initialDateRange.to) {
      return { from: new Date(initialDateRange.from), to: new Date(initialDateRange.to) };
    }
    return undefined;
  });

  // Set default date range on the client side to avoid hydration mismatch
  useEffect(() => {
    if (!selectedDateRange) {
      setSelectedDateRange({
        from: startOfDay(subDays(new Date(), 30)), // Last 30 days instead of 7
        to: endOfDay(new Date()),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Only update URL if a date range is selected
    if (selectedDateRange?.from) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('from', selectedDateRange.from.toISOString());
      if (selectedDateRange.to) {
        params.set('to', selectedDateRange.to.toISOString());
      } else {
        // If only 'from' is selected, 'to' is the same day.
        params.set('to', selectedDateRange.from.toISOString());
      }
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [selectedDateRange, pathname, router, searchParams]);

  const { filteredWashEvents, filteredExpenses, filteredEmployeeTransactions } = useMemo(() => {
    if (!selectedDateRange?.from) return { filteredWashEvents: [], filteredExpenses: [], filteredEmployeeTransactions: [] };
    const start = startOfDay(selectedDateRange.from);
    const end = endOfDay(selectedDateRange.to || selectedDateRange.from);

    const washEvents = initialWashEvents.filter(e => isWithinInterval(new Date(e.timestamp), { start, end }));
    const expenses = initialExpenses.filter(e => isWithinInterval(new Date(e.date), { start, end }));
    const employeeTransactions = initialEmployeeTransactions.filter(t => isWithinInterval(new Date(t.date), { start, end }));

    return { filteredWashEvents: washEvents, filteredExpenses: expenses, filteredEmployeeTransactions: employeeTransactions };
  }, [initialWashEvents, initialExpenses, initialEmployeeTransactions, selectedDateRange]);

  // --- Metrics Calculations ---
  const totalRevenue = filteredWashEvents.reduce((sum, event) => sum + (event.netAmount !== undefined ? event.netAmount : event.totalAmount), 0);
  const totalWashes = filteredWashEvents.length;

  const operationalExpenses = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const salaryPayments = filteredEmployeeTransactions
    .filter(t => t.type === 'payment' || t.type === 'bonus')
    .reduce((sum, t) => sum + t.amount, 0);

  // Chemical cost and consumption from wash events
  const chemicalCost = filteredWashEvents.reduce((sum, e) => sum + (e.chemicalCostRub ?? 0), 0);
  const chemicalConsumptionGrams = filteredWashEvents.reduce((sum, e) => sum + (e.chemicalConsumptionGrams ?? 0), 0);

  const totalExpenses = operationalExpenses + salaryPayments + chemicalCost;

  const profit = totalRevenue - totalExpenses;

  // Daily revenue chart data for the selected period
  const dailyRevenueData = useMemo(() => {
    if (!selectedDateRange?.from) return [];

    const start = selectedDateRange.from;
    const end = selectedDateRange.to || selectedDateRange.from;
    const intervalDays = eachDayOfInterval({ start, end });

    return intervalDays.map(day => {
      const dailyTotal = filteredWashEvents
        .filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd'))
        .reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0);
      return { date: format(day, 'dd MMM', { locale: ru }), revenue: dailyTotal };
    });
  }, [filteredWashEvents, selectedDateRange]);

  // Daily profit chart data
  const dailyProfitData = useMemo(() => {
    if (!selectedDateRange?.from) return [];

    const start = selectedDateRange.from;
    const end = selectedDateRange.to || selectedDateRange.from;
    const intervalDays = eachDayOfInterval({ start, end });

    return intervalDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');

      // Daily revenue
      const dailyRevenue = filteredWashEvents
        .filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0);

      // Daily chemical cost
      const dailyChemicalCost = filteredWashEvents
        .filter(e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, e) => sum + (e.chemicalCostRub ?? 0), 0);

      // Daily operational expenses
      const dailyOpEx = filteredExpenses
        .filter(e => format(new Date(e.date), 'yyyy-MM-dd') === dateStr)
        .reduce((sum, e) => sum + e.amount, 0);

      // Daily salary payments
      const dailySalary = filteredEmployeeTransactions
        .filter(t => format(new Date(t.date), 'yyyy-MM-dd') === dateStr && (t.type === 'payment' || t.type === 'bonus'))
        .reduce((sum, t) => sum + t.amount, 0);

      const dailyExpenses = dailyChemicalCost + dailyOpEx + dailySalary;

      return {
        date: format(day, 'dd MMM', { locale: ru }),
        revenue: dailyRevenue,
        expenses: dailyExpenses,
        profit: dailyRevenue - dailyExpenses
      };
    });
  }, [filteredWashEvents, filteredExpenses, filteredEmployeeTransactions, selectedDateRange]);

  // Daily chemical consumption chart data
  const dailyChemicalData = useMemo(() => {
    if (!selectedDateRange?.from) return [];

    const start = selectedDateRange.from;
    const end = selectedDateRange.to || selectedDateRange.from;
    const intervalDays = eachDayOfInterval({ start, end });

    return intervalDays.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd');

      const dayWashEvents = filteredWashEvents.filter(
        e => format(new Date(e.timestamp), 'yyyy-MM-dd') === dateStr
      );

      const consumptionGrams = dayWashEvents.reduce((sum, e) => sum + (e.chemicalConsumptionGrams ?? 0), 0);
      const costRub = dayWashEvents.reduce((sum, e) => sum + (e.chemicalCostRub ?? 0), 0);
      const washCount = dayWashEvents.length;

      return {
        date: format(day, 'dd MMM', { locale: ru }),
        consumptionGrams,
        costRub,
        washCount
      };
    });
  }, [filteredWashEvents, selectedDateRange]);

  const retailRevenue = filteredWashEvents
    .filter(e => e.paymentMethod === 'cash' || e.paymentMethod === 'card' || e.paymentMethod === 'transfer')
    .reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0);

  const aggregatorRevenue = filteredWashEvents
    .filter(e => e.paymentMethod === 'aggregator')
    .reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0);

  const counterAgentRevenue = filteredWashEvents
    .filter(e => e.paymentMethod === 'counterAgentContract')
    .reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0);

  const aggregatorDetails = aggregators.map((agg, index) => ({
    name: agg.name,
    value: filteredWashEvents.filter(e => e.sourceId === agg.id).reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0),
    fill: CHART_COLORS.aggregator
  })).filter(item => item.value > 0);

  const counterAgentDetails = counterAgents.map((agent, index) => ({
    name: agent.name,
    value: filteredWashEvents.filter(e => e.sourceId === agent.id).reduce((sum, e) => sum + (e.netAmount ?? e.totalAmount), 0),
    fill: CHART_COLORS.counterAgent
  })).filter(item => item.value > 0);

  const paymentTypeDistribution = [
    { name: "Розница", value: retailRevenue, fill: CHART_COLORS.retail },
    { name: "Агрегаторы", value: aggregatorRevenue, fill: CHART_COLORS.aggregator, details: aggregatorDetails },
    { name: "Контрагенты", value: counterAgentRevenue, fill: CHART_COLORS.counterAgent, details: counterAgentDetails },
  ].filter(item => item.value > 0);

  const latestWashes = filteredWashEvents.slice(0, 5);

  const periodDescription = useMemo(() => {
    const range = selectedDateRange;
    if (!range?.from) return "загрузка...";
    const from = format(range.from, "d MMM", { locale: ru });
    if (!range.to || format(range.from, 'yyyy-MM-dd') === format(range.to, 'yyyy-MM-dd')) {
      return `за ${from}`;
    }
    const to = format(range.to, "d MMM yyyy", { locale: ru });
    return `с ${from} по ${to}`;
  }, [selectedDateRange]);

  return (
    <div className="zorin-dashboard">
      <ZorinPageHeader
        title="Панель управления"
        description="Обзор операций вашей автомойки в реальном времени с аналитикой и инсайтами."
        actions={<DateRangePicker date={selectedDateRange} setDate={setSelectedDateRange} />}
      />

      {/* Metrics Grid */}
      <div className="zorin-dashboard-grid">
        <RevenueDetailsDialog
          washEvents={filteredWashEvents}
          employees={employees}
          paymentDistribution={{ retailRevenue, aggregatorRevenue, counterAgentRevenue }}
        >
          <ZorinMetricCard
            title="Общая выручка"
            value={totalRevenue.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
            subtitle={periodDescription}
            icon={TrendingUp}
            variant="primary"
          />
        </RevenueDetailsDialog>

        <ZorinMetricCard
          title="Всего расходов"
          value={totalExpenses.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
          subtitle={`ЗП ${salaryPayments.toLocaleString('ru-RU')} + химия ${chemicalCost.toLocaleString('ru-RU')} руб.`}
          icon={ShoppingCart}
          variant="danger"
        />

        <ProfitDetailsDialog
          washEvents={filteredWashEvents}
          expenses={filteredExpenses}
          employeeTransactions={filteredEmployeeTransactions}
        >
          <ZorinMetricCard
            title="Прибыль"
            value={profit.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
            subtitle="Выручка - Все расходы"
            icon={Scale}
            variant={profit >= 0 ? 'success' : 'warning'}
          />
        </ProfitDetailsDialog>

        <ZorinMetricCard
          title="Всего моек"
          value={totalWashes}
          subtitle={periodDescription}
          icon={Users}
          variant="info"
        />

        <Link href="/inventory" className="block">
          <ZorinMetricCard
            title="Остаток химии"
            value={`${(inventory.chemicalStockGrams / 1000).toFixed(2)} кг`}
            subtitle={chemicalConsumptionGrams > 0
              ? `Израсходовано: ${(chemicalConsumptionGrams / 1000).toFixed(2)} кг (${chemicalCost.toLocaleString('ru-RU')} руб.)`
              : "На складе"}
            icon={Droplets}
            variant="default"
          />
        </Link>
      </div>

      {/* Charts Section */}
      <ZorinCharts
        dailyRevenueData={dailyRevenueData}
        paymentTypeDistribution={paymentTypeDistribution}
      />

      {/* Profit Chart and Employee Performance Section */}
      <div className="zorin-charts-section">
        <ZorinProfitChart data={dailyProfitData} />
        <ZorinEmployeePerformance
          washEvents={filteredWashEvents}
          employees={employees}
        />
      </div>

      {/* Chemical Consumption Chart */}
      <div className="zorin-charts-section" style={{ gridTemplateColumns: '1fr' }}>
        <ZorinChemicalChart data={dailyChemicalData} />
      </div>

      {/* Recent Activity */}
      <ZorinRecentActivity
        washEvents={latestWashes}
        periodDescription={periodDescription}
      />
    </div>
  );
}
