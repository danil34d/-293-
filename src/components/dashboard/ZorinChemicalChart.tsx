"use client";

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { Droplets, TrendingDown } from 'lucide-react';

interface DailyChemicalData {
  date: string;
  consumptionGrams: number;
  costRub: number;
  washCount: number;
}

interface ZorinChemicalChartProps {
  data: DailyChemicalData[];
}

export function ZorinChemicalChart({ data }: ZorinChemicalChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Расход:</span>
              <span className="font-medium text-blue-600">
                {(item.consumptionGrams / 1000).toFixed(2)} кг
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Стоимость:</span>
              <span className="font-medium text-red-600">
                {item.costRub.toLocaleString('ru-RU')} руб.
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Моек:</span>
              <span className="font-medium">{item.washCount}</span>
            </div>
            {item.washCount > 0 && (
              <div className="flex justify-between gap-4 pt-1 border-t">
                <span className="text-gray-500">На мойку:</span>
                <span className="font-medium">
                  {Math.round(item.consumptionGrams / item.washCount)} г
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate summary stats
  const totalConsumption = data.reduce((sum, d) => sum + d.consumptionGrams, 0);
  const totalCost = data.reduce((sum, d) => sum + d.costRub, 0);
  const totalWashes = data.reduce((sum, d) => sum + d.washCount, 0);
  const avgPerWash = totalWashes > 0 ? Math.round(totalConsumption / totalWashes) : 0;
  const avgDailyConsumption = data.length > 0 ? Math.round(totalConsumption / data.length) : 0;

  if (data.length === 0 || totalConsumption === 0) {
    return (
      <div className="zorin-chart-card">
        <div className="zorin-chart-title">
          <Droplets size={20} className="text-blue-500" />
          Расход химии
        </div>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Droplets size={48} className="mx-auto mb-4 text-gray-300" />
            <p>Нет данных о расходе химии</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="zorin-chart-card">
      <div className="zorin-chart-title">
        <Droplets size={20} className="text-blue-500" />
        Расход химии
      </div>
      <p className="zorin-chart-description">
        Ежедневный расход концентрата за выбранный период
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="p-2 bg-blue-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">Всего</p>
          <p className="text-lg font-bold text-blue-600">
            {(totalConsumption / 1000).toFixed(2)} кг
          </p>
        </div>
        <div className="p-2 bg-red-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">Стоимость</p>
          <p className="text-lg font-bold text-red-600">
            {totalCost.toLocaleString('ru-RU')} руб.
          </p>
        </div>
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">На мойку</p>
          <p className="text-lg font-bold">
            {avgPerWash} г
          </p>
        </div>
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">В день</p>
          <p className="text-lg font-bold">
            {(avgDailyConsumption / 1000).toFixed(2)} кг
          </p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
          <defs>
            <linearGradient id="chemicalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.3}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#64748b' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => `${(value / 1000).toFixed(1)}кг`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            yAxisId="left"
            dataKey="consumptionGrams"
            fill="url(#chemicalGradient)"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="washCount"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-2 text-sm">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span className="text-gray-600">Расход химии (кг)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="text-gray-600">Количество моек</span>
        </div>
      </div>
    </div>
  );
}
