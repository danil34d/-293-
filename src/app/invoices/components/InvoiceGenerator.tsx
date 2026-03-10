
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { CounterAgent, Aggregator, WashEvent, MyCompanyDetails, PriceListItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, isWithinInterval, format } from "date-fns";
import { Printer, FileWarning, Edit, Eye, PlusCircle, Trash2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import { InvoiceTemplate } from './InvoiceTemplate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface InvoiceGeneratorProps {
    counterAgents: CounterAgent[];
    aggregators: Aggregator[];
    washEvents: WashEvent[];
    myCompanyDetails: MyCompanyDetails;
}

interface EditableService extends PriceListItem {
    id: string; // For stable rendering
    count: number;
    total: number;
}

export function InvoiceGenerator({ counterAgents, aggregators, washEvents, myCompanyDetails }: InvoiceGeneratorProps) {
    const [clientType, setClientType] = useState<'counter-agent' | 'aggregator'>('counter-agent');
    const [selectedClientId, setSelectedClientId] = useState<string | undefined>();
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    
    const invoicePrintRef = useRef<HTMLDivElement>(null);
    
    const [invoiceNumber, setInvoiceNumber] = useState("б/н");
    const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());

    const [editableServices, setEditableServices] = useState<EditableService[]>([]);

    const handlePrint = useReactToPrint({
        content: () => invoicePrintRef.current,
        documentTitle: `Акт для ${[...counterAgents, ...aggregators].find(c => c.id === selectedClientId)?.name || 'Клиент'}`,
    });

    const clientOptions = useMemo(() => {
        const clients = clientType === 'counter-agent' ? counterAgents : aggregators;
        return [...clients].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }, [clientType, counterAgents, aggregators]);
    
    const selectedClient = useMemo(() => {
        const allClients: (CounterAgent | Aggregator)[] = [...counterAgents, ...aggregators];
        return allClients.find(c => c.id === selectedClientId);
    }, [selectedClientId, counterAgents, aggregators]);

    useEffect(() => {
        // Reset client selection when type changes
        setSelectedClientId(undefined);
    }, [clientType]);

    useEffect(() => {
        if (!selectedClientId || !dateRange?.from) {
            setEditableServices([]);
            return;
        }
        const periodStart = startOfDay(dateRange.from);
        const periodEnd = endOfDay(dateRange.to || dateRange.from);

        const paymentMethod = clientType === 'counter-agent' ? 'counterAgentContract' : 'aggregator';

        const filteredEvents = washEvents.filter(event => 
            event.sourceId === selectedClientId &&
            event.paymentMethod === paymentMethod &&
            isWithinInterval(new Date(event.timestamp), {
                start: periodStart,
                end: periodEnd,
            })
        );
        
        const serviceMap = new Map<string, { count: number, price: number, total: number, chemicalConsumption: number }>();
        filteredEvents.forEach(event => {
            const services = [event.services.main, ...event.services.additional];
            services.forEach(service => {
                if (service?.serviceName) {
                    const existing = serviceMap.get(service.serviceName);
                    if (existing) {
                        existing.count++;
                        existing.total += service.price;
                    } else {
                        serviceMap.set(service.serviceName, { 
                            count: 1, 
                            price: service.price, 
                            total: service.price,
                            chemicalConsumption: service.chemicalConsumption || 0,
                        });
                    }
                }
            });
        });

        const aggregated: EditableService[] = Array.from(serviceMap.entries()).map(([name, data], index) => ({
            id: `service-${index}-${Date.now()}`,
            serviceName: name,
            count: data.count,
            price: data.price,
            total: data.total,
            chemicalConsumption: data.chemicalConsumption
        }));

        setEditableServices(aggregated);

        // Update invoice date to the end of the selected period
        if (dateRange.to) {
            setInvoiceDate(dateRange.to);
        }

    }, [selectedClientId, dateRange, washEvents, clientType]);
    
    const handleServiceChange = (index: number, field: keyof EditableService, value: string | number) => {
        const newServices = [...editableServices];
        const service = newServices[index];
        
        if (field === 'serviceName') {
            service.serviceName = String(value);
        } else {
            const numericValue = Number(value);
            if (!isNaN(numericValue)) {
                (service[field] as number) = numericValue;
                // Auto-recalculate total if count or price changes
                if (field === 'count' || field === 'price') {
                    service.total = service.count * service.price;
                }
            }
        }
        setEditableServices(newServices);
    };

    const addServiceRow = () => {
        setEditableServices([...editableServices, {
            id: `new-${Date.now()}`,
            serviceName: 'Новая услуга',
            price: 0,
            count: 1,
            total: 0,
        }]);
    };

    const removeServiceRow = (index: number) => {
        setEditableServices(editableServices.filter((_, i) => i !== index));
    };
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
                <Card>
                    <CardHeader>
                        <CardTitle>Параметры</CardTitle>
                        <CardDescription>Выберите тип клиента и период для формирования акта.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-sm font-medium mb-2 block">Тип клиента</Label>
                            <RadioGroup
                                value={clientType}
                                onValueChange={(value) => setClientType(value as 'counter-agent' | 'aggregator')}
                                className="grid grid-cols-2 gap-4"
                            >
                                <Label className="flex items-center space-x-2 border rounded-md p-2 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                                    <RadioGroupItem value="counter-agent" />
                                    <span>Контрагенты</span>
                                </Label>
                                <Label className="flex items-center space-x-2 border rounded-md p-2 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/10">
                                    <RadioGroupItem value="aggregator" />
                                    <span>Агрегаторы</span>
                                </Label>
                            </RadioGroup>
                        </div>

                        <div>
                            <Label className="text-sm font-medium mb-2 block">
                                {clientType === 'counter-agent' ? 'Контрагент' : 'Агрегатор'}
                            </Label>
                             <Select onValueChange={setSelectedClientId} value={selectedClientId}>
                                <SelectTrigger>
                                    <SelectValue placeholder={`Выберите ${clientType === 'counter-agent' ? 'контрагента' : 'агрегатора'}...`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {clientOptions.map(client => (
                                        <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div>
                            <Label className="text-sm font-medium mb-2 block">Период моек</Label>
                            <DateRangePicker date={dateRange} setDate={setDateRange} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label className="text-sm font-medium mb-2 block">Номер счета/акта</Label>
                                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-sm font-medium mb-2 block">Дата счета/акта</Label>
                                <DatePicker date={invoiceDate} setDate={(d) => setInvoiceDate(d || new Date())} />
                            </div>
                        </div>

                        <Button onClick={handlePrint} disabled={!selectedClient || editableServices.length === 0} className="w-full">
                            <Printer className="mr-2 h-4 w-4" />
                            Сформировать и печатать
                        </Button>
                         <p className="text-xs text-muted-foreground text-center pt-2">Вы сможете сохранить документ как PDF в диалоговом окне печати.</p>
                    </CardContent>
                </Card>
            </div>
            <div className="lg:col-span-2">
                <Tabs defaultValue="preview">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="editor"><Edit className="mr-2 h-4 w-4"/>Редактор</TabsTrigger>
                        <TabsTrigger value="preview"><Eye className="mr-2 h-4 w-4"/>Предпросмотр</TabsTrigger>
                    </TabsList>
                    <TabsContent value="editor">
                        <Card>
                            <CardHeader>
                                <CardTitle>Редактирование счета</CardTitle>
                                <CardDescription>Здесь вы можете изменить состав и стоимость услуг перед печатью.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {selectedClient && editableServices.length > 0 ? (
                                    <div className="space-y-4">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Наименование</TableHead>
                                                    <TableHead className="w-[80px]">Кол-во</TableHead>
                                                    <TableHead className="w-[110px]">Цена</TableHead>
                                                    <TableHead className="w-[110px]">Сумма</TableHead>
                                                    <TableHead className="w-[50px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {editableServices.map((service, index) => (
                                                    <TableRow key={service.id}>
                                                        <TableCell>
                                                            <Input value={service.serviceName} onChange={(e) => handleServiceChange(index, 'serviceName', e.target.value)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" value={service.count} onChange={(e) => handleServiceChange(index, 'count', e.target.value)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" value={service.price} onChange={(e) => handleServiceChange(index, 'price', e.target.value)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Input type="number" value={service.total} onChange={(e) => handleServiceChange(index, 'total', e.target.value)} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Button variant="ghost" size="icon" onClick={() => removeServiceRow(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                        <Button variant="outline" size="sm" onClick={addServiceRow}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> Добавить строку
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-12">
                                        <FileWarning className="h-12 w-12 mb-4"/>
                                        <h3 className="font-semibold text-lg">Нет данных для редактирования</h3>
                                        <p>Выберите клиента и период, чтобы загрузить услуги.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="preview">
                        <Card className="min-h-[400px]">
                            <CardHeader>
                                <CardTitle>Предпросмотр документа</CardTitle>
                                <CardDescription>Финальный вид счета и акта для печати.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {selectedClient && editableServices.length > 0 ? (
                                    <div ref={invoicePrintRef} className="p-4 bg-white text-black scale-95 origin-top-left">
                                        <InvoiceTemplate 
                                            myCompany={myCompanyDetails}
                                            customer={selectedClient}
                                            services={editableServices}
                                            invoiceNumber={invoiceNumber}
                                            invoiceDate={invoiceDate}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-20">
                                        <FileWarning className="h-12 w-12 mb-4"/>
                                        <h3 className="font-semibold text-lg">Нет данных для отображения</h3>
                                        <p>Выберите клиента и период, за который есть мойки, чтобы сформировать акт.</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
