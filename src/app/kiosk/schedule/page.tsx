/**
 * /kiosk/schedule — Простой график для терминала.
 *
 * Показывает «карточки смены» (НЕ сложный календарь сотрудника):
 *  • Сегодня день  (08:00-20:00) — Hero с обводкой если активна сейчас
 *  • Сегодня ночь  (20:00-08:00)
 *  • Завтра день
 *  • Завтра ночь
 *
 * Пустые карточки (где нет смен ни в одном боксе) показываются в свёрнутом
 * виде — одна строка, чтобы не захламлять экран.
 */
export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData } from '@/lib/data';
import type { Shift, Employee } from '@/types';
import { isKiosk } from '@/lib/employee-role';
import { KioskScheduleClient } from './KioskScheduleClient';

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface ShiftSlotData {
  date: string;
  shiftType: 'day' | 'night';
  box1Names: string[];
  box2Names: string[];
}

function getEmployeeName(employees: Employee[], id: string): string | null {
  const e = employees.find((emp) => emp.id === id);
  if (!e) return null;
  return e.fullName?.split(' ').slice(0, 2).join(' ') || e.username || id;
}

function buildSlot(
  shifts: Shift[],
  employees: Employee[],
  date: string,
  shiftType: 'day' | 'night',
): ShiftSlotData {
  const matching = shifts.filter(
    (s) => s.date === date && s.shiftType === shiftType && s.washId === 'wash_1',
  );
  const box1 = matching
    .filter((s) => s.boxNumber === 1)
    .flatMap((s) => s.employeeIds)
    .map((id) => getEmployeeName(employees, id))
    .filter((name): name is string => name !== null);
  const box2 = matching
    .filter((s) => s.boxNumber === 2)
    .flatMap((s) => s.employeeIds)
    .map((id) => getEmployeeName(employees, id))
    .filter((name): name is string => name !== null);
  return { date, shiftType, box1Names: box1, box2Names: box2 };
}

export default async function KioskSchedulePage() {
  const [shifts, employees] = await Promise.all([getShiftsData(), getEmployeesData()]);
  const realPeople = employees.filter((e) => !isKiosk(e));

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const slots = [
    buildSlot(shifts, realPeople, ymd(today), 'day'),
    buildSlot(shifts, realPeople, ymd(today), 'night'),
    buildSlot(shifts, realPeople, ymd(tomorrow), 'day'),
    buildSlot(shifts, realPeople, ymd(tomorrow), 'night'),
  ];

  const currentHour = today.getHours();
  const isDayShiftActive = currentHour >= 8 && currentHour < 20;
  const todayStr = ymd(today);

  return (
    <KioskScheduleClient
      slots={slots}
      todayStr={todayStr}
      isDayShiftActive={isDayShiftActive}
    />
  );
}
