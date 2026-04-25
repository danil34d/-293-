import type { Inventory, StockMovement, WashComment, WashEvent } from '@/types';
import {
  getInventory,
  invalidateInventoryCache,
  invalidateStockMovementsCache,
  invalidateWashEventsCache,
} from '@/lib/data';
import { createWashEventAtomic, readEntity } from '@/lib/data/write-helpers';
import { isCompletedWashEvent } from '@/lib/wash-event-status';

function calculateTotalChemicalConsumption(washEvent: WashEvent, inventory: Inventory): number {
  if (!isCompletedWashEvent(washEvent)) {
    return 0;
  }

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

  // Check for duplicate via data adapter (PG or JSON)
  const existing = await readEntity<WashEvent>('washEvent', washEvent.id);
  if (existing) {
    return existing;
  }

  normalizeLegacyComments(washEvent);

  const inventory = await getInventory();
  const consumedChemicals = calculateTotalChemicalConsumption(washEvent, inventory);
  if (consumedChemicals > 0) {
    washEvent.chemicalConsumptionGrams = consumedChemicals;
    washEvent.chemicalCostRub = calculateChemicalCost(consumedChemicals, inventory);
  }

  // Prepare stock movement and inventory update
  let stockMovement: StockMovement | null = null;
  let updatedInventory: Inventory | null = null;

  if (consumedChemicals > 0 && inventory.settings?.autoDeductChemical !== false) {
    const newBalance = inventory.chemicalStockGrams - consumedChemicals;

    stockMovement = {
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      materialId: 'mat_chemical_main',
      type: 'consumption',
      amount: -consumedChemicals,
      balanceAfter: newBalance,
      date: new Date().toISOString(),
      description: `Автосписание при мойке #${washEvent.id}`,
      relatedEntityType: 'wash_event',
      relatedEntityId: washEvent.id,
      employeeId: washEvent.employeeIds[0],
    };

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
    updatedInventory = inventory;
  }

  // Prepare client balance change
  const clientBalanceChange = (washEvent.sourceId && washEvent.totalAmount > 0)
    ? { sourceId: washEvent.sourceId, amount: -washEvent.totalAmount }
    : null;

  // Atomic write: wash event + stock movement + inventory + client balance
  // For PG: single transaction (all-or-nothing)
  // For JSON: sequential writes (backward compatible)
  await createWashEventAtomic({
    washEvent,
    stockMovement,
    inventory: updatedInventory,
    clientBalanceChange,
  });

  // Invalidate caches (no-op for PG, real for JSON)
  invalidateWashEventsCache();
  if (updatedInventory) {
    invalidateInventoryCache();
    invalidateStockMovementsCache();
  }

  return washEvent;
}
