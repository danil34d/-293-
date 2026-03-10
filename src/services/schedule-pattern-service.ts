import { eachDayOfInterval, endOfMonth, format, getDay, startOfMonth, subMonths } from 'date-fns';
import type { DailyRequirement, Shift } from '@/types';

type SlotKey = 'box1Day' | 'box1Night' | 'box2Day' | 'box2Night';

export interface SchedulePatternSuggestionOptions {
  targetMonth: string; // YYYY-MM
  sourceMonth?: string; // YYYY-MM
  includeNights?: boolean;
  box2Reserve?: boolean;
  defaultBox1DayRequired?: number; // used if there is no history
}

export interface SchedulePatternSuggestionResult {
  ok: true;
  targetMonth: string;
  sourceMonth: string;
  dailyRequirements: DailyRequirement[];
  weekdayPattern: Record<
    'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun',
    { box1Day: number; box1Night: number; box2Day: number; box2Night: number; requiredCount: number }
  >;
  meta: {
    shiftsInSourceMonth: number;
    derivedFrom: 'shifts' | 'defaults';
  };
}

function assertMonthKey(month: string): void {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Месяц должен быть в формате YYYY-MM');
  }
}

function clampInt(value: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function weekdayKeyFromDateFnsDay(day: number): 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' {
  // date-fns getDay(): 0=Sun..6=Sat
  switch (day) {
    case 0:
      return 'sun';
    case 1:
      return 'mon';
    case 2:
      return 'tue';
    case 3:
      return 'wed';
    case 4:
      return 'thu';
    case 5:
      return 'fri';
    default:
      return 'sat';
  }
}

function resolveDefaultSourceMonth(targetMonth: string): string {
  assertMonthKey(targetMonth);
  const base = new Date(`${targetMonth}-01T00:00:00`);
  const prev = subMonths(base, 1);
  return format(prev, 'yyyy-MM');
}

function makeEmptySlotPattern(): { [K in SlotKey]: number } {
  return { box1Day: 0, box1Night: 0, box2Day: 0, box2Night: 0 };
}

function slotOfShift(shift: Shift): SlotKey | null {
  if (shift.boxNumber === 1 && shift.shiftType === 'day') return 'box1Day';
  if (shift.boxNumber === 1 && shift.shiftType === 'night') return 'box1Night';
  if (shift.boxNumber === 2 && shift.shiftType === 'day') return 'box2Day';
  if (shift.boxNumber === 2 && shift.shiftType === 'night') return 'box2Night';
  return null;
}

function buildWeekdaySlotPatternFromShifts(shifts: Shift[], sourceMonth: string): {
  weekdaySlots: Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', { [K in SlotKey]: number }>;
  shiftsInSourceMonth: number;
} {
  assertMonthKey(sourceMonth);

  const monthShifts = shifts.filter((s) => typeof s?.date === 'string' && s.date.startsWith(sourceMonth));
  if (monthShifts.length === 0) {
    return {
      weekdaySlots: {
        mon: makeEmptySlotPattern(),
        tue: makeEmptySlotPattern(),
        wed: makeEmptySlotPattern(),
        thu: makeEmptySlotPattern(),
        fri: makeEmptySlotPattern(),
        sat: makeEmptySlotPattern(),
        sun: makeEmptySlotPattern(),
      },
      shiftsInSourceMonth: 0,
    };
  }

  // date -> max employees per slot (protect against accidental duplicate shift files)
  const perDate: Record<string, { [K in SlotKey]: number }> = {};
  for (const shift of monthShifts) {
    const slot = slotOfShift(shift);
    if (!slot) continue;
    if (!Array.isArray(shift.employeeIds)) continue;

    const date = shift.date;
    perDate[date] ||= makeEmptySlotPattern();
    perDate[date][slot] = Math.max(perDate[date][slot], shift.employeeIds.length);
  }

  const aggregates: Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', Record<SlotKey, number[]>> = {
    mon: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
    tue: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
    wed: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
    thu: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
    fri: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
    sat: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
    sun: { box1Day: [], box1Night: [], box2Day: [], box2Night: [] },
  };

  for (const [date, slots] of Object.entries(perDate)) {
    const weekday = weekdayKeyFromDateFnsDay(getDay(new Date(`${date}T00:00:00`)));
    for (const slot of Object.keys(slots) as SlotKey[]) {
      aggregates[weekday][slot].push(clampInt(slots[slot], 0, 2));
    }
  }

  const weekdaySlots: Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', { [K in SlotKey]: number }> = {
    mon: makeEmptySlotPattern(),
    tue: makeEmptySlotPattern(),
    wed: makeEmptySlotPattern(),
    thu: makeEmptySlotPattern(),
    fri: makeEmptySlotPattern(),
    sat: makeEmptySlotPattern(),
    sun: makeEmptySlotPattern(),
  };

  for (const weekday of Object.keys(weekdaySlots) as Array<keyof typeof weekdaySlots>) {
    for (const slot of ['box1Day', 'box1Night', 'box2Day', 'box2Night'] as SlotKey[]) {
      const m = median(aggregates[weekday][slot]);
      weekdaySlots[weekday][slot] = clampInt(Math.round(m), 0, 2);
    }
  }

  return { weekdaySlots, shiftsInSourceMonth: monthShifts.length };
}

export function suggestDailyRequirementsFromHistory(shifts: Shift[], options: SchedulePatternSuggestionOptions): SchedulePatternSuggestionResult {
  assertMonthKey(options.targetMonth);
  const sourceMonth = options.sourceMonth?.trim() || resolveDefaultSourceMonth(options.targetMonth);
  assertMonthKey(sourceMonth);

  const includeNights = options.includeNights === true;
  const box2Reserve = options.box2Reserve !== false; // default true
  const defaultBox1DayRequired = clampInt(options.defaultBox1DayRequired ?? 2, 0, 2);

  const { weekdaySlots, shiftsInSourceMonth } = buildWeekdaySlotPatternFromShifts(shifts, sourceMonth);

  // No history -> defaults for main box.
  const derivedFrom: 'shifts' | 'defaults' = shiftsInSourceMonth > 0 ? 'shifts' : 'defaults';
  if (derivedFrom === 'defaults') {
    for (const weekday of Object.keys(weekdaySlots) as Array<keyof typeof weekdaySlots>) {
      weekdaySlots[weekday].box1Day = defaultBox1DayRequired;
      weekdaySlots[weekday].box1Night = 0;
      weekdaySlots[weekday].box2Day = 0;
      weekdaySlots[weekday].box2Night = 0;
    }
  }

  if (!includeNights) {
    for (const weekday of Object.keys(weekdaySlots) as Array<keyof typeof weekdaySlots>) {
      weekdaySlots[weekday].box1Night = 0;
      weekdaySlots[weekday].box2Night = 0;
    }
  }

  if (box2Reserve) {
    // Reserve strategy: do not "invent" usage of box 2 if there was no clear need.
    for (const weekday of Object.keys(weekdaySlots) as Array<keyof typeof weekdaySlots>) {
      weekdaySlots[weekday].box2Day = clampInt(weekdaySlots[weekday].box2Day, 0, 2);
      weekdaySlots[weekday].box2Night = clampInt(weekdaySlots[weekday].box2Night, 0, 2);
    }
  }

  const monthStart = startOfMonth(new Date(`${options.targetMonth}-01T00:00:00`));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const dailyRequirements: DailyRequirement[] = days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    const weekday = weekdayKeyFromDateFnsDay(getDay(day));
    const slots = weekdaySlots[weekday];

    const box1DayRequired = clampInt(slots.box1Day, 0, 2);
    const box1NightRequired = clampInt(slots.box1Night, 0, 2);
    const box2DayRequired = clampInt(slots.box2Day, 0, 2);
    const box2NightRequired = clampInt(slots.box2Night, 0, 2);

    const requiredCount = box1DayRequired + box1NightRequired + box2DayRequired + box2NightRequired;
    return {
      date,
      requiredCount,
      box1DayRequired,
      box1NightRequired,
      box2DayRequired,
      box2NightRequired,
    };
  });

  const weekdayPattern: SchedulePatternSuggestionResult['weekdayPattern'] = {
    mon: { ...weekdaySlots.mon, requiredCount: weekdaySlots.mon.box1Day + weekdaySlots.mon.box1Night + weekdaySlots.mon.box2Day + weekdaySlots.mon.box2Night },
    tue: { ...weekdaySlots.tue, requiredCount: weekdaySlots.tue.box1Day + weekdaySlots.tue.box1Night + weekdaySlots.tue.box2Day + weekdaySlots.tue.box2Night },
    wed: { ...weekdaySlots.wed, requiredCount: weekdaySlots.wed.box1Day + weekdaySlots.wed.box1Night + weekdaySlots.wed.box2Day + weekdaySlots.wed.box2Night },
    thu: { ...weekdaySlots.thu, requiredCount: weekdaySlots.thu.box1Day + weekdaySlots.thu.box1Night + weekdaySlots.thu.box2Day + weekdaySlots.thu.box2Night },
    fri: { ...weekdaySlots.fri, requiredCount: weekdaySlots.fri.box1Day + weekdaySlots.fri.box1Night + weekdaySlots.fri.box2Day + weekdaySlots.fri.box2Night },
    sat: { ...weekdaySlots.sat, requiredCount: weekdaySlots.sat.box1Day + weekdaySlots.sat.box1Night + weekdaySlots.sat.box2Day + weekdaySlots.sat.box2Night },
    sun: { ...weekdaySlots.sun, requiredCount: weekdaySlots.sun.box1Day + weekdaySlots.sun.box1Night + weekdaySlots.sun.box2Day + weekdaySlots.sun.box2Night },
  };

  return {
    ok: true,
    targetMonth: options.targetMonth,
    sourceMonth,
    dailyRequirements,
    weekdayPattern,
    meta: {
      shiftsInSourceMonth,
      derivedFrom,
    },
  };
}

