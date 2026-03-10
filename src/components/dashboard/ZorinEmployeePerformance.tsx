"use client";

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Trophy, TrendingUp, Car, Droplets } from 'lucide-react';
import type { WashEvent, Employee } from '@/types';
import { Badge } from '@/components/ui/badge';
import { isEmployeeAdmin } from '@/lib/employee-role';

interface EmployeePerformanceData {
  id: string;
  name: string;
  washCount: number;
  revenue: number;
  avgPerWash: number;
  chemicalUsed: number;
  efficiency: number; // revenue per gram of chemical
}

interface ZorinEmployeePerformanceProps {
  washEvents: WashEvent[];
  employees: Employee[];
}

const COLORS = ['#0088cc', '#00d4ff', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899'];

export function ZorinEmployeePerformance({ washEvents, employees }: ZorinEmployeePerformanceProps) {
  // Calculate performance data for each employee
  const performanceData: EmployeePerformanceData[] = employees
    .filter((emp) => !isEmployeeAdmin(emp))
    .map(emp => {
      const empWashes = washEvents.filter(w => w.employeeIds.includes(emp.id));
      const revenue = empWashes.reduce((sum, w) => sum + (w.netAmount ?? w.totalAmount), 0);
      const chemicalUsed = empWashes.reduce((sum, w) => sum + (w.chemicalConsumptionGrams ?? 0), 0);

      return {
        id: emp.id,
        name: emp.fullName.split(' ')[0], // First name only for chart
        washCount: empWashes.length,
        revenue,
        avgPerWash: empWashes.length > 0 ? Math.round(revenue / empWashes.length) : 0,
        chemicalUsed,
        efficiency: chemicalUsed > 0 ? Math.round((revenue / chemicalUsed) * 100) / 100 : 0,
      };
    })
    .filter(data => data.washCount > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const topPerformer = performanceData[0];
  const totalWashes = performanceData.reduce((sum, p) => sum + p.washCount, 0);
  const avgWashesPerEmployee = performanceData.length > 0
    ? Math.round(totalWashes / performanceData.length)
    : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as EmployeePerformanceData;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-gray-900 mb-2">{data.name}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Моек:</span>
              <span className="font-medium">{data.washCount}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Выручка:</span>
              <span className="font-medium text-green-600">{data.revenue.toLocaleString('ru-RU')} ₽</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Ср. чек:</span>
              <span className="font-medium">{data.avgPerWash.toLocaleString('ru-RU')} ₽</span>
            </div>
            {data.chemicalUsed > 0 && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Химия:</span>
                <span className="font-medium">{data.chemicalUsed.toLocaleString('ru-RU')} гр.</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (performanceData.length === 0) {
    return (
      <div className="zorin-chart-card">
        <div className="zorin-chart-title">
          <Users size={20} className="text-blue-500" />
          Производительность сотрудников
        </div>
        <div className="h-64 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <Users size={48} className="mx-auto mb-4 text-gray-300" />
            <p>Нет данных о работе сотрудников</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="zorin-chart-card">
      <div className="zorin-chart-title">
        <Users size={20} className="text-blue-500" />
        Производительность сотрудников
      </div>
      <p className="zorin-chart-description">
        Выручка и количество моек по сотрудникам
      </p>

      {/* Top Performer Badge */}
      {topPerformer && (
        <div className="flex items-center gap-2 mb-4 p-2 bg-amber-50 rounded-lg border border-amber-200">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-sm text-amber-800">
            Лидер: <strong>{topPerformer.name}</strong> — {topPerformer.revenue.toLocaleString('ru-RU')} ₽ ({topPerformer.washCount} моек)
          </span>
        </div>
      )}

      {/* Chart */}
      <ResponsiveContainer width="100%" height={250}>
        <BarChart
          data={performanceData.slice(0, 6)}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 60, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: '#64748b' }}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 12, fill: '#64748b' }}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
            {performanceData.slice(0, 6).map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
            <Users className="h-3 w-3" />
            Сотрудников
          </div>
          <p className="text-lg font-semibold">{performanceData.length}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
            <Car className="h-3 w-3" />
            Всего моек
          </div>
          <p className="text-lg font-semibold">{totalWashes}</p>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
            <TrendingUp className="h-3 w-3" />
            Ср. на чел.
          </div>
          <p className="text-lg font-semibold">{avgWashesPerEmployee}</p>
        </div>
      </div>
    </div>
  );
}
