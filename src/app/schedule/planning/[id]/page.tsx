import { getSchedulePlanById, getEmployeesData, getEmployeeDayStatusesData } from '@/lib/data';
import { PlanEditor } from './components/PlanEditor';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [plan, employees, dayStatuses] = await Promise.all([
    getSchedulePlanById(id),
    getEmployeesData(),
    getEmployeeDayStatusesData()
  ]);

  if (!plan) {
    notFound();
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{plan.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Настройка статусов дней и требований для автоматического распределения смен
        </p>
      </div>

      <PlanEditor
        plan={plan}
        employees={employees}
        initialDayStatuses={dayStatuses.filter(s => s.date.startsWith(plan.month))}
      />
    </div>
  );
}
