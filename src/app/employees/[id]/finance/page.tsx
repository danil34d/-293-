
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getEmployeeById } from '@/lib/data-loader';
import { FinanceDashboard } from './components/FinanceDashboard';
import { Suspense } from 'react';


export default async function EmployeeFinancePage({ params }: { params: { id: string } }) {
    const employeeId = params.id;
    let employee;
    let error: string | null = null;
    
    try {
        employee = await getEmployeeById(employeeId);
    } catch(e: any) {
        error = e.message || "Не удалось загрузить данные.";
    }


    if (!employee || error) {
        return (
            <div className="container mx-auto py-8">
                <PageHeader title="Финансы сотрудника" description="Ошибка загрузки данных." />
                <Alert variant="destructive" className="max-w-xl mx-auto">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Ошибка Загрузки</AlertTitle>
                    <AlertDescription>{error || 'Сотрудник не найден.'}</AlertDescription>
                </Alert>
            </div>
        );
    }
    
    return (
        <div className="container mx-auto py-4 md:py-8">
            <PageHeader
                title={`Финансы: ${employee.fullName}`}
                description="Управление зарплатой, выплатами, долгами и расходом материалов."
            />
            <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                <FinanceDashboard employee={employee} />
            </Suspense>
        </div>
    );
}
