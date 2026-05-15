'use server';

import { prisma } from '@/lib/db/prisma';
import type {
  WashEvent, Aggregator, CounterAgent, Employee, SalaryScheme,
  EmployeeTransaction, RetailPriceConfig, Expense, ClientTransaction,
  Shift, ShiftSwapRequest, ShiftAssignmentRequest, EmployeeDayStatusEntry,
  SchedulePlan, Inventory, StockMovement, EmployeeChemicalCanister, ActiveSession,
  Violation,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString();
  return d;
}

function parseJsonField<T>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val as T;
}

// ─── WashEvent mappers ───────────────────────────────────────

function washEventFromPrisma(row: any): WashEvent {
  return {
    id: row.id,
    timestamp: toISOString(row.timestamp),
    vehicleNumber: row.vehicleNumber,
    boxNumber: row.boxNumber ?? undefined,
    employeeIds: row.employees?.map((e: any) => e.employeeId) ?? [],
    paymentMethod: row.paymentMethod as any,
    sourceId: row.aggregatorId ?? row.counterAgentId ?? undefined,
    sourceName: row.sourceName ?? undefined,
    priceListName: row.priceListName ?? undefined,
    totalAmount: row.totalAmount,
    netAmount: row.netAmount ?? undefined,
    acquiringFee: row.acquiringFee ?? undefined,
    services: parseJsonField(row.services, { main: { serviceName: '', price: 0 }, additional: [] }),
    driverComments: parseJsonField(row.driverComments, undefined),
    editHistory: parseJsonField(row.editHistory, undefined),
    photos: parseJsonField(row.photos, undefined),
    chemicalConsumptionGrams: row.chemicalConsumptionGrams ?? undefined,
    chemicalCostRub: row.chemicalCostRub ?? undefined,
    status: row.status ?? undefined,
    completedAt: row.completedAt ?? undefined,
    refundedAt: row.refundedAt ?? undefined,
    refundReason: row.refundReason ?? undefined,
    tips: row.tips ?? undefined,
    shiftId: row.shiftId ?? undefined,
    washDurationSeconds: row.washDurationSeconds ?? undefined,
    cameraSession: parseJsonField(row.cameraSession, undefined),
    dismissal: parseJsonField(row.dismissal, undefined),
    restoration: parseJsonField(row.restoration, undefined),
    // Phase 8 / finding #38
    createdInClosedPeriod: row.createdInClosedPeriod ?? false,
    closedPeriodAtCreate: row.closedPeriodAtCreate ?? undefined,
  };
}

// ─── Employee mappers ────────────────────────────────────────

function employeeFromPrisma(row: any): Employee {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    paymentDetails: row.paymentDetails,
    hasCar: row.hasCar,
    role: row.role as any,
    telegramChatId: row.telegramChatId ?? undefined,
    username: row.username ?? undefined,
    password: row.password ?? undefined,
    salarySchemeId: row.salarySchemeId ?? undefined,
    canSwapShifts: row.canSwapShifts,
    preferredShiftType: row.preferredShiftType ?? undefined,
    weekdayPreferredShiftType: row.weekdayPreferredShiftType ?? undefined,
    weekendPreferredShiftType: row.weekendPreferredShiftType ?? undefined,
    targetShiftsPerMonth: row.targetShiftsPerMonth ?? undefined,
    wantsMoreShifts: row.wantsMoreShifts ?? undefined,
    archived: row.archived ?? false,
    archivedAt: row.archivedAt ?? undefined,
  };
}

// ─── Generic mappers ─────────────────────────────────────────

function aggregatorFromPrisma(row: any): Aggregator {
  return {
    id: row.id,
    name: row.name,
    balance: row.balance,
    companies: parseJsonField(row.companies, []),
    cars: parseJsonField(row.cars, []),
    priceLists: parseJsonField(row.priceLists, []),
    activePriceListName: row.activePriceListName ?? undefined,
  };
}

function counterAgentFromPrisma(row: any): CounterAgent {
  const rawCars = parseJsonField(row.cars, []);
  const cars = rawCars.map((c: any) => ({
    id: c.id || c.number || '',
    licensePlate: c.licensePlate || c.number || '',
    mark: c.mark,
    category: c.category,
  }));
  return {
    id: row.id,
    name: row.name,
    balance: row.balance,
    companies: parseJsonField(row.companies, []),
    cars,
    priceList: parseJsonField(row.priceList, []),
    additionalPriceList: parseJsonField(row.additionalPriceList, []),
    allowCustomServices: row.allowCustomServices,
    archived: row.archived,
    archivedAt: row.archivedAt ?? undefined,
  };
}

function expenseFromPrisma(row: any): Expense {
  return {
    id: row.id,
    date: toISOString(row.date),
    category: row.category,
    description: row.description,
    amount: row.amount,
    quantity: row.quantity ?? undefined,
    unit: row.unit ?? undefined,
    pricePerUnit: row.pricePerUnit ?? undefined,
  };
}

function employeeTransactionFromPrisma(row: any): EmployeeTransaction {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: toISOString(row.date),
    type: row.type as any,
    amount: row.amount,
    description: row.description,
  };
}

function clientTransactionFromPrisma(row: any): ClientTransaction {
  return {
    id: row.id,
    clientId: row.clientId,
    date: toISOString(row.date),
    type: row.type as any,
    amount: row.amount,
    description: row.description,
  };
}

function shiftFromPrisma(row: any): Shift {
  const boxNum = row.boxNumber as 1 | 2;
  return {
    id: row.id,
    washId: (row.washId as 'wash_1' | 'wash_2') || (boxNum === 2 ? 'wash_2' : 'wash_1'),
    date: row.date,
    boxNumber: boxNum,
    shiftType: row.shiftType as any,
    startTime: row.startTime,
    endTime: row.endTime,
    employeeIds: row.employees?.map((e: any) => e.employeeId) ?? [],
    releasedEmployeeId: row.releasedEmployeeId ?? undefined,
    isAutoAssigned: row.isAutoAssigned,
    status: row.status ?? 'scheduled',
    startedAt: row.startedAt?.toISOString() ?? undefined,
    closedAt: row.closedAt?.toISOString() ?? undefined,
  };
}

function salarySchemeFromPrisma(row: any): SalaryScheme {
  return {
    id: row.id,
    name: row.name,
    type: row.type as any,
    percentage: row.percentage ?? undefined,
    fixedDeduction: row.fixedDeduction ?? undefined,
    rateSource: parseJsonField(row.rateSource, undefined),
    rates: parseJsonField(row.rates, undefined),
    archived: row.archived ?? false,
    archivedAt: row.archivedAt ?? undefined,
  };
}

function stockMovementFromPrisma(row: any): StockMovement {
  return {
    id: row.id,
    materialId: row.materialId,
    type: row.type as any,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    date: toISOString(row.date),
    description: row.description,
    relatedEntityType: row.relatedEntityType ?? undefined,
    relatedEntityId: row.relatedEntityId ?? undefined,
    employeeId: row.employeeId ?? undefined,
    createdBy: row.createdBy ?? undefined,
  };
}

function canisterFromPrisma(row: any): EmployeeChemicalCanister {
  return {
    id: row.id,
    employeeId: row.employeeId,
    issuedAt: toISOString(row.issuedAt),
    initialAmountGrams: row.initialAmountGrams,
    remainingAmountGrams: row.remainingAmountGrams,
    priceRub: row.priceRub,
    status: row.status as any,
    transactionId: row.transactionId ?? undefined,
  };
}

// ─── READ Functions ──────────────────────────────────────────

export async function getWashEventsData(): Promise<WashEvent[]> {
  const rows = await prisma.washEvent.findMany({
    include: { employees: true },
    orderBy: { timestamp: 'desc' },
  });
  return rows.map(washEventFromPrisma);
}

export async function getWashEventById(id: string): Promise<WashEvent | null> {
  const row = await prisma.washEvent.findUnique({
    where: { id },
    include: { employees: true },
  });
  return row ? washEventFromPrisma(row) : null;
}

export async function getAggregatorsData(): Promise<Aggregator[]> {
  const rows = await prisma.aggregator.findMany();
  return rows.map(aggregatorFromPrisma);
}

export async function getAggregatorById(id: string): Promise<Aggregator | null> {
  const row = await prisma.aggregator.findUnique({ where: { id } });
  return row ? aggregatorFromPrisma(row) : null;
}

export async function getCounterAgentsData(): Promise<CounterAgent[]> {
  const rows = await prisma.counterAgent.findMany();
  return rows.map(counterAgentFromPrisma);
}

export async function getActiveCounterAgentsData(): Promise<CounterAgent[]> {
  const rows = await prisma.counterAgent.findMany({ where: { archived: false } });
  return rows.map(counterAgentFromPrisma);
}

export async function getCounterAgentById(id: string): Promise<CounterAgent | null> {
  const row = await prisma.counterAgent.findUnique({ where: { id } });
  return row ? counterAgentFromPrisma(row) : null;
}

export async function getEmployeesData(): Promise<Employee[]> {
  const rows = await prisma.employee.findMany();
  return rows.map(employeeFromPrisma);
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const row = await prisma.employee.findUnique({ where: { id } });
  return row ? employeeFromPrisma(row) : null;
}

export async function getSalarySchemesData(): Promise<SalaryScheme[]> {
  const rows = await prisma.salaryScheme.findMany();
  return rows.map(salarySchemeFromPrisma);
}

export async function getSalarySchemeById(id: string): Promise<SalaryScheme | null> {
  const row = await prisma.salaryScheme.findUnique({ where: { id } });
  return row ? salarySchemeFromPrisma(row) : null;
}

export async function getExpensesData(): Promise<Expense[]> {
  const rows = await prisma.expense.findMany({ orderBy: { date: 'desc' } });
  return rows.map(expenseFromPrisma);
}

export async function getExpenseById(id: string): Promise<Expense | null> {
  const row = await prisma.expense.findUnique({ where: { id } });
  return row ? expenseFromPrisma(row) : null;
}

export async function getAllEmployeeTransactions(): Promise<EmployeeTransaction[]> {
  const rows = await prisma.employeeTransaction.findMany({ orderBy: { date: 'desc' } });
  return rows.map(employeeTransactionFromPrisma);
}

export async function getEmployeeTransactions(employeeId: string): Promise<EmployeeTransaction[]> {
  const rows = await prisma.employeeTransaction.findMany({
    where: { employeeId },
    orderBy: { date: 'desc' },
  });
  return rows.map(employeeTransactionFromPrisma);
}

export async function getClientTransactions(clientId: string): Promise<ClientTransaction[]> {
  const rows = await prisma.clientTransaction.findMany({
    where: { clientId },
    orderBy: { date: 'desc' },
  });
  return rows.map(clientTransactionFromPrisma);
}

export async function getRetailPriceConfig(): Promise<RetailPriceConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'retailPriceList' } });
  if (!row) {
    return { mainPriceList: [], additionalPriceList: [], allowCustomRetailServices: true, cardAcquiringPercentage: 1.2 };
  }
  const data = row.value as any;
  if (data.allowCustomRetailServices === undefined) data.allowCustomRetailServices = true;
  if (data.cardAcquiringPercentage === undefined) data.cardAcquiringPercentage = 1.2;
  return data as RetailPriceConfig;
}

export async function getInventory(): Promise<Inventory> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'inventory' } });
  if (!row) {
    return {
      chemicalStockGrams: 0,
      materials: [],
      settings: {
        defaultChemicalConsumptionPerWash: 700,
        canisterWeightGrams: 21000,
        canisterVolumeMl: 19000,
        canisterPriceRub: 3000,
        lowStockThresholdKg: 10,
        autoDeductChemical: true,
        chemicalPricePerKg: 150,
      },
    };
  }
  const data = row.value as any;
  if (!data.settings) {
    data.settings = {
      defaultChemicalConsumptionPerWash: 700,
      canisterWeightGrams: 21000,
      canisterVolumeMl: 19000,
      canisterPriceRub: 3000,
      lowStockThresholdKg: 10,
      autoDeductChemical: true,
      chemicalPricePerKg: 150,
    };
  }
  if (!data.materials) data.materials = [];
  return data as Inventory;
}

export async function getActiveSession(): Promise<ActiveSession> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'activeSession' } });
  if (!row) return { updatedAt: new Date().toISOString(), boxes: [] };
  return row.value as any as ActiveSession;
}

export async function saveActiveSession(session: ActiveSession): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'activeSession' },
    update: { value: session as any },
    create: { key: 'activeSession', value: session as any },
  });
}

export async function getStockMovementsData(): Promise<StockMovement[]> {
  const rows = await prisma.stockMovement.findMany({ orderBy: { date: 'desc' } });
  return rows.map(stockMovementFromPrisma);
}

export async function getStockMovementsByMaterial(materialId: string): Promise<StockMovement[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { materialId },
    orderBy: { date: 'desc' },
  });
  return rows.map(stockMovementFromPrisma);
}

export async function getEmployeeCanistersData(): Promise<EmployeeChemicalCanister[]> {
  const rows = await prisma.employeeCanister.findMany({ orderBy: { issuedAt: 'desc' } });
  return rows.map(canisterFromPrisma);
}

export async function getEmployeeCanistersByEmployee(employeeId: string): Promise<EmployeeChemicalCanister[]> {
  const rows = await prisma.employeeCanister.findMany({
    where: { employeeId },
    orderBy: { issuedAt: 'desc' },
  });
  return rows.map(canisterFromPrisma);
}

export async function getActiveCanisterForEmployee(employeeId: string): Promise<EmployeeChemicalCanister | null> {
  const row = await prisma.employeeCanister.findFirst({
    where: { employeeId, status: 'active' },
    orderBy: { issuedAt: 'desc' },
  });
  return row ? canisterFromPrisma(row) : null;
}

export async function getShiftsData(): Promise<Shift[]> {
  const rows = await prisma.shift.findMany({
    include: { employees: true },
    orderBy: { date: 'asc' },
  });
  return rows.map(shiftFromPrisma);
}

export async function getShiftById(id: string): Promise<Shift | null> {
  const row = await prisma.shift.findUnique({
    where: { id },
    include: { employees: true },
  });
  return row ? shiftFromPrisma(row) : null;
}

export async function getShiftSwapRequestsData(): Promise<ShiftSwapRequest[]> {
  const rows = await prisma.shiftSwapRequest.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(r => ({
    id: r.id,
    type: r.type as any,
    createdAt: toISOString(r.createdAt),
    requesterId: r.requesterId,
    requesterShiftId: r.requesterShiftId,
    targetEmployeeId: r.targetEmployeeId ?? undefined,
    targetShiftId: r.targetShiftId ?? undefined,
    status: r.status as any,
    resolvedAt: r.resolvedAt ? toISOString(r.resolvedAt) : undefined,
  }));
}

export async function getShiftSwapRequestById(id: string): Promise<ShiftSwapRequest | null> {
  const row = await prisma.shiftSwapRequest.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    type: row.type as any,
    createdAt: toISOString(row.createdAt),
    requesterId: row.requesterId,
    requesterShiftId: row.requesterShiftId,
    targetEmployeeId: row.targetEmployeeId ?? undefined,
    targetShiftId: row.targetShiftId ?? undefined,
    status: row.status as any,
    resolvedAt: row.resolvedAt ? toISOString(row.resolvedAt) : undefined,
  };
}

export async function getShiftAssignmentRequestsData(): Promise<ShiftAssignmentRequest[]> {
  const rows = await prisma.shiftAssignmentRequest.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(r => {
    const boxNum = r.boxNumber as 1 | 2;
    return {
      id: r.id,
      washId: boxNum === 2 ? 'wash_2' as const : 'wash_1' as const,
      createdAt: toISOString(r.createdAt),
      employeeId: r.employeeId,
      date: r.date,
      shiftType: r.shiftType as any,
      boxNumber: boxNum,
      status: r.status as any,
      resolvedAt: r.resolvedAt ? toISOString(r.resolvedAt) : undefined,
      resolvedBy: r.resolvedBy ?? undefined,
      comment: r.comment ?? undefined,
    };
  });
}

export async function getEmployeeDayStatusesData(): Promise<EmployeeDayStatusEntry[]> {
  const rows = await prisma.employeeDayStatus.findMany({ orderBy: { date: 'asc' } });
  return rows.map(r => ({
    id: r.id,
    employeeId: r.employeeId,
    date: r.date,
    status: r.status as any,
    shiftType: (r.shiftType ?? undefined) as any,
    boxNumber: (r.boxNumber ?? undefined) as any,
  }));
}

export async function getEmployeeDayStatusById(id: string): Promise<EmployeeDayStatusEntry | null> {
  const row = await prisma.employeeDayStatus.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    status: row.status as any,
    shiftType: (row.shiftType ?? undefined) as any,
    boxNumber: (row.boxNumber ?? undefined) as any,
  };
}

export async function getEmployeeDayStatusesByEmployee(employeeId: string): Promise<EmployeeDayStatusEntry[]> {
  const rows = await prisma.employeeDayStatus.findMany({
    where: { employeeId },
    orderBy: { date: 'asc' },
  });
  return rows.map(r => ({
    id: r.id,
    employeeId: r.employeeId,
    date: r.date,
    status: r.status as any,
    shiftType: (r.shiftType ?? undefined) as any,
    boxNumber: (r.boxNumber ?? undefined) as any,
  }));
}

export async function getEmployeeDayStatusesByDate(date: string): Promise<EmployeeDayStatusEntry[]> {
  const rows = await prisma.employeeDayStatus.findMany({
    where: { date },
  });
  return rows.map(r => ({
    id: r.id,
    employeeId: r.employeeId,
    date: r.date,
    status: r.status as any,
    shiftType: (r.shiftType ?? undefined) as any,
    boxNumber: (r.boxNumber ?? undefined) as any,
  }));
}

export async function getSchedulePlansData(): Promise<SchedulePlan[]> {
  const rows = await prisma.schedulePlan.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    month: r.month,
    createdAt: toISOString(r.createdAt),
    createdBy: r.createdBy,
    clonedFrom: r.clonedFrom ?? undefined,
    isActive: r.isActive,
    washId: r.washId ?? undefined,
    employeeConfigs: parseJsonField(r.employeeConfigs, []),
    dailyRequirements: parseJsonField(r.dailyRequirements, []),
    weeklyPattern: parseJsonField(r.weeklyPattern, undefined),
  }));
}

export async function getSchedulePlanById(id: string): Promise<SchedulePlan | null> {
  const row = await prisma.schedulePlan.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    month: row.month,
    createdAt: toISOString(row.createdAt),
    createdBy: row.createdBy,
    clonedFrom: row.clonedFrom ?? undefined,
    isActive: row.isActive,
    washId: row.washId ?? undefined,
    employeeConfigs: parseJsonField(row.employeeConfigs, []),
    dailyRequirements: parseJsonField(row.dailyRequirements, []),
    weeklyPattern: parseJsonField(row.weeklyPattern, undefined),
  };
}

export async function getSchedulePlansByMonth(month: string): Promise<SchedulePlan[]> {
  const plans = await getSchedulePlansData();
  return plans.filter(p => p.month === month);
}

export async function getActiveSchedulePlan(month: string): Promise<SchedulePlan | null> {
  const row = await prisma.schedulePlan.findFirst({ where: { month, isActive: true } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    month: row.month,
    createdAt: toISOString(row.createdAt),
    createdBy: row.createdBy,
    clonedFrom: row.clonedFrom ?? undefined,
    isActive: row.isActive,
    washId: row.washId ?? undefined,
    employeeConfigs: parseJsonField(row.employeeConfigs, []),
    dailyRequirements: parseJsonField(row.dailyRequirements, []),
    weeklyPattern: parseJsonField(row.weeklyPattern, undefined),
  };
}

export async function getAllFinanceDataForEmployee(employeeId: string) {
  const [allWashEvents, allSchemes, initialTransactions, allEmployees] = await Promise.all([
    getWashEventsData(),
    getSalarySchemesData(),
    getEmployeeTransactions(employeeId),
    getEmployeesData(),
  ]);
  return { allWashEvents, allSchemes, initialTransactions, allEmployees };
}

// ─── WRITE Functions ─────────────────────────────────────────

// --- Wash Events ---

export async function saveWashEvent(data: any): Promise<void> {
  // Resolve sourceId → aggregatorId / counterAgentId
  let aggregatorId: string | null = null;
  let counterAgentId: string | null = null;
  if (data.sourceId) {
    if (data.sourceId.startsWith('agg_')) aggregatorId = data.sourceId;
    else if (data.sourceId.startsWith('agent_')) counterAgentId = data.sourceId;
  }

  await prisma.washEvent.upsert({
    where: { id: data.id },
    update: {
      timestamp: new Date(data.timestamp),
      vehicleNumber: data.vehicleNumber,
      boxNumber: data.boxNumber ?? null,
      paymentMethod: data.paymentMethod,
      aggregatorId,
      counterAgentId,
      sourceName: data.sourceName ?? null,
      priceListName: data.priceListName ?? null,
      totalAmount: data.totalAmount,
      netAmount: data.netAmount ?? null,
      acquiringFee: data.acquiringFee ?? null,
      services: data.services,
      driverComments: data.driverComments ?? undefined,
      editHistory: data.editHistory ?? undefined,
      photos: data.photos ?? undefined,
      chemicalConsumptionGrams: data.chemicalConsumptionGrams ?? null,
      chemicalCostRub: data.chemicalCostRub ?? null,
      status: data.status ?? null,
      completedAt: data.completedAt ?? null,
      refundedAt: data.refundedAt ?? null,
      refundReason: data.refundReason ?? null,
      tips: data.tips ?? null,
      shiftId: data.shiftId ?? undefined,
      washDurationSeconds: data.washDurationSeconds ?? null,
      cameraSession: data.cameraSession ?? undefined,
      dismissal: data.dismissal ?? undefined,
      restoration: data.restoration ?? undefined,
      // Phase 8 / finding #38
      createdInClosedPeriod: data.createdInClosedPeriod ?? false,
      closedPeriodAtCreate: data.closedPeriodAtCreate ?? null,
    },
    create: {
      id: data.id,
      timestamp: new Date(data.timestamp),
      vehicleNumber: data.vehicleNumber,
      boxNumber: data.boxNumber ?? null,
      paymentMethod: data.paymentMethod,
      aggregatorId,
      counterAgentId,
      sourceName: data.sourceName ?? null,
      priceListName: data.priceListName ?? null,
      totalAmount: data.totalAmount,
      netAmount: data.netAmount ?? null,
      acquiringFee: data.acquiringFee ?? null,
      services: data.services,
      driverComments: data.driverComments ?? undefined,
      editHistory: data.editHistory ?? undefined,
      photos: data.photos ?? undefined,
      chemicalConsumptionGrams: data.chemicalConsumptionGrams ?? null,
      chemicalCostRub: data.chemicalCostRub ?? null,
      status: data.status ?? null,
      completedAt: data.completedAt ?? null,
      refundedAt: data.refundedAt ?? null,
      refundReason: data.refundReason ?? null,
      tips: data.tips ?? null,
      shiftId: data.shiftId ?? null,
      washDurationSeconds: data.washDurationSeconds ?? null,
      cameraSession: data.cameraSession ?? undefined,
      dismissal: data.dismissal ?? undefined,
      restoration: data.restoration ?? undefined,
      // Phase 8 / finding #38
      createdInClosedPeriod: data.createdInClosedPeriod ?? false,
      closedPeriodAtCreate: data.closedPeriodAtCreate ?? null,
    },
  });

  // Sync junction table for employeeIds
  const employeeIds: string[] = data.employeeIds ?? [];
  // Delete old links and recreate
  await prisma.washEventEmployee.deleteMany({ where: { washEventId: data.id } });
  if (employeeIds.length > 0) {
    await prisma.washEventEmployee.createMany({
      data: employeeIds.map(empId => ({ washEventId: data.id, employeeId: empId })),
      skipDuplicates: true,
    });
  }
}

export async function deleteWashEvent(id: string): Promise<void> {
  // Junction rows cascade-deleted via onDelete: Cascade
  await prisma.washEvent.delete({ where: { id } });
}

// --- Employees ---

export async function saveEmployee(data: any): Promise<void> {
  await prisma.employee.upsert({
    where: { id: data.id },
    update: {
      fullName: data.fullName,
      phone: data.phone ?? '',
      paymentDetails: data.paymentDetails ?? '',
      hasCar: data.hasCar ?? false,
      role: data.role ?? 'employee',
      telegramChatId: data.telegramChatId ?? null,
      username: data.username || null,
      password: data.password || null,
      salarySchemeId: data.salarySchemeId ?? null,
      canSwapShifts: data.canSwapShifts ?? true,
      preferredShiftType: data.preferredShiftType ?? null,
      weekdayPreferredShiftType: data.weekdayPreferredShiftType ?? null,
      weekendPreferredShiftType: data.weekendPreferredShiftType ?? null,
      targetShiftsPerMonth: data.targetShiftsPerMonth ?? null,
      wantsMoreShifts: data.wantsMoreShifts ?? null,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
    create: {
      id: data.id,
      fullName: data.fullName,
      phone: data.phone ?? '',
      paymentDetails: data.paymentDetails ?? '',
      hasCar: data.hasCar ?? false,
      role: data.role ?? 'employee',
      telegramChatId: data.telegramChatId ?? null,
      username: data.username || null,
      password: data.password || null,
      salarySchemeId: data.salarySchemeId ?? null,
      canSwapShifts: data.canSwapShifts ?? true,
      preferredShiftType: data.preferredShiftType ?? null,
      weekdayPreferredShiftType: data.weekdayPreferredShiftType ?? null,
      weekendPreferredShiftType: data.weekendPreferredShiftType ?? null,
      targetShiftsPerMonth: data.targetShiftsPerMonth ?? null,
      wantsMoreShifts: data.wantsMoreShifts ?? null,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await prisma.employee.delete({ where: { id } });
}

/**
 * UX-safety: soft-delete сотрудника (Phase 6.2).
 * Архивные пропадают из активных списков и графиков, но история сохраняется.
 * См. АДМИНКА-АРХИТЕКТУРНЫЕ-НАХОДКИ #1 (cascade 7 таблиц).
 */
export async function archiveEmployee(id: string): Promise<void> {
  await prisma.employee.update({
    where: { id },
    data: { archived: true, archivedAt: new Date().toISOString() },
  });
}

/** Возвращает сотрудника обратно из архива. */
export async function unarchiveEmployee(id: string): Promise<void> {
  await prisma.employee.update({
    where: { id },
    data: { archived: false, archivedAt: null },
  });
}

/**
 * Подсчёт реальных связей сотрудника — для pre-check перед hard DELETE.
 * Возвращает количество записей в каскадных таблицах.
 */
export async function getEmployeeImpact(id: string): Promise<{
  washEvents: number;
  transactions: number;
  shifts: number;
  violations: number;
  canisters: number;
  dayStatuses: number;
}> {
  const [washEvents, transactions, shifts, violations, canisters, dayStatuses] = await Promise.all([
    prisma.washEventEmployee.count({ where: { employeeId: id } }),
    prisma.employeeTransaction.count({ where: { employeeId: id } }),
    prisma.shiftEmployee.count({ where: { employeeId: id } }),
    prisma.violation.count({ where: { employeeId: id } }),
    prisma.employeeCanister.count({ where: { employeeId: id } }),
    prisma.employeeDayStatus.count({ where: { employeeId: id } }),
  ]);
  return { washEvents, transactions, shifts, violations, canisters, dayStatuses };
}

// --- Aggregators ---

export async function saveAggregator(data: any): Promise<void> {
  await prisma.aggregator.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      balance: data.balance ?? 0,
      companies: data.companies ?? [],
      cars: data.cars ?? [],
      priceLists: data.priceLists ?? [],
      activePriceListName: data.activePriceListName ?? null,
      // Phase 7 / finding #26: archived поля раньше игнорировались, PATCH не работал.
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
    create: {
      id: data.id,
      name: data.name,
      balance: data.balance ?? 0,
      companies: data.companies ?? [],
      cars: data.cars ?? [],
      priceLists: data.priceLists ?? [],
      activePriceListName: data.activePriceListName ?? null,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
  });
}

export async function deleteAggregator(id: string): Promise<void> {
  await prisma.aggregator.delete({ where: { id } });
}

/** Phase 7: soft-delete aggregator. Используется в POST /api/aggregators/[id]/archive
 *  и в saveAggregator (через PATCH archived). */
export async function archiveAggregator(id: string): Promise<void> {
  await prisma.aggregator.update({
    where: { id },
    data: { archived: true, archivedAt: new Date().toISOString() },
  });
}

export async function unarchiveAggregator(id: string): Promise<void> {
  await prisma.aggregator.update({
    where: { id },
    data: { archived: false, archivedAt: null },
  });
}

// --- Counter Agents ---

export async function saveCounterAgent(data: any): Promise<void> {
  await prisma.counterAgent.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      balance: data.balance ?? 0,
      companies: data.companies ?? [],
      cars: data.cars ?? [],
      priceList: data.priceList ?? [],
      additionalPriceList: data.additionalPriceList ?? [],
      allowCustomServices: data.allowCustomServices ?? false,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
    create: {
      id: data.id,
      name: data.name,
      balance: data.balance ?? 0,
      companies: data.companies ?? [],
      cars: data.cars ?? [],
      priceList: data.priceList ?? [],
      additionalPriceList: data.additionalPriceList ?? [],
      allowCustomServices: data.allowCustomServices ?? false,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
  });
}

export async function deleteCounterAgent(id: string): Promise<void> {
  await prisma.counterAgent.delete({ where: { id } });
}

// --- Client Balance (aggregators + counter agents) ---

export async function updateClientBalance(sourceId: string, amountChange: number): Promise<void> {
  if (!sourceId || amountChange === 0) return;

  if (sourceId.startsWith('agg_')) {
    await prisma.aggregator.update({
      where: { id: sourceId },
      data: { balance: { increment: amountChange } },
    });
  } else if (sourceId.startsWith('agent_')) {
    await prisma.counterAgent.update({
      where: { id: sourceId },
      data: { balance: { increment: amountChange } },
    });
  }
}

// --- Expenses ---

export async function saveExpense(data: any): Promise<void> {
  await prisma.expense.upsert({
    where: { id: data.id },
    update: {
      date: new Date(data.date),
      category: data.category,
      description: data.description ?? '',
      amount: data.amount,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      pricePerUnit: data.pricePerUnit ?? null,
    },
    create: {
      id: data.id,
      date: new Date(data.date),
      category: data.category,
      description: data.description ?? '',
      amount: data.amount,
      quantity: data.quantity ?? null,
      unit: data.unit ?? null,
      pricePerUnit: data.pricePerUnit ?? null,
    },
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await prisma.expense.delete({ where: { id } });
}

// --- Salary Schemes ---

export async function saveSalaryScheme(data: any): Promise<void> {
  await prisma.salaryScheme.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      type: data.type,
      percentage: data.percentage ?? null,
      fixedDeduction: data.fixedDeduction ?? null,
      rateSource: data.rateSource ?? undefined,
      rates: data.rates ?? undefined,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
    create: {
      id: data.id,
      name: data.name,
      type: data.type,
      percentage: data.percentage ?? null,
      fixedDeduction: data.fixedDeduction ?? null,
      rateSource: data.rateSource ?? undefined,
      rates: data.rates ?? undefined,
      archived: data.archived ?? false,
      archivedAt: data.archivedAt ?? null,
    },
  });
}

export async function deleteSalaryScheme(id: string): Promise<void> {
  await prisma.salaryScheme.delete({ where: { id } });
}

/**
 * UX-safety: soft-delete схемы (archived=true, archivedAt=now).
 * Используется в POST /api/salary-schemes/[id]/archive вместо hard DELETE.
 * Сотрудники с archived schemeId сохраняют связь — история ZP не теряется.
 */
export async function archiveSalaryScheme(id: string): Promise<void> {
  await prisma.salaryScheme.update({
    where: { id },
    data: { archived: true, archivedAt: new Date().toISOString() },
  });
}

/** Возвращает схему обратно из архива (отмена archive). */
export async function unarchiveSalaryScheme(id: string): Promise<void> {
  await prisma.salaryScheme.update({
    where: { id },
    data: { archived: false, archivedAt: null },
  });
}

// ─── SalaryPeriod (UX-safety: блокировка правок WashEvent) ───

export async function getSalaryPeriod(month: string): Promise<any | null> {
  return prisma.salaryPeriod.findUnique({ where: { month } });
}

export async function isSalaryPeriodClosed(month: string): Promise<boolean> {
  const period = await prisma.salaryPeriod.findUnique({ where: { month } });
  return !!period?.closed;
}

/**
 * Закрыть период ЗП. После этого PUT/DELETE /api/wash-events/[id]
 * с timestamp.slice(0,7) === month вернёт 423 Locked.
 * Если период уже существует — обновляет closed/closedBy/closedAt.
 */
export async function closeSalaryPeriod(month: string, closedBy: string): Promise<void> {
  const closedAt = new Date();
  await prisma.salaryPeriod.upsert({
    where: { month },
    create: { month, closed: true, closedBy, closedAt },
    update: { closed: true, closedBy, closedAt },
  });
}

/** Открыть период обратно (для исключений). */
export async function openSalaryPeriod(month: string): Promise<void> {
  await prisma.salaryPeriod.upsert({
    where: { month },
    create: { month, closed: false },
    update: { closed: false, closedAt: null },
  });
}

// ─── EmployeeSalarySchemeHistory ────────────────────────────

/**
 * Закрыть текущую активную запись истории (effectiveTo=now) + создать новую
 * с effectiveFrom=now и переданным schemeId.
 * Используется в PUT /api/employees/[id] когда salarySchemeId меняется.
 * Транзакционно, чтобы не было дубликатов "активных" записей.
 */
export async function appendEmployeeSchemeHistory(
  employeeId: string,
  schemeId: string | null,
  changedBy: string
): Promise<void> {
  const now = new Date();
  await prisma.$transaction([
    prisma.employeeSalarySchemeHistory.updateMany({
      where: { employeeId, effectiveTo: null },
      data: { effectiveTo: now },
    }),
    prisma.employeeSalarySchemeHistory.create({
      data: { employeeId, schemeId, effectiveFrom: now, changedBy },
    }),
  ]);
}

// --- Employee Transactions ---

export async function saveEmployeeTransaction(data: any): Promise<void> {
  await prisma.employeeTransaction.upsert({
    where: { id: data.id },
    update: {
      employeeId: data.employeeId,
      date: new Date(data.date),
      type: data.type,
      amount: data.amount,
      description: data.description ?? '',
    },
    create: {
      id: data.id,
      employeeId: data.employeeId,
      date: new Date(data.date),
      type: data.type,
      amount: data.amount,
      description: data.description ?? '',
    },
  });
}

export async function saveEmployeeTransactions(employeeId: string, transactions: any[]): Promise<void> {
  // Replace all transactions for this employee
  await prisma.$transaction([
    prisma.employeeTransaction.deleteMany({ where: { employeeId } }),
    ...transactions.map(t =>
      prisma.employeeTransaction.create({
        data: {
          id: t.id,
          employeeId: t.employeeId ?? employeeId,
          date: new Date(t.date),
          type: t.type,
          amount: t.amount,
          description: t.description ?? '',
        },
      })
    ),
  ]);
}

export async function deleteEmployeeTransaction(id: string): Promise<void> {
  await prisma.employeeTransaction.delete({ where: { id } });
}

// --- Client Transactions ---

export async function saveClientTransaction(data: any): Promise<void> {
  let aggregatorId: string | null = null;
  let counterAgentId: string | null = null;
  const clientId = data.clientId ?? '';
  if (clientId.startsWith('agg_')) aggregatorId = clientId;
  else if (clientId.startsWith('agent_')) counterAgentId = clientId;

  await prisma.clientTransaction.upsert({
    where: { id: data.id },
    update: {
      clientId,
      aggregatorId,
      counterAgentId,
      date: new Date(data.date),
      type: data.type ?? 'payment',
      amount: data.amount,
      description: data.description ?? '',
    },
    create: {
      id: data.id,
      clientId,
      aggregatorId,
      counterAgentId,
      date: new Date(data.date),
      type: data.type ?? 'payment',
      amount: data.amount,
      description: data.description ?? '',
    },
  });
}

export async function deleteClientTransaction(id: string): Promise<void> {
  await prisma.clientTransaction.delete({ where: { id } });
}

export async function saveClientTransactions(clientId: string, transactions: any[]): Promise<void> {
  let aggregatorId: string | null = null;
  let counterAgentId: string | null = null;
  if (clientId.startsWith('agg_')) aggregatorId = clientId;
  else if (clientId.startsWith('agent_')) counterAgentId = clientId;

  await prisma.$transaction([
    prisma.clientTransaction.deleteMany({ where: { clientId } }),
    ...transactions.map(t =>
      prisma.clientTransaction.create({
        data: {
          id: t.id,
          clientId: t.clientId ?? clientId,
          aggregatorId,
          counterAgentId,
          date: new Date(t.date),
          type: t.type ?? 'payment',
          amount: t.amount,
          description: t.description ?? '',
        },
      })
    ),
  ]);
}

// --- Shifts ---

export async function saveShift(data: any): Promise<void> {
  await prisma.shift.upsert({
    where: { id: data.id },
    update: {
      date: data.date,
      washId: data.washId ?? 'wash_1',
      boxNumber: data.boxNumber,
      shiftType: data.shiftType,
      startTime: data.startTime ?? '08:00',
      endTime: data.endTime ?? '20:00',
      releasedEmployeeId: data.releasedEmployeeId ?? null,
      isAutoAssigned: data.isAutoAssigned ?? false,
      status: data.status ?? 'scheduled',
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      closedAt: data.closedAt ? new Date(data.closedAt) : null,
    },
    create: {
      id: data.id,
      date: data.date,
      washId: data.washId ?? 'wash_1',
      boxNumber: data.boxNumber,
      shiftType: data.shiftType,
      startTime: data.startTime ?? '08:00',
      endTime: data.endTime ?? '20:00',
      releasedEmployeeId: data.releasedEmployeeId ?? null,
      isAutoAssigned: data.isAutoAssigned ?? false,
      status: data.status ?? 'scheduled',
      startedAt: data.startedAt ? new Date(data.startedAt) : null,
      closedAt: data.closedAt ? new Date(data.closedAt) : null,
    },
  });

  // Sync junction table
  const employeeIds: string[] = data.employeeIds ?? [];
  await prisma.shiftEmployee.deleteMany({ where: { shiftId: data.id } });
  if (employeeIds.length > 0) {
    await prisma.shiftEmployee.createMany({
      data: employeeIds.map(empId => ({ shiftId: data.id, employeeId: empId })),
      skipDuplicates: true,
    });
  }
}

export async function deleteShift(id: string): Promise<void> {
  await prisma.shift.delete({ where: { id } });
}

// --- Shift Swap Requests ---

export async function saveShiftSwapRequest(data: any): Promise<void> {
  await prisma.shiftSwapRequest.upsert({
    where: { id: data.id },
    update: {
      type: data.type,
      requesterId: data.requesterId,
      requesterShiftId: data.requesterShiftId,
      targetEmployeeId: data.targetEmployeeId ?? null,
      targetShiftId: data.targetShiftId ?? null,
      status: data.status,
      resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
    },
    create: {
      id: data.id,
      type: data.type,
      requesterId: data.requesterId,
      requesterShiftId: data.requesterShiftId,
      targetEmployeeId: data.targetEmployeeId ?? null,
      targetShiftId: data.targetShiftId ?? null,
      status: data.status,
      resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });
}

export async function deleteShiftSwapRequest(id: string): Promise<void> {
  await prisma.shiftSwapRequest.delete({ where: { id } });
}

// --- Shift Assignment Requests ---

export async function saveShiftAssignmentRequest(data: any): Promise<void> {
  await prisma.shiftAssignmentRequest.upsert({
    where: { id: data.id },
    update: {
      employeeId: data.employeeId,
      date: data.date,
      shiftType: data.shiftType,
      boxNumber: data.boxNumber,
      status: data.status,
      resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
      resolvedBy: data.resolvedBy ?? null,
      comment: data.comment ?? null,
    },
    create: {
      id: data.id,
      employeeId: data.employeeId,
      date: data.date,
      shiftType: data.shiftType,
      boxNumber: data.boxNumber,
      status: data.status,
      resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
      resolvedBy: data.resolvedBy ?? null,
      comment: data.comment ?? null,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });
}

export async function deleteShiftAssignmentRequest(id: string): Promise<void> {
  await prisma.shiftAssignmentRequest.delete({ where: { id } });
}

// --- Employee Day Statuses ---

export async function saveEmployeeDayStatus(data: any): Promise<void> {
  await prisma.employeeDayStatus.upsert({
    where: { employeeId_date: { employeeId: data.employeeId, date: data.date } },
    update: {
      id: data.id,
      status: data.status,
      shiftType: data.shiftType ?? null,
      boxNumber: data.boxNumber ?? null,
    },
    create: {
      id: data.id,
      employeeId: data.employeeId,
      date: data.date,
      status: data.status,
      shiftType: data.shiftType ?? null,
      boxNumber: data.boxNumber ?? null,
    },
  });
}

export async function deleteEmployeeDayStatus(id: string): Promise<void> {
  await prisma.employeeDayStatus.delete({ where: { id } });
}

// --- Schedule Plans ---

export async function saveSchedulePlan(data: any): Promise<void> {
  await prisma.schedulePlan.upsert({
    where: { id: data.id },
    update: {
      name: data.name,
      month: data.month,
      createdBy: data.createdBy,
      clonedFrom: data.clonedFrom ?? null,
      isActive: data.isActive ?? false,
      washId: data.washId ?? null,
      employeeConfigs: data.employeeConfigs ?? [],
      dailyRequirements: data.dailyRequirements ?? [],
      weeklyPattern: data.weeklyPattern ?? undefined,
    },
    create: {
      id: data.id,
      name: data.name,
      month: data.month,
      createdBy: data.createdBy,
      clonedFrom: data.clonedFrom ?? null,
      isActive: data.isActive ?? false,
      washId: data.washId ?? null,
      employeeConfigs: data.employeeConfigs ?? [],
      dailyRequirements: data.dailyRequirements ?? [],
      weeklyPattern: data.weeklyPattern ?? undefined,
      createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
    },
  });
}

export async function deleteSchedulePlan(id: string): Promise<void> {
  await prisma.schedulePlan.delete({ where: { id } });
}

// --- Stock Movements ---

export async function saveStockMovement(data: any): Promise<void> {
  // Ensure material exists
  const materialId = data.materialId ?? 'mat_chemical_main';
  const exists = await prisma.inventoryMaterial.findUnique({ where: { id: materialId } });
  if (!exists) {
    await prisma.inventoryMaterial.create({
      data: {
        id: materialId,
        name: materialId === 'mat_chemical_main' ? 'Химия (основная)' : materialId,
        category: 'chemical',
        unit: 'grams',
        currentStock: 0,
      },
    });
  }

  await prisma.stockMovement.upsert({
    where: { id: data.id },
    update: {
      materialId,
      type: data.type,
      amount: data.amount,
      balanceAfter: data.balanceAfter,
      date: new Date(data.date),
      description: data.description ?? '',
      relatedEntityType: data.relatedEntityType ?? null,
      relatedEntityId: data.relatedEntityId ?? null,
      employeeId: data.employeeId ?? null,
      createdBy: data.createdBy ?? null,
    },
    create: {
      id: data.id,
      materialId,
      type: data.type,
      amount: data.amount,
      balanceAfter: data.balanceAfter,
      date: new Date(data.date),
      description: data.description ?? '',
      relatedEntityType: data.relatedEntityType ?? null,
      relatedEntityId: data.relatedEntityId ?? null,
      employeeId: data.employeeId ?? null,
      createdBy: data.createdBy ?? null,
    },
  });
}

// --- Employee Canisters ---

export async function saveEmployeeCanister(data: any): Promise<void> {
  await prisma.employeeCanister.upsert({
    where: { id: data.id },
    update: {
      employeeId: data.employeeId,
      issuedAt: new Date(data.issuedAt),
      initialAmountGrams: data.initialAmountGrams,
      remainingAmountGrams: data.remainingAmountGrams,
      priceRub: data.priceRub,
      status: data.status,
      transactionId: data.transactionId ?? null,
    },
    create: {
      id: data.id,
      employeeId: data.employeeId,
      issuedAt: new Date(data.issuedAt),
      initialAmountGrams: data.initialAmountGrams,
      remainingAmountGrams: data.remainingAmountGrams,
      priceRub: data.priceRub,
      status: data.status,
      transactionId: data.transactionId ?? null,
    },
  });
}

export async function deleteEmployeeCanister(id: string): Promise<void> {
  await prisma.employeeCanister.delete({ where: { id } });
}

// --- Shift Reports ---

export async function saveShiftReport(data: any): Promise<void> {
  // Caller (shift-report-service) passes envelope:
  //   { id, date, shiftType, boxNumber, shiftId, createdAt, data: ShiftReportData }
  // The envelope's scalar fields (date/shiftType/boxNumber/shiftId) go into
  // their own columns; only the inner `data` payload belongs in the JSONB
  // `data` column. Previously the entire envelope (minus id) was stored,
  // producing `report.data.data.totalAmount` double-nesting in reads.
  const innerPayload = data.data && typeof data.data === 'object' ? data.data : data;
  const dateStr = data.date ?? innerPayload.closedAt?.substring(0, 10)
    ?? innerPayload.startedAt?.substring(0, 10) ?? '';

  await prisma.shiftReport.upsert({
    where: { id: data.id },
    update: {
      date: dateStr,
      shiftType: data.shiftType ?? 'day',
      boxNumber: data.boxNumber ?? 1,
      shiftId: data.shiftId ?? null,
      data: innerPayload,
    },
    create: {
      id: data.id,
      date: dateStr,
      shiftType: data.shiftType ?? 'day',
      boxNumber: data.boxNumber ?? 1,
      shiftId: data.shiftId ?? null,
      data: innerPayload,
      createdAt: innerPayload.closedAt
        ? new Date(innerPayload.closedAt)
        : (data.createdAt ? new Date(data.createdAt) : undefined),
    },
  });
}

// --- App Configs (singletons) ---

export async function saveInventory(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'inventory' },
    update: { value: data },
    create: { key: 'inventory', value: data },
  });
}

export async function saveChemicalConfig(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'chemicalConfig' },
    update: { value: data },
    create: { key: 'chemicalConfig', value: data },
  });
}

export async function getChemicalConfig(): Promise<any> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'chemicalConfig' } });
  return row?.value ?? null;
}

export async function saveRetailPriceConfig(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'retailPriceList' },
    update: { value: data },
    create: { key: 'retailPriceList', value: data },
  });
}

export async function saveVehicleTypes(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'vehicleTypes' },
    update: { value: data },
    create: { key: 'vehicleTypes', value: data },
  });
}

export async function getVehicleTypes(): Promise<any> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'vehicleTypes' } });
  return row?.value ?? [];
}

export async function saveAppVersion(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'appVersion' },
    update: { value: data },
    create: { key: 'appVersion', value: data },
  });
}

export async function getAppVersion(): Promise<any> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'appVersion' } });
  return row?.value ?? null;
}

export async function saveDeviceHeartbeats(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'deviceHeartbeats' },
    update: { value: data },
    create: { key: 'deviceHeartbeats', value: data },
  });
}

export async function getDeviceHeartbeats(): Promise<any> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'deviceHeartbeats' } });
  return row?.value ?? {};
}

export async function saveWeatherPatterns(data: any): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: 'weatherPatterns' },
    update: { value: data },
    create: { key: 'weatherPatterns', value: data },
  });
}

export async function getWeatherPatterns(): Promise<any> {
  const row = await prisma.appConfig.findUnique({ where: { key: 'weatherPatterns' } });
  return row?.value ?? null;
}

// --- Compound Operations (transactional) ---

/**
 * Create a wash event with all side effects in a single transaction:
 * - WashEvent + WashEventEmployee junction
 * - StockMovement (chemical consumption)
 * - Inventory update (chemical stock)
 * - Client balance update (aggregator/counter-agent)
 */
export async function createWashEventWithSideEffects(
  washEvent: any,
  stockMovement: any | null,
  inventoryUpdate: { chemicalStockGrams: number; materials?: any[] } | null,
  clientBalanceChange: { sourceId: string; amount: number } | null,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // 1. Create wash event
    let aggregatorId: string | null = null;
    let counterAgentId: string | null = null;
    if (washEvent.sourceId) {
      if (washEvent.sourceId.startsWith('agg_')) aggregatorId = washEvent.sourceId;
      else if (washEvent.sourceId.startsWith('agent_')) counterAgentId = washEvent.sourceId;
    }

    await tx.washEvent.create({
      data: {
        id: washEvent.id,
        timestamp: new Date(washEvent.timestamp),
        vehicleNumber: washEvent.vehicleNumber,
        boxNumber: washEvent.boxNumber ?? null,
        paymentMethod: washEvent.paymentMethod,
        aggregatorId,
        counterAgentId,
        sourceName: washEvent.sourceName ?? null,
        priceListName: washEvent.priceListName ?? null,
        totalAmount: washEvent.totalAmount,
        netAmount: washEvent.netAmount ?? null,
        acquiringFee: washEvent.acquiringFee ?? null,
        services: washEvent.services,
        driverComments: washEvent.driverComments ?? undefined,
        photos: washEvent.photos ?? undefined,
        chemicalConsumptionGrams: washEvent.chemicalConsumptionGrams ?? null,
        chemicalCostRub: washEvent.chemicalCostRub ?? null,
        status: washEvent.status ?? null,
        completedAt: washEvent.completedAt ?? null,
        tips: washEvent.tips ?? null,
        washDurationSeconds: washEvent.washDurationSeconds ?? null,
        cameraSession: washEvent.cameraSession ?? undefined,
        dismissal: washEvent.dismissal ?? undefined,
        restoration: washEvent.restoration ?? undefined,
      },
    });

    // 2. Junction table
    const employeeIds: string[] = washEvent.employeeIds ?? [];
    if (employeeIds.length > 0) {
      await tx.washEventEmployee.createMany({
        data: employeeIds.map(empId => ({ washEventId: washEvent.id, employeeId: empId })),
      });
    }

    // 3. Stock movement
    if (stockMovement) {
      // Ensure material exists
      const mat = await tx.inventoryMaterial.findUnique({ where: { id: stockMovement.materialId } });
      if (!mat) {
        await tx.inventoryMaterial.create({
          data: {
            id: stockMovement.materialId,
            name: 'Химия (основная)',
            category: 'chemical',
            unit: 'grams',
            currentStock: 0,
          },
        });
      }
      await tx.stockMovement.create({
        data: {
          id: stockMovement.id,
          materialId: stockMovement.materialId,
          type: stockMovement.type,
          amount: stockMovement.amount,
          balanceAfter: stockMovement.balanceAfter,
          date: new Date(stockMovement.date),
          description: stockMovement.description ?? '',
          relatedEntityType: stockMovement.relatedEntityType ?? null,
          relatedEntityId: stockMovement.relatedEntityId ?? null,
          employeeId: stockMovement.employeeId ?? null,
        },
      });
    }

    // 4. Inventory update
    if (inventoryUpdate) {
      await tx.appConfig.upsert({
        where: { key: 'inventory' },
        update: { value: inventoryUpdate as any },
        create: { key: 'inventory', value: inventoryUpdate as any },
      });
    }

    // 5. Client balance
    if (clientBalanceChange && clientBalanceChange.sourceId) {
      const { sourceId, amount } = clientBalanceChange;
      if (sourceId.startsWith('agg_')) {
        await tx.aggregator.update({
          where: { id: sourceId },
          data: { balance: { increment: amount } },
        });
      } else if (sourceId.startsWith('agent_')) {
        await tx.counterAgent.update({
          where: { id: sourceId },
          data: { balance: { increment: amount } },
        });
      }
    }
  });
}

// ─── Cache invalidation (no-ops for PG) ──────────────────────

export async function invalidateWashEventsCache() {}
export async function invalidateAggregatorsCache() {}
export async function invalidateCounterAgentsCache() {}
export async function invalidateEmployeesCache() {}
export async function invalidateSalarySchemesCache() {}
export async function invalidateRetailPriceConfigCache() {}
export async function invalidateExpensesCache() {}
export async function invalidateInventoryCache() {}
export async function invalidateStockMovementsCache() {}
export async function invalidateEmployeeCanistersCache() {}
export async function invalidateEmployeeTransactionsCache(_employeeId: string) {}
export async function invalidateAllEmployeeTransactionsCache() {}
export async function invalidateClientTransactionsCache(_clientId: string) {}
export async function invalidateAllClientTransactionsCache() {}
export async function invalidateShiftsCache() {}
export async function invalidateShiftSwapRequestsCache() {}
export async function invalidateShiftAssignmentRequestsCache() {}
export async function invalidateEmployeeDayStatusesCache() {}
export async function invalidateSchedulePlansCache() {}
export async function invalidateActiveSessionCache() {}

// ─── Reset financial data (admin tool) ─────────────────────────

export async function resetFinancialData(): Promise<void> {
  await prisma.$transaction([
    prisma.washEventEmployee.deleteMany(),
    prisma.washEvent.deleteMany(),
    prisma.employeeTransaction.deleteMany(),
    prisma.clientTransaction.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.aggregator.updateMany({ data: { balance: 0 } }),
    prisma.counterAgent.updateMany({ data: { balance: 0 } }),
  ]);

  // Reset inventory stock to 0, preserving settings/materials
  const existing = await prisma.appConfig.findUnique({ where: { key: 'inventory' } });
  if (existing?.value) {
    const inv = existing.value as any;
    inv.chemicalStockGrams = 0;
    await prisma.appConfig.update({
      where: { key: 'inventory' },
      data: { value: inv },
    });
  }
}

// ─── Violations ─────────────────────────────────────────────

function violationFromPrisma(row: any): Violation {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    type: row.type as any,
    description: row.description,
    penaltyAmount: row.penaltyAmount ?? undefined,
    shiftId: row.shiftId ?? undefined,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    resolved: row.resolved,
    resolvedComment: row.resolvedComment ?? undefined,
  };
}

export async function getViolationsData(): Promise<Violation[]> {
  const rows = await prisma.violation.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(violationFromPrisma);
}

export async function saveViolation(violation: Violation): Promise<void> {
  await prisma.violation.upsert({
    where: { id: violation.id },
    create: {
      id: violation.id,
      employeeId: violation.employeeId,
      date: violation.date,
      type: violation.type,
      description: violation.description,
      penaltyAmount: violation.penaltyAmount ?? null,
      shiftId: violation.shiftId ?? null,
      createdBy: violation.createdBy,
      resolved: violation.resolved ?? false,
      resolvedComment: violation.resolvedComment ?? null,
    },
    update: {
      description: violation.description,
      penaltyAmount: violation.penaltyAmount ?? null,
      resolved: violation.resolved ?? false,
      resolvedComment: violation.resolvedComment ?? null,
    },
  });
}

export async function deleteViolation(id: string): Promise<void> {
  await prisma.violation.delete({ where: { id } }).catch(() => {});
}

export async function getShiftReportsData(): Promise<any[]> {
  const rows = await prisma.shiftReport.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r: any) => {
    const raw = r.data as any;
    // Backward compat: legacy rows stored the whole envelope (with nested
    // `data` field) into the JSONB column. Unwrap if double-nesting detected.
    const data = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
      ? raw.data
      : raw;
    return {
      id: r.id,
      date: r.date,
      shiftType: r.shiftType,
      boxNumber: r.boxNumber,
      shiftId: (r as any).shiftId ?? undefined,
      data,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    };
  });
}

// ─── Phase 7: Backend polish (real metrics) ────────────────────

/**
 * Считает реальные метрики работы сотрудника для Live Impact Preview
 * (см. SchemeImpactPreview в EmployeeForm).
 *
 * Возвращает:
 *  - monthsWorked: число календарных месяцев между первой и последней мойкой
 *  - monthlyTurnover: средний netAmount (или totalAmount если netAmount=null) на мес
 *  - washEventsCount: всего моек у сотрудника
 *  - firstWashAt / lastWashAt: даты первой и последней мойки
 *  - currentMonthTurnover: оборот текущего календарного месяца
 *
 * Если у сотрудника нет моек — возвращает нули (UI должен показать «нет данных»).
 */
export async function getEmployeeSchemeImpact(employeeId: string): Promise<{
  monthsWorked: number;
  monthlyTurnover: number;
  washEventsCount: number;
  firstWashAt: string | null;
  lastWashAt: string | null;
  currentMonthTurnover: number;
}> {
  // Забираем только метаданные (timestamp, totalAmount, netAmount) —
  // не тянем всю мойку, выборка может быть большой.
  const links = await prisma.washEventEmployee.findMany({
    where: { employeeId },
    select: {
      washEvent: {
        select: {
          timestamp: true,
          totalAmount: true,
          netAmount: true,
          status: true,
        },
      },
    },
  });

  // Только успешно завершённые мойки (status null = legacy completed)
  const valid = links
    .map(l => l.washEvent)
    .filter(w => w && (w.status == null || w.status === 'completed'));

  if (valid.length === 0) {
    return {
      monthsWorked: 0,
      monthlyTurnover: 0,
      washEventsCount: 0,
      firstWashAt: null,
      lastWashAt: null,
      currentMonthTurnover: 0,
    };
  }

  const sorted = [...valid].sort((a, b) => a!.timestamp.getTime() - b!.timestamp.getTime());
  const firstWash = sorted[0]!;
  const lastWash = sorted[sorted.length - 1]!;

  // Считаем «оборот» как netAmount (т.е. без acquiringFee), fallback на totalAmount.
  // Это база ZP-расчёта по проценту в SalaryScheme type='percentage'.
  const totalTurnover = valid.reduce(
    (sum, w) => sum + (w!.netAmount ?? w!.totalAmount ?? 0),
    0
  );

  // Месяцев работы (по месяцам, не по дням): YYYY-MM первой мойки vs текущий
  const monthsSet = new Set<string>();
  for (const w of valid) monthsSet.add(w!.timestamp.toISOString().slice(0, 7));
  const monthsWorked = Math.max(1, monthsSet.size);

  const monthlyTurnover = Math.round(totalTurnover / monthsWorked);

  // Текущий месяц отдельно (для UI: «в этом месяце уже X ₽»)
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthTurnover = valid
    .filter(w => w!.timestamp.toISOString().slice(0, 7) === currentMonthKey)
    .reduce((sum, w) => sum + (w!.netAmount ?? w!.totalAmount ?? 0), 0);

  return {
    monthsWorked,
    monthlyTurnover,
    washEventsCount: valid.length,
    firstWashAt: firstWash.timestamp.toISOString(),
    lastWashAt: lastWash.timestamp.toISOString(),
    currentMonthTurnover: Math.round(currentMonthTurnover),
  };
}

/**
 * Пересчёт остатков склада из StockMovement (admin recovery tool).
 *
 * Для каждого InventoryMaterial:
 *   newCurrentStock = SUM(StockMovement.amount WHERE materialId = X)
 *   (amount уже хранится со знаком: purchase = +, consumption/issue = -)
 *
 * Возвращает diff (старое vs новое) для каждого материала.
 * Если apply=true — записывает новые значения в БД, иначе только preview.
 *
 * Также синхронизирует Inventory.chemicalStockGrams с mat_chemical_main
 * (legacy единое поле).
 */
export async function recomputeInventoryStock(apply: boolean): Promise<{
  materials: Array<{
    id: string;
    name: string;
    currentStock: number;
    computedStock: number;
    delta: number;
    movementCount: number;
  }>;
  legacyChemicalStockGrams?: { current: number; computed: number; delta: number };
  applied: boolean;
}> {
  const materials = await prisma.inventoryMaterial.findMany({
    select: { id: true, name: true, currentStock: true },
  });

  const result: Array<{
    id: string;
    name: string;
    currentStock: number;
    computedStock: number;
    delta: number;
    movementCount: number;
  }> = [];

  for (const m of materials) {
    const agg = await prisma.stockMovement.aggregate({
      where: { materialId: m.id },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const computed = agg._sum.amount ?? 0;
    const delta = computed - m.currentStock;
    result.push({
      id: m.id,
      name: m.name,
      currentStock: m.currentStock,
      computedStock: Math.round(computed * 100) / 100,
      delta: Math.round(delta * 100) / 100,
      movementCount: agg._count._all,
    });
  }

  // Legacy chemicalStockGrams хранится в JSON-инвентаре (Inventory модель в БД нет —
  // это JSON-only field). Postgres-only пересчёт работает с InventoryMaterial напрямую.
  // mat_chemical_main и есть SOT для химии в pg-режиме.

  if (apply) {
    await prisma.$transaction(async (tx) => {
      for (const r of result) {
        if (r.delta !== 0) {
          await tx.inventoryMaterial.update({
            where: { id: r.id },
            data: { currentStock: r.computedStock },
          });
        }
      }
    });
  }

  return {
    materials: result,
    applied: apply,
  };
}

/**
 * Phase 7 / Finding #25: pre-check для удаления Aggregator/CounterAgent.
 * Возвращает список SalaryScheme где rateSource.type === sourceType
 * и rateSource.id === sourceId. Если этот список не пуст — удаление source
 * сломает расчёт ZP по этим схемам.
 */
export async function findSchemesUsingRateSource(
  sourceType: 'aggregator' | 'counterAgent' | 'retail',
  sourceId: string
): Promise<Array<{ id: string; name: string; type: string }>> {
  // rateSource — это Json. Используем прямой SQL фильтр через JSONB операторы.
  // Prisma не умеет нативно фильтровать по @> для произвольных JSON, поэтому
  // забираем все схемы с непустым rateSource и фильтруем в JS.
  // Объём небольшой (~10 схем) — приемлемо.
  const all = await prisma.salaryScheme.findMany({
    where: { rateSource: { not: undefined } as any },
    select: { id: true, name: true, type: true, rateSource: true },
  });
  return all
    .filter((s: any) => {
      const rs = s.rateSource;
      if (!rs || typeof rs !== 'object') return false;
      return rs.type === sourceType && rs.id === sourceId;
    })
    .map((s: any) => ({ id: s.id, name: s.name, type: s.type }));
}

/**
 * Pre-check для DELETE Aggregator. Считает связи в каскадных таблицах
 * + находит схемы ZP с rateSource на этого aggregator (finding #25).
 */
export async function getAggregatorImpact(id: string): Promise<{
  washEvents: number;
  clientTransactions: number;
  schemesUsingAsRateSource: Array<{ id: string; name: string; type: string }>;
}> {
  const [washEvents, clientTransactions, schemes] = await Promise.all([
    prisma.washEvent.count({ where: { aggregatorId: id } }),
    prisma.clientTransaction.count({ where: { aggregatorId: id } }),
    findSchemesUsingRateSource('aggregator', id),
  ]);
  return { washEvents, clientTransactions, schemesUsingAsRateSource: schemes };
}

/** Pre-check для DELETE CounterAgent — аналогично getAggregatorImpact. */
export async function getCounterAgentImpact(id: string): Promise<{
  washEvents: number;
  clientTransactions: number;
  schemesUsingAsRateSource: Array<{ id: string; name: string; type: string }>;
}> {
  const [washEvents, clientTransactions, schemes] = await Promise.all([
    prisma.washEvent.count({ where: { counterAgentId: id } }),
    prisma.clientTransaction.count({ where: { counterAgentId: id } }),
    findSchemesUsingRateSource('counterAgent', id),
  ]);
  return { washEvents, clientTransactions, schemesUsingAsRateSource: schemes };
}
