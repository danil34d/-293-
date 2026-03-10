
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getAggregatorsData, getWashEventsData, getClientTransactions } from '@/lib/data-loader';
import { ClientFinanceDashboard } from '@/components/common/ClientFinanceDashboard';


async function fetchData(aggregatorId: string) {
    try {
        const [allAggregators, allWashEvents, transactions] = await Promise.all([
            getAggregatorsData(),
            getWashEventsData(),
            getClientTransactions(aggregatorId),
        ]);
        
        const aggregator = allAggregators.find(a => a.id === aggregatorId);

        if (!aggregator) {
            return { error: 'Агрегатор не найден.' };
        }

        const aggregatorWashEvents = allWashEvents.filter(event => event.sourceId === aggregatorId);

        return { aggregator, aggregatorWashEvents, transactions, error: null };
    } catch (e: any) {
        console.error("Failed to fetch client finance data:", e);
        return { error: e.message || "Не удалось загрузить финансовые данные.", aggregator: null, aggregatorWashEvents: null, transactions: null };
    }
}


export default async function AggregatorFinancePage({ params }: { params: { id: string } }) {
    const aggregatorId = params.id;
    const { aggregator, aggregatorWashEvents, transactions, error } = await fetchData(aggregatorId);

    if (error || !aggregator) {
        return (
            <div className="container mx-auto py-8">
                <PageHeader title="Финансы агрегатора" description="Ошибка загрузки данных." />
                <Alert variant="destructive" className="max-w-xl mx-auto">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Ошибка Загрузки</AlertTitle>
                    <AlertDescription>{error || 'Не удалось загрузить все необходимые данные.'}</AlertDescription>
                </Alert>
            </div>
        );
    }
    
    return (
        <div className="container mx-auto py-4 md:py-8">
            <PageHeader
                title={`Финансы: ${aggregator.name}`}
                description="Просмотр истории моек и баланса по агрегатору."
            />
            <ClientFinanceDashboard
                client={aggregator}
                washEvents={aggregatorWashEvents || []}
                initialTransactions={transactions || []}
                clientType="aggregator"
            />
        </div>
    );
}
