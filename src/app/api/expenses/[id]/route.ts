export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Expense } from '@/types';
import { invalidateExpensesCache, invalidateInventoryCache, getInventory, reverseExpenseStockMovements } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, deleteEntity, readEntity, saveInventoryData } from '@/lib/data/write-helpers';

async function updateInventory(changeInGrams: number) {
    const inventory = await getInventory();
    inventory.chemicalStockGrams += changeInGrams;
    await saveInventoryData(inventory);
    invalidateInventoryCache();
}


export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Expense ID is required' }, { status: 400 });
  }

  try {
    const data = await readEntity<Expense>('expense', id);
    if (!data) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Error reading expense data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Expense ID is required for PUT' }, { status: 400 });
  }

  try {
    const updatedData: Expense = await request.json();

    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }

    // Handle inventory change
    let oldChemicalAmountGrams = 0;
    try {
        const oldData = await readEntity<Expense>('expense', id);
        if (oldData) {
          const isOldChemicalPurchase = oldData.category === 'Закупка химии' &&
                                        oldData.unit &&
                                        oldData.unit.trim().toLowerCase().startsWith('кг') &&
                                        typeof oldData.quantity === 'number';
          if (isOldChemicalPurchase) {
              oldChemicalAmountGrams = (oldData.quantity ?? 0) * 1000;
          }
        }
    } catch (e: any) {
      console.error("Could not read old expense:", e);
    }

    let newChemicalAmountGrams = 0;
    const isNewChemicalPurchase = updatedData.category === 'Закупка химии' &&
                                  updatedData.unit &&
                                  updatedData.unit.trim().toLowerCase().startsWith('кг') &&
                                  typeof updatedData.quantity === 'number';
    if (isNewChemicalPurchase) {
        newChemicalAmountGrams = (updatedData.quantity ?? 0) * 1000;
    }

    const inventoryChange = newChemicalAmountGrams - oldChemicalAmountGrams;

    // Write entity FIRST - if this fails, inventory won't be updated
    await saveEntity('expense', updatedData);
    invalidateExpensesCache();

    // Only update inventory after entity is successfully written
    if (inventoryChange !== 0) {
        await updateInventory(inventoryChange);
    }

    return NextResponse.json({ message: 'Data updated successfully', expense: updatedData });
  } catch (error) {
    console.error(`Error writing expense data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Expense ID is required for DELETE' }, { status: 400 });
  }

  try {
    let chemicalAmountToSubtractGrams = 0;
    const data = await readEntity<Expense>('expense', id);
    if (!data) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    const isChemicalPurchase = data.category === 'Закупка химии' &&
                               data.unit &&
                               data.unit.trim().toLowerCase().startsWith('кг') &&
                               typeof data.quantity === 'number';
    if (isChemicalPurchase) {
        chemicalAmountToSubtractGrams = (data.quantity ?? 0) * 1000;
    }

    // Phase 24a / V2-#2 / finding #7 АРХ: атомарный реверс связанных StockMovement
    // (если есть — backfill Phase 16 создал relatedEntityType='expense' + relatedEntityId).
    // Делаем ПЕРВЫМ — если реверс упадёт, ничего не удаляется (audit safety).
    let stockReversal = { reversed: 0, totalGramsReversed: 0, reverseMovementIds: [] as string[] };
    try {
      stockReversal = await reverseExpenseStockMovements(id, auth.id);
    } catch (e: any) {
      console.error(`reverseExpenseStockMovements failed for expense ${id}:`, e);
      return NextResponse.json({
        error: `Не удалось реверсировать связанные движения склада: ${e.message ?? e}. Расход НЕ удалён.`,
      }, { status: 500 });
    }

    // Legacy путь: AppConfig.inventory.chemicalStockGrams (manual number, без audit).
    // Делаем только если StockMovement реверса НЕ было — чтобы не двойной декремент.
    if (chemicalAmountToSubtractGrams > 0 && stockReversal.reversed === 0) {
        await updateInventory(-chemicalAmountToSubtractGrams);
    }

    // Только после успешного inventory adjustment удаляем сам Expense
    await deleteEntity('expense', id);
    invalidateExpensesCache();
    if (stockReversal.reversed > 0) invalidateInventoryCache();

    return NextResponse.json({
      message: 'Expense deleted successfully',
      stockReversal: stockReversal.reversed > 0 ? {
        reversedMovements: stockReversal.reversed,
        totalGramsReversed: stockReversal.totalGramsReversed,
        note: `Создано ${stockReversal.reversed} reverse-движений (audit trail сохранён)`,
      } : undefined,
    });
  } catch (error: any) {
    console.error(`Error deleting expense data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
