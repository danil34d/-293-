export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { Shift, SchedulePlan, EmployeeDayStatusEntry, Employee } from '@/types';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import {
  getSchedulePlansData,
  getEmployeesData,
  getEmployeeDayStatusesData,
  getShiftsData,
  invalidateShiftsCache,
  invalidateSchedulePlansCache
} from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { normalizeWashId } from '@/lib/wash';
import { saveEntity, deleteEntity } from '@/lib/data/write-helpers';

function clampInt(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.trunc(num)));
}

function buildShiftSlotKey(date: string, boxNumber: 1 | 2, shiftType: 'day' | 'night'): string {
  return `${date}|${boxNumber}|${shiftType}`;
}

function normalizeSlotCount(value: unknown): number {
  // В одном боксе могут работать 1-2 сотрудника
  return clampInt(value, 0, 2);
}

function buildShiftRequirementsFromDailyRequirement(dailyReq: any): Array<{ box: 1 | 2; type: 'day' | 'night'; count: number }> {
  const detailed = [
    { box: 1 as const, type: 'day' as const, count: normalizeSlotCount(dailyReq?.box1DayRequired ?? 0) },
    { box: 1 as const, type: 'night' as const, count: normalizeSlotCount(dailyReq?.box1NightRequired ?? 0) },
    { box: 2 as const, type: 'day' as const, count: normalizeSlotCount(dailyReq?.box2DayRequired ?? 0) },
    { box: 2 as const, type: 'night' as const, count: normalizeSlotCount(dailyReq?.box2NightRequired ?? 0) },
  ].filter((req) => req.count > 0);

  if (detailed.length > 0) return detailed;

  // Backward compatible fallback: if plan uses only requiredCount, interpret it as a day-only demand for this wash.
  const requiredCount = clampInt(dailyReq?.requiredCount ?? 0, 0, 4);
  if (requiredCount <= 0) return [];

  const box1 = Math.min(requiredCount, 2);
  const box2 = Math.min(Math.max(requiredCount - 2, 0), 2);

  return [
    { box: 1 as const, type: 'day' as const, count: box1 },
    { box: 2 as const, type: 'day' as const, count: box2 },
  ].filter((req) => req.count > 0);
}

interface EmployeeWorkload {
  employeeId: string;
  assignedCount: number;
  targetCount: number;
  preferredShiftType: 'day' | 'night' | 'any';
  weekdayPreferredShiftType?: 'day' | 'night' | 'any';
  weekendPreferredShiftType?: 'day' | 'night' | 'any';
  wantsMoreShifts: boolean;
  shiftLoadPreference: 'less' | 'standard' | 'more';
  availableDays: 'all' | 'weekdays_only' | 'weekends_only';
  canWork24hShifts: boolean;
}

// Deterministic hash for fair tie-breaking (same seed -> same result, different employees -> different order per day)
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function getEffectivePreferredShiftType(workload: EmployeeWorkload, dateStr: string): 'day' | 'night' | 'any' {
  // dateStr is YYYY-MM-DD
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const specific = isWeekend ? workload.weekendPreferredShiftType : workload.weekdayPreferredShiftType;
  return specific || workload.preferredShiftType;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({} as any));
    const clearExisting = Boolean((body as any)?.clearExisting);
    const syncEmployeeConfigs = Boolean((body as any)?.syncEmployeeConfigs);
    // Phase 40 / V2-#18: preview-режим (исключить дни галками)
    // excludeDates — массив yyyy-MM-dd, которые ПРОПУСТИТЬ при автозаполнении.
    // Полезно когда админ хочет автозаполнить часть месяца (например, не трогать
    // праздничные дни или дни особого режима, которые уже выставлены вручную).
    const excludeDatesArr = Array.isArray((body as any)?.excludeDates) ? (body as any).excludeDates : [];
    const excludeDates = new Set<string>(
      excludeDatesArr.filter((d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
    );

    // Load plan
    const plans = await getSchedulePlansData();
    const plan = plans.find(p => p.id === id);

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    const planWashId = normalizeWashId((plan as Partial<SchedulePlan>).washId);

    // Load employees and statuses
    const [employees, dayStatuses] = await Promise.all([
      getEmployeesData(),
      getEmployeeDayStatusesData()
    ]);

    if (syncEmployeeConfigs) {
      // Sync plan.employeeConfigs from current employees (values only, keep included employee list as in the plan).
      // This helps keep planning "organic": employees update preferences in their profile, manager can sync and fill.
      const currentConfigs = Array.isArray(plan.employeeConfigs) ? plan.employeeConfigs : [];
      let nextConfigs: any[] = [];

      if (currentConfigs.length === 0) {
        // If the plan had no configs, include all employees by default.
        nextConfigs = employees.map((emp) => ({
          employeeId: emp.id,
          targetShiftsCount: emp.targetShiftsPerMonth || 15,
          preferredShiftType: emp.preferredShiftType || 'any',
          wantsMoreShifts: typeof emp.wantsMoreShifts === 'boolean' ? emp.wantsMoreShifts : false,
        }));
      } else {
        const empById = new Map(employees.map((e) => [e.id, e]));
        nextConfigs = currentConfigs.map((cfg) => {
          const emp = empById.get(cfg.employeeId);
          if (!emp) return { ...cfg };
          return {
            ...cfg,
            targetShiftsCount: (typeof emp.targetShiftsPerMonth === 'number' && Number.isFinite(emp.targetShiftsPerMonth))
              ? emp.targetShiftsPerMonth
              : (typeof cfg.targetShiftsCount === 'number' && Number.isFinite(cfg.targetShiftsCount) ? cfg.targetShiftsCount : 15),
            preferredShiftType: emp.preferredShiftType || cfg.preferredShiftType || 'any',
            wantsMoreShifts: typeof emp.wantsMoreShifts === 'boolean'
              ? emp.wantsMoreShifts
              : (typeof cfg.wantsMoreShifts === 'boolean' ? cfg.wantsMoreShifts : false),
          };
        });
      }

      const changed = JSON.stringify(nextConfigs) !== JSON.stringify(currentConfigs);
      if (changed) {
        (plan as any).employeeConfigs = nextConfigs as any;
        await saveEntity('schedulePlan', plan);
        invalidateSchedulePlansCache();
      }
    }

    // Get month range
    const monthStart = startOfMonth(new Date(plan.month + '-01'));
    const monthEnd = endOfMonth(new Date(plan.month + '-01'));
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Clear existing shifts if requested
    if (clearExisting) {
      const monthStr = plan.month;
      const allCurrentShifts = await getShiftsData();
      const shiftsToDelete = allCurrentShifts.filter(
        s => typeof s.date === 'string' && s.date.startsWith(monthStr) && normalizeWashId(s.washId) === planWashId
      );
      for (const shift of shiftsToDelete) {
        await deleteEntity('shift', shift.id);
      }
    }

    // Load ALL shifts for the month (both washes) to check cross-wash conflicts
    const allMonthShifts: Shift[] = (await getShiftsData()).filter(
      (s) => typeof s?.date === 'string' && s.date.startsWith(plan.month)
    );

    // Existing shifts for THIS wash (if we are not clearing) are treated as already assigned workload and should not be duplicated.
    const existingMonthShifts: Shift[] = clearExisting
      ? []
      : allMonthShifts.filter((s) => normalizeWashId(s.washId) === planWashId);

    // Shifts on the OTHER wash -- employees here cannot be assigned to same date+shift on this wash
    const otherWashId = planWashId === 'wash_1' ? 'wash_2' : 'wash_1';
    const otherWashMonthShifts: Shift[] = allMonthShifts.filter((s) => normalizeWashId(s.washId) === otherWashId);

    // Slot map (date|box|type -> shift). If duplicates exist, keep the one with more employees.
    const existingShiftBySlot = new Map<string, Shift>();
    for (const shift of existingMonthShifts) {
      const key = buildShiftSlotKey(shift.date, shift.boxNumber, shift.shiftType);
      const prev = existingShiftBySlot.get(key);
      if (!prev || (Array.isArray(shift.employeeIds) && shift.employeeIds.length > (prev.employeeIds?.length || 0))) {
        existingShiftBySlot.set(key, shift);
      }
    }

    // Initialize employee workloads (managerOverrides take priority over employee prefs)
    const workloads: Map<string, EmployeeWorkload> = new Map();
    for (const empConfig of plan.employeeConfigs) {
      const emp = employees.find(e => e.id === empConfig.employeeId);
      if (emp) {
        const mo = emp.managerOverrides || {};
        const alreadyAssigned = existingMonthShifts.filter((s) => Array.isArray(s.employeeIds) && s.employeeIds.includes(empConfig.employeeId)).length;
        const loadPref = mo.shiftLoadPreference || emp.shiftLoadPreference || (emp.wantsMoreShifts ? 'more' : 'standard');
        workloads.set(empConfig.employeeId, {
          employeeId: empConfig.employeeId,
          assignedCount: alreadyAssigned,
          targetCount: mo.targetShiftsPerMonth || empConfig.targetShiftsCount,
          preferredShiftType: mo.preferredShiftType || empConfig.preferredShiftType || emp.preferredShiftType || 'any',
          weekdayPreferredShiftType: mo.weekdayPreferredShiftType || emp.weekdayPreferredShiftType,
          weekendPreferredShiftType: mo.weekendPreferredShiftType || emp.weekendPreferredShiftType,
          wantsMoreShifts: loadPref === 'more',
          shiftLoadPreference: loadPref,
          availableDays: mo.availableDays || emp.availableDays || 'all',
          canWork24hShifts: mo.canWork24hShifts ?? emp.canWork24hShifts ?? false,
        });
      }
    }

    const createdShifts: Shift[] = [];
    const updatedShifts: Shift[] = [];

    // For each day, assign employees
    for (const day of daysInMonth) {
      const dateStr = format(day, 'yyyy-MM-dd');

      // Phase 40 / V2-#18: skip дни выбранные админом в preview через галки
      if (excludeDates.has(dateStr)) continue;

      // Get daily requirement
      const dailyReq = plan.dailyRequirements.find(r => r.date === dateStr);
      if (!dailyReq) continue;

      // Build per-slot requirements (supports both detailed per-box fields and legacy requiredCount-only plans).
      const shiftRequirements = buildShiftRequirementsFromDailyRequirement(dailyReq);
      if (shiftRequirements.length === 0) continue;

      // Get day statuses for this date
      const statusesForDate = dayStatuses.filter(s => s.date === dateStr);

      // Check if this date is a weekend
      const dow = day.getDay(); // 0=Sun..6=Sat
      const isWeekend = dow === 0 || dow === 6;

      // Filter available employees for this date
      const availableEmployees = Array.from(workloads.values()).filter(workload => {
        const status = statusesForDate.find(s => s.employeeId === workload.employeeId);

        // Check status
        if (status) {
          if (status.status === 'doesnt_want' || status.status === 'vacation_sick') {
            return false; // Not available
          }
          if (status.status === 'must_work') {
            return true; // Must work, definitely available
          }
        }

        // Check availableDays restriction
        if (workload.availableDays === 'weekdays_only' && isWeekend) return false;
        if (workload.availableDays === 'weekends_only' && !isWeekend) return false;

        // Check if already assigned enough shifts
        const effectiveTarget = workload.shiftLoadPreference === 'less'
          ? Math.max(1, Math.floor(workload.targetCount * 0.7))  // ~30% less
          : workload.targetCount;
        if (!workload.wantsMoreShifts && workload.assignedCount >= effectiveTarget) {
          return false;
        }

        return true;
      });

      // Helper: sort employees by priority with fair rotation (re-sort per slot).
      // Uses ratio (assigned/target) for fairness + random tie-break so employees
      // with equal priority get evenly distributed across the month.
      function sortEmployeesForSlot(
        employees: EmployeeWorkload[],
        statuses: EmployeeDayStatusEntry[],
        slotDate: string,
        slotType: 'day' | 'night'
      ): EmployeeWorkload[] {
        return [...employees].sort((a, b) => {
          // 1. Must work status first
          const aStatus = statuses.find(s => s.employeeId === a.employeeId);
          const bStatus = statuses.find(s => s.employeeId === b.employeeId);

          if (aStatus?.status === 'must_work' && bStatus?.status !== 'must_work') return -1;
          if (bStatus?.status === 'must_work' && aStatus?.status !== 'must_work') return 1;

          // 2. Fulfillment ratio (lower = more in need of shifts)
          const aRatio = a.targetCount > 0 ? a.assignedCount / a.targetCount : a.assignedCount;
          const bRatio = b.targetCount > 0 ? b.assignedCount / b.targetCount : b.assignedCount;
          const ratioDiff = aRatio - bRatio;
          if (Math.abs(ratioDiff) > 0.01) return ratioDiff;

          // 3. Prefer employees whose shift type matches the slot
          const aEffPref = getEffectivePreferredShiftType(a, slotDate);
          const bEffPref = getEffectivePreferredShiftType(b, slotDate);
          const aMatch = aEffPref === slotType ? 0 : aEffPref === 'any' ? 1 : 2;
          const bMatch = bEffPref === slotType ? 0 : bEffPref === 'any' ? 1 : 2;
          if (aMatch !== bMatch) return aMatch - bMatch;

          // 4. Employees who want more shifts
          if (a.wantsMoreShifts && !b.wantsMoreShifts) return -1;
          if (b.wantsMoreShifts && !a.wantsMoreShifts) return 1;

          // 5. Random tie-break for fairness (stable per day to avoid inconsistency within same day)
          const aHash = simpleHash(`${slotDate}|${a.employeeId}`);
          const bHash = simpleHash(`${slotDate}|${b.employeeId}`);
          return aHash - bHash;
        });
      }

      // Track employees already assigned today to avoid double-booking.
      // Map: employeeId -> set of shift types they're already assigned to today
      const assignedTodayByType = new Map<string, Set<string>>();
      const markAssigned = (empId: string, sType: string) => {
        if (!assignedTodayByType.has(empId)) assignedTodayByType.set(empId, new Set());
        assignedTodayByType.get(empId)!.add(sType);
      };

      for (const shift of existingMonthShifts) {
        if (shift.date !== dateStr) continue;
        if (!Array.isArray(shift.employeeIds)) continue;
        for (const empId of shift.employeeIds) markAssigned(empId, shift.shiftType);
      }
      // Cross-wash: block employees who work at the other wash on the same date
      for (const shift of otherWashMonthShifts) {
        if (shift.date !== dateStr) continue;
        if (!Array.isArray(shift.employeeIds)) continue;
        for (const empId of shift.employeeIds) markAssigned(empId, shift.shiftType);
      }

      // Helper: check if employee can be assigned to a slot today
      const canAssignToSlot = (empId: string, slotType: 'day' | 'night'): boolean => {
        const assigned = assignedTodayByType.get(empId);
        if (!assigned || assigned.size === 0) return true;
        // Already assigned to the same type -> no
        if (assigned.has(slotType)) return false;
        // Assigned to the other type -> only OK if canWork24hShifts
        const workload = workloads.get(empId);
        return workload?.canWork24hShifts ?? false;
      };

      // Create shifts for each requirement
      for (const requirement of shiftRequirements) {
        const slotKey = buildShiftSlotKey(dateStr, requirement.box, requirement.type);
        const existingShift = existingShiftBySlot.get(slotKey);
        const existingEmployees = Array.isArray(existingShift?.employeeIds) ? existingShift!.employeeIds : [];

        // How many employees we still need for this slot.
        const targetCount = normalizeSlotCount(requirement.count);
        const remainingNeed = Math.max(0, targetCount - existingEmployees.length);
        if (remainingNeed <= 0) {
          continue;
        }

        // Re-sort per slot for fair distribution (uses current assignedCount + per-day hash)
        const sortedForSlot = sortEmployeesForSlot(availableEmployees, statusesForDate, dateStr, requirement.type);

        const assignedEmployees: string[] = [];

        // Assign required number of employees for this shift
        for (let i = 0; i < remainingNeed; i++) {
          const bestEmployee = sortedForSlot.find(e => canAssignToSlot(e.employeeId, requirement.type));

          if (bestEmployee) {
            assignedEmployees.push(bestEmployee.employeeId);
            markAssigned(bestEmployee.employeeId, requirement.type);
            bestEmployee.assignedCount++;
          } else {
            break; // No more available employees
          }
        }

        if (assignedEmployees.length === 0) continue;

        if (existingShift) {
          const merged = [...existingEmployees];
          for (const empId of assignedEmployees) {
            if (!merged.includes(empId)) merged.push(empId);
          }
          const updatedShift: Shift = {
            ...existingShift,
            washId: planWashId,
            employeeIds: merged,
          };
          await saveEntity('shift', updatedShift);
          updatedShifts.push(updatedShift);
          existingShiftBySlot.set(slotKey, updatedShift);
        } else {
          const startTime = requirement.type === 'day' ? '08:00' : '20:00';
          const endTime = requirement.type === 'day' ? '20:00' : '08:00';

          const newShift: Shift = {
            id: `shift_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            washId: planWashId,
            date: dateStr,
            boxNumber: requirement.box,
            employeeIds: assignedEmployees,
            shiftType: requirement.type,
            startTime,
            endTime,
            isAutoAssigned: true
          };

          await saveEntity('shift', newShift);
          createdShifts.push(newShift);
          existingShiftBySlot.set(slotKey, newShift);

          // Small delay to ensure unique timestamps
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
    }

    invalidateShiftsCache();

    return NextResponse.json({
      message: 'Shifts auto-filled successfully',
      shiftsCreated: createdShifts.length,
      shiftsUpdated: updatedShifts.length,
      shifts: createdShifts,
      updatedShiftIds: updatedShifts.map((s) => s.id),
    });
  } catch (error) {
    console.error('Error auto-filling shifts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
