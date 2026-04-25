export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Expense } from '@/types';
import { getExpensesData, invalidateExpensesCache, invalidateInventoryCache, getInventory } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, saveInventoryData } from '@/lib/data/write-helpers';

async function updateInventory(changeInGrams: number) {
    const inventory = await getInventory();
    inventory.chemicalStockGrams += changeInGrams;
    await saveInventoryData(inventory);
    invalidateInventoryCache();
}


export async function GET() {
  try {
    const expenses = await getExpensesData();
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error reading expenses directory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const newExpense: Expense = await request.json();
    if (!newExpense.id) {
       return NextResponse.json({ error: 'Expense ID is required' }, { status: 400 });
    }

    // Write expense FIRST - if this fails, inventory won't be updated
    await saveEntity('expense', newExpense);
    invalidateExpensesCache();

    // Only update inventory after expense is successfully saved
    // Check for chemical purchase (handle "кг", "кг.", "кг ", etc.)
    const isChemicalPurchase = newExpense.category === 'Закупка химии' &&
                               newExpense.unit &&
                               newExpense.unit.trim().toLowerCase().startsWith('кг') &&
                               typeof newExpense.quantity === 'number';

    if (isChemicalPurchase) {
        const amountInGrams = (newExpense.quantity ?? 0) * 1000;
        await updateInventory(amountInGrams);
    }

    return NextResponse.json({ message: 'Expense created successfully', expense: newExpense }, { status: 201 });
  } catch (error) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
