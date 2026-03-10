export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { EmployeeTransaction } from '@/types';
import { invalidateEmployeeTransactionsCache, getInventory, invalidateInventoryCache, invalidateAllEmployeeTransactionsCache } from '@/lib/data-loader';
import { requireAdmin } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'employee-transactions');
const inventoryPath = path.join(process.cwd(), 'data', 'inventory.json');

async function ensureDataDirectory() {
  try {
    await fs.access(dataDir);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      await fs.mkdir(dataDir, { recursive: true });
    } else {
      throw error;
    }
  }
}

async function readTransactions(employeeId: string): Promise<EmployeeTransaction[]> {
    const filePath = path.join(dataDir, `${employeeId}.json`);
    try {
        await ensureDataDirectory();
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent) as EmployeeTransaction[];
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return []; // No transactions file yet, return empty array
        }
        throw error; // Other errors should be propagated
    }
}

async function writeTransactions(employeeId: string, transactions: EmployeeTransaction[]) {
    const filePath = path.join(dataDir, `${employeeId}.json`);
    await ensureDataDirectory();
    await fs.writeFile(filePath, JSON.stringify(transactions, null, 2), 'utf-8');
    invalidateEmployeeTransactionsCache(employeeId);
    invalidateAllEmployeeTransactionsCache();
}

async function updateInventory(changeInGrams: number) {
    const inventory = await getInventory();
    inventory.chemicalStockGrams += changeInGrams;
    await fs.writeFile(inventoryPath, JSON.stringify(inventory, null, 2), 'utf-8');
    invalidateInventoryCache();
}


export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const employeeId = params.id;
  if (!employeeId) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }

  try {
    const newTransactionData = await request.json();

    if (!newTransactionData.type || !newTransactionData.amount || !newTransactionData.description) {
        return NextResponse.json({ error: 'Missing required transaction fields' }, { status: 400 });
    }

    const parsedAmount = Number(newTransactionData.amount);
    if (!Number.isFinite(parsedAmount)) {
        return NextResponse.json({ error: 'Amount must be a valid number' }, { status: 400 });
    }

    const currentTransactions = await readTransactions(employeeId);

    const transactionToSave: EmployeeTransaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      employeeId: employeeId,
      date: new Date().toISOString(),
      type: newTransactionData.type,
      amount: parsedAmount,
      description: newTransactionData.description,
    };
    
    currentTransactions.push(transactionToSave);
    
    await writeTransactions(employeeId, currentTransactions);
    
    // If it's a chemical canister issue, update inventory by subtracting
    if (transactionToSave.type === 'purchase' && transactionToSave.description.includes('Выдача канистры химии')) {
      const inventory = await getInventory();
      const canisterWeightGrams = inventory.settings?.canisterWeightGrams ?? 21000;
      await updateInventory(-canisterWeightGrams);
    }


    return NextResponse.json({ message: 'Transaction added successfully', transaction: transactionToSave }, { status: 201 });

  } catch (error) {
    console.error(`Error adding transaction for employee ${employeeId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const employeeId = params.id;
  if (!employeeId) {
    return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
  }
  
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get('transactionId');
  if (!transactionId) {
    return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
  }

  try {
    let transactions = await readTransactions(employeeId);
    
    const transactionToDelete = transactions.find(t => t.id === transactionId);
    if (!transactionToDelete) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    transactions = transactions.filter(t => t.id !== transactionId);

    // If it was a chemical canister issue that is being deleted, add the amount back to inventory
    if (transactionToDelete.type === 'purchase' && transactionToDelete.description.includes('Выдача канистры химии')) {
        const inventory = await getInventory();
        const canisterWeightGrams = inventory.settings?.canisterWeightGrams ?? 21000;
        await updateInventory(canisterWeightGrams);
    }

    await writeTransactions(employeeId, transactions);

    return NextResponse.json({ message: 'Transaction deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting transaction for employee ${employeeId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
