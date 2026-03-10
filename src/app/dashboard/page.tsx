
export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getWashEventsData, getAggregatorsData, getCounterAgentsData, getEmployeesData, getExpensesData, getInventory, getAllEmployeeTransactions } from '@/lib/data-loader';
import { ZorinDashboardClient } from './components/ZorinDashboardClient';

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

    return (
        <Suspense fallback={
            <div className="zorin-dashboard flex h-64 items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            </div>
        }>
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
