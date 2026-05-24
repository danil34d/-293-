
export const dynamic = 'force-dynamic';

import "@/styles/inventory.css";
import { AlertTriangle } from 'lucide-react';
import { getWashEventsData, getExpensesData, getInventory, getAllEmployeeTransactions, getEmployeesData, getEmployeeCanistersData } from '@/lib/data';
import { InventoryDashboard } from './components/InventoryDashboard';
import { EmployeeCanistersSection } from './components/EmployeeCanistersSection';

async function fetchData() {
    try {
        const [
            washEvents,
            expenses,
            inventory,
            employeeTransactions,
            employees,
            canisters,
        ] = await Promise.all([
            getWashEventsData(),
            getExpensesData(),
            getInventory(),
            getAllEmployeeTransactions(),
            getEmployeesData(),
            getEmployeeCanistersData(),
        ]);

        return { washEvents, expenses, inventory, employeeTransactions, employees, canisters, error: null };
    } catch (e: any) {
        console.error("Failed to fetch inventory data:", e);
        return {
            error: e.message || "Не удалось загрузить данные для раздела склада.",
            washEvents: [], expenses: [], inventory: { chemicalStockGrams: 0 }, employeeTransactions: [], employees: [], canisters: []
        };
    }
}

export default async function InventoryPage() {
    const { washEvents, expenses, inventory, employeeTransactions, employees, canisters, error } = await fetchData();

    if (error) {
        return (
            <div className="inventory">
                <div className="page-header-section">
                    <div className="page-header-content">
                        <div className="page-title-section">
                            <h1>Склад</h1>
                            <p>Ошибка загрузки данных.</p>
                        </div>
                    </div>
                </div>
                <div className="alert error">
                    <AlertTriangle className="h-5 w-5" />
                    <div>
                        <div className="alert-title">Ошибка Загрузки</div>
                        <div className="alert-description">{error}</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="inventory">
            <div className="page-header-section">
                <div className="page-header-content">
                    <div className="page-title-section">
                        <h1>Склад</h1>
                        <p>Управление запасами и отслеживание движения химических средств.</p>
                    </div>
                </div>
            </div>
            <div className="inventory-dashboard">
                <InventoryDashboard
                    inventory={inventory}
                    allWashEvents={washEvents}
                    allExpenses={expenses}
                    allEmployeeTransactions={employeeTransactions}
                    employees={employees}
                />
            </div>

            {/* Phase 52b / V2-NEW-1: Канистры у сотрудников секция */}
            <EmployeeCanistersSection
                canisters={canisters}
                employees={employees}
                washEvents={washEvents}
                transactions={employeeTransactions}
            />
        </div>
    );
}
