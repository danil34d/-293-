export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import type { WashEvent, Inventory } from '@/types';
import {
  getInventory,
  getWashEventById,
  invalidateInventoryCache,
  invalidateWashEventsCache,
  isSalaryPeriodClosed,
} from '@/lib/data';
import {
  deleteEntity,
  readEntity,
  saveEntity,
  saveInventoryData,
  updateBalance,
} from '@/lib/data/write-helpers';
import { requireAuth } from '@/lib/server-auth';
import { isCompletedWashEvent } from '@/lib/wash-event-status';

/**
 * UX-safety: проверка что WashEvent не из закрытого периода ЗП.
 *
 * После «Закрыть период» (POST /api/salary-period/close) edit/delete мойки
 * за этот месяц возвращает 423 Locked. Это защищает от пост-выплатных правок,
 * которые ломают баланс факт vs выплачено (см. АРХИТЕКТУРНЫЕ-НАХОДКИ #6).
 *
 * Возвращает NextResponse(423) если период закрыт, иначе null.
 * Решение владельца (2026-05-13): блокировка ТОЛЬКО на WashEvent edit/delete,
 * выплаты/расходы/склад — без блокировки.
 */
async function checkWashEventPeriodLocked(washEvent: WashEvent | null): Promise<NextResponse | null> {
  if (!washEvent?.timestamp) return null;
  try {
    const month = new Date(washEvent.timestamp).toISOString().slice(0, 7);
    if (await isSalaryPeriodClosed(month)) {
      return NextResponse.json({
        error: `Период ${month} закрыт. Откройте период через /salary-report (admin), чтобы редактировать мойки.`,
        month,
        suggestUnlock: '/salary-report',
      }, { status: 423 });
    }
  } catch (e) {
    // На JSON-fallback isSalaryPeriodClosed просто вернёт false — пропускаем.
    console.warn('[salary-period] check failed (non-fatal):', (e as any)?.message);
  }
  return null;
}

function calculateExplicitChemicalConsumption(washEvent: WashEvent): number {
  let total = 0;
  if (washEvent.services.main.chemicalConsumption) {
    total += washEvent.services.main.chemicalConsumption;
  }
  if (washEvent.services.additional && washEvent.services.additional.length > 0) {
    washEvent.services.additional.forEach(service => {
      if (service.chemicalConsumption) {
        total += service.chemicalConsumption;
      }
    });
  }
  return total;
}

function calculateConsumptionWithDefaults(washEvent: WashEvent, inventory: Inventory): number {
  if (!isCompletedWashEvent(washEvent)) {
    return 0;
  }
  const explicit = calculateExplicitChemicalConsumption(washEvent);
  if (explicit > 0) return explicit;
  if (inventory.settings?.autoDeductChemical === false) return 0;
  const settings = inventory.settings;
  if (settings?.dilutionEnabled && settings?.dilutionRatio) {
    const solutionPerWash = settings.solutionPerWashFull ?? settings.solutionPerWash ?? 700;
    return Math.round(solutionPerWash / (settings.dilutionRatio + 1));
  }
  return settings?.defaultChemicalConsumptionPerWash ?? 700;
}

function getRecordedConsumption(washEvent: WashEvent): number {
  if (typeof washEvent.chemicalConsumptionGrams === 'number' && washEvent.chemicalConsumptionGrams > 0) {
    return washEvent.chemicalConsumptionGrams;
  }
  return calculateExplicitChemicalConsumption(washEvent);
}

function calculateChemicalCost(consumedGrams: number, inventory: Inventory): number {
  if (consumedGrams <= 0) return 0;
  const chemicalMaterial = inventory.materials?.find(m => m.category === 'chemical' && m.isActive);
  if (chemicalMaterial?.pricePerUnit) {
    return Math.round(consumedGrams * chemicalMaterial.pricePerUnit * 100) / 100;
  }
  if (inventory.settings?.chemicalPricePerKg) {
    return Math.round((consumedGrams / 1000) * inventory.settings.chemicalPricePerKg * 100) / 100;
  }
  return 0;
}

async function updateInventoryDelta(deltaGrams: number) {
  if (deltaGrams === 0) return;
  const inventory = await getInventory();
  inventory.chemicalStockGrams -= deltaGrams;
  await saveInventoryData(inventory);
  invalidateInventoryCache();
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash Event ID is required' }, { status: 400 });
  }

  try {
    const data = await readEntity<WashEvent>('washEvent', id);
    if (!data) {
      return NextResponse.json({ error: 'Wash Event not found' }, { status: 404 });
    }

    // Migration logic
    if ((data as any).driverComment && !Array.isArray(data.driverComments)) {
      if (typeof (data as any).driverComment === 'object' && !Array.isArray((data as any).driverComment)) {
        data.driverComments = [(data as any).driverComment];
      }
      delete (data as any).driverComment;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Error reading wash event data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash Event ID is required for PUT' }, { status: 400 });
  }

  try {
    // Read old wash event to get previous values
    let oldConsumption = 0;
    let oldAmount = 0;
    let oldSourceId: string | undefined;
    const oldEvent = await readEntity<WashEvent>('washEvent', id);

    // UX-safety: если период закрыт — отказ 423.
    const locked = await checkWashEventPeriodLocked(oldEvent);
    if (locked) return locked;

    if (oldEvent) {
      oldConsumption = getRecordedConsumption(oldEvent);
      oldAmount = oldEvent.totalAmount || 0;
      oldSourceId = oldEvent.sourceId;
    }

    const updatedData: WashEvent = await request.json();

    if (!updatedData.id || updatedData.id !== id) {
      updatedData.id = id;
    }

    // Migration logic for data coming from client
    if ((updatedData as any).driverComment && !Array.isArray(updatedData.driverComments)) {
      const comment = (updatedData as any).driverComment;
      if (typeof comment === 'object' && !Array.isArray(comment)) {
        updatedData.driverComments = [comment];
      }
      delete (updatedData as any).driverComment;
    }

    const inventory = await getInventory();
    const newConsumption = calculateConsumptionWithDefaults(updatedData, inventory);
    if (newConsumption > 0) {
      updatedData.chemicalConsumptionGrams = newConsumption;
      updatedData.chemicalCostRub = calculateChemicalCost(newConsumption, inventory);
    } else {
      delete updatedData.chemicalConsumptionGrams;
      delete updatedData.chemicalCostRub;
    }

    // Write updated wash event
    await saveEntity('washEvent', updatedData);
    invalidateWashEventsCache();

    // Update inventory: add back old consumption, subtract new consumption
    const delta = newConsumption - oldConsumption;
    await updateInventoryDelta(delta);

    // Update client balance if amount or source changed
    const newAmount = updatedData.totalAmount || 0;
    const newSourceId = updatedData.sourceId;

    if (oldSourceId !== newSourceId) {
      if (oldSourceId && oldAmount > 0) {
        await updateBalance(oldSourceId, oldAmount);
      }
      if (newSourceId && newAmount > 0) {
        await updateBalance(newSourceId, -newAmount);
      }
    } else if (oldAmount !== newAmount && newSourceId) {
      const amountDelta = oldAmount - newAmount;
      await updateBalance(newSourceId, amountDelta);
    }

    return NextResponse.json({ message: 'Wash Event updated successfully', event: updatedData });
  } catch (error) {
    console.error(`Error writing wash event data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash Event ID is required for DELETE' }, { status: 400 });
  }

  try {
    // Read wash event before deleting to get chemical consumption and amount
    let consumedChemicals = 0;
    let washAmount = 0;
    let sourceId: string | undefined;
    const washEvent = await readEntity<WashEvent>('washEvent', id);

    // UX-safety: если период закрыт — отказ 423.
    const locked = await checkWashEventPeriodLocked(washEvent);
    if (locked) return locked;

    if (washEvent) {
      consumedChemicals = getRecordedConsumption(washEvent);
      washAmount = washEvent.totalAmount || 0;
      sourceId = washEvent.sourceId;
    }

    // Delete the wash event
    await deleteEntity('washEvent', id);
    invalidateWashEventsCache();

    // Add chemicals back to inventory (reverse the consumption)
    if (consumedChemicals > 0) {
      await updateInventoryDelta(-consumedChemicals);
    }

    // Refund client balance
    if (sourceId && washAmount > 0) {
      await updateBalance(sourceId, washAmount);
    }

    return NextResponse.json({ message: 'Wash event deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting wash event data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
