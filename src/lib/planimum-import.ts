/**
 * Planimum.ru schedule import
 *
 * Fetches schedule data from a public planimum.ru link,
 * matches employees by name, and creates shifts in the system.
 */

import {
  getEmployeesData,
  getShiftsData,
  invalidateShiftsCache,
} from '@/lib/data';
import { saveEntity, deleteEntity } from '@/lib/data/write-helpers';

export interface PlanimumImportParams {
  url: string;
  washId: 'wash_1' | 'wash_2';
  clearExisting?: boolean;
}

export interface PlanimumImportResult {
  success: boolean;
  error?: string;
  planimumNames?: string[];
  systemNames?: string[];
  data?: {
    message: string;
    month: string;
    washId: string;
    scheduleTitle: string;
    shiftsCreated: number;
    shiftsDeleted: number;
    daysWithShifts: number;
    totalDays: number;
    matchedEmployees: string[];
    unmatchedEmployees: string[];
  };
}

/** How many boxes are active per wash */
const WASH_BOX_COUNT: Record<string, number> = {
  wash_1: 2, // Мойка 1 (Циолковского) — 2 бокса
  wash_2: 1, // Мойка 2 — 1 бокс
};

export async function importPlanimumSchedule(
  params: PlanimumImportParams
): Promise<PlanimumImportResult> {
  const { url, washId, clearExisting = true } = params;
  const boxCount = WASH_BOX_COUNT[washId] ?? 2;

  // ---- 1. Validate URL ----
  if (!url || !url.includes('planimum.ru/schedule/')) {
    return {
      success: false,
      error: 'Некорректная ссылка. Ожидается: https://planimum.ru/schedule/display/YYYY/MM/hash/',
    };
  }

  // ---- 2. Fetch page ----
  let html: string;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return {
        success: false,
        error: `Не удалось загрузить страницу planimum.ru (${resp.status})`,
      };
    }
    html = await resp.text();
  } catch (err: any) {
    return {
      success: false,
      error: `Ошибка загрузки: ${err.message}`,
    };
  }

  // ---- 3. Extract JSON from <script id="initial-schedule-fields"> ----
  const scriptMatch = html.match(
    /<script\s+id="initial-schedule-fields"\s+type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!scriptMatch) {
    return {
      success: false,
      error: 'Не удалось найти данные расписания на странице. Проверьте ссылку.',
    };
  }

  let scheduleData: any;
  try {
    scheduleData = JSON.parse(scriptMatch[1]);
  } catch {
    return { success: false, error: 'Не удалось разобрать данные расписания' };
  }

  const {
    month: monthStr,
    title: scheduleTitle,
    shifts: planimumShifts,
    employees: planimumEmployees,
    emptable,
  } = scheduleData;

  if (!monthStr || !planimumEmployees || !emptable) {
    return { success: false, error: 'Данные расписания неполные' };
  }

  // ---- 4. Parse month ----
  const year = parseInt(monthStr.slice(0, 4));
  const monthNum = parseInt(monthStr.slice(4, 6));
  const monthPrefix = `${year}-${String(monthNum).padStart(2, '0')}`;
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // ---- 5. Build shift type mapping (1-based shift_idx) ----
  const shiftTypeMap: Record<number, 'day' | 'night'> = {};
  for (let i = 0; i < (planimumShifts || []).length; i++) {
    const t = (planimumShifts[i].title || '').toLowerCase();
    if (t.includes('дневн') || t.includes('day')) shiftTypeMap[i + 1] = 'day';
    else if (t.includes('ночн') || t.includes('night')) shiftTypeMap[i + 1] = 'night';
  }
  if (!shiftTypeMap[1]) shiftTypeMap[1] = 'day';
  if (!shiftTypeMap[2]) shiftTypeMap[2] = 'night';

  // ---- 6. Match employees by name ----
  const ourEmployees = await getEmployeesData();
  const active = ourEmployees.filter((e: any) => !e.isDismissed);

  const matched: Array<{ plIdx: number; plName: string; ourId: string; ourName: string }> = [];
  const unmatched: string[] = [];

  for (let i = 0; i < planimumEmployees.length; i++) {
    const plName: string = planimumEmployees[i].name || '';
    const plParts = plName.trim().toLowerCase().split(/\s+/).sort();

    const emp = active.find((e: any) => {
      const ourParts = (e.fullName || '').trim().toLowerCase().split(/\s+/).sort();
      if (plParts.length !== ourParts.length || plParts.length === 0) return false;
      return plParts.every((p: string, idx: number) => p === ourParts[idx]);
    });

    if (emp) {
      matched.push({ plIdx: i, plName, ourId: emp.id, ourName: emp.fullName });
    } else {
      unmatched.push(plName);
    }
  }

  if (matched.length === 0) {
    return {
      success: false,
      error: 'Не удалось сопоставить ни одного сотрудника',
      planimumNames: planimumEmployees.map((e: any) => e.name),
      systemNames: active.map((e: any) => e.fullName),
    };
  }

  // ---- 7. Clear existing shifts for month + wash ----
  let deletedCount = 0;
  if (clearExisting) {
    const existing = await getShiftsData();
    const toDelete = existing.filter(
      (s: any) => s.date.startsWith(monthPrefix) && s.washId === washId
    );
    for (const s of toDelete) {
      await deleteEntity('shift', s.id);
    }
    deletedCount = toDelete.length;
  }

  // ---- 8. Create shifts from emptable ----
  let createdCount = 0;
  const daysWithShifts = new Set<string>();

  for (let dayIdx = 0; dayIdx < Math.min(emptable[0]?.length || 0, daysInMonth); dayIdx++) {
    const dayNum = dayIdx + 1;
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    const byType: Record<string, string[]> = { day: [], night: [] };

    for (const m of matched) {
      const cell = emptable[m.plIdx]?.[dayIdx];
      if (!cell || cell === 0) continue;
      const shiftIdx = cell.shift_idx;
      if (shiftIdx === 0) continue; // unassigned placeholder
      const st = shiftTypeMap[shiftIdx] || 'day';
      byType[st].push(m.ourId);
    }

    for (const shiftType of ['day', 'night'] as const) {
      const emps = byType[shiftType];
      if (emps.length === 0) continue;

      daysWithShifts.add(dateStr);
      const startTime = shiftType === 'day' ? '08:00' : '20:00';
      const endTime = shiftType === 'day' ? '20:00' : '08:00';

      if (boxCount === 1) {
        // Single box — all employees to box 1
        await saveEntity('shift', {
          id: `shift_pl_${dateStr}_${shiftType}_b1`,
          washId,
          date: dateStr,
          boxNumber: 1,
          employeeIds: emps,
          shiftType,
          startTime,
          endTime,
          isAutoAssigned: true,
        });
        createdCount++;
      } else {
        // Two boxes — split employees
        const mid = Math.ceil(emps.length / 2);
        const box1 = emps.slice(0, mid);
        const box2 = emps.slice(mid);

        if (box1.length > 0) {
          await saveEntity('shift', {
            id: `shift_pl_${dateStr}_${shiftType}_b1`,
            washId,
            date: dateStr,
            boxNumber: 1,
            employeeIds: box1,
            shiftType,
            startTime,
            endTime,
            isAutoAssigned: true,
          });
          createdCount++;
        }
        if (box2.length > 0) {
          await saveEntity('shift', {
            id: `shift_pl_${dateStr}_${shiftType}_b2`,
            washId,
            date: dateStr,
            boxNumber: 2,
            employeeIds: box2,
            shiftType,
            startTime,
            endTime,
            isAutoAssigned: true,
          });
          createdCount++;
        }
      }
    }
  }

  await invalidateShiftsCache();

  return {
    success: true,
    data: {
      message: `Расписание "${scheduleTitle}" за ${monthPrefix} импортировано`,
      month: monthPrefix,
      washId,
      scheduleTitle: scheduleTitle || '',
      shiftsCreated: createdCount,
      shiftsDeleted: deletedCount,
      daysWithShifts: daysWithShifts.size,
      totalDays: daysInMonth,
      matchedEmployees: matched.map((m) => `${m.plName} → ${m.ourName}`),
      unmatchedEmployees: unmatched,
    },
  };
}
