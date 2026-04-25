
export const dynamic = 'force-dynamic';

import PageHeader from '@/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { getCounterAgentsData, getWashEventsData, getClientTransactions } from '@/lib/data';
import { ClientFinanceDashboard } from '@/components/common/ClientFinanceDashboard';


async function fetchData(agentId: string) {
    try {
        const [allAgents, allWashEvents, transactions] = await Promise.all([
            getCounterAgentsData(),
            getWashEventsData(),
            getClientTransactions(agentId),
        ]);
        
        const agent = allAgents.find(a => a.id === agentId);

        if (!agent) {
            return { error: 'Контрагент не найден.' };
        }

        const agentWashEvents = allWashEvents.filter(event => event.sourceId === agentId);

        return { agent, agentWashEvents, transactions, error: null };
    } catch (e: any) {
        console.error("Failed to fetch client finance data:", e);
        return { error: e.message || "Не удалось загрузить финансовые данные.", agent: null, agentWashEvents: null, transactions: null };
    }
}


export default async function CounterAgentFinancePage({ params }: { params: { id: string } }) {
    const agentId = params.id;
    const { agent, agentWashEvents, transactions, error } = await fetchData(agentId);

    if (error || !agent) {
        return (
            <div className="container mx-auto py-8">
                <PageHeader title="Финансы контрагента" description="Ошибка загрузки данных." />
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
                title={`Финансы: ${agent.name}`}
                description="Просмотр истории моек и баланса по контрагенту."
            />
            <ClientFinanceDashboard
                client={agent}
                washEvents={agentWashEvents || []}
                initialTransactions={transactions || []}
                clientType="counter-agent"
            />
        </div>
    );
}
