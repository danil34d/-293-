
export const dynamic = 'force-dynamic';

import "@/styles/inventory.css";
import { AlertTriangle } from 'lucide-react';
import { getWashEventsData, getExpensesData, getInventory, getAllEmployeeTransactions, getEmployeesData } from '@/lib/data-loader';
import { InventoryDashboard } from './components/InventoryDashboard';

async function fetchData() {
    try {
        const [
            washEvents,
            expenses,
            inventory,
            employeeTransactions,
            employees
        ] = await Promise.all([
            getWashEventsData(),
            getExpensesData(),
            getInventory(),
            getAllEmployeeTransactions(),
            getEmployeesData(),
        ]);
        
        return { washEvents, expenses, inventory, employeeTransactions, employees, error: null };
    } catch (e: any) {
        console.error("Failed to fetch inventory data:", e);
        return { 
            error: e.message || "Не удалось загрузить данные для раздела склада.",
            washEvents: [], expenses: [], inventory: { chemicalStockGrams: 0 }, employeeTransactions: [], employees: []
        };
    }
}

export default async function InventoryPage() {
    const { washEvents, expenses, inventory, employeeTransactions, employees, error } = await fetchData();

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
        </div>
    );
}
