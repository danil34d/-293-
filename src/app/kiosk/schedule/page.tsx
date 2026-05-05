/**
 * /kiosk/schedule — Простой график для терминала.
 *
 * Показывает 4 «карточки смены» (НЕ сложный календарь сотрудника):
 *  • Сегодня день  (08:00-20:00)
 *  • Сегодня ночь  (20:00-08:00 → утра следующего дня)
 *  • Завтра день
 *  • Завтра ночь
 *
 * В каждой — кто работает, по боксам.
 * НЕ умеет: создание смены, обмен, swap (это для employee/admin).
 */
export const dynamic = 'force-dynamic';

import { getShiftsData, getEmployeesData } from '@/lib/data';
import type { Shift, Employee } from '@/types';
import { isKiosk } from '@/lib/employee-role';

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
  if (!e) return null;  // 🔥 уволенных/удалённых не показываем (раньше было '?')
  // Приоритет: fullName, потом username
  return e.fullName?.split(' ')[0] || e.username || id;
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

  return (
    <div className="flex flex-col h-full pb-[80px] px-3 pt-3 space-y-3 overflow-y-auto">
      <h2 className="text-lg font-bold text-gray-800 px-1">📅 Кто работает</h2>

      {slots.map((slot, idx) => (
        <SlotCard
          key={`${slot.date}-${slot.shiftType}`}
          slot={slot}
          isToday={slot.date === ymd(today)}
        />
      ))}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mt-2">
        ℹ️ Для изменения смен — обращайтесь к администратору.
      </div>
    </div>
  );
}

function SlotCard({ slot, isToday }: { slot: ShiftSlotData; isToday: boolean }) {
  const dateLabel = isToday ? 'Сегодня' : 'Завтра';
  const shiftLabel = slot.shiftType === 'day' ? 'День ☀' : 'Ночь 🌙';

  // 🔥 ФИКС 2: статические классы (Tailwind JIT не работает с интерполяцией bg-${color}-50).
  // Раньше: `bg-${shiftColor}-50 border-${shiftColor}-200` → классы выкидывались на prod build.
  const cardClasses =
    slot.shiftType === 'day'
      ? 'bg-amber-50 border-amber-200'
      : 'bg-indigo-50 border-indigo-200';

  // 🔥 ФИКС 5: фильтруем null (раньше getEmployeeName возвращал '?' для уволенных)
  const box1Names = slot.box1Names.filter(Boolean);
  const box2Names = slot.box2Names.filter(Boolean);

  const renderBox = (label: string, names: string[]) => (
    <div className="bg-white rounded-md p-2 border border-gray-200">
      <div className="text-xs font-bold text-gray-500 mb-1">{label}</div>
      {names.length === 0 ? (
        <div className="text-sm text-gray-400 italic">— нет смены</div>
      ) : (
        <div className="text-base font-medium text-gray-900">
          {names.join(', ')}
        </div>
      )}
    </div>
  );

  return (
    <div className={`${cardClasses} border-2 rounded-lg p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <div className="text-base font-bold text-gray-900">
          {dateLabel} • {shiftLabel}
        </div>
        <div className="text-xs text-gray-500">
          {slot.shiftType === 'day' ? '08:00 – 20:00' : '20:00 – 08:00'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {renderBox('Бокс 1', box1Names)}
        {renderBox('Бокс 2', box2Names)}
      </div>
    </div>
  );
}
