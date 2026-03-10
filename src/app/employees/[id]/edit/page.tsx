
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { EmployeeForm } from '../../components/EmployeeForm';
import type { Employee } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getEmployeeById } from '@/lib/data-loader';

export default async function EditEmployeePage({ params }: { params: { id: string } }) {
  const employeeId = params.id;
  let employee: Employee | null = null;
  let fetchError: string | null = null;

  try {
    employee = await getEmployeeById(employeeId);
    if (!employee) {
      fetchError = `Сотрудник с ID "${employeeId}" не найден.`;
    }
  } catch (error: any) {
    fetchError = error.message || `Не удалось загрузить данные для сотрудника с ID ${employeeId}.`;
  }

  if (fetchError) {
     return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать сотрудника" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ошибка Загрузки</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать сотрудника" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Сотрудник не найден</AlertTitle>
          <AlertDescription>
            Сотрудник с ID "{employeeId}" не найден. Возможно, он был удален или ID указан неверно.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title={`Редактировать сотрудника`}
        description={`Обновление данных для ${employee.fullName}.`}
      />
      <EmployeeForm initialData={employee} employeeId={employeeId} />
    </div>
  );
}
