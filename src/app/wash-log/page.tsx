export const dynamic = 'force-dynamic';

import "@/styles/wash-log.css";
import { WashLogPageWrapper } from './components/WashLogPageWrapper';
import { ShiftReportsTab } from './components/ShiftReportsTab';
import { ViolationsTab } from './components/ViolationsTab';
import { WashLogTabs } from './components/WashLogTabs';
import { getWashEventsData, getEmployeesData, getViolationsData, getShiftReportsData, getShiftsData } from '@/lib/data';
import { enrichWashEventsForLog } from '@/lib/wash-log-timeline';
import type { Shift, WashEvent } from '@/types';

/**
 * Для смен, у которых нет формального ShiftReport (никто не нажал "Завершить смену"),
 * вычисляем статистику на лету из моек.
 */
function buildSyntheticShiftReports(
  shifts: Shift[],
  washEvents: WashEvent[],
  existingReportShiftIds: Set<string>,
) {
  // Группируем смены по слоту (date + boxNumber + shiftType), чтобы убрать дубли
  const slotMap = new Map<string, {
    shiftIds: string[];
    employeeIds: string[];
    date: string;
    shiftType: string;
    boxNumber: number;
    startedAt?: string;
    closedAt?: string;
  }>();

  for (const shift of shifts) {
    // Пропускаем если для этой смены уже есть формальный отчёт
    if (existingReportShiftIds.has(shift.id)) continue;
    // Пропускаем смены без сотрудников
    if (!shift.employeeIds || shift.employeeIds.length === 0) continue;

    const key = `${shift.date}_box${shift.boxNumber}_${shift.shiftType}`;
    const existing = slotMap.get(key);
    if (existing) {
      existing.shiftIds.push(shift.id);
      for (const eid of shift.employeeIds) {
        if (!existing.employeeIds.includes(eid)) {
          existing.employeeIds.push(eid);
        }
      }
      if (!existing.startedAt && shift.startedAt) existing.startedAt = shift.startedAt;
      if (!existing.closedAt && shift.closedAt) existing.closedAt = shift.closedAt;
    } else {
      slotMap.set(key, {
        shiftIds: [shift.id],
        employeeIds: [...shift.employeeIds],
        date: shift.date,
        shiftType: shift.shiftType,
        boxNumber: shift.boxNumber,
        startedAt: shift.startedAt,
        closedAt: shift.closedAt,
      });
    }
  }

  // Для каждого слота находим мойки и считаем статистику
  const results: any[] = [];
  for (const [key, slot] of slotMap) {
    const matchingWashes = washEvents.filter((wash) => {
      // Прямое совпадение по shiftId
      if (wash.shiftId && slot.shiftIds.includes(wash.shiftId)) return true;

      // Совпадение по дате
      const washDate = wash.timestamp?.slice(0, 10);
      if (washDate !== slot.date) return false;

      // Совпадение по боксу
      if (wash.boxNumber != null && wash.boxNumber !== slot.boxNumber) return false;

      // Совпадение по типу смены (из часа мойки)
      const washHour = new Date(wash.timestamp).getHours();
      const washShiftType = (washHour >= 8 && washHour < 20) ? 'day' : 'night';
      if (washShiftType !== slot.shiftType) return false;

      return true;
    });

    const totalAmount = matchingWashes.reduce((sum, w) => sum + (w.totalAmount || 0), 0);

    results.push({
      id: `computed_${key}`,
      date: slot.date,
      shiftType: slot.shiftType,
      boxNumber: slot.boxNumber,
      shiftId: slot.shiftIds[0],
      employeeIds: slot.employeeIds,
      totalWashes: matchingWashes.length,
      totalAmount,
      startedAt: slot.startedAt || '',
      closedAt: slot.closedAt || '',
      createdAt: slot.startedAt || `${slot.date}T12:00:00Z`,
    });
  }

  return results;
}

export default async function WashLogPage() {
  const [sourceWashEvents, employees, violations, shiftReports, shifts] = await Promise.all([
    getWashEventsData(),
    getEmployeesData(),
    getViolationsData(),
    getShiftReportsData(),
    getShiftsData(),
  ]);

  const washEvents = await enrichWashEventsForLog(sourceWashEvents);

  // Собираем shiftId из существующих формальных отчётов
  const existingReportShiftIds = new Set(
    shiftReports
      .map((r: any) => r.shiftId || r.data?.shiftId)
      .filter(Boolean),
  );

  // Дополняем формальные отчёты вычисленными из смен без отчётов
  const syntheticReports = buildSyntheticShiftReports(shifts, sourceWashEvents, existingReportShiftIds);
  const combinedReports = [...shiftReports, ...syntheticReports];

  return (
    <WashLogTabs
      washLogContent={
        <WashLogPageWrapper initialWashEvents={washEvents} initialEmployees={employees} />
      }
      shiftsContent={
        <ShiftReportsTab reports={combinedReports} employees={employees} />
      }
      violationsContent={
        <ViolationsTab initialViolations={violations} employees={employees} />
      }
    />
  );
}
