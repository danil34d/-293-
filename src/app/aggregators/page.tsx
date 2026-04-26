
export const dynamic = 'force-dynamic';

import "@/styles/aggregators.css";
import type { Aggregator } from '@/types';
import { getAggregatorsData } from '@/lib/data';
import AggregatorsSearch from './components/AggregatorsSearch';

export default async function AggregatorsPage() {
  let aggregators: Aggregator[] = [];
  let fetchError: string | null = null;

  try {
    aggregators = await getAggregatorsData();
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список агрегаторов.";
  }

  return (
    <AggregatorsSearch
      allAggregators={aggregators}
      fetchError={fetchError}
    />
  );
}
