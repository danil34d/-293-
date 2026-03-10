import fs from 'fs/promises';
import path from 'path';
import { invalidateAggregatorsCache, invalidateCounterAgentsCache } from '@/lib/data-loader';

type ClientKind = 'counter-agent' | 'aggregator';

function resolveClientPath(clientId: string): { filePath: string; kind: ClientKind } | null {
  if (clientId.startsWith('agent_')) {
    return {
      filePath: path.join(process.cwd(), 'data', 'counter-agents', `${clientId}.json`),
      kind: 'counter-agent',
    };
  }

  if (clientId.startsWith('agg_')) {
    return {
      filePath: path.join(process.cwd(), 'data', 'aggregators', `${clientId}.json`),
      kind: 'aggregator',
    };
  }

  return null;
}

export async function updateClientBalanceById(clientId: string, amountChange: number): Promise<void> {
  if (!clientId || amountChange === 0) return;

  const resolved = resolveClientPath(clientId);
  if (!resolved) return;

  try {
    const fileContent = await fs.readFile(resolved.filePath, 'utf-8');
    const clientData = JSON.parse(fileContent);

    const currentBalance = Number(clientData.balance ?? 0);
    clientData.balance = currentBalance + amountChange;

    await fs.writeFile(resolved.filePath, JSON.stringify(clientData, null, 2), 'utf-8');
    if (resolved.kind === 'counter-agent') {
      invalidateCounterAgentsCache();
    } else {
      invalidateAggregatorsCache();
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Client file not found for balance update: ${clientId}`);
      return;
    }
    throw error;
  }
}
