'use client';

import * as React from 'react';
import Link from 'next/link';
import { Users, UserCircle2, Sparkles, Wallet, FileText, FolderOpen } from 'lucide-react';
import type { CounterAgent, WashEvent, OurCompany } from '@/types';
import { CounterAgentForm } from './CounterAgentForm';
import { DriversTab } from './DriversTab';
import { CounterAgentHeaderCard } from './CounterAgentHeaderCard';
import { CounterAgentWashesTab } from './CounterAgentWashesTab';

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
  /** Phase 57c: для CounterAgentForm Select preferredOurCompanyId. */
  ourCompanies?: OurCompany[];
}

type TabKey = 'profile' | 'washes' | 'drivers' | 'finance' | 'documents';

export function CounterAgentEditTabs({ agent, agentId, referenceAgents, washEvents, ourCompanies = [] }: Props) {
  const [activeTab, setActiveTab] = React.useState<TabKey>('profile');
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

  // Phase 59-ui-a: резолвим ourCompany по preferredOurCompanyId (или primary fallback)
  const resolvedOurCompany = React.useMemo(() => {
    const active = (ourCompanies || []).filter(c => !c.archived);
    if (agent.preferredOurCompanyId) {
      const m = active.find(c => c.id === agent.preferredOurCompanyId);
      if (m) return m;
    }
    return active.find(c => c.isPrimary) ?? null;
  }, [ourCompanies, agent.preferredOurCompanyId]);

  return (
    <div>
      {/* Phase 59-ui-a: Header-сводка */}
      <CounterAgentHeaderCard
        agent={agent}
        agentId={agentId}
        washEvents={washEvents}
        ourCompany={resolvedOurCompany}
        pendingKickbacks={pendingCount}
      />

      {/* Tabs header */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-4 -mt-2 overflow-x-auto">
        <TabButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} icon={<UserCircle2 className="w-4 h-4" />} label="Профиль" />
        <TabButton
          active={activeTab === 'washes'}
          onClick={() => setActiveTab('washes')}
          icon={<Sparkles className="w-4 h-4" />}
          label="Мойки"
        />
        <TabButton
          active={activeTab === 'drivers'}
          onClick={() => setActiveTab('drivers')}
          icon={<Users className="w-4 h-4" />}
          label="Водители"
          badge={pendingCount !== null && pendingCount > 0 ? pendingCount : undefined}
        />
        <TabButton active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} icon={<Wallet className="w-4 h-4" />} label="Финансы" />
        <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={<FileText className="w-4 h-4" />} label="Документы" />
      </div>

      {/* Tab content */}
      {activeTab === 'profile' && (
        <CounterAgentForm
          initialData={agent}
          agentId={agentId}
          referenceAgents={referenceAgents}
          washEvents={washEvents}
          ourCompanies={ourCompanies}
        />
      )}
      {activeTab === 'washes' && (
        <CounterAgentWashesTab agentId={agentId} agentName={agent.name} washEvents={washEvents} />
      )}
      {activeTab === 'drivers' && (
        <DriversTab agentId={agentId} agentName={agent.name} />
      )}
      {activeTab === 'finance' && (
        <FinanceTabStub agentId={agentId} />
      )}
      {activeTab === 'documents' && (
        <DocumentsTabStub agentName={agent.name} />
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label, badge,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2.5 text-[13px] font-semibold transition-colors flex items-center gap-2 -mb-px border-b-2 whitespace-nowrap"
      style={{
        color: active ? '#0088CC' : '#64748b',
        borderColor: active ? '#0088CC' : 'transparent',
      }}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}

function FinanceTabStub({ agentId }: { agentId: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-8 text-center space-y-3">
      <Wallet className="w-12 h-12 text-slate-400 mx-auto" />
      <div>
        <h3 className="text-base font-bold text-slate-900">Финансы контрагента</h3>
        <p className="text-sm text-slate-600 mt-1">Полная финансовая история — на отдельной странице.</p>
      </div>
      <Link
        href={`/counter-agents/${agentId}/finance`}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
      >
        Открыть финансы →
      </Link>
      <p className="text-[11px] text-slate-400 pt-2">
        В будущем (Phase 59-fin) — встроим прямо сюда: баланс-history, платежи, счета.
      </p>
    </div>
  );
}

function DocumentsTabStub({ agentName }: { agentName: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-gradient-to-br from-white to-slate-50 p-8 text-center space-y-3">
      <FolderOpen className="w-12 h-12 text-indigo-400 mx-auto" />
      <div>
        <h3 className="text-base font-bold text-slate-900">Документы — скоро</h3>
        <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
          Здесь будет автогенерация .docx документов на основе реквизитов контрагента:
        </p>
      </div>
      <div className="text-sm text-slate-700 max-w-md mx-auto space-y-1.5 text-left bg-white rounded-lg p-3 border border-slate-200">
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Договор № __ от ДД.ММ.ГГГГ</div>
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Приложение №1 «Список автотранспорта»</div>
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Приложение №2 «Ведомость учёта»</div>
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Приложение №3 «Прейскурант цен»</div>
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Ежемесячный «Акт оказанных услуг»</div>
      </div>
      <p className="text-[11px] text-slate-500 pt-2">
        Phase 59-doc — backend (docxtemplater + storage) + UI кнопок «Сформировать».
      </p>
    </div>
  );
}
