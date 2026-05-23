export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { CounterAgentForm } from '../components/CounterAgentForm';
import { getCounterAgentsData, getWashEventsData, getOurCompaniesData } from '@/lib/data';

export default async function NewCounterAgentPage() {
  const [referenceAgents, washEvents, ourCompanies] = await Promise.all([
    getCounterAgentsData(),
    getWashEventsData(),
    getOurCompaniesData().catch(() => []),
  ]);

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новый контрагент"
        description="Добавьте нового корпоративного клиента в систему."
      />
      <CounterAgentForm
        referenceAgents={referenceAgents}
        washEvents={washEvents}
        ourCompanies={ourCompanies}
      />
    </div>
  );
}
