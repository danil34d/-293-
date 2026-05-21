'use client';

import * as React from 'react';
import { Users, UserCircle2 } from 'lucide-react';
import type { CounterAgent, WashEvent } from '@/types';
import { CounterAgentForm } from './CounterAgentForm';
import { DriversTab } from './DriversTab';

/**
 * Phase 51a / V2-#4 split-pricing: Tabs обёртка для /counter-agents/[id]/edit.
 *
 * Профиль (existing CounterAgentForm) + Водители (NEW журнал DriverKickback).
 * «Водители» tab показывает badge с count pending — менеджер сразу видит
 * сколько бонусов ждут оплаты счёта контрагентом.
 */

interface Props {
  agent: CounterAgent;
  agentId: string;
  referenceAgents: CounterAgent[];
  washEvents: WashEvent[];
}

export function CounterAgentEditTabs({ agent, agentId, referenceAgents, washEvents }: Props) {
  const [activeTab, setActiveTab] = React.useState<'profile' | 'drivers'>('profile');
  const [pendingCount, setPendingCount] = React.useState<number | null>(null);

  // Lazy-fetch counter для badge только при mount (1 запрос, не блокирующий)
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/driver-kickbacks?counterAgentId=${encodeURIComponent(agentId)}&status=pending`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setPendingCount(data.length);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [agentId]);

  return (
    <div>
      {/* Tabs header */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4 -mt-2">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className="px-4 py-2.5 text-[13px] font-semibold transition-colors flex items-center gap-2 -mb-px border-b-2"
          style={{
            color: activeTab === 'profile' ? '#0088CC' : '#64748b',
            borderColor: activeTab === 'profile' ? '#0088CC' : 'transparent',
          }}
        >
          <UserCircle2 className="w-4 h-4" />
          Профиль
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drivers')}
          className="px-4 py-2.5 text-[13px] font-semibold transition-colors flex items-center gap-2 -mb-px border-b-2"
          style={{
            color: activeTab === 'drivers' ? '#0088CC' : '#64748b',
            borderColor: activeTab === 'drivers' ? '#0088CC' : 'transparent',
          }}
        >
          <Users className="w-4 h-4" />
          Водители
          {pendingCount !== null && pendingCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && (
        <CounterAgentForm
          initialData={agent}
          agentId={agentId}
          referenceAgents={referenceAgents}
          washEvents={washEvents}
        />
      )}
      {activeTab === 'drivers' && (
        <DriversTab agentId={agentId} agentName={agent.name} />
      )}
    </div>
  );
}
