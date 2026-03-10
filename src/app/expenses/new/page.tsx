
import PageHeader from '@/components/layout/PageHeader';
import { ExpenseForm } from '../components/ExpenseForm';

export default function NewExpensePage() {
  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новый расход"
        description="Добавьте новую запись об операционных расходах."
      />
      <ExpenseForm />
    </div>
  );
}
