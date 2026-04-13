'use server';

import type { Shift, WashEvent } from '@/types';
import { getWashEventsData } from '@/lib/data';
import { saveEntity } from '@/lib/data/write-helpers';

interface ShiftReportSummary {
  totalWashes: number;
  totalAmount: number;
}

interface ShiftReportData {
  shiftId: string;
  employeeIds: string[];
  startedAt: string;
  closedAt: string;
  totalWashes: number;
  totalAmount: number;
  byPaymentMethod: Record<string, { count: number; amount: number }>;
  chemicalConsumptionGrams: number;
  washes: Array<{
    id: string;
    vehicleNumber: string;
    totalAmount: number;
    paymentMethod: string;
    timestamp: string;
  }>;
}

export async function generateShiftReport(shift: Shift): Promise<ShiftReportSummary> {
  const allWashes = await getWashEventsData();

  const startedAt = shift.startedAt || shift.startTime;
  const closedAt = shift.closedAt || new Date().toISOString();

  // Filter washes that belong to this shift
  const shiftWashes = allWashes.filter(w => {
    // Direct link via shiftId
    if (w.shiftId === shift.id) return true;

    // Fallback: time range + employee overlap
    const wTime = new Date(w.timestamp).getTime();
    const sTime = new Date(startedAt).getTime();
    const eTime = new Date(closedAt).getTime();

    if (wTime < sTime || wTime > eTime) return false;

    const hasEmployeeOverlap = w.employeeIds.some(eid => shift.employeeIds.includes(eid));
    return hasEmployeeOverlap;
  });

  // Aggregate
  const byPaymentMethod: Record<string, { count: number; amount: number }> = {};
  let totalAmount = 0;
  let chemicalConsumptionGrams = 0;

  const washDetails = shiftWashes.map(w => {
    totalAmount += w.totalAmount;
    chemicalConsumptionGrams += w.chemicalConsumptionGrams || 0;

    const pm = w.paymentMethod;
    if (!byPaymentMethod[pm]) {
      byPaymentMethod[pm] = { count: 0, amount: 0 };
    }
    byPaymentMethod[pm].count++;
    byPaymentMethod[pm].amount += w.totalAmount;

    return {
      id: w.id,
      vehicleNumber: w.vehicleNumber,
      totalAmount: w.totalAmount,
      paymentMethod: w.paymentMethod,
      timestamp: w.timestamp,
    };
  });

  const reportData: ShiftReportData = {
    shiftId: shift.id,
    employeeIds: shift.employeeIds,
    startedAt,
    closedAt,
    totalWashes: shiftWashes.length,
    totalAmount,
    byPaymentMethod,
    chemicalConsumptionGrams,
    washes: washDetails,
  };

  // Save report
  const reportId = `sr_${shift.id}`;
  await saveEntity('shiftReport', {
    id: reportId,
    date: shift.date,
    shiftType: shift.shiftType,
    boxNumber: shift.boxNumber,
    shiftId: shift.id,
    data: reportData,
  });

  return {
    totalWashes: shiftWashes.length,
    totalAmount,
  };
}
