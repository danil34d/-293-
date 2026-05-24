
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { CounterAgentEditTabs } from '../../components/CounterAgentEditTabs';
import type { CounterAgent, WashEvent, OurCompany, ClientTransaction } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getCounterAgentById, getCounterAgentsData, getWashEventsData, getOurCompaniesData, getClientTransactions } from '@/lib/data';

export default async function EditCounterAgentPage({ params }: { params: { id: string } }) {
  const agentIdFromParams = params.id;
  let agent: CounterAgent | null = null;
  let allAgents: CounterAgent[] = [];
  let washEvents: WashEvent[] = [];
  let ourCompanies: OurCompany[] = [];
  // Phase 59-fin: подтягиваем транзакции для embedded ClientFinanceDashboard в табе «Финансы».
  let transactions: ClientTransaction[] = [];
  let fetchError: string | null = null;

  try {
    [agent, allAgents, washEvents, ourCompanies, transactions] = await Promise.all([
      getCounterAgentById(agentIdFromParams),
      getCounterAgentsData(),
      getWashEventsData(),
      getOurCompaniesData().catch(() => []),
      getClientTransactions(agentIdFromParams).catch(() => []),
    ]);
    if (!agent) {
      fetchError = `Контрагент с ID "${agentIdFromParams}" не найден.`;
    }
  } catch (error: any) {
    fetchError = error.message || `Не удалось загрузить данные для агента с ID ${agentIdFromParams}.`;
  }

  if (fetchError) {
     return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать контрагента" description="Ошибка загрузки данных агента." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ошибка Загрузки</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать контрагента" description="Ошибка загрузки данных агента." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Агент не найден</AlertTitle>
          <AlertDescription>
            Контрагент с ID "{agentIdFromParams}" не найден. Возможно, он был удален или ID указан неверно.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title={`Редактировать контрагента`}
        description={`Обновление данных для ${agent.name}.`}
      />
      <CounterAgentEditTabs
        agent={agent}
        agentId={agentIdFromParams}
        referenceAgents={allAgents}
        washEvents={washEvents}
        ourCompanies={ourCompanies}
        transactions={transactions}
      />
    </div>
  );
}
