
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import type { WashEvent, Employee, CounterAgent, Aggregator, RetailPriceConfig } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Info } from 'lucide-react';
import { WashEventForm } from '../../components/WashEventForm';
import { getEmployeesData, getCounterAgentsData, getAggregatorsData, getRetailPriceConfig, getWashEventById } from '@/lib/data';

async function fetchData(eventId: string) {
    const [washEvent, employees, counterAgents, aggregators, retailPriceConfig] = await Promise.all([
        getWashEventById(eventId),
        getEmployeesData(),
        getCounterAgentsData(),
        getAggregatorsData(),
        getRetailPriceConfig()
    ]);

    return { washEvent, employees, counterAgents, aggregators, retailPriceConfig };
}

export default async function EditWashEventPage({ params }: { params: { id: string } }) {
  const eventId = params.id;
  let data: any = {};
  let fetchError: string | null = null;
  
  try {
    data = await fetchData(eventId);
  } catch(e: any) {
    fetchError = e.message || "Произошла неизвестная ошибка при загрузке данных.";
  }
  
  const { washEvent, employees, counterAgents, aggregators, retailPriceConfig } = data;

  if (fetchError) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать запись о мойке" description="Ошибка загрузки." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ошибка Загрузки</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!washEvent) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать запись о мойке" description="Запись не найдена." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Запись не найдена</AlertTitle>
          <AlertDescription>
            Запись о мойке с ID "{eventId}" не найдена. Возможно, она была удалена.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Редактировать запись о мойке"
        description={`Редактирование деталей для машины ${washEvent.vehicleNumber}`}
      />

      {/* Phase 41 / АРХ-#18: historic prices hint */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 flex items-start gap-2 mb-4 max-w-3xl">
        <Info className="h-4 w-4 text-blue-700 flex-shrink-0 mt-0.5" />
        <div className="text-[12px] text-blue-900 leading-snug">
          <b>Цены — снимок на момент мойки.</b> Услуги хранят свою цену из прайс-листа на дату создания
          мойки. Текущий прайс в /settings может отличаться — это не ошибка, исторические записи
          остаются неизменными (audit-trail). Изменения в этой форме перезапишут снимок этой
          конкретной записи и попадут в `editHistory`.
        </div>
      </div>

      <WashEventForm
        initialData={washEvent}
        employees={employees}
        counterAgents={counterAgents}
        aggregators={aggregators}
        retailPriceConfig={retailPriceConfig}
      />
    </div>
  );
}
