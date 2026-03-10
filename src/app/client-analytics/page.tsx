
export const dynamic = 'force-dynamic';

import "@/styles/client-analytics.css";
import { AlertTriangle } from 'lucide-react';
import { getWashEventsData, getAggregatorsData, getCounterAgentsData } from '@/lib/data-loader';
import { ClientAnalyticsDashboard } from './components/ClientAnalyticsDashboard';

async function fetchData() {
    try {
        const [washEvents, aggregators, counterAgents] = await Promise.all([
            getWashEventsData(),
            getAggregatorsData(),
            getCounterAgentsData(),
        ]);
        
        return { washEvents, aggregators, counterAgents, error: null };
    } catch (e: any) {
        console.error("Failed to fetch client analytics data:", e);
        return { error: e.message || "Не удалось загрузить данные.", washEvents: [], aggregators: [], counterAgents: [] };
    }
}

export default async function ClientAnalyticsPage() {
    const { washEvents, aggregators, counterAgents, error } = await fetchData();

    if (error) {
        return (
            <div className="client-analytics">
                <div className="page-header-section">
                    <div className="page-header-content">
                        <div className="page-title-section">
                            <h1>Анализ клиентов</h1>
                            <p>Ошибка загрузки данных.</p>
                        </div>
                    </div>
                </div>
                <div className="alert error">
                    <AlertTriangle className="h-5 w-5" />
                    <div>
                        <div className="alert-title">Ошибка Загрузки</div>
                        <div className="alert-description">{error}</div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="client-analytics">
            <div className="page-header-section">
                <div className="page-header-content">
                    <div className="page-title-section">
                        <h1>Анализ клиентов</h1>
                        <p>Сравнивайте эффективность контрагентов, агрегаторов и розничных продаж для принятия бизнес-решений.</p>
                    </div>
                </div>
            </div>
            <div className="analytics-dashboard">
                <ClientAnalyticsDashboard
                    washEvents={washEvents}
                    aggregators={aggregators}
                    counterAgents={counterAgents}
                />
            </div>
        </div>
    );
}

    