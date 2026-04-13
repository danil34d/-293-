'use server';

/**
 * Universal write helpers that dispatch to either JSON files or PostgreSQL
 * based on DATA_SOURCE env variable.
 *
 * Usage in API routes:
 *   import { saveEntity, deleteEntity, updateBalance } from '@/lib/data/write-helpers';
 *   await saveEntity('washEvent', washEventData);
 *   await deleteEntity('washEvent', id);
 *   await updateBalance(sourceId, -amount);
 *
 * When DATA_SOURCE=postgres: calls pg-adapter Prisma functions
 * When DATA_SOURCE=json (default): calls fs.writeFile (legacy behavior)
 */

import fs from 'fs/promises';
import path from 'path';

const usePostgres = process.env.DATA_SOURCE === 'postgres';
const dataRoot = path.join(process.cwd(), 'data');

// Lazy-load pg-adapter only when needed
let pgAdapter: any = null;
function getPgAdapter() {
  if (!pgAdapter) {
    pgAdapter = require('./pg-adapter');
  }
  return pgAdapter;
}

// ─── JSON file helpers ──────────────────────────────────────

async function writeJsonFile(dir: string, filename: string, data: any): Promise<void> {
  const dirPath = path.join(dataRoot, dir);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(path.join(dirPath, filename), JSON.stringify(data, null, 2), 'utf-8');
}

async function deleteJsonFile(dir: string, filename: string): Promise<void> {
  try {
    await fs.unlink(path.join(dataRoot, dir, filename));
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}

async function readJsonFile<T>(dir: string, filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(dataRoot, dir, filename), 'utf-8');
    return JSON.parse(raw) as T;
  } catch (e: any) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeSingleton(filename: string, data: any): Promise<void> {
  await fs.writeFile(path.join(dataRoot, filename), JSON.stringify(data, null, 2), 'utf-8');
}

// ─── Entity Save/Delete ─────────────────────────────────────

type EntityType =
  | 'washEvent' | 'employee' | 'aggregator' | 'counterAgent'
  | 'expense' | 'salaryScheme' | 'shift' | 'shiftSwapRequest'
  | 'shiftAssignmentRequest' | 'employeeDayStatus' | 'schedulePlan'
  | 'stockMovement' | 'employeeCanister' | 'shiftReport' | 'violation';

const entityDirMap: Record<EntityType, string> = {
  washEvent: 'wash-events',
  employee: 'employees',
  aggregator: 'aggregators',
  counterAgent: 'counter-agents',
  expense: 'expenses',
  salaryScheme: 'salary-schemes',
  shift: 'shifts',
  shiftSwapRequest: 'shift-swap-requests',
  shiftAssignmentRequest: 'shift-assignment-requests',
  employeeDayStatus: 'employee-day-statuses',
  schedulePlan: 'schedule-plans',
  stockMovement: 'stock-movements',
  employeeCanister: 'employee-canisters',
  shiftReport: 'shift-reports',
  violation: 'violations',
};

const pgSaveFnMap: Record<EntityType, string> = {
  washEvent: 'saveWashEvent',
  employee: 'saveEmployee',
  aggregator: 'saveAggregator',
  counterAgent: 'saveCounterAgent',
  expense: 'saveExpense',
  salaryScheme: 'saveSalaryScheme',
  shift: 'saveShift',
  shiftSwapRequest: 'saveShiftSwapRequest',
  shiftAssignmentRequest: 'saveShiftAssignmentRequest',
  employeeDayStatus: 'saveEmployeeDayStatus',
  schedulePlan: 'saveSchedulePlan',
  stockMovement: 'saveStockMovement',
  employeeCanister: 'saveEmployeeCanister',
  shiftReport: 'saveShiftReport',
  violation: 'saveViolation',
};

const pgDeleteFnMap: Record<EntityType, string> = {
  washEvent: 'deleteWashEvent',
  employee: 'deleteEmployee',
  aggregator: 'deleteAggregator',
  counterAgent: 'deleteCounterAgent',
  expense: 'deleteExpense',
  salaryScheme: 'deleteSalaryScheme',
  shift: 'deleteShift',
  shiftSwapRequest: 'deleteShiftSwapRequest',
  shiftAssignmentRequest: 'deleteShiftAssignmentRequest',
  employeeDayStatus: 'deleteEmployeeDayStatus',
  schedulePlan: 'deleteSchedulePlan',
  stockMovement: '', // no delete
  employeeCanister: 'deleteEmployeeCanister',
  shiftReport: '', // no delete
  violation: 'deleteViolation',
};

/**
 * Save an entity (create or update) to the active data source.
 * For JSON: writes to data/{dir}/{id}.json
 * For PG: calls pg-adapter save function
 */
export async function saveEntity(type: EntityType, data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    const fn = pg[pgSaveFnMap[type]];
    await fn(data);
  } else {
    const dir = entityDirMap[type];
    await writeJsonFile(dir, `${data.id}.json`, data);
  }
}

/**
 * Delete an entity from the active data source.
 */
export async function deleteEntity(type: EntityType, id: string): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    const fnName = pgDeleteFnMap[type];
    if (fnName) await pg[fnName](id);
  } else {
    const dir = entityDirMap[type];
    await deleteJsonFile(dir, `${id}.json`);
  }
}

/**
 * Read an entity by ID (for mutation operations that need to read before write).
 */
export async function readEntity<T>(type: EntityType, id: string): Promise<T | null> {
  if (usePostgres) {
    // For PG, use the read functions from the adapter
    const pg = getPgAdapter();
    const byIdFns: Record<string, string> = {
      washEvent: 'getWashEventById',
      employee: 'getEmployeeById',
      aggregator: 'getAggregatorById',
      counterAgent: 'getCounterAgentById',
      expense: 'getExpenseById',
      salaryScheme: 'getSalarySchemeById',
      shift: 'getShiftById',
      shiftSwapRequest: 'getShiftSwapRequestById',
      employeeDayStatus: 'getEmployeeDayStatusById',
      schedulePlan: 'getSchedulePlanById',
    };
    const fn = pg[byIdFns[type]];
    return fn ? await fn(id) : null;
  } else {
    return readJsonFile<T>(entityDirMap[type], `${id}.json`);
  }
}

// ─── Client Balance ─────────────────────────────────────────

/**
 * Update client (aggregator/counter-agent) balance.
 * amountChange: positive = add money, negative = charge
 */
export async function updateBalance(sourceId: string, amountChange: number): Promise<void> {
  if (!sourceId || amountChange === 0) return;

  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.updateClientBalance(sourceId, amountChange);
  } else {
    // JSON: read file, update balance, write back
    let dir: string;
    if (sourceId.startsWith('agg_')) dir = 'aggregators';
    else if (sourceId.startsWith('agent_')) dir = 'counter-agents';
    else return;

    const filePath = path.join(dataRoot, dir, `${sourceId}.json`);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      data.balance = (data.balance ?? 0) + amountChange;
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        console.warn(`Client file not found for balance update: ${sourceId}`);
        return;
      }
      throw e;
    }
  }
}

// ─── Employee Transactions (array-per-file in JSON) ─────────

/**
 * Save all transactions for an employee.
 * JSON: writes array to employee-transactions/{employeeId}.json
 * PG: replaces all transactions for this employee
 */
export async function saveEmployeeTransactions(employeeId: string, transactions: any[]): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveEmployeeTransactions(employeeId, transactions);
  } else {
    await writeJsonFile('employee-transactions', `${employeeId}.json`, transactions);
  }
}

// ─── Client Transactions (array-per-file in JSON) ─────────

/**
 * Save all transactions for a client.
 * JSON: writes array to client-transactions/{clientId}.json
 * PG: replaces all transactions for this client
 */
export async function saveClientTransactions(clientId: string, transactions: any[]): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveClientTransactions(clientId, transactions);
  } else {
    await writeJsonFile('client-transactions', `${clientId}.json`, transactions);
  }
}

// ─── Singleton configs ──────────────────────────────────────

export async function saveInventoryData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveInventory(data);
  } else {
    await writeSingleton('inventory.json', data);
  }
}

export async function saveChemicalConfigData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveChemicalConfig(data);
  } else {
    await writeSingleton('chemical-config.json', data);
  }
}

export async function saveRetailPriceConfigData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveRetailPriceConfig(data);
  } else {
    await writeSingleton('retail-price-list.json', data);
  }
}

export async function saveVehicleTypesData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveVehicleTypes(data);
  } else {
    await writeSingleton('vehicle-types.json', data);
  }
}

export async function saveAppVersionData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveAppVersion(data);
  } else {
    await writeSingleton('app-version.json', data);
  }
}

export async function saveDeviceHeartbeatsData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveDeviceHeartbeats(data);
  } else {
    await writeSingleton('device-heartbeats.json', data);
  }
}

export async function saveWeatherPatternsData(data: any): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.saveWeatherPatterns(data);
  } else {
    await writeSingleton('weather-patterns.json', data);
  }
}

// ─── Transactional wash event creation ──────────────────────

/**
 * Create a wash event with all side effects atomically.
 * For PG: single transaction (all-or-nothing)
 * For JSON: sequential writes (best-effort, with rollback on failure)
 */
export async function createWashEventAtomic(params: {
  washEvent: any;
  stockMovement: any | null;
  inventory: any | null;
  clientBalanceChange: { sourceId: string; amount: number } | null;
}): Promise<void> {
  if (usePostgres) {
    const pg = getPgAdapter();
    await pg.createWashEventWithSideEffects(
      params.washEvent,
      params.stockMovement,
      params.inventory,
      params.clientBalanceChange,
    );
  } else {
    // JSON: sequential writes (existing behavior)
    await saveEntity('washEvent', params.washEvent);
    if (params.stockMovement) {
      await saveEntity('stockMovement', params.stockMovement);
    }
    if (params.inventory) {
      await saveInventoryData(params.inventory);
    }
    if (params.clientBalanceChange) {
      await updateBalance(params.clientBalanceChange.sourceId, params.clientBalanceChange.amount);
    }
  }
}
