
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { ExpenseForm } from '../../components/ExpenseForm';
import type { Expense } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getExpenseById } from '@/lib/data-loader';

export default async function EditExpensePage({ params }: { params: { id: string } }) {
  const expenseId = params.id;
  let expense: Expense | null = null;
  let fetchError: string | null = null;

  try {
    expense = await getExpenseById(expenseId);
    if (!expense) {
      fetchError = `Расход с ID "${expenseId}" не найден.`;
    }
  } catch (error: any) {
    fetchError = error.message || `Не удалось загрузить данные для расхода с ID ${expenseId}.`;
  }

  if (fetchError) {
     return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать расход" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ошибка Загрузки</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать расход" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Расход не найден</AlertTitle>
          <AlertDescription>
            Запись о расходе с ID "{expenseId}" не найдена. Возможно, она была удалена.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title={`Редактировать расход`}
        description={`Обновление данных для "${expense.description}".`}
      />
      <ExpenseForm initialData={expense} expenseId={expenseId} />
    </div>
  );
}
