
import PageHeader from '@/components/layout/PageHeader';
import { SalarySchemeForm } from '../components/SalarySchemeForm';

export default function NewSalarySchemePage() {
  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новая схема зарплаты"
        description="Создайте новую схему расчета для сотрудников."
      />
      <SalarySchemeForm />
    </div>
  );
}
