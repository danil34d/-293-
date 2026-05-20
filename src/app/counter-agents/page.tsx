
export const dynamic = 'force-dynamic';

import "@/styles/counter-agents.css";
import type { CounterAgent, WashEvent } from '@/types';
import { getCounterAgentsData, getWashEventsData } from '@/lib/data';
import { computeAgentSignals, type AgentSignal } from '@/lib/counter-agent-signals';
import CounterAgentsSearch from './components/CounterAgentsSearch';

type CounterAgentsView = 'active' | 'archived' | 'all';

export default async function CounterAgentsPage({ searchParams }: { searchParams?: { view?: string } }) {
  let allCounterAgents: CounterAgent[] = [];
  let washEvents: WashEvent[] = [];
  let fetchError: string | null = null;
  const requestedView = searchParams?.view;
  const currentView: CounterAgentsView = requestedView === 'archived' || requestedView === 'all' ? requestedView : 'active';

  try {
    [allCounterAgents, washEvents] = await Promise.all([
      getCounterAgentsData(),
      getWashEventsData(),
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список контрагентов.";
  }

  // Phase 42 / V2-#7 deferred: precompute signals server-side, map by agent id.
  const signalsByAgentId: Record<string, AgentSignal[]> = {};
  for (const agent of allCounterAgents) {
    signalsByAgentId[agent.id] = computeAgentSignals(agent, washEvents);
  }

  return (
    <CounterAgentsSearch
      allAgents={allCounterAgents}
      initialView={currentView}
      fetchError={fetchError}
      signalsByAgentId={signalsByAgentId}
    />
  );
}
