
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import PageHeader from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Employee } from '@/types';
import { FinanceDashboard } from '@/app/employees/[id]/finance/components/FinanceDashboard';
import { Suspense } from 'react';

async function getCurrentEmployee(): Promise<Employee | null> {
    const cookieStore = cookies();
    const employeeCookie = cookieStore.get('employee_auth_sim');
    if (!employeeCookie?.value) {
        return null;
    }
    try {
        const decodedValue = decodeURIComponent(employeeCookie.value);
        return JSON.parse(decodedValue);
    } catch (e) {
        console.error("Failed to parse employee cookie:", e);
        return null;
    }
}


export default async function MyFinancePage() {
    const employee = await getCurrentEmployee();

    if (!employee) {
         return (
            <div className="container mx-auto py-8">
                <PageHeader title="Мои финансы" description="Ошибка доступа." />
                <Alert variant="destructive" className="max-w-xl mx-auto">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Доступ запрещен</AlertTitle>
                    <AlertDescription>Не удалось определить пользователя. Пожалуйста, войдите в систему заново.</AlertDescription>
                </Alert>
            </div>
        );
    }
    
    return (
        <div className="container mx-auto py-4 md:py-8">
            <PageHeader
                title={`Финансы: ${employee.fullName}`}
                description="Обзор ваших начислений, выплат и расхода материалов."
            />
            <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
                <FinanceDashboard
                    employee={employee}
                />
            </Suspense>
        </div>
    );
}
