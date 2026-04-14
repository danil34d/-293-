/**
 * Миграция JSON → PostgreSQL
 *
 * Читает все JSON-файлы из /srv/carwash/data/ и вставляет в PostgreSQL через Prisma.
 * Idempotent: использует upsert — можно запускать повторно.
 *
 * Запуск: npx tsx scripts/migrate-json-to-pg.ts
 * Переменные: DATABASE_URL (из .env)
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const DATA_DIR = process.env.DATA_DIR || '/srv/carwash/data';

// ─── Helpers ──────────────────────────────────────────────────

function readJsonFile<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`  ✗ Error reading ${filePath}:`, (e as Error).message);
    return null;
  }
}

function readJsonDir<T>(dirName: string): T[] {
  const dirPath = path.join(DATA_DIR, dirName);
  if (!fs.existsSync(dirPath)) {
    console.log(`  ⚠ Directory not found: ${dirPath}`);
    return [];
  }
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
  const items: T[] = [];
  for (const file of files) {
    const data = readJsonFile<T>(path.join(dirPath, file));
    if (data !== null) {
      // Some files contain arrays (employee-transactions)
      if (Array.isArray(data)) {
        items.push(...data);
      } else {
        items.push(data);
      }
    }
  }
  return items;
}

function toDate(val: string | undefined | null): Date {
  if (!val) return new Date();
  return new Date(val);
}

// ─── 1. Salary Schemes ──────────────────────────────────────

async function migrateSalarySchemes() {
  console.log('\n📋 Salary Schemes...');
  const items = readJsonDir<any>('salary-schemes');
  let count = 0;
  for (const item of items) {
    await prisma.salaryScheme.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        type: item.type,
        percentage: item.percentage ?? null,
        fixedDeduction: item.fixedDeduction ?? null,
        rateSource: item.rateSource ?? undefined,
        rates: item.rates ?? undefined,
      },
      create: {
        id: item.id,
        name: item.name,
        type: item.type,
        percentage: item.percentage ?? null,
        fixedDeduction: item.fixedDeduction ?? null,
        rateSource: item.rateSource ?? undefined,
        rates: item.rates ?? undefined,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} salary schemes`);
}

// ─── 2. Employees ───────────────────────────────────────────

async function migrateEmployees() {
  console.log('\n👤 Employees...');
  const items = readJsonDir<any>('employees');
  let count = 0;
  for (const item of items) {
    await prisma.employee.upsert({
      where: { id: item.id },
      update: {
        fullName: item.fullName,
        phone: item.phone ?? '',
        paymentDetails: item.paymentDetails ?? '',
        hasCar: item.hasCar ?? false,
        role: item.role ?? 'employee',
        telegramChatId: item.telegramChatId ?? null,
        username: item.username || null,
        password: item.password || null,
        salarySchemeId: item.salarySchemeId ?? null,
        canSwapShifts: item.canSwapShifts ?? true,
        preferredShiftType: item.preferredShiftType ?? null,
        weekdayPreferredShiftType: item.weekdayPreferredShiftType ?? null,
        weekendPreferredShiftType: item.weekendPreferredShiftType ?? null,
        targetShiftsPerMonth: item.targetShiftsPerMonth ?? null,
        wantsMoreShifts: item.wantsMoreShifts ?? null,
      },
      create: {
        id: item.id,
        fullName: item.fullName,
        phone: item.phone ?? '',
        paymentDetails: item.paymentDetails ?? '',
        hasCar: item.hasCar ?? false,
        role: item.role ?? 'employee',
        telegramChatId: item.telegramChatId ?? null,
        username: item.username || null,
        password: item.password || null,
        salarySchemeId: item.salarySchemeId ?? null,
        canSwapShifts: item.canSwapShifts ?? true,
        preferredShiftType: item.preferredShiftType ?? null,
        weekdayPreferredShiftType: item.weekdayPreferredShiftType ?? null,
        weekendPreferredShiftType: item.weekendPreferredShiftType ?? null,
        targetShiftsPerMonth: item.targetShiftsPerMonth ?? null,
        wantsMoreShifts: item.wantsMoreShifts ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} employees`);
}

// ─── 3. Aggregators ─────────────────────────────────────────

async function migrateAggregators() {
  console.log('\n🏢 Aggregators...');
  const items = readJsonDir<any>('aggregators');
  let count = 0;
  for (const item of items) {
    await prisma.aggregator.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        balance: item.balance ?? 0,
        companies: item.companies ?? [],
        cars: item.cars ?? [],
        priceLists: item.priceLists ?? [],
        activePriceListName: item.activePriceListName ?? null,
      },
      create: {
        id: item.id,
        name: item.name,
        balance: item.balance ?? 0,
        companies: item.companies ?? [],
        cars: item.cars ?? [],
        priceLists: item.priceLists ?? [],
        activePriceListName: item.activePriceListName ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} aggregators`);
}

// ─── 4. Counter Agents ──────────────────────────────────────

async function migrateCounterAgents() {
  console.log('\n📝 Counter Agents...');
  const items = readJsonDir<any>('counter-agents');
  let count = 0;
  for (const item of items) {
    await prisma.counterAgent.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        balance: item.balance ?? 0,
        companies: item.companies ?? [],
        cars: item.cars ?? [],
        priceList: item.priceList ?? [],
        additionalPriceList: item.additionalPriceList ?? [],
        allowCustomServices: item.allowCustomServices ?? false,
        archived: item.archived ?? false,
        archivedAt: item.archivedAt ?? null,
      },
      create: {
        id: item.id,
        name: item.name,
        balance: item.balance ?? 0,
        companies: item.companies ?? [],
        cars: item.cars ?? [],
        priceList: item.priceList ?? [],
        additionalPriceList: item.additionalPriceList ?? [],
        allowCustomServices: item.allowCustomServices ?? false,
        archived: item.archived ?? false,
        archivedAt: item.archivedAt ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} counter agents`);
}

// ─── 5. Expenses ────────────────────────────────────────────

async function migrateExpenses() {
  console.log('\n💰 Expenses...');
  const items = readJsonDir<any>('expenses');
  let count = 0;
  for (const item of items) {
    await prisma.expense.upsert({
      where: { id: item.id },
      update: {
        date: toDate(item.date),
        category: item.category,
        description: item.description ?? '',
        amount: item.amount,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        pricePerUnit: item.pricePerUnit ?? null,
      },
      create: {
        id: item.id,
        date: toDate(item.date),
        category: item.category,
        description: item.description ?? '',
        amount: item.amount,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        pricePerUnit: item.pricePerUnit ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} expenses`);
}

// ─── 6. Wash Events + WashEventEmployee ─────────────────────

async function migrateWashEvents() {
  console.log('\n🚿 Wash Events...');
  const items = readJsonDir<any>('wash-events');

  // Collect existing employee/aggregator/counterAgent IDs for FK validation
  const existingEmployeeIds = new Set((await prisma.employee.findMany({ select: { id: true } })).map(e => e.id));
  const existingAggIds = new Set((await prisma.aggregator.findMany({ select: { id: true } })).map(a => a.id));
  const existingAgentIds = new Set((await prisma.counterAgent.findMany({ select: { id: true } })).map(a => a.id));

  let count = 0;
  let junctionCount = 0;
  for (const item of items) {
    // Resolve sourceId → aggregatorId / counterAgentId
    let aggregatorId: string | null = null;
    let counterAgentId: string | null = null;
    if (item.sourceId) {
      if (item.sourceId.startsWith('agg_') && existingAggIds.has(item.sourceId)) {
        aggregatorId = item.sourceId;
      } else if (item.sourceId.startsWith('agent_') && existingAgentIds.has(item.sourceId)) {
        counterAgentId = item.sourceId;
      }
    }

    // Filter employeeIds to only those that exist
    const validEmployeeIds: string[] = (item.employeeIds ?? []).filter((id: string) => existingEmployeeIds.has(id));

    await prisma.washEvent.upsert({
      where: { id: item.id },
      update: {
        timestamp: toDate(item.timestamp),
        vehicleNumber: item.vehicleNumber,
        boxNumber: item.boxNumber ?? null,
        paymentMethod: item.paymentMethod,
        aggregatorId,
        counterAgentId,
        sourceName: item.sourceName ?? null,
        priceListName: item.priceListName ?? null,
        totalAmount: item.totalAmount,
        netAmount: item.netAmount ?? null,
        acquiringFee: item.acquiringFee ?? null,
        services: item.services,
        driverComments: item.driverComments ?? undefined,
        editHistory: item.editHistory ?? undefined,
        photos: item.photos ?? undefined,
        chemicalConsumptionGrams: item.chemicalConsumptionGrams ?? null,
        chemicalCostRub: item.chemicalCostRub ?? null,
        status: item.status ?? null,
        completedAt: item.completedAt ?? null,
        refundedAt: item.refundedAt ?? null,
        refundReason: item.refundReason ?? null,
        tips: item.tips ?? null,
      },
      create: {
        id: item.id,
        timestamp: toDate(item.timestamp),
        vehicleNumber: item.vehicleNumber,
        boxNumber: item.boxNumber ?? null,
        paymentMethod: item.paymentMethod,
        aggregatorId,
        counterAgentId,
        sourceName: item.sourceName ?? null,
        priceListName: item.priceListName ?? null,
        totalAmount: item.totalAmount,
        netAmount: item.netAmount ?? null,
        acquiringFee: item.acquiringFee ?? null,
        services: item.services,
        driverComments: item.driverComments ?? undefined,
        editHistory: item.editHistory ?? undefined,
        photos: item.photos ?? undefined,
        chemicalConsumptionGrams: item.chemicalConsumptionGrams ?? null,
        chemicalCostRub: item.chemicalCostRub ?? null,
        status: item.status ?? null,
        completedAt: item.completedAt ?? null,
        refundedAt: item.refundedAt ?? null,
        refundReason: item.refundReason ?? null,
        tips: item.tips ?? null,
      },
    });

    // Upsert junction rows
    for (const empId of validEmployeeIds) {
      await prisma.washEventEmployee.upsert({
        where: { washEventId_employeeId: { washEventId: item.id, employeeId: empId } },
        update: {},
        create: { washEventId: item.id, employeeId: empId },
      });
      junctionCount++;
    }
    count++;
  }
  console.log(`  ✓ ${count} wash events, ${junctionCount} employee links`);
}

// ─── 7. Employee Transactions ───────────────────────────────

async function migrateEmployeeTransactions() {
  console.log('\n💳 Employee Transactions...');
  // Each file is an array of transactions for one employee
  const items = readJsonDir<any>('employee-transactions');
  let count = 0;
  for (const item of items) {
    await prisma.employeeTransaction.upsert({
      where: { id: item.id },
      update: {
        employeeId: item.employeeId,
        date: toDate(item.date),
        type: item.type,
        amount: item.amount,
        description: item.description ?? '',
      },
      create: {
        id: item.id,
        employeeId: item.employeeId,
        date: toDate(item.date),
        type: item.type,
        amount: item.amount,
        description: item.description ?? '',
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} employee transactions`);
}

// ─── 8. Client Transactions ─────────────────────────────────

async function migrateClientTransactions() {
  console.log('\n💳 Client Transactions...');
  const items = readJsonDir<any>('client-transactions');
  let count = 0;
  for (const item of items) {
    // clientId format: agg_xxx or agent_xxx
    let aggregatorId: string | null = null;
    let counterAgentId: string | null = null;
    const clientId = item.clientId ?? '';
    if (clientId.startsWith('agg_')) {
      aggregatorId = clientId;
    } else if (clientId.startsWith('agent_')) {
      counterAgentId = clientId;
    }

    await prisma.clientTransaction.upsert({
      where: { id: item.id },
      update: {
        clientId,
        aggregatorId,
        counterAgentId,
        date: toDate(item.date),
        type: item.type ?? 'payment',
        amount: item.amount,
        description: item.description ?? '',
      },
      create: {
        id: item.id,
        clientId,
        aggregatorId,
        counterAgentId,
        date: toDate(item.date),
        type: item.type ?? 'payment',
        amount: item.amount,
        description: item.description ?? '',
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} client transactions`);
}

// ─── 9. Shifts + ShiftEmployee ──────────────────────────────

async function migrateShifts() {
  console.log('\n📅 Shifts...');
  const items = readJsonDir<any>('shifts');
  const existingEmployeeIds = new Set((await prisma.employee.findMany({ select: { id: true } })).map(e => e.id));

  let count = 0;
  let junctionCount = 0;
  for (const item of items) {
    const validEmployeeIds: string[] = (item.employeeIds ?? []).filter((id: string) => existingEmployeeIds.has(id));

    await prisma.shift.upsert({
      where: { id: item.id },
      update: {
        date: item.date,
        boxNumber: item.boxNumber,
        shiftType: item.shiftType,
        startTime: item.startTime ?? '08:00',
        endTime: item.endTime ?? '20:00',
        releasedEmployeeId: item.releasedEmployeeId ?? null,
        isAutoAssigned: item.isAutoAssigned ?? false,
      },
      create: {
        id: item.id,
        date: item.date,
        boxNumber: item.boxNumber,
        shiftType: item.shiftType,
        startTime: item.startTime ?? '08:00',
        endTime: item.endTime ?? '20:00',
        releasedEmployeeId: item.releasedEmployeeId ?? null,
        isAutoAssigned: item.isAutoAssigned ?? false,
      },
    });

    for (const empId of validEmployeeIds) {
      await prisma.shiftEmployee.upsert({
        where: { shiftId_employeeId: { shiftId: item.id, employeeId: empId } },
        update: {},
        create: { shiftId: item.id, employeeId: empId },
      });
      junctionCount++;
    }
    count++;
  }
  console.log(`  ✓ ${count} shifts, ${junctionCount} employee links`);
}

// ─── 10. Shift Swap Requests ────────────────────────────────

async function migrateShiftSwapRequests() {
  console.log('\n🔄 Shift Swap Requests...');
  const items = readJsonDir<any>('shift-swap-requests');
  let count = 0;
  for (const item of items) {
    await prisma.shiftSwapRequest.upsert({
      where: { id: item.id },
      update: {
        type: item.type,
        requesterId: item.requesterId,
        requesterShiftId: item.requesterShiftId,
        targetEmployeeId: item.targetEmployeeId ?? null,
        targetShiftId: item.targetShiftId ?? null,
        status: item.status,
        resolvedAt: item.resolvedAt ? toDate(item.resolvedAt) : null,
        createdAt: item.createdAt ? toDate(item.createdAt) : undefined,
      },
      create: {
        id: item.id,
        type: item.type,
        requesterId: item.requesterId,
        requesterShiftId: item.requesterShiftId,
        targetEmployeeId: item.targetEmployeeId ?? null,
        targetShiftId: item.targetShiftId ?? null,
        status: item.status,
        resolvedAt: item.resolvedAt ? toDate(item.resolvedAt) : null,
        createdAt: item.createdAt ? toDate(item.createdAt) : undefined,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} shift swap requests`);
}

// ─── 11. Shift Assignment Requests ──────────────────────────

async function migrateShiftAssignmentRequests() {
  console.log('\n📋 Shift Assignment Requests...');
  const items = readJsonDir<any>('shift-assignment-requests');
  let count = 0;
  for (const item of items) {
    await prisma.shiftAssignmentRequest.upsert({
      where: { id: item.id },
      update: {
        employeeId: item.employeeId,
        date: item.date,
        shiftType: item.shiftType,
        boxNumber: item.boxNumber,
        status: item.status,
        resolvedAt: item.resolvedAt ? toDate(item.resolvedAt) : null,
        resolvedBy: item.resolvedBy ?? null,
        comment: item.comment ?? null,
        createdAt: item.createdAt ? toDate(item.createdAt) : undefined,
      },
      create: {
        id: item.id,
        employeeId: item.employeeId,
        date: item.date,
        shiftType: item.shiftType,
        boxNumber: item.boxNumber,
        status: item.status,
        resolvedAt: item.resolvedAt ? toDate(item.resolvedAt) : null,
        resolvedBy: item.resolvedBy ?? null,
        comment: item.comment ?? null,
        createdAt: item.createdAt ? toDate(item.createdAt) : undefined,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} shift assignment requests`);
}

// ─── 12. Employee Day Statuses ──────────────────────────────

async function migrateEmployeeDayStatuses() {
  console.log('\n📆 Employee Day Statuses...');
  const items = readJsonDir<any>('employee-day-statuses');

  // Deduplicate: keep last entry per (employeeId, date)
  const byKey = new Map<string, any>();
  for (const item of items) {
    const key = `${item.employeeId}__${item.date}`;
    byKey.set(key, item); // last one wins
  }

  let count = 0;
  for (const item of byKey.values()) {
    await prisma.employeeDayStatus.upsert({
      where: { employeeId_date: { employeeId: item.employeeId, date: item.date } },
      update: {
        id: item.id,
        status: item.status,
        shiftType: item.shiftType ?? null,
        boxNumber: item.boxNumber ?? null,
      },
      create: {
        id: item.id,
        employeeId: item.employeeId,
        date: item.date,
        status: item.status,
        shiftType: item.shiftType ?? null,
        boxNumber: item.boxNumber ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} employee day statuses`);
}

// ─── 13. Schedule Plans ─────────────────────────────────────

async function migrateSchedulePlans() {
  console.log('\n📊 Schedule Plans...');
  const items = readJsonDir<any>('schedule-plans');
  let count = 0;
  for (const item of items) {
    await prisma.schedulePlan.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        month: item.month,
        createdBy: item.createdBy,
        clonedFrom: item.clonedFrom ?? null,
        isActive: item.isActive ?? false,
        washId: item.washId ?? null,
        employeeConfigs: item.employeeConfigs ?? [],
        dailyRequirements: item.dailyRequirements ?? [],
        weeklyPattern: item.weeklyPattern ?? undefined,
        createdAt: item.createdAt ? toDate(item.createdAt) : undefined,
      },
      create: {
        id: item.id,
        name: item.name,
        month: item.month,
        createdBy: item.createdBy,
        clonedFrom: item.clonedFrom ?? null,
        isActive: item.isActive ?? false,
        washId: item.washId ?? null,
        employeeConfigs: item.employeeConfigs ?? [],
        dailyRequirements: item.dailyRequirements ?? [],
        weeklyPattern: item.weeklyPattern ?? undefined,
        createdAt: item.createdAt ? toDate(item.createdAt) : undefined,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} schedule plans`);
}

// ─── 14. Stock Movements ────────────────────────────────────

async function migrateStockMovements() {
  console.log('\n📦 Stock Movements...');
  const items = readJsonDir<any>('stock-movements');
  let count = 0;
  for (const item of items) {
    // Ensure the material exists — create a placeholder if not
    const materialId = item.materialId ?? 'mat_chemical_main';
    const existingMaterial = await prisma.inventoryMaterial.findUnique({ where: { id: materialId } });
    if (!existingMaterial) {
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
      where: { id: item.id },
      update: {
        materialId,
        type: item.type,
        amount: item.amount,
        balanceAfter: item.balanceAfter,
        date: toDate(item.date),
        description: item.description ?? '',
        relatedEntityType: item.relatedEntityType ?? null,
        relatedEntityId: item.relatedEntityId ?? null,
        employeeId: item.employeeId ?? null,
        createdBy: item.createdBy ?? null,
      },
      create: {
        id: item.id,
        materialId,
        type: item.type,
        amount: item.amount,
        balanceAfter: item.balanceAfter,
        date: toDate(item.date),
        description: item.description ?? '',
        relatedEntityType: item.relatedEntityType ?? null,
        relatedEntityId: item.relatedEntityId ?? null,
        employeeId: item.employeeId ?? null,
        createdBy: item.createdBy ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} stock movements`);
}

// ─── 15. Employee Canisters ─────────────────────────────────

async function migrateEmployeeCanisters() {
  console.log('\n🧪 Employee Canisters...');
  const items = readJsonDir<any>('employee-canisters');
  let count = 0;
  for (const item of items) {
    await prisma.employeeCanister.upsert({
      where: { id: item.id },
      update: {
        employeeId: item.employeeId,
        issuedAt: toDate(item.issuedAt),
        initialAmountGrams: item.initialAmountGrams,
        remainingAmountGrams: item.remainingAmountGrams,
        priceRub: item.priceRub,
        status: item.status,
        transactionId: item.transactionId ?? null,
      },
      create: {
        id: item.id,
        employeeId: item.employeeId,
        issuedAt: toDate(item.issuedAt),
        initialAmountGrams: item.initialAmountGrams,
        remainingAmountGrams: item.remainingAmountGrams,
        priceRub: item.priceRub,
        status: item.status,
        transactionId: item.transactionId ?? null,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} employee canisters`);
}

// ─── 16. Shift Reports ──────────────────────────────────────

async function migrateShiftReports() {
  console.log('\n📊 Shift Reports...');
  const items = readJsonDir<any>('shift-reports');
  let count = 0;
  for (const item of items) {
    // ShiftReport stores most data in a JSON `data` column
    // Extract date, shiftType, boxNumber from the report itself
    const reportData = { ...item };
    delete reportData.id;

    // Try to parse date from closedAt or startedAt
    const dateStr = item.closedAt?.substring(0, 10) ?? item.startedAt?.substring(0, 10) ?? '';

    await prisma.shiftReport.upsert({
      where: { id: item.id },
      update: {
        date: dateStr,
        shiftType: item.shiftType ?? 'day',
        boxNumber: item.boxNumber ?? 1,
        data: reportData,
      },
      create: {
        id: item.id,
        date: dateStr,
        shiftType: item.shiftType ?? 'day',
        boxNumber: item.boxNumber ?? 1,
        data: reportData,
        createdAt: item.closedAt ? toDate(item.closedAt) : undefined,
      },
    });
    count++;
  }
  console.log(`  ✓ ${count} shift reports`);
}

// ─── 17. AppConfig (singletons) ─────────────────────────────

async function migrateAppConfigs() {
  console.log('\n⚙️  App Configs...');

  const singletons: { key: string; file: string }[] = [
    { key: 'inventory', file: 'inventory.json' },
    { key: 'chemicalConfig', file: 'chemical-config.json' },
    { key: 'retailPriceList', file: 'retail-price-list.json' },
    { key: 'vehicleTypes', file: 'vehicle-types.json' },
    { key: 'appVersion', file: 'app-version.json' },
    { key: 'deviceHeartbeats', file: 'device-heartbeats.json' },
    { key: 'activeSession', file: 'active-session.json' },
    { key: 'weatherPatterns', file: 'weather-patterns.json' },
  ];

  let count = 0;
  for (const { key, file } of singletons) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠ ${file} not found, skipping`);
      continue;
    }
    const data = readJsonFile<any>(filePath);
    if (data === null) continue;

    await prisma.appConfig.upsert({
      where: { key },
      update: { value: data },
      create: { key, value: data },
    });
    count++;
  }
  console.log(`  ✓ ${count} app configs`);
}

// ─── Verification ───────────────────────────────────────────

async function verify() {
  console.log('\n🔍 Verification...');

  const counts: Record<string, number> = {
    salarySchemes: await prisma.salaryScheme.count(),
    employees: await prisma.employee.count(),
    aggregators: await prisma.aggregator.count(),
    counterAgents: await prisma.counterAgent.count(),
    expenses: await prisma.expense.count(),
    washEvents: await prisma.washEvent.count(),
    washEventEmployees: await prisma.washEventEmployee.count(),
    employeeTransactions: await prisma.employeeTransaction.count(),
    clientTransactions: await prisma.clientTransaction.count(),
    shifts: await prisma.shift.count(),
    shiftEmployees: await prisma.shiftEmployee.count(),
    shiftSwapRequests: await prisma.shiftSwapRequest.count(),
    shiftAssignmentRequests: await prisma.shiftAssignmentRequest.count(),
    employeeDayStatuses: await prisma.employeeDayStatus.count(),
    schedulePlans: await prisma.schedulePlan.count(),
    inventoryMaterials: await prisma.inventoryMaterial.count(),
    stockMovements: await prisma.stockMovement.count(),
    employeeCanisters: await prisma.employeeCanister.count(),
    shiftReports: await prisma.shiftReport.count(),
    appConfigs: await prisma.appConfig.count(),
  };

  console.log('\n  ┌─────────────────────────────┬───────┐');
  console.log('  │ Table                       │ Count │');
  console.log('  ├─────────────────────────────┼───────┤');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  │ ${table.padEnd(27)} │ ${String(count).padStart(5)} │`);
  }
  console.log('  └─────────────────────────────┴───────┘');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\n  Total rows: ${total}`);
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  JSON → PostgreSQL Migration');
  console.log(`  Data dir: ${DATA_DIR}`);
  console.log('═══════════════════════════════════════════');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`\n✗ Data directory not found: ${DATA_DIR}`);
    console.error('  Set DATA_DIR env variable or run on the server.');
    process.exit(1);
  }

  const startTime = Date.now();

  // Order matters: FK dependencies
  await migrateSalarySchemes();       // 1. No FK
  await migrateEmployees();           // 2. FK → SalaryScheme
  await migrateAggregators();         // 3. No FK
  await migrateCounterAgents();       // 4. No FK
  await migrateExpenses();            // 5. No FK
  await migrateWashEvents();          // 6. FK → Aggregator, CounterAgent; junction → Employee
  await migrateEmployeeTransactions(); // 7. FK → Employee
  await migrateClientTransactions();  // 8. FK → Aggregator, CounterAgent
  await migrateShifts();              // 9. Junction → Employee
  await migrateShiftSwapRequests();   // 10. No FK (just stores IDs)
  await migrateShiftAssignmentRequests(); // 11. No FK
  await migrateEmployeeDayStatuses(); // 12. FK → Employee
  await migrateSchedulePlans();       // 13. No FK
  await migrateStockMovements();      // 14. FK → InventoryMaterial, Employee
  await migrateEmployeeCanisters();   // 15. FK → Employee
  await migrateShiftReports();        // 16. No FK
  await migrateAppConfigs();          // 17. Key-value store

  await verify();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Migration completed in ${elapsed}s`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('\n✗ Migration failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
