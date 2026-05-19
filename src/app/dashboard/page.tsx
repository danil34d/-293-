
export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getWashEventsData, getAggregatorsData, getCounterAgentsData, getEmployeesData, getExpensesData, getInventory, getAllEmployeeTransactions } from '@/lib/data';
import { ZorinDashboardClient } from './components/ZorinDashboardClient';
import { DashboardAlertStrip } from './components/DashboardAlertStrip';
import { DashboardHeroKpi } from './components/DashboardHeroKpi';
import { DashboardPeriodSwitcher } from './components/DashboardPeriodSwitcher';

async function fetchData() {
    const [washEvents, aggregators, counterAgents, employees, expenses, inventory, employeeTransactions] = await Promise.all([
        getWashEventsData(),
        getAggregatorsData(),
        getCounterAgentsData(),
        getEmployeesData(),
        getExpensesData(),
        getInventory(),
        getAllEmployeeTransactions()
    ]);

    return { washEvents, aggregators, counterAgents, employees, expenses, inventory, employeeTransactions };
}


export default async function DashboardPage({ searchParams }: { searchParams?: { from?: string; to?: string; } }) {
    let fetchDataResult;
    let fetchError: string | null = null;
    
    try {
        fetchDataResult = await fetchData();
    } catch(e: any) {
        fetchError = e.message || "Не удалось загрузить данные для панели управления.";
    }

    if (fetchError || !fetchDataResult) {
        return (
            <div className="zorin-dashboard">
                <div className="zorin-page-header">
                    <h1 className="zorin-page-title">Панель управления</h1>
                </div>
                <Alert variant="destructive" className="mb-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Ошибка загрузки данных</AlertTitle>
                    <AlertDescription>{fetchError || 'Неизвестная ошибка'}</AlertDescription>
                </Alert>
            </div>
        );
    }

    const { washEvents, aggregators, counterAgents, employees, expenses, inventory, employeeTransactions } = fetchDataResult;

    const chemicalStockKg = (inventory?.chemicalStockGrams ?? 0) / 1000;
    const activeEmployeesCount = employees.filter((e: any) => !e.archived).length;

    return (
        <Suspense fallback={
            <div className="zorin-dashboard flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            </div>
        }>
            <div className="zorin-dashboard px-6 pb-12 max-w-[1400px]">
                {/* Phase 35 / V2-#3: Header + period switcher */}
                <div className="flex items-end justify-between pt-4 pb-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-wider font-bold text-blue-600 flex items-center gap-1.5">
                            🟦 Главный экран
                        </div>
                        <h1 className="text-[26px] font-bold text-slate-900 mt-1 leading-tight">Дашборд</h1>
                        <p className="text-[13px] text-slate-500 mt-1">Картина дня и месяца — без правок данных, только наблюдение</p>
                    </div>
                    <DashboardPeriodSwitcher />
                </div>

                {/* Phase 35: Alert strip (показывается только если есть тревоги) */}
                <DashboardAlertStrip inventory={inventory} washEvents={washEvents} />

                {/* Phase 35: 3 hero KPI + 4 small KPI с дельтой к прошлому периоду */}
                <DashboardHeroKpi
                    washEvents={washEvents}
                    expenses={expenses}
                    employeesCount={activeEmployeesCount}
                    chemicalStockKg={chemicalStockKg}
                />
            </div>

            {/* Существующие графики и таблицы — оставлены как есть */}
            <ZorinDashboardClient
                washEvents={washEvents}
                aggregators={aggregators}
                counterAgents={counterAgents}
                employees={employees}
                expenses={expenses}
                inventory={inventory}
                employeeTransactions={employeeTransactions}
                dateRange={{ from: searchParams?.from, to: searchParams?.to }}
            />
        </Suspense>
    );
}
