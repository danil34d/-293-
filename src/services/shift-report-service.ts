'use server';

import type { Shift } from '@/types';
import { getEmployeesData, getWashEventsData } from '@/lib/data';
import { saveEntity } from '@/lib/data/write-helpers';

interface ShiftReportSummary {
  totalWashes: number;
  totalAmount: number;
}

interface ShiftReportData {
  shiftId: string;
  employeeIds: string[];
  employeeNames: string[];
  startedAt: string;
  closedAt: string;
  totalWashes: number;
  totalAmount: number;
  byPaymentMethod: Record<string, { count: number; amount: number }>;
  cashTotal: number;
  cardTotal: number;
  transferTotal: number;
  aggregatorTotal: number;
  contractTotal: number;
  tipsTotal: number;
  cashInRegister: number;
  chemicalConsumptionGrams: number;
  durationSeconds?: number;
  washes: Array<{
    id: string;
    vehicleNumber: string;
    totalAmount: number;
    paymentMethod: string;
    timestamp: string;
    tips?: number;
  }>;
}

const TECHNICAL_EMPTY_KIOSK_SHIFT_MS = 15 * 60 * 1000;

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function generateShiftReport(shift: Shift): Promise<ShiftReportSummary> {
  const [allWashes, employees] = await Promise.all([
    getWashEventsData(),
    getEmployeesData(),
  ]);

  const startedAt = shift.startedAt || shift.startTime;
  const closedAt = shift.closedAt || new Date().toISOString();

  const shiftWashes = allWashes.filter((wash) => {
    if (wash.shiftId === shift.id) return true;

    const washTime = new Date(wash.timestamp).getTime();
    const shiftStartTime = new Date(startedAt).getTime();
    const shiftEndTime = new Date(closedAt).getTime();

    if (washTime < shiftStartTime || washTime > shiftEndTime) return false;

    return wash.employeeIds.some((employeeId) => shift.employeeIds.includes(employeeId));
  });

  const byPaymentMethod: Record<string, { count: number; amount: number }> = {};
  let totalAmount = 0;
  let chemicalConsumptionGrams = 0;
  let tipsTotal = 0;

  const washDetails = shiftWashes.map((wash) => {
    totalAmount += wash.totalAmount;
    chemicalConsumptionGrams += wash.chemicalConsumptionGrams || 0;
    tipsTotal += wash.tips || 0;

    const paymentMethod = wash.paymentMethod;
    if (!byPaymentMethod[paymentMethod]) {
      byPaymentMethod[paymentMethod] = { count: 0, amount: 0 };
    }
    byPaymentMethod[paymentMethod].count++;
    byPaymentMethod[paymentMethod].amount += wash.totalAmount;

    return {
      id: wash.id,
      vehicleNumber: wash.vehicleNumber,
      totalAmount: wash.totalAmount,
      paymentMethod: wash.paymentMethod,
      timestamp: wash.timestamp,
      tips: wash.tips,
    };
  });

  const cashTotal = byPaymentMethod['cash']?.amount || 0;
  const cardTotal = byPaymentMethod['card']?.amount || 0;
  const transferTotal = byPaymentMethod['transfer']?.amount || 0;
  const aggregatorTotal = byPaymentMethod['aggregator']?.amount || 0;
  const contractTotal = byPaymentMethod['counterAgentContract']?.amount || 0;
  const cashInRegister = cashTotal + tipsTotal;

  const employeeMap = new Map(employees.map((e) => [e.id, e.fullName]));
  const employeeNames = shift.employeeIds
    .map((id) => employeeMap.get(id))
    .filter((name): name is string => Boolean(name));

  const startedAtMs = parseTimestamp(startedAt);
  const closedAtMs = parseTimestamp(closedAt);
  const durationMs = startedAtMs !== null && closedAtMs !== null
    ? Math.max(0, closedAtMs - startedAtMs)
    : null;

  const employeeRoleMap = new Map(employees.map((employee) => [employee.id, employee.role]));
  const kioskOnlyShift = shift.employeeIds.length > 0
    && shift.employeeIds.every((employeeId) => employeeRoleMap.get(employeeId) === 'kiosk');

  const shouldSkipTechnicalReport = shiftWashes.length === 0
    && totalAmount === 0
    && kioskOnlyShift
    && durationMs !== null
    && durationMs <= TECHNICAL_EMPTY_KIOSK_SHIFT_MS;

  if (shouldSkipTechnicalReport) {
    return {
      totalWashes: 0,
      totalAmount: 0,
    };
  }

  const reportData: ShiftReportData = {
    shiftId: shift.id,
    employeeIds: shift.employeeIds,
    employeeNames,
    startedAt,
    closedAt,
    totalWashes: shiftWashes.length,
    totalAmount,
    byPaymentMethod,
    cashTotal,
    cardTotal,
    transferTotal,
    aggregatorTotal,
    contractTotal,
    tipsTotal,
    cashInRegister,
    chemicalConsumptionGrams,
    durationSeconds: durationMs !== null ? Math.round(durationMs / 1000) : undefined,
    washes: washDetails,
  };

  const reportId = `sr_${shift.id}`;
  await saveEntity('shiftReport', {
    id: reportId,
    date: shift.date,
    shiftType: shift.shiftType,
    boxNumber: shift.boxNumber,
    shiftId: shift.id,
    createdAt: new Date().toISOString(),
    data: reportData,
  });

  return {
    totalWashes: shiftWashes.length,
    totalAmount,
  };
}
