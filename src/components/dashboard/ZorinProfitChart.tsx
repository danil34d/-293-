"use client";

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Scale, TrendingUp, TrendingDown } from 'lucide-react';

interface DailyProfitData {
  date: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface ZorinProfitChartProps {
  data: DailyProfitData[];
}

export function ZorinProfitChart({ data }: ZorinProfitChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const profit = payload[0].value;
      const isPositive = profit >= 0;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Выручка:</span>
              <span className="font-medium text-green-600">
                {payload[0].payload.revenue.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Расходы:</span>
              <span className="font-medium text-red-600">
                {payload[0].payload.expenses.toLocaleString('ru-RU')} ₽
              </span>
            </div>
            <div className="flex justify-between gap-4 pt-1 border-t">
              <span className="text-gray-500">Прибыль:</span>
              <span className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {profit.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate summary stats
  const totalProfit = data.reduce((sum, d) => sum + d.profit, 0);
  const avgDailyProfit = data.length > 0 ? Math.round(totalProfit / data.length) : 0;
  const profitableDays = data.filter(d => d.profit > 0).length;
  const profitMargin = data.reduce((sum, d) => sum + d.revenue, 0) > 0
    ? Math.round((totalProfit / data.reduce((sum, d) => sum + d.revenue, 0)) * 100)
    : 0;

  if (data.length === 0) {
    return (
      <div className="zorin-chart-card">
        <div className="zorin-chart-title">
          <Scale size={20} className="text-blue-500" />
          Динамика прибыли
        </div>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Scale size={48} className="mx-auto mb-4 text-gray-300" />
            <p>Нет данных для отображения</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="zorin-chart-card">
      <div className="zorin-chart-title">
        <Scale size={20} className="text-blue-500" />
        Динамика прибыли
      </div>
      <p className="zorin-chart-description">
        Ежедневная прибыль за выбранный период
      </p>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">Общая прибыль</p>
          <p className={`text-lg font-bold ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {totalProfit.toLocaleString('ru-RU')} ₽
          </p>
        </div>
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">Ср. в день</p>
          <p className={`text-lg font-bold ${avgDailyProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {avgDailyProfit.toLocaleString('ru-RU')} ₽
          </p>
        </div>
        <div className="p-2 bg-gray-50 rounded-lg text-center">
          <p className="text-xs text-gray-500">Маржинальность</p>
          <p className={`text-lg font-bold ${profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {profitMargin}%
          </p>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
          <defs>
            <linearGradient id="profitGradientPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="profitGradientNegative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
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
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="profit"
            stroke="#10b981"
            fill="url(#profitGradientPositive)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Days indicator */}
      <div className="flex items-center justify-center gap-4 mt-2 text-sm">
        <div className="flex items-center gap-1">
          <TrendingUp className="h-4 w-4 text-green-500" />
          <span className="text-gray-600">
            {profitableDays} {profitableDays === 1 ? 'день' : 'дней'} в плюс
          </span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingDown className="h-4 w-4 text-red-500" />
          <span className="text-gray-600">
            {data.length - profitableDays} {(data.length - profitableDays) === 1 ? 'день' : 'дней'} в минус
          </span>
        </div>
      </div>
    </div>
  );
}
