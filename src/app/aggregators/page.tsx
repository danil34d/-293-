
export const dynamic = 'force-dynamic';

import "@/styles/aggregators.css";
import type { Aggregator, WashEvent } from '@/types';
import { getAggregatorsData, getWashEventsData } from '@/lib/data';
import { computeAggregatorSignals, type AgentSignal } from '@/lib/aggregator-signals';
import AggregatorsSearch from './components/AggregatorsSearch';

export default async function AggregatorsPage() {
  let aggregators: Aggregator[] = [];
  let washEvents: WashEvent[] = [];
  let fetchError: string | null = null;

  try {
    [aggregators, washEvents] = await Promise.all([
      getAggregatorsData(),
      getWashEventsData(),
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список агрегаторов.";
  }

  // Phase 43 / V2-#10 deferred: precompute signals server-side.
  const signalsByAggregatorId: Record<string, AgentSignal[]> = {};
  for (const aggregator of aggregators) {
    signalsByAggregatorId[aggregator.id] = computeAggregatorSignals(aggregator, washEvents);
  }

  return (
    <AggregatorsSearch
      allAggregators={aggregators}
      fetchError={fetchError}
      signalsByAggregatorId={signalsByAggregatorId}
    />
  );
}
