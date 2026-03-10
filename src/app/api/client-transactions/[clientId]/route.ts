export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import type { ClientTransaction } from '@/types';
import { invalidateClientTransactionsCache, invalidateCounterAgentsCache, invalidateAggregatorsCache } from '@/lib/data-loader';
import { updateClientBalanceById } from '@/lib/client-balance';
import { requireAdmin } from '@/lib/server-auth';

const dataDir = path.join(process.cwd(), 'data', 'client-transactions');

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

async function readTransactions(clientId: string): Promise<ClientTransaction[]> {
    const filePath = path.join(dataDir, `${clientId}.json`);
    try {
        await ensureDataDirectory();
        const fileContent = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(fileContent) as ClientTransaction[];
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            return []; // No transactions file yet, return empty array
        }
        throw error; // Other errors should be propagated
    }
}

async function writeTransactions(clientId: string, transactions: ClientTransaction[]) {
    const filePath = path.join(dataDir, `${clientId}.json`);
    await ensureDataDirectory();
    await fs.writeFile(filePath, JSON.stringify(transactions, null, 2), 'utf-8');
    invalidateClientTransactionsCache(clientId);
    if (clientId.startsWith('agent_')) {
        invalidateCounterAgentsCache();
    } else if (clientId.startsWith('agg_')) {
        invalidateAggregatorsCache();
    }
}

export async function POST(request: Request, { params }: { params: { clientId: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const clientId = params.clientId;
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
  }

  try {
    const newTransactionData = await request.json();

    if (!newTransactionData.amount || !newTransactionData.description) {
        return NextResponse.json({ error: 'Missing required transaction fields' }, { status: 400 });
    }
    
    const amountToAdd = Number(newTransactionData.amount);

    const currentTransactions = await readTransactions(clientId);
    
    const transactionToSave: ClientTransaction = {
      id: `client_txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      clientId: clientId,
      date: new Date().toISOString(),
      type: 'payment',
      amount: amountToAdd,
      description: newTransactionData.description,
    };

    currentTransactions.push(transactionToSave);

    // Update balance FIRST - if this fails, we don't write the transaction file
    await updateClientBalanceById(clientId, amountToAdd);

    // Only write transactions after balance is successfully updated
    await writeTransactions(clientId, currentTransactions);

    return NextResponse.json({ message: 'Transaction added successfully', transaction: transactionToSave }, { status: 201 });

  } catch (error: any) {
    console.error(`Error adding transaction for client ${clientId}:`, error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { clientId: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const clientId = params.clientId;
  if (!clientId) {
    return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
  }
  
  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get('transactionId');
  if (!transactionId) {
    return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
  }

  try {
    let transactions = await readTransactions(clientId);
    
    const transactionToDelete = transactions.find(t => t.id === transactionId);
    if (!transactionToDelete) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    transactions = transactions.filter(t => t.id !== transactionId);

    // Update balance FIRST - if this fails, we don't write the updated transactions
    await updateClientBalanceById(clientId, -transactionToDelete.amount);

    // Only write transactions after balance is successfully updated
    await writeTransactions(clientId, transactions);

    return NextResponse.json({ message: 'Transaction deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting transaction for client ${clientId}:`, error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
