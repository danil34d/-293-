export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Expense } from '@/types';
import { getExpensesData, invalidateExpensesCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity } from '@/lib/data/write-helpers';


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

    // Persist the expense only. Inventory updates are owned by
    // /api/stock-movements (which is the audit source for stock balance
    // changes). Previously this route also added quantity*1000 grams to
    // inventory.chemicalStockGrams when category was "Закупка химии",
    // which double-counted every chemical purchase made through the UI
    // (handlePurchaseChemical posts to both /api/stock-movements and
    // /api/expenses, so the stock would be credited twice).
    await saveEntity('expense', newExpense);
    invalidateExpensesCache();

    return NextResponse.json({ message: 'Expense created successfully', expense: newExpense }, { status: 201 });
  } catch (error) {
    console.error('Error creating expense:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
