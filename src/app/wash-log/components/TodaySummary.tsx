import { TrendingUp, Users, DollarSign, Car } from 'lucide-react';

type SummaryItem = {
  grossPay: number;
  completedWashes: number;
};

interface TodaySummaryProps {
  reportData: SummaryItem[];
}

export function TodaySummary({ reportData }: TodaySummaryProps) {
  const totalRevenue = reportData.reduce((sum, emp) => sum + emp.grossPay, 0);
  const totalWashes = reportData.reduce((sum, emp) => sum + emp.completedWashes, 0);
  const activeEmployees = reportData.length;

  return (
    <div className="summary-card">
      <div className="summary-header">
        <div className="summary-icon">
          <TrendingUp size={20} />
        </div>
        <h3 className="summary-title">Статистика за сегодня</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="text-center">
          <div className="mb-2">
            <DollarSign className="w-8 h-8 mx-auto text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600">
            {totalRevenue.toLocaleString('ru-RU')} ₽
          </div>
          <div className="text-sm text-gray-600">Общая выручка</div>
        </div>

        <div className="text-center">
          <div className="mb-2">
            <Car className="w-8 h-8 mx-auto text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {totalWashes}
          </div>
          <div className="text-sm text-gray-600">Всего моек</div>
        </div>

        <div className="text-center">
          <div className="mb-2">
            <Users className="w-8 h-8 mx-auto text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600">
            {activeEmployees}
          </div>
          <div className="text-sm text-gray-600">Активные сотрудники</div>
        </div>

        <div className="text-center">
          <div className="mb-2">
            <TrendingUp className="w-8 h-8 mx-auto text-orange-500" />
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {totalWashes > 0 ? Math.round(totalRevenue / totalWashes) : 0} ₽
          </div>
          <div className="text-sm text-gray-600">Средний чек</div>
        </div>
      </div>
    </div>
  );
}
