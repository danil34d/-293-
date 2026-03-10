"use client";

import { useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Sun, Moon, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Shift, Employee, WashId } from '@/types';
import { normalizeWashId } from '@/lib/wash';

interface EmployeeScheduleOverviewProps {
  shifts: Shift[];
  employees: Employee[];
  initialMonth?: string;
}

const DOW_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function parseMonthKey(month: string | undefined): Date | null {
  if (!month) return null;
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const dt = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

interface CellInfo {
  wash: WashId;
  washLabel: string;
  box: number;
  shiftType: 'day' | 'night';
  shiftId: string;
}

export function EmployeeScheduleOverview({ shifts, employees, initialMonth }: EmployeeScheduleOverviewProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => parseMonthKey(initialMonth) || new Date());

  const monthKey = format(currentMonth, 'yyyy-MM');
  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Build lookup: employeeId -> date -> CellInfo[]
  const employeeSchedule = useMemo(() => {
    const map = new Map<string, Map<string, CellInfo[]>>();

    const monthShifts = shifts.filter(s => s.date?.startsWith(monthKey));

    for (const shift of monthShifts) {
      if (!Array.isArray(shift.employeeIds)) continue;
      for (const empId of shift.employeeIds) {
        if (!map.has(empId)) map.set(empId, new Map());
        const dateMap = map.get(empId)!;
        if (!dateMap.has(shift.date)) dateMap.set(shift.date, []);
        dateMap.get(shift.date)!.push({
          wash: normalizeWashId(shift.washId),
          washLabel: normalizeWashId(shift.washId) === 'wash_2' ? 'М2' : 'М1',
          box: shift.boxNumber,
          shiftType: shift.shiftType,
          shiftId: shift.id,
        });
      }
    }

    return map;
  }, [shifts, monthKey]);

  // Stats per employee
  const employeeStats = useMemo(() => {
    return employees.map(emp => {
      const dateMap = employeeSchedule.get(emp.id);
      let totalShifts = 0;
      let dayShifts = 0;
      let nightShifts = 0;
      let wash1Shifts = 0;
      let wash2Shifts = 0;

      if (dateMap) {
        for (const cells of dateMap.values()) {
          for (const cell of cells) {
            totalShifts++;
            if (cell.shiftType === 'day') dayShifts++;
            else nightShifts++;
            if (cell.wash === 'wash_1') wash1Shifts++;
            else wash2Shifts++;
          }
        }
      }

      return { emp, totalShifts, dayShifts, nightShifts, wash1Shifts, wash2Shifts };
    }).sort((a, b) => b.totalShifts - a.totalShifts);
  }, [employees, employeeSchedule]);

  const getCellColor = (info: CellInfo): string => {
    if (info.wash === 'wash_1') {
      return info.shiftType === 'day' ? 'bg-blue-200 text-blue-900' : 'bg-blue-400 text-white';
    }
    return info.shiftType === 'day' ? 'bg-green-200 text-green-900' : 'bg-green-400 text-white';
  };

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize">
          {format(currentMonth, 'LLLL yyyy', { locale: ru })}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-blue-200 border border-blue-300"></span>
          М1 день
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-blue-400 border border-blue-500"></span>
          М1 ночь
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-green-200 border border-green-300"></span>
          М2 день
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-green-400 border border-green-500"></span>
          М2 ночь
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded bg-gray-100 border border-gray-200"></span>
          Выходной
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left font-medium text-gray-700 border-b border-r min-w-[140px]">
                Сотрудник
              </th>
              {days.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dow = getDay(day);
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <th
                    key={dateStr}
                    className={`px-0.5 py-1 text-center border-b border-r min-w-[32px] ${
                      isWeekend ? 'bg-red-50 text-red-700' : ''
                    }`}
                  >
                    <div className="text-[10px] text-gray-400">{DOW_SHORT[dow]}</div>
                    <div>{format(day, 'd')}</div>
                  </th>
                );
              })}
              <th className="px-2 py-1.5 text-center border-b border-r bg-gray-50 font-medium min-w-[40px]">
                Всего
              </th>
              <th className="px-2 py-1.5 text-center border-b border-r bg-gray-50 font-medium min-w-[30px]" title="Дневные смены">
                <Sun className="h-3 w-3 mx-auto text-amber-500" />
              </th>
              <th className="px-2 py-1.5 text-center border-b border-r bg-gray-50 font-medium min-w-[30px]" title="Ночные смены">
                <Moon className="h-3 w-3 mx-auto text-indigo-500" />
              </th>
              <th className="px-2 py-1.5 text-center border-b border-r bg-blue-50 font-medium min-w-[30px]" title="Мойка 1">
                М1
              </th>
              <th className="px-2 py-1.5 text-center border-b bg-green-50 font-medium min-w-[30px]" title="Мойка 2">
                М2
              </th>
            </tr>
          </thead>
          <tbody>
            {employeeStats.map(({ emp, totalShifts, dayShifts, nightShifts, wash1Shifts, wash2Shifts }) => {
              const dateMap = employeeSchedule.get(emp.id);
              return (
                <tr key={emp.id} className="hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 bg-white px-2 py-1 border-b border-r font-medium text-gray-800 truncate max-w-[140px]" title={emp.fullName}>
                    {emp.fullName}
                  </td>
                  {days.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const cells = dateMap?.get(dateStr);
                    const dow = getDay(day);
                    const isWeekend = dow === 0 || dow === 6;

                    if (!cells || cells.length === 0) {
                      return (
                        <td key={dateStr} className={`border-b border-r text-center ${isWeekend ? 'bg-gray-50' : ''}`}>
                          <span className="text-gray-200">-</span>
                        </td>
                      );
                    }

                    return (
                      <td key={dateStr} className="border-b border-r p-0">
                        <div className="flex flex-col gap-0.5 p-0.5">
                          {cells.map((cell, i) => (
                            <div
                              key={i}
                              className={`rounded text-[9px] font-medium text-center leading-tight py-0.5 ${getCellColor(cell)}`}
                              title={`${cell.washLabel} Б${cell.box} ${cell.shiftType === 'day' ? 'День' : 'Ночь'}`}
                            >
                              {cell.washLabel}
                              <span className="text-[8px]">Б{cell.box}</span>
                              {cell.shiftType === 'night' && <Moon className="inline h-2 w-2 ml-0.5" />}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                  <td className="border-b border-r text-center font-semibold px-1">
                    {totalShifts || '-'}
                  </td>
                  <td className="border-b border-r text-center px-1 text-amber-600">
                    {dayShifts || '-'}
                  </td>
                  <td className="border-b border-r text-center px-1 text-indigo-600">
                    {nightShifts || '-'}
                  </td>
                  <td className="border-b border-r text-center px-1 text-blue-600">
                    {wash1Shifts || '-'}
                  </td>
                  <td className="border-b text-center px-1 text-green-600">
                    {wash2Shifts || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary per day */}
      <div className="mt-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          Заполненность по дням
        </h3>
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 text-left font-medium border-b border-r min-w-[140px]">Слот</th>
                {days.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const dow = getDay(day);
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={dateStr} className={`px-0.5 py-1 text-center border-b border-r min-w-[32px] ${isWeekend ? 'bg-red-50' : ''}`}>
                      {format(day, 'd')}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(['wash_1', 'wash_2'] as WashId[]).map(washId => {
                const washLabel = washId === 'wash_1' ? 'М1' : 'М2';
                return [1, 2].map(box => {
                  return (['day', 'night'] as const).map(shiftType => {
                    const label = `${washLabel} Б${box} ${shiftType === 'day' ? 'Д' : 'Н'}`;
                    return (
                      <tr key={`${washId}-${box}-${shiftType}`} className="hover:bg-gray-50/50">
                        <td className="sticky left-0 z-10 bg-white px-2 py-1 border-b border-r font-medium text-gray-700">
                          <span className="flex items-center gap-1">
                            {shiftType === 'day' ? <Sun className="h-3 w-3 text-amber-500" /> : <Moon className="h-3 w-3 text-indigo-500" />}
                            {label}
                          </span>
                        </td>
                        {days.map(day => {
                          const dateStr = format(day, 'yyyy-MM-dd');
                          const slotShifts = shifts.filter(s =>
                            s.date === dateStr &&
                            normalizeWashId(s.washId) === washId &&
                            s.boxNumber === box &&
                            s.shiftType === shiftType
                          );
                          const empNames = slotShifts.flatMap(s => s.employeeIds).map(id => {
                            const emp = employees.find(e => e.id === id);
                            return emp ? emp.fullName.split(' ')[0] : '?';
                          });
                          const hasEmployee = empNames.length > 0;

                          return (
                            <td
                              key={dateStr}
                              className={`border-b border-r text-center py-0.5 px-0.5 ${
                                hasEmployee
                                  ? washId === 'wash_1' ? 'bg-blue-100' : 'bg-green-100'
                                  : ''
                              }`}
                              title={empNames.join(', ') || 'Пусто'}
                            >
                              <span className="text-[9px]">{empNames.length > 0 ? empNames[0] : '-'}</span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                });
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
