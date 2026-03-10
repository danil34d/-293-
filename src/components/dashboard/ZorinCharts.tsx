import React from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, PieChartIcon } from 'lucide-react';

interface DailyRevenueData {
  date: string;
  revenue: number;
}

interface DistributionData {
  name: string;
  value: number;
  fill: string;
  details?: DistributionData[];
}

interface ZorinChartsProps {
  dailyRevenueData: DailyRevenueData[];
  paymentTypeDistribution: DistributionData[];
}

const CHART_COLORS = {
  retail: "#0088cc",      // ZORIN primary blue
  aggregator: "#00d4ff",   // Light blue
  counterAgent: "#f59e0b", // Orange
  other: "#94a3b8",        // Gray
};

export function ZorinCharts({ dailyRevenueData, paymentTypeDistribution }: ZorinChartsProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-sm text-blue-600 font-semibold">
            {payload[0].value.toLocaleString('ru-RU')} ₽
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900">{payload[0].name}</p>
          <p className="text-sm text-blue-600 font-semibold">
            {payload[0].value.toLocaleString('ru-RU')} ₽
          </p>
          <p className="text-xs text-gray-500">
            {((payload[0].percent) * 100).toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="zorin-charts-section">
      {/* Revenue Chart */}
      <div className="zorin-chart-card">
        <div className="zorin-chart-title">
          <TrendingUp size={20} className="text-blue-500" />
          Динамика выручки
        </div>
        <p className="zorin-chart-description">
          График ежедневной выручки за выбранный период
        </p>

        {dailyRevenueData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dailyRevenueData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: '#64748b' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                tickFormatter={(value) => `${value.toLocaleString('ru-RU')} ₽`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="revenue"
                fill="url(#colorGradient)"
                radius={[8, 8, 0, 0]}
              />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0088cc" stopOpacity={0.8}/>
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0.6}/>
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <TrendingUp size={48} className="mx-auto mb-4 text-gray-300" />
              <p>Нет данных для отображения</p>
            </div>
          </div>
        )}
      </div>

      {/* Payment Distribution Chart */}
      <div className="zorin-chart-card">
        <div className="zorin-chart-title">
          <PieChartIcon size={20} className="text-blue-500" />
          Распределение платежей
        </div>
        <p className="zorin-chart-description">
          Структура выручки по способам оплаты
        </p>

        {paymentTypeDistribution.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={paymentTypeDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {paymentTypeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<CustomPieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <PieChartIcon size={48} className="mx-auto mb-4 text-gray-300" />
              <p>Нет данных для отображения</p>
            </div>
          </div>
        )}

        {/* Legend */}
        {paymentTypeDistribution.length > 0 && (
          <div className="mt-4 space-y-2">
            {paymentTypeDistribution.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="text-gray-700">{item.name}</span>
                </div>
                <span className="font-medium text-gray-900">
                  {item.value.toLocaleString('ru-RU')} ₽
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}