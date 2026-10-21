import type { ShiftKey } from './live-types';

export function validateShift(value: ShiftKey): ShiftKey {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) || !['day', 'night'].includes(value.period)) {
    throw new Error('Укажите дату и дневную или ночную смену.');
  }
  const parsed = new Date(`${value.date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.date || value.date < '2020-01-01' || value.date > '2100-12-31') {
    throw new Error('Некорректная дата смены.');
  }
  return { date: value.date, period: value.period };
}

export function shiftId(shift: ShiftKey): string {
  const checked = validateShift(shift);
  return `live-${checked.date}-${checked.period}`;
}

export function shiftBounds(shift: ShiftKey) {
  validateShift(shift);
  const start = new Date(`${shift.date}T${shift.period === 'day' ? '08' : '20'}:00:00+03:00`);
  return { start: start.getTime(), end: start.getTime() + 12 * 60 * 60 * 1000 };
}

export function currentShift(now = new Date()): ShiftKey {
  if (!Number.isFinite(now.getTime())) throw new Error('Некорректное время.');
  const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const hour = moscow.getUTCHours();
  if (hour < 8) moscow.setUTCDate(moscow.getUTCDate() - 1);
  return { date: moscow.toISOString().slice(0, 10), period: hour >= 8 && hour < 20 ? 'day' : 'night' };
}

export function previousShift(now = new Date()): ShiftKey {
  const shift = currentShift(now);
  if (shift.period === 'night') return { ...shift, period: 'day' };
  const yesterday = new Date(`${shift.date}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return { date: yesterday.toISOString().slice(0, 10), period: 'night' };
}
