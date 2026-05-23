export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { AggregatorForm } from '../components/AggregatorForm';
import { getOurCompaniesData } from '@/lib/data';

export default async function NewAggregatorPage() {
  const ourCompanies = await getOurCompaniesData().catch(() => []);
  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title="Новый агрегатор"
        description="Добавьте нового партнера-агрегатора в систему."
      />
      <AggregatorForm ourCompanies={ourCompanies} />
    </div>
  );
}
