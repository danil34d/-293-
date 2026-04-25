
export const dynamic = 'force-dynamic';

import "@/styles/counter-agents.css";
import type { CounterAgent } from '@/types';
import { getCounterAgentsData } from '@/lib/data';
import CounterAgentsSearch from './components/CounterAgentsSearch';

type CounterAgentsView = 'active' | 'archived' | 'all';

export default async function CounterAgentsPage({ searchParams }: { searchParams?: { view?: string } }) {
  let allCounterAgents: CounterAgent[] = [];
  let fetchError: string | null = null;
  const requestedView = searchParams?.view;
  const currentView: CounterAgentsView = requestedView === 'archived' || requestedView === 'all' ? requestedView : 'active';

  try {
    allCounterAgents = await getCounterAgentsData();
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список контрагентов.";
  }

  return (
    <CounterAgentsSearch
      allAgents={allCounterAgents}
      initialView={currentView}
      fetchError={fetchError}
    />
  );
}
