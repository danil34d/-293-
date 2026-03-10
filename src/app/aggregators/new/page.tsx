
import PageHeader from '@/components/layout/PageHeader';
import { AggregatorForm } from '../components/AggregatorForm';

export default function NewAggregatorPage() {
  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новый агрегатор"
        description="Добавьте нового партнера-агрегатора в систему."
      />
      <AggregatorForm />
    </div>
  );
}
