
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { AggregatorForm } from '../../components/AggregatorForm';
import type { Aggregator } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getAggregatorById } from '@/lib/data-loader';

export default async function EditAggregatorPage({ params }: { params: { id: string } }) {
  const aggregatorId = params.id;
  let aggregator: Aggregator | null = null;
  let fetchError: string | null = null;

  try {
    aggregator = await getAggregatorById(aggregatorId);
    if (!aggregator) {
      fetchError = `Агрегатор с ID "${aggregatorId}" не найден.`;
    }
  } catch (error: any) {
    fetchError = error.message || `Не удалось загрузить данные для агрегатора с ID ${aggregatorId}.`;
  }

  if (fetchError) {
     return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать агрегатора" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ошибка Загрузки</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!aggregator) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать агрегатора" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Агрегатор не найден</AlertTitle>
          <AlertDescription>
            Агрегатор с ID "{aggregatorId}" не найден. Возможно, он был удален или ID указан неверно.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title={`Редактировать агрегатора`}
        description={`Обновление данных для ${aggregator.name}.`}
      />
      <AggregatorForm initialData={aggregator} aggregatorId={aggregatorId} />
    </div>
  );
}
