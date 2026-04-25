export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { WashEvent, Inventory } from '@/types';
import { invalidateWashEventsCache, getInventory, invalidateInventoryCache } from '@/lib/data-loader';
import { updateClientBalanceById } from '@/lib/client-balance';
import { requireAuth } from '@/lib/server-auth';
import { isCompletedWashEvent } from '@/lib/wash-event-status';

const dataDir = path.join(process.cwd(), 'data', 'wash-events');
const inventoryPath = path.join(process.cwd(), 'data', 'inventory.json');

// Calculate total chemical consumption for a wash event
function calculateExplicitChemicalConsumption(washEvent: WashEvent): number {
  let total = 0;

  // Main service consumption
  if (washEvent.services.main.chemicalConsumption) {
    total += washEvent.services.main.chemicalConsumption;
  }

  // Additional services consumption
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
  // On delete/legacy records, never apply defaults retroactively.
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

// Update inventory by a delta (positive = add, negative = subtract)
async function updateInventory(deltaGrams: number) {
  if (deltaGrams === 0) return;

  const inventory = await getInventory();
  inventory.chemicalStockGrams -= deltaGrams; // Negative delta = add back to stock
  await fs.writeFile(inventoryPath, JSON.stringify(inventory, null, 2), 'utf-8');
  invalidateInventoryCache();
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash Event ID is required' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    let data = JSON.parse(fileContent);

    // Migration logic
    if (data.driverComment && !Array.isArray(data.driverComments)) {
        // Ensure driverComment is an object and not an array before wrapping
        if (typeof data.driverComment === 'object' && !Array.isArray(data.driverComment)) {
            data.driverComments = [data.driverComment];
        }
        delete data.driverComment;
    }

    return NextResponse.json(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Wash Event not found' }, { status: 404 });
    }
    console.error(`Error reading wash event data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id:string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash Event ID is required for PUT' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    // Read old wash event to get previous values
    let oldConsumption = 0;
    let oldAmount = 0;
    let oldSourceId: string | undefined;
    try {
      const oldFileContent = await fs.readFile(filePath, 'utf-8');
      const oldEvent: WashEvent = JSON.parse(oldFileContent);
      oldConsumption = getRecordedConsumption(oldEvent);
      oldAmount = oldEvent.totalAmount || 0;
      oldSourceId = oldEvent.sourceId;
    } catch (error) {
      // File doesn't exist or can't be read - treat as new event
      oldConsumption = 0;
      oldAmount = 0;
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
    await fs.writeFile(filePath, JSON.stringify(updatedData, null, 2), 'utf-8');
    invalidateWashEventsCache();

    // Update inventory: add back old consumption, subtract new consumption
    const delta = newConsumption - oldConsumption; // Positive if consumption increased
    await updateInventory(delta);

    // Update client balance if amount or source changed
    const newAmount = updatedData.totalAmount || 0;
    const newSourceId = updatedData.sourceId;

    // If source changed, refund old client and charge new client
    if (oldSourceId !== newSourceId) {
      // Refund old client (positive change = add money back)
      if (oldSourceId && oldAmount > 0) {
        await updateClientBalanceById(oldSourceId, oldAmount);
      }
      // Charge new client (negative change = deduct money)
      if (newSourceId && newAmount > 0) {
        await updateClientBalanceById(newSourceId, -newAmount);
      }
    } else if (oldAmount !== newAmount && newSourceId) {
      // Same source, but amount changed - adjust the difference
      const amountDelta = oldAmount - newAmount; // Positive if price decreased (refund), negative if increased (charge more)
      await updateClientBalanceById(newSourceId, amountDelta);
    }

    return NextResponse.json({ message: 'Wash Event updated successfully', event: updatedData });
  } catch (error) {
    console.error(`Error writing wash event data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id:string } }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Wash Event ID is required for DELETE' }, { status: 400 });
  }
  const filePath = path.join(dataDir, `${id}.json`);

  try {
    // Read wash event before deleting to get chemical consumption and amount
    let consumedChemicals = 0;
    let washAmount = 0;
    let sourceId: string | undefined;
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const washEvent: WashEvent = JSON.parse(fileContent);
      consumedChemicals = getRecordedConsumption(washEvent);
      washAmount = washEvent.totalAmount || 0;
      sourceId = washEvent.sourceId;
    } catch (error) {
      // File doesn't exist or can't be read
      consumedChemicals = 0;
      washAmount = 0;
    }

    // Delete the wash event file
    await fs.unlink(filePath);
    invalidateWashEventsCache();

    // Add chemicals back to inventory (reverse the consumption)
    if (consumedChemicals > 0) {
      await updateInventory(-consumedChemicals); // Negative = add back to stock
    }

    // Refund client balance (positive change = add money back)
    if (sourceId && washAmount > 0) {
      await updateClientBalanceById(sourceId, washAmount);
    }

    return NextResponse.json({ message: 'Wash event deleted successfully' });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Wash event not found' }, { status: 404 });
    }
    console.error(`Error deleting wash event data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
