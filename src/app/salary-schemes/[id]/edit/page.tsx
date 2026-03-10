
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { SalarySchemeForm } from '../../components/SalarySchemeForm';
import type { SalaryScheme } from '@/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getSalarySchemeById } from '@/lib/data-loader';

export default async function EditSalarySchemePage({ params }: { params: { id: string } }) {
  const schemeId = params.id;
  let scheme: SalaryScheme | null = null;
  let fetchError: string | null = null;

  try {
    scheme = await getSalarySchemeById(schemeId);
    if (!scheme) {
      fetchError = `Схема с ID "${schemeId}" не найдена.`;
    }
  } catch (error: any) {
    fetchError = error.message || `Не удалось загрузить данные для схемы с ID ${schemeId}.`;
  }

  if (fetchError) {
     return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать схему" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ошибка Загрузки</AlertTitle>
          <AlertDescription>{fetchError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!scheme) {
    return (
      <div className="container mx-auto py-8">
        <PageHeader title="Редактировать схему" description="Ошибка загрузки данных." />
        <Alert variant="destructive" className="max-w-xl mx-auto">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Схема не найдена</AlertTitle>
          <AlertDescription>
            Схема с ID "{schemeId}" не найдена. Возможно, она была удалена или ID указан неверно.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title={`Редактировать схему`}
        description={`Обновление данных для схемы "${scheme.name}".`}
      />
      <SalarySchemeForm initialData={scheme} schemeId={schemeId} />
    </div>
  );
}
