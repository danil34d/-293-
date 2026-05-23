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
    // Phase 10 / finding #40
    createdByEmployeeId: row.createdByEmployeeId ?? undefined,
    // Phase 57 / multi-company
    ourCompanyId: row.ourCompanyId ?? undefined,
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
    // Phase 57 / multi-company
    preferredOurCompanyId: row.preferredOurCompanyId ?? undefined,
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
    // Phase 50 / V2-#4: drivers (Json) — split-pricing
    drivers: parseJsonField(row.drivers, []),
    // Phase 57 / multi-company
    preferredOurCompanyId: row.preferredOurCompanyId ?? undefined,
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
    // Phase 57 / multi-company
    ourCompanyId: row.ourCompanyId ?? undefined,
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
    // Phase 57 / multi-company
    ourCompanyId: row.ourCompanyId ?? undefined,
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
    // Phase 52 / V2-NEW-1 канистры
    mode: row.mode as any,
    issuedBy: row.issuedBy ?? undefined,
    notes: row.notes ?? '',
    washPoint: row.washPoint ?? undefined,
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
      // Phase 10 / finding #40 — НЕ перезаписываем при upsert update,
      // чтобы не потерять оригинального автора при последующих edit'ах.
      // (Update path — это PUT, у нас createdByEmployeeId фиксируется только на create.)
      // Phase 57 / multi-company — admin может сменить ИП через UI (override)
      ourCompanyId: data.ourCompanyId ?? null,
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
      // Phase 10 / finding #40 — фиксируется только на create (PUT не трогает)
      createdByEmployeeId: data.createdByEmployeeId ?? null,
      // Phase 57 / multi-company — какое НАШЕ ИП оказало услугу
      ourCompanyId: data.ourCompanyId ?? null,
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
 * Phase 24a / V2-#2 / finding #7 АРХ-НАХОДКИ: атомарный реверс StockMovement при DELETE Expense.
 *
 * Проблема: DELETE Expense (категория Закупка химии) оставляет
 *   - StockMovement.purchase orphan (FK не cascade)
 *   - Inventory.chemicalStockGrams (AppConfig JSON) не пересчитан
 *   - История остаётся «бита» (Phase 20 orphan scanner это уже видит, но это репорт-only)
 *
 * Решение: при удалении Expense в транзакции
 *   1. Найти все StockMovement где relatedEntityType='expense' AND relatedEntityId=expenseId
 *   2. Для каждого — создать reverse-movement type='adjustment' с amount=-original
 *      (это сохраняет audit trail — оригинал + реверс оба видны в журнале)
 *   3. Декремент InventoryMaterial.currentStock на сумму реверсируемых amounts
 *
 * Возвращает summary: сколько реверсировано, на какую сумму kg.
 */
export async function reverseExpenseStockMovements(
  expenseId: string,
  employeeId?: string
): Promise<{
  reversed: number;
  totalGramsReversed: number;
  reverseMovementIds: string[];
}> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      relatedEntityType: 'expense',
      relatedEntityId: expenseId,
    },
    select: {
      id: true,
      materialId: true,
      type: true,
      amount: true,
    },
  });

  if (movements.length === 0) {
    return { reversed: 0, totalGramsReversed: 0, reverseMovementIds: [] };
  }

  const now = new Date();
  const reverseMovementIds: string[] = [];
  let totalGramsReversed = 0;

  await prisma.$transaction(async (tx) => {
    for (const m of movements) {
      const reverseAmount = -m.amount;
      const material = await tx.inventoryMaterial.findUnique({
        where: { id: m.materialId },
        select: { currentStock: true },
      });
      const newStock = (material?.currentStock ?? 0) + reverseAmount;

      const reverseId = `sm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_rev`;
      await tx.stockMovement.create({
        data: {
          id: reverseId,
          materialId: m.materialId,
          type: 'adjustment',
          amount: reverseAmount,
          balanceAfter: newStock,
          date: now,
          description: `Авто-реверс при удалении Expense ${expenseId} (оригинал SM ${m.id}, ${m.type})`,
          relatedEntityType: 'expense_reversal',
          relatedEntityId: expenseId,
          employeeId: employeeId ?? null,
          createdBy: employeeId ?? null,
        },
      });
      await tx.inventoryMaterial.update({
        where: { id: m.materialId },
        data: { currentStock: newStock },
      });
      reverseMovementIds.push(reverseId);
      totalGramsReversed += Math.abs(m.amount);
    }
  });

  return {
    reversed: movements.length,
    totalGramsReversed: Math.round(totalGramsReversed * 100) / 100,
    reverseMovementIds,
  };
}

/**
 * Phase 20 / finding #8 АРХ-НАХОДКИ: scan orphan StockMovement.
 *
 * `StockMovement.relatedEntityType` + `relatedEntityId` — soft FK без БД-констрейнта.
 * DELETE WashEvent / Expense оставляет StockMovement с битой ссылкой.
 *
 * Функция сканирует все StockMovement с relatedEntityType='wash_event'/'expense'
 * и проверяет существование связанной записи. Возвращает orphan'ы с метаданными.
 *
 * Не удаляет (история ценна) — только репортит. Endpoint /api/inventory/orphan-stock
 * предоставляет результат, UI показывает badge «связь утеряна» рядом со строкой.
 */
export async function findOrphanedStockMovements(): Promise<{
  total: number;
  orphans: Array<{
    id: string;
    materialId: string;
    type: string;
    amount: number;
    date: string;
    description: string;
    relatedEntityType: string;
    relatedEntityId: string;
    reason: string;
  }>;
  summary: {
    totalMovements: number;
    withSoftFK: number;
    orphanCount: number;
    byReason: Record<string, number>;
  };
}> {
  // 1. Забираем все movements с soft FK (relatedEntityType + relatedEntityId)
  const movements = await prisma.stockMovement.findMany({
    where: {
      relatedEntityType: { not: null },
      relatedEntityId: { not: null },
    },
    select: {
      id: true,
      materialId: true,
      type: true,
      amount: true,
      date: true,
      description: true,
      relatedEntityType: true,
      relatedEntityId: true,
    },
  });

  const totalAll = await prisma.stockMovement.count();
  const withSoftFK = movements.length;

  // 2. Группируем по relatedEntityType
  const byType = new Map<string, Set<string>>();
  for (const m of movements) {
    const t = m.relatedEntityType!;
    if (!byType.has(t)) byType.set(t, new Set());
    byType.get(t)!.add(m.relatedEntityId!);
  }

  // 3. Проверяем существование связанных записей batch'ами
  const existingIds = new Map<string, Set<string>>();

  for (const [type, ids] of byType) {
    const idsArray = Array.from(ids);
    const existing = new Set<string>();

    if (type === 'wash_event') {
      const rows = await prisma.washEvent.findMany({
        where: { id: { in: idsArray } },
        select: { id: true },
      });
      for (const r of rows) existing.add(r.id);
    } else if (type === 'expense') {
      const rows = await prisma.expense.findMany({
        where: { id: { in: idsArray } },
        select: { id: true },
      });
      for (const r of rows) existing.add(r.id);
    } else if (type === 'employee') {
      const rows = await prisma.employee.findMany({
        where: { id: { in: idsArray } },
        select: { id: true },
      });
      for (const r of rows) existing.add(r.id);
    } else if (type === 'canister') {
      const rows = await prisma.employeeCanister.findMany({
        where: { id: { in: idsArray } },
        select: { id: true },
      });
      for (const r of rows) existing.add(r.id);
    }
    // Other types — без проверки, не считаем orphan'ом

    existingIds.set(type, existing);
  }

  // 4. Собираем orphan'ы
  const orphans: Array<{
    id: string;
    materialId: string;
    type: string;
    amount: number;
    date: string;
    description: string;
    relatedEntityType: string;
    relatedEntityId: string;
    reason: string;
  }> = [];
  const byReason: Record<string, number> = {};

  for (const m of movements) {
    const type = m.relatedEntityType!;
    const checkedTypes = new Set(['wash_event', 'expense', 'employee', 'canister']);
    if (!checkedTypes.has(type)) continue; // unknown type — skip

    const existing = existingIds.get(type) ?? new Set();
    if (!existing.has(m.relatedEntityId!)) {
      const reason = `${type} ${m.relatedEntityId} удалён`;
      byReason[type] = (byReason[type] ?? 0) + 1;
      orphans.push({
        id: m.id,
        materialId: m.materialId,
        type: m.type,
        amount: m.amount,
        date: m.date.toISOString(),
        description: m.description,
        relatedEntityType: type,
        relatedEntityId: m.relatedEntityId!,
        reason,
      });
    }
  }

  return {
    total: orphans.length,
    orphans,
    summary: {
      totalMovements: totalAll,
      withSoftFK,
      orphanCount: orphans.length,
      byReason,
    },
  };
}

// ─── Phase 22 / Invoice ─────────────────────────────────────────

function invoiceFromPrisma(row: any): import('@/types').Invoice {
  return {
    id: row.id,
    number: row.number,
    counterAgentId: row.counterAgentId,
    counterAgentName: row.counterAgent?.name,
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : row.periodStart,
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : row.periodEnd,
    status: (row.status ?? 'draft') as any,
    subtotal: row.subtotal,
    discountPercent: row.discountPercent ?? undefined,
    discountAmount: row.discountAmount ?? undefined,
    prepayments: row.prepayments ?? undefined,
    totalAmount: row.totalAmount,
    items: parseJsonField(row.items, { services: [], washes: [] }),
    createdByEmployeeId: row.createdByEmployeeId ?? undefined,
    sentAt: row.sentAt instanceof Date ? row.sentAt.toISOString() : (row.sentAt ?? undefined),
    sentToEmail: row.sentToEmail ?? undefined,
    paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : (row.paidAt ?? undefined),
    paidVia: row.paidVia ?? undefined,
    paidTransactionId: row.paidTransactionId ?? undefined,
    notes: row.notes ?? '',
    // Phase 57b.1: multi-company FK
    ourCompanyId: row.ourCompanyId ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

export async function getInvoicesData(filters?: {
  counterAgentId?: string;
  status?: string;
  periodFrom?: string;
  periodTo?: string;
}): Promise<import('@/types').Invoice[]> {
  const where: any = {};
  if (filters?.counterAgentId) where.counterAgentId = filters.counterAgentId;
  if (filters?.status) where.status = filters.status;
  if (filters?.periodFrom || filters?.periodTo) {
    where.periodStart = {};
    if (filters.periodFrom) where.periodStart.gte = new Date(filters.periodFrom);
    if (filters.periodTo) where.periodStart.lte = new Date(filters.periodTo);
  }
  const rows = await prisma.invoice.findMany({
    where,
    include: { counterAgent: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map(invoiceFromPrisma);
}

export async function getInvoiceById(id: string): Promise<import('@/types').Invoice | null> {
  const row = await prisma.invoice.findUnique({
    where: { id },
    include: { counterAgent: { select: { name: true } } },
  });
  return row ? invoiceFromPrisma(row) : null;
}

export async function getInvoicesByCounterAgent(counterAgentId: string): Promise<import('@/types').Invoice[]> {
  return getInvoicesData({ counterAgentId });
}

/**
 * Phase 22: генерация номера счёта вида "YYYY-MM-NNN".
 * NNN — счётчик per-month, начиная с 001. Атомарно через max + 1.
 */
export async function generateInvoiceNumber(periodStart: Date): Promise<string> {
  const year = periodStart.getFullYear();
  const month = String(periodStart.getMonth() + 1).padStart(2, '0');
  const prefix = `${year}-${month}-`;

  const existing = await prisma.invoice.findMany({
    where: { number: { startsWith: prefix } },
    select: { number: true },
  });
  let maxN = 0;
  for (const inv of existing) {
    const tail = inv.number.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > maxN) maxN = n;
  }
  const next = String(maxN + 1).padStart(3, '0');
  return `${prefix}${next}`;
}

/**
 * Phase 22: основная функция — собрать WashEvent + ClientTransaction за период
 * и сформировать items snapshot. НЕ создаёт запись в БД — только preview.
 *
 * services: агрегация по serviceName (для сводки)
 * washes: детализация по WashEvent (для сворачиваемого блока)
 */
export async function buildInvoicePreview(
  counterAgentId: string,
  periodStart: Date,
  periodEnd: Date,
  discountPercent?: number
): Promise<{
  counterAgentId: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  prepayments: number;
  totalAmount: number;
  items: import('@/types').InvoiceItems;
  washCount: number;
}> {
  // 1. Все completed WashEvent за период для этого counterAgent
  const washEvents = await prisma.washEvent.findMany({
    where: {
      counterAgentId,
      timestamp: { gte: periodStart, lte: periodEnd },
      OR: [{ status: null }, { status: 'completed' }, { status: 'restored' }],
    },
    orderBy: { timestamp: 'asc' },
  });

  // 2. Все ClientTransaction (type='payment') за период для предоплат
  const prepaymentsRows = await prisma.clientTransaction.findMany({
    where: {
      counterAgentId,
      date: { gte: periodStart, lte: periodEnd },
      type: 'payment',
    },
    select: { amount: true },
  });
  const prepayments = prepaymentsRows.reduce((sum, t) => sum + (t.amount || 0), 0);

  // 3. Aggregate by serviceName (для services array)
  const serviceMap = new Map<string, { qty: number; pricePerUnit: number; total: number }>();
  const washes: import('@/types').InvoiceWashItem[] = [];
  let subtotal = 0;

  for (const w of washEvents) {
    const services = parseJsonField(w.services, { main: { serviceName: '', price: 0 }, additional: [] });
    const allServices = [services.main, ...(services.additional || [])].filter((s: any) => s?.serviceName);

    // Краткое описание услуг для wash item
    const serviceShort = allServices.map((s: any) => s.serviceName).join(' + ') || '—';
    const washTotal = w.totalAmount || 0;
    subtotal += washTotal;

    washes.push({
      id: w.id,
      date: w.timestamp.toISOString(),
      plate: w.vehicleNumber,
      vehicleType: undefined,
      services: serviceShort,
      total: washTotal,
    });

    // Aggregation: по каждой услуге отдельно (так клиент видит «Мойка тягача × 5»)
    for (const s of allServices) {
      const key = s.serviceName;
      const price = s.price ?? 0;
      const existing = serviceMap.get(key);
      if (existing) {
        existing.qty += 1;
        existing.total += price;
        // pricePerUnit оставляем как первое — если цены разные, average считаем в конце
      } else {
        serviceMap.set(key, { qty: 1, pricePerUnit: price, total: price });
      }
    }
  }

  // Финализируем services с average price если total/qty не равен pricePerUnit
  const services: import('@/types').InvoiceServiceItem[] = [];
  for (const [name, s] of serviceMap) {
    const avgPrice = s.qty > 0 ? Math.round((s.total / s.qty) * 100) / 100 : 0;
    services.push({ name, qty: s.qty, pricePerUnit: avgPrice, total: s.total });
  }
  services.sort((a, b) => b.total - a.total);

  // Discount
  const discountAmount = discountPercent ? Math.round((subtotal * discountPercent) / 100 * 100) / 100 : 0;
  const totalAmount = Math.max(0, subtotal - discountAmount - prepayments);

  return {
    counterAgentId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    subtotal,
    discountPercent,
    discountAmount,
    prepayments,
    totalAmount,
    items: { services, washes },
    washCount: washes.length,
  };
}

/**
 * Phase 22: создать Invoice в БД из preview.
 * Auto-number, status='draft' по умолчанию.
 */
export async function createInvoice(data: {
  counterAgentId: string;
  periodStart: Date;
  periodEnd: Date;
  subtotal: number;
  discountPercent?: number;
  discountAmount?: number;
  prepayments?: number;
  totalAmount: number;
  items: import('@/types').InvoiceItems;
  createdByEmployeeId?: string;
  notes?: string;
  // Phase 57b.1: multi-company FK. Если не указан — резолвится из counterAgent.preferredOurCompanyId или primary.
  ourCompanyId?: string | null;
}): Promise<import('@/types').Invoice> {
  const number = await generateInvoiceNumber(data.periodStart);

  // Auto-resolve ourCompanyId если не передали явно: counterAgent.preferredOurCompanyId → primary
  let resolvedOurCompanyId: string | null = data.ourCompanyId ?? null;
  if (!resolvedOurCompanyId) {
    const agent = await prisma.counterAgent.findUnique({
      where: { id: data.counterAgentId },
      select: { preferredOurCompanyId: true },
    });
    if (agent?.preferredOurCompanyId) {
      resolvedOurCompanyId = agent.preferredOurCompanyId;
    } else {
      const primary = await prisma.ourCompany.findFirst({
        where: { isPrimary: true, archived: false },
        select: { id: true },
      });
      resolvedOurCompanyId = primary?.id ?? null;
    }
  }

  const created = await prisma.invoice.create({
    data: {
      number,
      counterAgentId: data.counterAgentId,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      status: 'draft',
      subtotal: data.subtotal,
      discountPercent: data.discountPercent ?? null,
      discountAmount: data.discountAmount ?? 0,
      prepayments: data.prepayments ?? 0,
      totalAmount: data.totalAmount,
      items: data.items as any,
      createdByEmployeeId: data.createdByEmployeeId ?? null,
      notes: data.notes ?? '',
      // Phase 57b.1: multi-company FK persistence
      ourCompanyId: resolvedOurCompanyId,
    },
    include: { counterAgent: { select: { name: true } } },
  });
  return invoiceFromPrisma(created);
}

export async function updateInvoice(id: string, data: Partial<{
  status: string;
  discountPercent: number | null;
  discountAmount: number;
  prepayments: number;
  totalAmount: number;
  sentAt: Date | null;
  sentToEmail: string | null;
  paidAt: Date | null;
  paidVia: string | null;
  paidTransactionId: string | null;
  notes: string;
}>): Promise<import('@/types').Invoice> {
  const updated = await prisma.invoice.update({
    where: { id },
    data: data as any,
    include: { counterAgent: { select: { name: true } } },
  });
  return invoiceFromPrisma(updated);
}

export async function deleteInvoice(id: string): Promise<void> {
  await prisma.invoice.delete({ where: { id } });
}

// ─── Report (Phase 23 / finding #4 АРХ-НАХОДКИ / #21 ТЕХ-ДОЛГ) ─────

function reportFromPrisma(row: any): import('@/types').Report {
  return {
    id: row.id,
    title: row.title,
    periodStart: row.periodStart instanceof Date ? row.periodStart.toISOString() : String(row.periodStart),
    periodEnd: row.periodEnd instanceof Date ? row.periodEnd.toISOString() : String(row.periodEnd),
    status: (row.status ?? 'draft') as import('@/types').ReportStatus,
    reportMarkdown: row.reportMarkdown ?? '',
    prompt: row.prompt ?? '',
    usage: row.usage ?? undefined,
    createdByEmployeeId: row.createdByEmployeeId ?? undefined,
    notes: row.notes ?? '',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function getReportsData(filters?: {
  status?: string;
  periodFrom?: string; // ISO
  periodTo?: string;   // ISO
}): Promise<import('@/types').Report[]> {
  const where: any = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.periodFrom || filters?.periodTo) {
    where.periodStart = {};
    if (filters.periodFrom) where.periodStart.gte = new Date(filters.periodFrom);
    if (filters.periodTo) where.periodStart.lte = new Date(filters.periodTo);
  }
  const rows = await prisma.report.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map(reportFromPrisma);
}

export async function getReportById(id: string): Promise<import('@/types').Report | null> {
  const row = await prisma.report.findUnique({ where: { id } });
  return row ? reportFromPrisma(row) : null;
}

// generateReportTitle вынесен в @/lib/utils/report-title (sync utility),
// чтобы избежать ошибки Next.js "Server actions must be async functions"
// при цепочке импортов pg-adapter → data/index → ai/flows/* ('use server').
import { generateReportTitle } from '@/lib/utils/report-title';

export async function createReport(data: {
  title?: string;
  periodStart: Date;
  periodEnd: Date;
  reportMarkdown: string;
  prompt?: string;
  usage?: import('@/types').ReportUsage;
  createdByEmployeeId?: string;
  notes?: string;
}): Promise<import('@/types').Report> {
  const title = data.title?.trim() || generateReportTitle(data.periodStart, data.periodEnd);
  const created = await prisma.report.create({
    data: {
      title,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      reportMarkdown: data.reportMarkdown,
      prompt: data.prompt ?? '',
      status: 'draft',
      usage: (data.usage as any) ?? undefined,
      createdByEmployeeId: data.createdByEmployeeId ?? null,
      notes: data.notes ?? '',
    },
  });
  return reportFromPrisma(created);
}

export async function updateReport(id: string, data: {
  title?: string;
  status?: import('@/types').ReportStatus;
  notes?: string;
}): Promise<import('@/types').Report> {
  const updated = await prisma.report.update({
    where: { id },
    data: data as any,
  });
  return reportFromPrisma(updated);
}

export async function deleteReport(id: string): Promise<void> {
  await prisma.report.delete({ where: { id } });
}

/**
 * Phase 16 / finding #35: backfill StockMovement.purchase из исторических Expense.
 *
 * Симптом: на проде 22 движения химии — все consumption, 0 purchase.
 * Причина — operational: сотрудники не оформляли закупки через UI «Закупка химии»
 * (которая корректно создавала бы StockMovement.purchase).
 *
 * Решение: пройти по Expense с category matching "хими" → создать соответствующий
 * StockMovement.purchase. Дедупликация: пропускаем Expense у которых уже есть
 * StockMovement с relatedEntityType='expense' + relatedEntityId=expense.id.
 *
 * Поддерживаемые единицы:
 *  - 'кг' / 'kg' → grams = quantity * 1000
 *  - 'г' / 'g' → grams = quantity
 *  - 'л' / 'l' (для химии — приблизительно 1л ≈ 1000г) → grams = quantity * 1000
 *  - other → skip + report
 *
 * apply=false → preview, apply=true → создание.
 */
export async function backfillChemicalPurchasesFromExpenses(apply: boolean): Promise<{
  candidates: Array<{
    expenseId: string;
    date: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    grams: number;
    skipReason?: string;
  }>;
  alreadyBackfilled: number;
  willCreate: number;
  skipped: number;
  applied: boolean;
}> {
  // 1. Найти все Expense с категорией матчащей "хими"
  const expenses = await prisma.expense.findMany({
    where: {
      OR: [
        { category: { contains: 'хими', mode: 'insensitive' } },
        { category: { contains: 'chem', mode: 'insensitive' } },
      ],
      quantity: { not: null },
      unit: { not: null },
    },
    orderBy: { date: 'asc' },
  });

  // 2. Дедупликация — какие Expense уже зафиксированы в StockMovement
  const existingMovements = await prisma.stockMovement.findMany({
    where: { relatedEntityType: 'expense', type: 'purchase' },
    select: { relatedEntityId: true },
  });
  const backfilled = new Set(existingMovements.map(m => m.relatedEntityId).filter(Boolean));

  // 3. Анализ кандидатов
  const candidates: Array<{
    expenseId: string;
    date: string;
    category: string;
    description: string;
    quantity: number;
    unit: string;
    grams: number;
    skipReason?: string;
  }> = [];

  let willCreate = 0;
  let skipped = 0;

  for (const exp of expenses) {
    const unit = (exp.unit || '').toLowerCase().trim();
    const quantity = exp.quantity ?? 0;
    let grams = 0;
    let skipReason: string | undefined;

    if (backfilled.has(exp.id)) {
      skipReason = 'уже backfilled';
      skipped++;
    } else if (quantity <= 0) {
      skipReason = 'quantity ≤ 0';
      skipped++;
    } else if (unit === 'кг' || unit === 'kg') {
      grams = quantity * 1000;
      willCreate++;
    } else if (unit === 'г' || unit === 'g') {
      grams = quantity;
      willCreate++;
    } else if (unit === 'л' || unit === 'l') {
      grams = quantity * 1000;
      willCreate++;
    } else {
      skipReason = `unsupported unit "${exp.unit}"`;
      skipped++;
    }

    candidates.push({
      expenseId: exp.id,
      date: exp.date.toISOString(),
      category: exp.category,
      description: exp.description,
      quantity,
      unit: exp.unit ?? '',
      grams,
      skipReason,
    });
  }

  // 4. Apply — создаём StockMovement.purchase для валидных кандидатов
  if (apply) {
    const toCreate = candidates.filter(c => !c.skipReason && c.grams > 0);
    if (toCreate.length > 0) {
      // Убедимся что mat_chemical_main существует
      await prisma.inventoryMaterial.upsert({
        where: { id: 'mat_chemical_main' },
        update: {},
        create: {
          id: 'mat_chemical_main',
          name: 'Химия (основная)',
          category: 'chemical',
          unit: 'grams',
          currentStock: 0,
        },
      });

      // Создаём movements хронологически (важно для balanceAfter если будет recompute)
      for (const c of toCreate) {
        await prisma.stockMovement.create({
          data: {
            id: `mov_backfill_${c.expenseId}`,
            materialId: 'mat_chemical_main',
            type: 'purchase',
            amount: c.grams,
            balanceAfter: 0, // будет пересчитано при recomputeInventoryStock(apply:true)
            date: new Date(c.date),
            description: `[backfill #35] ${c.description || c.category}`,
            relatedEntityType: 'expense',
            relatedEntityId: c.expenseId,
          },
        });
      }
    }
  }

  return {
    candidates,
    alreadyBackfilled: backfilled.size,
    willCreate,
    skipped,
    applied: apply,
  };
}

/**
 * Phase 14 / UX полировка: метрики для /employees таблицы (Моек/мес + Последняя активность).
 *
 * Возвращает Map<employeeId, {washesThisMonth, lastWashAt}> за один batch-запрос.
 * Используется в /employees page чтобы показать колонки без отдельного fetch.
 */
export async function getEmployeesMetrics(): Promise<Map<string, {
  washesThisMonth: number;
  lastWashAt: string | null;
}>> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Считаем completed мойки текущего месяца
  const monthLinks = await prisma.washEventEmployee.findMany({
    where: {
      washEvent: {
        timestamp: { gte: monthStart },
        OR: [{ status: null }, { status: 'completed' }, { status: 'restored' }],
      },
    },
    select: { employeeId: true },
  });

  // Последняя мойка (любая completed, любой период)
  const lastByEmployee = await prisma.washEventEmployee.groupBy({
    by: ['employeeId'],
    _max: { washEventId: true },
  });
  // Через groupBy нельзя достать timestamp напрямую, нужен второй запрос:
  // забираем last washEventId per employee, потом lookup timestamps.
  const lastIds = lastByEmployee
    .map(l => l._max.washEventId)
    .filter((id): id is string => Boolean(id));
  const lastEvents = lastIds.length > 0
    ? await prisma.washEvent.findMany({
        where: { id: { in: lastIds } },
        select: { id: true, timestamp: true, employees: { select: { employeeId: true } } },
      })
    : [];

  // Build map
  const result = new Map<string, { washesThisMonth: number; lastWashAt: string | null }>();
  for (const link of monthLinks) {
    const cur = result.get(link.employeeId) ?? { washesThisMonth: 0, lastWashAt: null };
    cur.washesThisMonth += 1;
    result.set(link.employeeId, cur);
  }
  // Last wash: пройдёмся по всем ссылкам, найдём max timestamp per employee
  for (const ev of lastEvents) {
    for (const link of ev.employees) {
      const cur = result.get(link.employeeId) ?? { washesThisMonth: 0, lastWashAt: null };
      const ts = ev.timestamp.toISOString();
      if (!cur.lastWashAt || ts > cur.lastWashAt) cur.lastWashAt = ts;
      result.set(link.employeeId, cur);
    }
  }
  return result;
}

/**
 * Phase 11 / finding #39: lookup активной/завершённой смены по timestamp + бокс.
 *
 * Используется при retroactive POST WashEvent чтобы проставить ПРАВИЛЬНЫЙ shiftId
 * (той смены, что была фактически на момент мойки), а не текущей смены бокса.
 *
 * Логика shiftType:
 *  - hour 8-19 → 'day' (date = sameDay)
 *  - hour 20-23 → 'night' (date = sameDay, ночная смена начинается)
 *  - hour 0-7 → 'night' (date = previousDay, ночная смена ещё идёт)
 *
 * Ищет любую смену (status=any), даже completed — это исторический matching.
 * Возвращает shift.id или null если не найден.
 */
export async function findShiftForTimestamp(
  timestamp: Date | string,
  boxNumber: 1 | 2
): Promise<string | null> {
  const ts = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (!Number.isFinite(ts.getTime())) return null;

  const hour = ts.getHours();
  const isDay = hour >= 8 && hour < 20;

  // Дата смены: для night-смены утренних часов (0-7) — это вчерашняя дата.
  let dateForShift: Date;
  if (!isDay && hour < 8) {
    dateForShift = new Date(ts);
    dateForShift.setDate(dateForShift.getDate() - 1);
  } else {
    dateForShift = ts;
  }
  const dateKey = dateForShift.toISOString().slice(0, 10);
  const shiftType = isDay ? 'day' : 'night';
  const washId = boxNumber === 2 ? 'wash_2' : 'wash_1';

  const shift = await prisma.shift.findFirst({
    where: { date: dateKey, boxNumber, shiftType, washId },
    select: { id: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return shift?.id ?? null;
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
      // Phase 57b.1: multi-company FK persistence
      preferredOurCompanyId: data.preferredOurCompanyId ?? null,
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
      // Phase 57b.1: multi-company FK persistence
      preferredOurCompanyId: data.preferredOurCompanyId ?? null,
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
      // Phase 57b.1: multi-company FK persistence
      preferredOurCompanyId: data.preferredOurCompanyId ?? null,
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
      // Phase 57b.1: multi-company FK persistence
      preferredOurCompanyId: data.preferredOurCompanyId ?? null,
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
      // Phase 57b.1: multi-company FK persistence
      ourCompanyId: data.ourCompanyId ?? null,
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
      // Phase 57b.1: multi-company FK persistence
      ourCompanyId: data.ourCompanyId ?? null,
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

// ─── EmployeeChangeLog (Phase 29 / V2-NEW-3) ────────────────────

function changeLogFromPrisma(row: any): import('@/types').EmployeeChangeLogEntry {
  return {
    id: row.id,
    employeeId: row.employeeId,
    fieldName: row.fieldName,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue ?? null,
    changedBy: row.changedBy,
    reason: row.reason ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

/**
 * Phase 29 / V2-NEW-3: запись одной строки audit-журнала для опасной правки Employee.
 * Не throw'ит — best-effort: если БД упадёт, основная PUT-операция не должна
 * остановиться. Только лог в console.error.
 */
export async function createEmployeeChangeLog(data: {
  employeeId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  reason?: string | null;
}): Promise<void> {
  try {
    await prisma.employeeChangeLog.create({
      data: {
        employeeId: data.employeeId,
        fieldName: data.fieldName,
        oldValue: data.oldValue,
        newValue: data.newValue,
        changedBy: data.changedBy,
        reason: data.reason ?? null,
      },
    });
  } catch (err) {
    console.error('[createEmployeeChangeLog] best-effort failed:', err);
  }
}

/** Batch-вариант для PUT'а с несколькими опасными изменениями за один запрос. */
export async function createEmployeeChangeLogBatch(entries: Array<{
  employeeId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  reason?: string | null;
}>): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.employeeChangeLog.createMany({
      data: entries.map(e => ({
        employeeId: e.employeeId,
        fieldName: e.fieldName,
        oldValue: e.oldValue,
        newValue: e.newValue,
        changedBy: e.changedBy,
        reason: e.reason ?? null,
      })),
    });
  } catch (err) {
    console.error('[createEmployeeChangeLogBatch] best-effort failed:', err);
  }
}

/**
 * История изменений конкретного employee. Newest first. Лимит для UI tab.
 */
export async function getEmployeeChangeLog(
  employeeId: string,
  limit = 50
): Promise<import('@/types').EmployeeChangeLogEntry[]> {
  const rows = await prisma.employeeChangeLog.findMany({
    where: { employeeId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(changeLogFromPrisma);
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
      // Phase 57b.1: multi-company FK persistence
      ourCompanyId: data.ourCompanyId ?? null,
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
      // Phase 57b.1: multi-company FK persistence
      ourCompanyId: data.ourCompanyId ?? null,
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
          // Phase 57b.1: multi-company FK persistence
          ourCompanyId: t.ourCompanyId ?? null,
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

// ────────────────────────────────────────────────────────────────────
// Phase 52 (V2-NEW-1): канистры — atomic issue с 4 режимами выдачи
// ────────────────────────────────────────────────────────────────────

const CANISTER_DEFAULT_GRAMS = 22000;
const CANISTER_DEFAULT_PRICE = 3000;

export interface IssueCanisterInput {
  employeeId: string;
  mode: import('@/types').CanisterMode;
  amountGrams?: number; // default 22000 (1 канистра 22 кг)
  priceRub?: number;    // default 3000 ₽; для bonus игнорируется (всё равно 0 в EmployeeTransaction)
  washPoint?: string;   // 'wash_1' | 'wash_2' (опционально)
  notes?: string;       // reason для bonus, комментарий
  issuedBy: string;     // admin employeeId
  materialId?: string;  // default — первый chemical isActive
}

/**
 * Phase 52a: atomic выдача канистры с 4 режимами.
 *
 * В одной $transaction:
 *  1. EmployeeCanister(status='active', mode, issuedBy, notes, washPoint)
 *  2. StockMovement (kind='issue', warehouse='main', amount=-grams)
 *  3. По mode либо EmployeeTransaction либо Expense:
 *     - purchase           → EmployeeTransaction(type='purchase', amount=-priceRub)
 *     - bonus              → EmployeeTransaction(type='bonus', amount=0, description=notes)
 *     - gift               → Expense(category='gift', amount=priceRub, description="Канистра ...")
 *     - salary-deduction   → EmployeeTransaction(type='salary-deduction', amount=-priceRub)
 *  4. canister.transactionId связывается с созданной транзакцией / Expense (audit).
 *
 * Note: списание со склада осуществляется через StockMovement (warehouse='main').
 * InventoryMaterial.currentStock пересчитывается отдельно (см. recomputeInventoryStock).
 */
export async function issueCanisterAtomic(
  input: IssueCanisterInput,
): Promise<import('@/types').EmployeeChemicalCanister> {
  const amountGrams = input.amountGrams ?? CANISTER_DEFAULT_GRAMS;
  const priceRub = input.priceRub ?? CANISTER_DEFAULT_PRICE;
  const now = new Date();
  const canisterId = `ec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Find primary chemical material if not specified
  let materialId = input.materialId;
  if (!materialId) {
    const primary = await prisma.inventoryMaterial.findFirst({
      where: { category: 'chemical', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    materialId = primary?.id;
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) {
    throw new Error(`Employee ${input.employeeId} not found`);
  }

  const created = await prisma.$transaction(async (tx) => {
    // 1. EmployeeCanister
    const canister = await tx.employeeCanister.create({
      data: {
        id: canisterId,
        employeeId: input.employeeId,
        issuedAt: now,
        initialAmountGrams: amountGrams,
        remainingAmountGrams: amountGrams,
        priceRub: input.mode === 'bonus' ? 0 : priceRub,
        status: 'active',
        mode: input.mode,
        issuedBy: input.issuedBy,
        notes: input.notes ?? '',
        washPoint: input.washPoint,
      },
    });

    // 2. StockMovement (списание со склада)
    if (materialId) {
      // Find current balance for materialId on main warehouse
      const lastMov = await tx.stockMovement.findFirst({
        where: { materialId, warehouse: 'main' },
        orderBy: { date: 'desc' },
      });
      const prevBalance = lastMov?.balanceAfter ?? 0;
      const newBalance = prevBalance - amountGrams;

      await tx.stockMovement.create({
        data: {
          id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          materialId,
          type: 'issue',
          amount: -amountGrams,
          balanceAfter: newBalance,
          date: now,
          description: `Канистра ${input.mode} → ${employee.fullName}`,
          relatedEntityType: 'employee_canister',
          relatedEntityId: canisterId,
          employeeId: input.employeeId,
          createdBy: input.issuedBy,
          warehouse: 'main',
        },
      });

      // Update material currentStock
      await tx.inventoryMaterial.update({
        where: { id: materialId },
        data: { currentStock: newBalance },
      });
    }

    // 3. EmployeeTransaction или Expense по mode
    let txnId: string | null = null;
    if (input.mode === 'purchase') {
      const t = await tx.employeeTransaction.create({
        data: {
          id: `et_canister_${canisterId}`,
          employeeId: input.employeeId,
          date: now,
          type: 'purchase',
          amount: priceRub, // положительная сумма = долг (читается как удержание в salary-report)
          description: `Канистра (покупка) · ${amountGrams / 1000}кг`,
        },
      });
      txnId = t.id;
    } else if (input.mode === 'bonus') {
      const t = await tx.employeeTransaction.create({
        data: {
          id: `et_canister_${canisterId}`,
          employeeId: input.employeeId,
          date: now,
          type: 'bonus',
          amount: 0,
          description: `Канистра (премия) · ${input.notes || 'без причины'}`,
        },
      });
      txnId = t.id;
    } else if (input.mode === 'salary-deduction') {
      const t = await tx.employeeTransaction.create({
        data: {
          id: `et_canister_${canisterId}`,
          employeeId: input.employeeId,
          date: now,
          type: 'salary-deduction',
          amount: priceRub, // положительная сумма = удержание
          description: `Канистра (в счёт ЗП) · ${amountGrams / 1000}кг`,
        },
      });
      txnId = t.id;
    } else if (input.mode === 'gift') {
      const e = await tx.expense.create({
        data: {
          id: `exp_canister_${canisterId}`,
          date: now,
          category: 'gift',
          description: `Канистра (подарок) · ${employee.fullName} · ${input.notes || ''}`.trim(),
          amount: priceRub,
        },
      });
      txnId = e.id;
    }

    // 4. Link canister to transaction/expense
    if (txnId) {
      await tx.employeeCanister.update({
        where: { id: canisterId },
        data: { transactionId: txnId },
      });
    }

    return tx.employeeCanister.findUnique({ where: { id: canisterId } });
  });

  if (!created) throw new Error('Canister was not created');
  return canisterFromPrisma(created);
}

// ────────────────────────────────────────────────────────────────────
// Phase 50 (V2-#4 split-pricing): DriverKickback
// ────────────────────────────────────────────────────────────────────

function driverKickbackFromPrisma(row: any): import('@/types').DriverKickback {
  return {
    id: row.id,
    washEventId: row.washEventId,
    counterAgentId: row.counterAgentId,
    driverName: row.driverName,
    driverPhone: row.driverPhone ?? '',
    plate: row.plate ?? '',
    amount: row.amount,
    status: row.status as import('@/types').DriverKickbackStatus,
    createdAt: row.createdAt.toISOString(),
    readyAt: row.readyAt ? row.readyAt.toISOString() : undefined,
    paidAt: row.paidAt ? row.paidAt.toISOString() : undefined,
    paidBy: row.paidBy ?? undefined,
  };
}

export async function getDriverKickbacks(filters?: {
  counterAgentId?: string;
  status?: import('@/types').DriverKickbackStatus;
  washEventId?: string;
}): Promise<import('@/types').DriverKickback[]> {
  const where: any = {};
  if (filters?.counterAgentId) where.counterAgentId = filters.counterAgentId;
  if (filters?.status) where.status = filters.status;
  if (filters?.washEventId) where.washEventId = filters.washEventId;
  const rows = await prisma.driverKickback.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
  });
  return rows.map(driverKickbackFromPrisma);
}

export async function getDriverKickbackById(id: string): Promise<import('@/types').DriverKickback | null> {
  const row = await prisma.driverKickback.findUnique({ where: { id } });
  return row ? driverKickbackFromPrisma(row) : null;
}

export async function getDriverKickbacksByWashEvent(washEventId: string): Promise<import('@/types').DriverKickback[]> {
  const rows = await prisma.driverKickback.findMany({
    where: { washEventId },
    orderBy: [{ createdAt: 'asc' }],
  });
  return rows.map(driverKickbackFromPrisma);
}

/**
 * Phase 50d: создать DriverKickback при оформлении WashEvent со split-услугой.
 * Используется ВНУТРИ $transaction вместе с созданием WashEvent.
 */
export async function createDriverKickback(data: {
  washEventId: string;
  counterAgentId: string;
  driverName: string;
  driverPhone?: string;
  plate?: string;
  amount: number;
}): Promise<import('@/types').DriverKickback> {
  const created = await prisma.driverKickback.create({
    data: {
      washEventId: data.washEventId,
      counterAgentId: data.counterAgentId,
      driverName: data.driverName.trim(),
      driverPhone: (data.driverPhone ?? '').trim(),
      plate: (data.plate ?? '').trim(),
      amount: data.amount,
      status: 'pending',
    },
  });
  return driverKickbackFromPrisma(created);
}

/**
 * Phase 50c: bulk pending → ready (Q2 рекомендация: manual select через UI).
 * Менеджер отмечает галками после получения оплаты от контрагента.
 */
export async function markDriverKickbacksReady(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const now = new Date();
  const result = await prisma.driverKickback.updateMany({
    where: { id: { in: ids }, status: 'pending' },
    data: { status: 'ready', readyAt: now },
  });
  return result.count;
}

/**
 * Phase 50c: ready → paid в одной транзакции.
 *  1. DriverKickback.status='paid', paidAt, paidBy
 *  2. Expense(category='driver-kickback', amount, description, date)
 * Если статус НЕ ready — кидаем ошибку (нельзя пропустить ready stage).
 */
export async function payDriverKickback(
  id: string,
  paidByEmployeeId: string,
): Promise<{ kickback: import('@/types').DriverKickback; expenseId: string }> {
  const now = new Date();
  const existing = await prisma.driverKickback.findUnique({ where: { id } });
  if (!existing) throw new Error('DriverKickback not found');
  if (existing.status !== 'ready') {
    throw new Error(`DriverKickback ${id} status=${existing.status}, ожидался 'ready'`);
  }

  const expenseId = `kickback_${id}_${Date.now()}`;
  const result = await prisma.$transaction(async (tx) => {
    const kickback = await tx.driverKickback.update({
      where: { id },
      data: { status: 'paid', paidAt: now, paidBy: paidByEmployeeId },
    });
    await tx.expense.create({
      data: {
        id: expenseId,
        date: now,
        category: 'driver-kickback',
        description: `Бонус водителю ${existing.driverName}${existing.plate ? ` (${existing.plate})` : ''}`,
        amount: existing.amount,
      },
    });
    return kickback;
  });

  return { kickback: driverKickbackFromPrisma(result), expenseId };
}

/**
 * Phase 50f: получить блокеры для DELETE WashEvent.
 * paid → 423 Locked (бухгалтерия не должна разойтись)
 * ready → 409 (предложить отменить через UI)
 * pending → cascade OK через Prisma onDelete
 */
export async function getWashEventKickbackBlockers(washEventId: string): Promise<{
  paid: number;
  ready: number;
  pending: number;
}> {
  const grouped = await prisma.driverKickback.groupBy({
    by: ['status'],
    where: { washEventId },
    _count: { _all: true },
  });
  const counts = { paid: 0, ready: 0, pending: 0 };
  for (const g of grouped) {
    const s = g.status as keyof typeof counts;
    if (s in counts) counts[s] = g._count._all;
  }
  return counts;
}

// ────────────────────────────────────────────────────────────────────
// Phase 57 (multi-company / ЭкоФуд кейс): OurCompany CRUD + primary helper
// ────────────────────────────────────────────────────────────────────

function ourCompanyFromPrisma(row: any): import('@/types').OurCompany {
  return {
    id: row.id,
    shortName: row.shortName,
    fullName: row.fullName ?? '',
    inn: row.inn ?? undefined,
    kpp: row.kpp ?? undefined,
    ogrn: row.ogrn ?? undefined,
    ownerName: row.ownerName ?? undefined,
    legalAddress: row.legalAddress ?? undefined,
    bankName: row.bankName ?? undefined,
    settlementAccount: row.settlementAccount ?? undefined,
    correspondentAccount: row.correspondentAccount ?? undefined,
    bik: row.bik ?? undefined,
    taxRegime: row.taxRegime ?? undefined,
    cardAcquiringPercentage: row.cardAcquiringPercentage ?? undefined,
    isPrimary: row.isPrimary,
    archived: row.archived,
    archivedAt: row.archivedAt ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOurCompaniesData(): Promise<import('@/types').OurCompany[]> {
  const rows = await prisma.ourCompany.findMany({
    orderBy: [{ isPrimary: 'desc' }, { archived: 'asc' }, { shortName: 'asc' }],
  });
  return rows.map(ourCompanyFromPrisma);
}

export async function getOurCompanyById(id: string): Promise<import('@/types').OurCompany | null> {
  const row = await prisma.ourCompany.findUnique({ where: { id } });
  return row ? ourCompanyFromPrisma(row) : null;
}

export async function getPrimaryOurCompany(): Promise<import('@/types').OurCompany | null> {
  const row = await prisma.ourCompany.findFirst({
    where: { isPrimary: true, archived: false },
    orderBy: { createdAt: 'asc' },
  });
  return row ? ourCompanyFromPrisma(row) : null;
}

/**
 * Phase 57a: Upsert OurCompany. При isPrimary=true автоматически снимает primary
 * со всех других компаний (одно primary в системе).
 */
export async function saveOurCompany(data: Partial<import('@/types').OurCompany> & { id: string }): Promise<import('@/types').OurCompany> {
  const willBePrimary = !!data.isPrimary;

  const result = await prisma.$transaction(async (tx) => {
    if (willBePrimary) {
      // Снять primary со всех других
      await tx.ourCompany.updateMany({
        where: { id: { not: data.id }, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const existing = await tx.ourCompany.findUnique({ where: { id: data.id } });
    // Хелпер: если поле явно передано в data — использует его значение (включая null),
    // иначе — берёт из existing. Нужен чтобы `archivedAt: null` при unarchive
    // корректно записывал null, а не откатывался к старому значению через `??`.
    function pick<T>(key: string, fallback: T): T {
      if (key in data) {
        const v = (data as any)[key];
        return v !== undefined ? v : fallback;
      }
      const v = (existing as any)?.[key];
      return v !== undefined ? v : fallback;
    }

    const payload = {
      shortName: data.shortName ?? existing?.shortName ?? '',
      fullName: data.fullName ?? existing?.fullName ?? '',
      inn: pick('inn', null),
      kpp: pick('kpp', null),
      ogrn: pick('ogrn', null),
      ownerName: pick('ownerName', null),
      legalAddress: pick('legalAddress', null),
      bankName: pick('bankName', null),
      settlementAccount: pick('settlementAccount', null),
      correspondentAccount: pick('correspondentAccount', null),
      bik: pick('bik', null),
      taxRegime: pick('taxRegime', null),
      cardAcquiringPercentage: data.cardAcquiringPercentage ?? existing?.cardAcquiringPercentage ?? null,
      isPrimary: willBePrimary,
      archived: data.archived ?? existing?.archived ?? false,
      // Явный null при unarchive корректно стирает archivedAt (pick учитывает `null in data`)
      archivedAt: pick('archivedAt', null),
    };

    if (existing) {
      return tx.ourCompany.update({ where: { id: data.id }, data: payload });
    }
    return tx.ourCompany.create({ data: { id: data.id, ...payload } });
  });

  return ourCompanyFromPrisma(result);
}

export async function archiveOurCompany(id: string): Promise<void> {
  await prisma.ourCompany.update({
    where: { id },
    data: { archived: true, archivedAt: new Date().toISOString() },
  });
}

export async function unarchiveOurCompany(id: string): Promise<void> {
  await prisma.ourCompany.update({
    where: { id },
    data: { archived: false, archivedAt: null },
  });
}

/**
 * Phase 57a: «Под каким нашим ИП оформить эту мойку?» — server-side helper.
 * Используется в wash-event-create-service для авто-определения ourCompanyId.
 *
 * Логика:
 *   1. Если paymentMethod='counterAgentContract' и contractor.preferredOurCompanyId — использовать его
 *   2. Если paymentMethod='aggregator' и aggregator.preferredOurCompanyId — использовать его
 *   3. Иначе (розница cash/card/transfer) — primary OurCompany
 *
 * Override через UI поле washEvent.ourCompanyId (admin может сменить вручную).
 */
export async function resolveOurCompanyIdForWashEvent(washEvent: {
  paymentMethod: string;
  sourceId?: string;
  ourCompanyId?: string | null;
}): Promise<string | null> {
  // Если ourCompanyId явно установлен (override) — используем его
  if (washEvent.ourCompanyId) return washEvent.ourCompanyId;

  if (washEvent.paymentMethod === 'counterAgentContract' && washEvent.sourceId) {
    const ca = await prisma.counterAgent.findUnique({
      where: { id: washEvent.sourceId },
      select: { preferredOurCompanyId: true },
    });
    if (ca?.preferredOurCompanyId) return ca.preferredOurCompanyId;
  }

  if (washEvent.paymentMethod === 'aggregator' && washEvent.sourceId) {
    const agg = await prisma.aggregator.findUnique({
      where: { id: washEvent.sourceId },
      select: { preferredOurCompanyId: true },
    });
    if (agg?.preferredOurCompanyId) return agg.preferredOurCompanyId;
  }

  // Розница или нет preferred — primary
  const primary = await prisma.ourCompany.findFirst({
    where: { isPrimary: true, archived: false },
    select: { id: true },
  });
  return primary?.id ?? null;
}
