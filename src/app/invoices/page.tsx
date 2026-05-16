export const dynamic = 'force-dynamic';

import "@/styles/invoices.css";
import { AlertTriangle } from 'lucide-react';
import { getCounterAgentsData, getAggregatorsData, getWashEventsData, getInvoicesData } from '@/lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InvoiceGenerator } from './components/InvoiceGenerator';
import { InvoicesListClient } from './components/InvoicesListClient';

async function fetchData() {
    try {
        const [counterAgents, aggregators, washEvents, invoices] = await Promise.all([
            getCounterAgentsData(),
            getAggregatorsData(),
            getWashEventsData(),
            getInvoicesData(),
        ]);
        return { counterAgents, aggregators, washEvents, invoices, error: null };
    } catch (e: any) {
        console.error("Failed to fetch invoice page data:", e);
        return {
            error: e.message || "Не удалось загрузить данные.",
            counterAgents: [], aggregators: [], washEvents: [], invoices: [],
        };
    }
}

export default async function InvoicesPage() {
    const { counterAgents, aggregators, washEvents, invoices, error } = await fetchData();

    // Реквизиты исполнителя (вынести в /settings позже)
    const myCompanyDetails = {
        companyName: 'Индивидуальный предприниматель Абанин Даниил Олегович',
        ownerName: 'Абанин Д.О.',
        inn: '333801382869',
        ogrnip: '315333200009578',
        legalAddress: '601441, Владимирская область, г.Вязники, Полевой переулок, д.3',
        bankName: 'Владимирское отделение № 8611 ПАО Сбербанк',
        bik: '041708602',
        correspondentAccount: '30101810000000000602',
        settlementAccount: '40802810210000009322'
    };

    if (error) {
        return (
            <div className="invoices">
                <div className="page-header-section">
                    <div className="page-header-content">
                        <div className="page-title-section">
                            <h1>Счета для клиентов</h1>
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
        <div className="invoices">
            <div className="page-header-section">
                <div className="page-header-content">
                    <div className="page-title-section">
                        <h1>Счета для клиентов</h1>
                        <p>Сохранённые счета с workflow draft → sent → paid + быстрая генерация preview без сохранения.</p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="saved" className="w-full">
                <TabsList className="mb-4">
                    <TabsTrigger value="saved">💼 Сохранённые счета (БД)</TabsTrigger>
                    <TabsTrigger value="quick">⚡ Быстрый счёт (preview)</TabsTrigger>
                </TabsList>

                <TabsContent value="saved">
                    <InvoicesListClient
                        initialInvoices={invoices}
                        counterAgents={counterAgents}
                    />
                </TabsContent>

                <TabsContent value="quick">
                    <div className="invoice-generator">
                        <InvoiceGenerator
                            counterAgents={counterAgents}
                            aggregators={aggregators}
                            washEvents={washEvents}
                            myCompanyDetails={myCompanyDetails}
                        />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
