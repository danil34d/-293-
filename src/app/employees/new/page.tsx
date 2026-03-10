
import PageHeader from '@/components/layout/PageHeader';
import { EmployeeForm } from '../components/EmployeeForm';

export default function NewEmployeePage() {
  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новый сотрудник"
        description="Добавьте нового сотрудника в систему."
      />
      <EmployeeForm />
    </div>
  );
}
