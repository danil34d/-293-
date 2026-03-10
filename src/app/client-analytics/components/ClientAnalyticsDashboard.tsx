
"use client";

import { useState, useMemo } from 'react';
import type { WashEvent, CounterAgent, Aggregator } from '@/types';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval, format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { Users, Briefcase, ArrowDownUp, TrendingUp, Hash, Calendar, Trophy, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ClientPerformanceData {
    id: string;
    name: string;
    type: 'Контрагент' | 'Агрегатор' | 'Розница';
    totalRevenue: number;
    washCount: number;
    avgCheck: number;
    lastWashDate: Date | null;
}

interface ClientAnalyticsDashboardProps {
    washEvents: WashEvent[];
    counterAgents: CounterAgent[];
    aggregators: Aggregator[];
}

type SortKey = 'name' | 'totalRevenue' | 'washCount' | 'avgCheck' | 'lastWashDate';
type SortDirection = 'asc' | 'desc';

export function ClientAnalyticsDashboard({ washEvents, counterAgents, aggregators }: ClientAnalyticsDashboardProps) {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    
    const [sortKey, setSortKey] = useState<SortKey>('totalRevenue');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const clientData = useMemo(() => {
        const clients: (CounterAgent | Aggregator)[] = [...counterAgents, ...aggregators];
        const periodStart = dateRange?.from ? startOfDay(dateRange.from) : null;
        const periodEnd = dateRange?.from ? endOfDay(dateRange.to || dateRange.from) : null;
        
        const clientPerformances = clients.map(client => {
            const isAggregator = 'priceLists' in client;
            const relevantWashes = washEvents.filter(event => 
                event.sourceId === client.id &&
                periodStart && periodEnd &&
                isWithinInterval(new Date(event.timestamp), { start: periodStart, end: periodEnd })
            );

            const totalRevenue = relevantWashes.reduce((sum, event) => sum + (event.netAmount ?? event.totalAmount), 0);
            const washCount = relevantWashes.length;
            const avgCheck = washCount > 0 ? totalRevenue / washCount : 0;
            
            const lastWash = relevantWashes.length > 0 ? new Date(relevantWashes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp) : null;

            return {
                id: client.id,
                name: client.name,
                type: isAggregator ? 'Агрегатор' : 'Контрагент',
                totalRevenue,
                washCount,
                avgCheck,
                lastWashDate: lastWash
            } as ClientPerformanceData;
        });

        // Calculate retail data
        const retailWashes = washEvents.filter(event => 
            (event.paymentMethod === 'cash' || event.paymentMethod === 'card' || event.paymentMethod === 'transfer') &&
            periodStart && periodEnd &&
            isWithinInterval(new Date(event.timestamp), { start: periodStart, end: periodEnd })
        );
        
        if (retailWashes.length > 0) {
            const retailTotalRevenue = retailWashes.reduce((sum, event) => sum + (event.netAmount ?? event.totalAmount), 0);
            const retailWashCount = retailWashes.length;
            const retailAvgCheck = retailWashCount > 0 ? retailTotalRevenue / retailWashCount : 0;
            const retailLastWash = new Date(retailWashes.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp);

            clientPerformances.push({
                id: 'retail_clients',
                name: 'Розничные клиенты',
                type: 'Розница',
                totalRevenue: retailTotalRevenue,
                washCount: retailWashCount,
                avgCheck: retailAvgCheck,
                lastWashDate: retailLastWash
            });
        }

        return clientPerformances.filter(data => data.washCount > 0); // Only show clients with activity in the period
    }, [washEvents, counterAgents, aggregators, dateRange]);
    
    
    const sortedClientData = useMemo(() => {
        return [...clientData].sort((a, b) => {
            let compareA = a[sortKey];
            let compareB = b[sortKey];
            
            if (sortKey === 'name') {
                 compareA = a.name.toLowerCase();
                 compareB = b.name.toLowerCase();
            }

            if (compareA === null) return 1;
            if (compareB === null) return -1;

            if (compareA < compareB) {
                return sortDirection === 'asc' ? -1 : 1;
            }
            if (compareA > compareB) {
                return sortDirection === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [clientData, sortKey, sortDirection]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };
    
    const topRevenueClient = useMemo(() => clientData.length > 0 ? clientData.reduce((max, client) => client.totalRevenue > max.totalRevenue ? client : max, clientData[0]) : null, [clientData]);
    const topWashesClient = useMemo(() => clientData.length > 0 ? clientData.reduce((max, client) => client.washCount > max.washCount ? client : max, clientData[0]) : null, [clientData]);

    const getClientTypeIcon = (type: ClientPerformanceData['type']) => {
        switch (type) {
            case 'Контрагент': return <Users className="mr-1.5 h-3 w-3" />;
            case 'Агрегатор': return <Briefcase className="mr-1.5 h-3 w-3" />;
            case 'Розница': return <DollarSign className="mr-1.5 h-3 w-3" />;
            default: return null;
        }
    };
    const getClientTypeVariant = (type: ClientPerformanceData['type']) => {
        switch (type) {
            case 'Контрагент': return 'secondary';
            case 'Агрегатор': return 'outline';
            case 'Розница': return 'default';
            default: return 'secondary';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-start">
                <DateRangePicker date={dateRange} setDate={setDateRange} />
            </div>
            
            {clientData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Card className="bg-amber-50 border-amber-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-amber-900"><Trophy className="text-amber-500" />Лидер по выручке</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xl font-bold">{topRevenueClient?.name}</p>
                            <p className="text-2xl font-bold text-green-600">{topRevenueClient?.totalRevenue.toLocaleString('ru-RU')} руб.</p>
                        </CardContent>
                    </Card>
                     <Card className="bg-sky-50 border-sky-200">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-sky-900"><Trophy className="text-sky-500" />Лидер по количеству моек</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xl font-bold">{topWashesClient?.name}</p>
                            <p className="text-2xl font-bold text-sky-600">{topWashesClient?.washCount} моек</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Сравнительная таблица</CardTitle>
                    <CardDescription>
                        Проанализируйте и сравните производительность ваших клиентов. Нажмите на заголовок столбца для сортировки.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    <Button variant="ghost" onClick={() => handleSort('name')}>
                                        Клиент <ArrowDownUp className="ml-2 h-4 w-4" />
                                    </Button>
                                </TableHead>
                                <TableHead>Тип</TableHead>
                                <TableHead className="text-right">
                                     <Button variant="ghost" onClick={() => handleSort('totalRevenue')}>
                                        Выручка <ArrowDownUp className="ml-2 h-4 w-4" />
                                    </Button>
                                </TableHead>
                                <TableHead className="text-right">
                                     <Button variant="ghost" onClick={() => handleSort('washCount')}>
                                        Кол-во моек <ArrowDownUp className="ml-2 h-4 w-4" />
                                    </Button>
                                </TableHead>
                                <TableHead className="text-right">
                                     <Button variant="ghost" onClick={() => handleSort('avgCheck')}>
                                        Средний чек <ArrowDownUp className="ml-2 h-4 w-4" />
                                    </Button>
                                </TableHead>
                                <TableHead className="text-right">
                                     <Button variant="ghost" onClick={() => handleSort('lastWashDate')}>
                                        Последняя мойка <ArrowDownUp className="ml-2 h-4 w-4" />
                                    </Button>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedClientData.length > 0 ? (
                                sortedClientData.map(client => (
                                    <TableRow key={client.id}>
                                        <TableCell className="font-medium">{client.name}</TableCell>
                                        <TableCell>
                                            <Badge variant={getClientTypeVariant(client.type)}>
                                                {getClientTypeIcon(client.type)}
                                                {client.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <TrendingUp className="h-4 w-4 text-green-500"/>
                                                {client.totalRevenue.toLocaleString('ru-RU')} руб.
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                             <div className="flex items-center justify-end gap-1.5">
                                                <Hash className="h-4 w-4 text-blue-500"/>
                                                {client.washCount}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {client.avgCheck.toLocaleString('ru-RU')} руб.
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
                                                <Calendar className="h-4 w-4"/>
                                                {client.lastWashDate ? format(client.lastWashDate, 'dd.MM.yyyy', { locale: ru }) : 'N/A'}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24">
                                        Нет данных по клиентам за выбранный период.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

    
