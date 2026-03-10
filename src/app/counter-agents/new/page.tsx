import PageHeader from '@/components/layout/PageHeader';
import { CounterAgentForm } from '../components/CounterAgentForm';
import { getCounterAgentsData, getWashEventsData } from '@/lib/data-loader';

export default async function NewCounterAgentPage() {
  const [referenceAgents, washEvents] = await Promise.all([
    getCounterAgentsData(),
    getWashEventsData(),
  ]);

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новый контрагент"
        description="Добавьте нового корпоративного клиента в систему."
      />
      <CounterAgentForm referenceAgents={referenceAgents} washEvents={washEvents} />
    </div>
  );
}
