export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { ClientTransaction } from '@/types';
import { invalidateClientTransactionsCache, invalidateCounterAgentsCache, invalidateAggregatorsCache, getClientTransactions } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveClientTransactions, updateBalance } from '@/lib/data/write-helpers';

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

    const currentTransactions = await getClientTransactions(clientId);

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
    await updateBalance(clientId, amountToAdd);

    // Only write transactions after balance is successfully updated
    await saveClientTransactions(clientId, currentTransactions);
    invalidateClientTransactionsCache(clientId);
    if (clientId.startsWith('agent_')) {
        invalidateCounterAgentsCache();
    } else if (clientId.startsWith('agg_')) {
        invalidateAggregatorsCache();
    }

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
    let transactions = await getClientTransactions(clientId);

    const transactionToDelete = transactions.find(t => t.id === transactionId);
    if (!transactionToDelete) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    transactions = transactions.filter(t => t.id !== transactionId);

    // Update balance FIRST - if this fails, we don't write the updated transactions
    await updateBalance(clientId, -transactionToDelete.amount);

    // Only write transactions after balance is successfully updated
    await saveClientTransactions(clientId, transactions);
    invalidateClientTransactionsCache(clientId);
    if (clientId.startsWith('agent_')) {
        invalidateCounterAgentsCache();
    } else if (clientId.startsWith('agg_')) {
        invalidateAggregatorsCache();
    }

    return NextResponse.json({ message: 'Transaction deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting transaction for client ${clientId}:`, error);
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
