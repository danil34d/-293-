
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { CounterAgentForm } from '../../components/CounterAgentForm';
import type { CounterAgent, WashEvent } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getCounterAgentById, getCounterAgentsData, getWashEventsData } from '@/lib/data-loader';

export default async function EditCounterAgentPage({ params }: { params: { id: string } }) {
  const agentIdFromParams = params.id;
  let agent: CounterAgent | null = null;
  let allAgents: CounterAgent[] = [];
  let washEvents: WashEvent[] = [];
  let fetchError: string | null = null;

  try {
    [agent, allAgents, washEvents] = await Promise.all([
      getCounterAgentById(agentIdFromParams),
      getCounterAgentsData(),
      getWashEventsData(),
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
      <CounterAgentForm
        initialData={agent}
        agentId={agentIdFromParams}
        referenceAgents={allAgents}
        washEvents={washEvents}
      />
    </div>
  );
}
