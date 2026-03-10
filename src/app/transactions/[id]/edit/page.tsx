import PageHeader from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Construction } from 'lucide-react';

export default function EditTransactionPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto py-4 md:py-8">
      <PageHeader
        title={`Редактировать транзакцию`}
        description={`Обновите детали для транзакции (ID: ${params.id}).`}
      />
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Форма транзакции</CardTitle>
          <CardDescription>Измените детали для этой транзакции.</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-12">
            <Construction className="mx-auto h-16 w-16 text-primary mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Форма в разработке</h3>
            <p className="text-muted-foreground mb-4">Форма для редактирования транзакций еще не реализована.</p>
            <Button asChild variant="outline">
                <Link href="/transactions">Назад к списку транзакций</Link>
            </Button>
        </CardContent>
      </Card>
    </div>
  );
}
