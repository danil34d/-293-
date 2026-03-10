import fs from 'fs/promises';
import path from 'path';
import type { Inventory, StockMovement, WashComment, WashEvent } from '@/types';
import {
  getInventory,
  invalidateInventoryCache,
  invalidateStockMovementsCache,
  invalidateWashEventsCache,
} from '@/lib/data-loader';
import { updateClientBalanceById } from '@/lib/client-balance';

const WASH_EVENTS_DIR = path.join(process.cwd(), 'data', 'wash-events');
const INVENTORY_PATH = path.join(process.cwd(), 'data', 'inventory.json');
const STOCK_MOVEMENTS_DIR = path.join(process.cwd(), 'data', 'stock-movements');

async function ensureDataDirectory(): Promise<void> {
  await fs.mkdir(WASH_EVENTS_DIR, { recursive: true });
}

function calculateTotalChemicalConsumption(washEvent: WashEvent, inventory: Inventory): number {
  let total = 0;

  if (washEvent.services.main.chemicalConsumption) {
    total += washEvent.services.main.chemicalConsumption;
  }

  if (Array.isArray(washEvent.services.additional)) {
    for (const service of washEvent.services.additional) {
      if (service.chemicalConsumption) {
        total += service.chemicalConsumption;
      }
    }
  }

  if (total === 0 && inventory.settings?.autoDeductChemical !== false) {
    const settings = inventory.settings;
    if (settings?.dilutionEnabled && settings?.dilutionRatio) {
      const solutionPerWash = settings.solutionPerWashFull ?? settings.solutionPerWash ?? 700;
      total = Math.round(solutionPerWash / (settings.dilutionRatio + 1));
    } else {
      total = settings?.defaultChemicalConsumptionPerWash ?? 700;
    }
  }

  return total;
}

function calculateChemicalCost(consumedGrams: number, inventory: Inventory): number {
  if (consumedGrams <= 0) return 0;

  const chemicalMaterial = inventory.materials?.find((item) => item.category === 'chemical' && item.isActive);
  if (chemicalMaterial?.pricePerUnit) {
    return Math.round(consumedGrams * chemicalMaterial.pricePerUnit * 100) / 100;
  }

  if (inventory.settings?.chemicalPricePerKg) {
    return Math.round((consumedGrams / 1000) * inventory.settings.chemicalPricePerKg * 100) / 100;
  }

  return 0;
}

async function createStockMovementRecord(params: {
  consumedGrams: number;
  balanceAfter: number;
  washEventId: string;
  employeeIds: string[];
}): Promise<void> {
  await fs.mkdir(STOCK_MOVEMENTS_DIR, { recursive: true });

  const movement: StockMovement = {
    id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
    materialId: 'mat_chemical_main',
    type: 'consumption',
    amount: -params.consumedGrams,
    balanceAfter: params.balanceAfter,
    date: new Date().toISOString(),
    description: `Автосписание при мойке #${params.washEventId}`,
    relatedEntityType: 'wash_event',
    relatedEntityId: params.washEventId,
    employeeId: params.employeeIds[0],
  };

  const movementPath = path.join(STOCK_MOVEMENTS_DIR, `${movement.id}.json`);
  await fs.writeFile(movementPath, JSON.stringify(movement, null, 2), 'utf-8');
  invalidateStockMovementsCache();
}

async function updateInventoryAfterWash(params: {
  consumedGrams: number;
  washEventId: string;
  employeeIds: string[];
}): Promise<void> {
  if (params.consumedGrams <= 0) return;

  const inventory = await getInventory();
  if (inventory.settings?.autoDeductChemical === false) return;

  const newBalance = inventory.chemicalStockGrams - params.consumedGrams;
  inventory.chemicalStockGrams = newBalance;

  const materials = inventory.materials ?? [];
  const chemicalMaterial = materials.find((item) => item.category === 'chemical' && item.isActive);
  if (chemicalMaterial) {
    const idx = materials.findIndex((item) => item.id === chemicalMaterial.id);
    if (idx >= 0) {
      materials[idx].currentStock = newBalance;
      materials[idx].updatedAt = new Date().toISOString();
    }
  }
  inventory.materials = materials;

  await fs.writeFile(INVENTORY_PATH, JSON.stringify(inventory, null, 2), 'utf-8');
  invalidateInventoryCache();

  await createStockMovementRecord({
    consumedGrams: params.consumedGrams,
    balanceAfter: newBalance,
    washEventId: params.washEventId,
    employeeIds: params.employeeIds,
  });
}

function normalizeLegacyComments(washEvent: WashEvent): void {
  const legacyDriverComment = (washEvent as WashEvent & { driverComment?: WashComment }).driverComment;
  if (legacyDriverComment) {
    washEvent.driverComments = [legacyDriverComment];
    delete (washEvent as WashEvent & { driverComment?: WashComment }).driverComment;
  }
}

export async function createWashEvent(washEvent: WashEvent): Promise<WashEvent> {
  if (!washEvent.id) {
    throw new Error('Wash event ID is required');
  }

  await ensureDataDirectory();
  const filePath = path.join(WASH_EVENTS_DIR, `${washEvent.id}.json`);

  try {
    const existingRaw = await fs.readFile(filePath, 'utf-8');
    const existing = JSON.parse(existingRaw) as WashEvent;
    return existing;
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  normalizeLegacyComments(washEvent);

  const inventory = await getInventory();
  const consumedChemicals = calculateTotalChemicalConsumption(washEvent, inventory);
  if (consumedChemicals > 0) {
    washEvent.chemicalConsumptionGrams = consumedChemicals;
    washEvent.chemicalCostRub = calculateChemicalCost(consumedChemicals, inventory);
  }

  await fs.writeFile(filePath, JSON.stringify(washEvent, null, 2), 'utf-8');
  invalidateWashEventsCache();

  await updateInventoryAfterWash({
    consumedGrams: consumedChemicals,
    washEventId: washEvent.id,
    employeeIds: washEvent.employeeIds,
  });

  if (washEvent.sourceId && washEvent.totalAmount > 0) {
    await updateClientBalanceById(washEvent.sourceId, -washEvent.totalAmount);
  }

  return washEvent;
}
