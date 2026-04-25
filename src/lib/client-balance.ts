import { updateBalance } from '@/lib/data/write-helpers';
import { invalidateAggregatorsCache, invalidateCounterAgentsCache } from '@/lib/data';

/**
 * Update client (aggregator/counter-agent) balance by ID.
 * Delegates to write-helpers.updateBalance for data-source-agnostic persistence,
 * then invalidates the appropriate cache.
 *
 * @deprecated Prefer importing updateBalance from '@/lib/data/write-helpers' directly.
 */
export async function updateClientBalanceById(clientId: string, amountChange: number): Promise<void> {
  if (!clientId || amountChange === 0) return;

  await updateBalance(clientId, amountChange);

  // Invalidate caches (write-helpers doesn't do this automatically)
  if (clientId.startsWith('agent_')) {
    invalidateCounterAgentsCache();
  } else if (clientId.startsWith('agg_')) {
    invalidateAggregatorsCache();
  }
}
