
"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from 'next/navigation';
import type { CounterAgent, Aggregator, WashEvent, ClientTransaction } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format, isWithinInterval, startOfMonth, endOfMonth, startOfDay } from "date-fns";
import { ru } from "date-fns/locale";
import { PiggyBank, BookCheck, Scale, PlusCircle, Car, HandCoins, MinusCircle, Loader2, Printer } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DeleteConfirmationButton } from "./DeleteConfirmationButton";
import { useReactToPrint } from "react-to-print";
import { ClientFinanceReportTemplate } from "./ClientFinanceReportTemplate";

interface ClientFinanceDashboardProps {
    client: CounterAgent | Aggregator;
    washEvents: WashEvent[];
    initialTransactions: ClientTransaction[];
    clientType: 'counter-agent' | 'aggregator';
}

interface CombinedJournalEntry {
    id: string;
    date: Date;
    type: 'wash' | 'payment';
    description: string;
    vehicleNumber?: string;
    debit: number; // списание
    credit: number; // поступление
    balanceAfter: number;
}

export function ClientFinanceDashboard({ client, washEvents, initialTransactions, clientType }: ClientFinanceDashboardProps) {
    const router = useRouter();
    const { toast } = useToast();
    const [transactions, setTransactions] = useState<ClientTransaction[]>(initialTransactions);
    const [currentClient, setCurrentClient] = useState(client);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const printRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        content: () => printRef.current,
        documentTitle: `Финансовый отчет для ${client.name}`,
    });
    
    const { journalForPeriod, balanceAtStartOfPeriod, balanceAtEndOfPeriod } = useMemo(() => {
        if (!dateRange?.from) return { journalForPeriod: [], balanceAtStartOfPeriod: 0, balanceAtEndOfPeriod: 0 };
        
        const periodStart = startOfDay(dateRange.from);
        
        const allWashEntries = washEvents.map(e => ({
            id: e.id,
            date: new Date(e.timestamp),
            type: 'wash' as const,
            description: e.services.main.serviceName + (e.services.additional.length > 0 ? ` (+${e.services.additional.length})` : ''),
            vehicleNumber: e.vehicleNumber,
            debit: e.totalAmount,
            credit: 0
        }));
            
        const allPaymentEntries = transactions.map(t => ({
            id: t.id,
            date: new Date(t.date),
            type: 'payment' as const,
            description: t.description,
            vehicleNumber: undefined,
            debit: 0,
            credit: t.amount,
        }));

        const allEntries = [...allWashEntries, ...allPaymentEntries].sort((a,b) => a.date.getTime() - b.date.getTime());

        // Calculate balance at start of period
        const chargesBeforePeriod = allWashEntries
            .filter(e => e.date < periodStart)
            .reduce((sum, e) => sum + e.debit, 0);
        const paymentsBeforePeriod = allPaymentEntries
            .filter(e => e.date < periodStart)
            .reduce((sum, e) => sum + e.credit, 0);

        const initialBalance = client.balance ?? 0;
        // To find the balance at the start of the period, we reverse the operations that happened AFTER the period started.
        // Charges increase debt (make balance more negative), so we ADD them back to reverse.
        // Payments decrease debt (make balance less negative), so we SUBTRACT them to reverse.
        const chargesWithinOrAfterPeriod = allWashEntries
            .filter(e => e.date >= periodStart)
            .reduce((sum, e) => sum + e.debit, 0);
        const paymentsWithinOrAfterPeriod = allPaymentEntries
            .filter(e => e.date >= periodStart)
            .reduce((sum, e) => sum + e.credit, 0);

        const balanceAtStartOfPeriod = initialBalance + chargesWithinOrAfterPeriod - paymentsWithinOrAfterPeriod;

        // Calculate running balance for the journal
        let runningBalance = balanceAtStartOfPeriod;
        const journalWithBalance: CombinedJournalEntry[] = [];
        
        for (const entry of allEntries) {
            runningBalance = runningBalance - entry.debit + entry.credit;
            journalWithBalance.push({ ...entry, balanceAfter: runningBalance });
        }
        
        const journalForPeriod = journalWithBalance
            .filter(e => isWithinInterval(e.date, { start: periodStart, end: dateRange.to || dateRange.from! }))
            .sort((a,b) => b.date.getTime() - a.date.getTime());

        return { 
            journalForPeriod, 
            balanceAtStartOfPeriod,
            balanceAtEndOfPeriod: runningBalance // The final running balance is the current balance
        };

    }, [washEvents, transactions, dateRange, client.balance]);


    const periodSummary = useMemo(() => {
        const summary = {
            periodCharges: 0,
            periodPayments: 0,
        };

        journalForPeriod.forEach(entry => {
            summary.periodCharges += entry.debit;
            summary.periodPayments += entry.credit;
        });

        return summary;
    }, [journalForPeriod]);

    const handleAddPayment = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const data = {
            amount: parseFloat(formData.get('amount') as string),
            description: formData.get('description') as string,
        };

        if (isNaN(data.amount) || data.amount <= 0) {
            toast({ title: "Ошибка", description: "Сумма должна быть положительным числом.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Add the transaction
            const transactionResponse = await fetch(`/api/client-transactions/${client.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!transactionResponse.ok) throw new Error("Не удалось добавить транзакцию.");
            const newTransaction = await transactionResponse.json();
            
            // 2. Update client balance
            const newBalance = (currentClient.balance ?? 0) + data.amount;
            const apiPath = clientType === 'counter-agent' ? `/api/counter-agents` : `/api/aggregators`;
            const balanceResponse = await fetch(`${apiPath}/${client.id}`, {
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ ...currentClient, balance: newBalance }),
            });
            if (!balanceResponse.ok) throw new Error("Не удалось обновить баланс клиента.");
            const updatedClient = await balanceResponse.json();

            // 3. Update state
            setCurrentClient(updatedClient.agent || updatedClient.aggregator);
            setTransactions(prev => [newTransaction.transaction, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
            toast({ title: "Успешно!", description: "Платеж зарегистрирован." });
            setDialogOpen(false);
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const onTransactionDeleted = (deletedTxnId: string, amount: number) => {
        setTransactions(prev => prev.filter(t => t.id !== deletedTxnId));
        const newBalance = (currentClient.balance ?? 0) - amount;
        setCurrentClient(prev => ({...prev, balance: newBalance }));
    };

    return (
        <div className="space-y-6">
             <div style={{ display: "none" }}>
                <div ref={printRef}>
                    <ClientFinanceReportTemplate 
                        client={currentClient}
                        journal={journalForPeriod.slice().reverse()} // Pass sorted by date asc for printing
                        summary={periodSummary}
                        dateRange={dateRange}
                        balanceAtStart={balanceAtStartOfPeriod}
                    />
                </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <DateRangePicker date={dateRange} setDate={setDateRange} />
                <div className="flex gap-2">
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button><PlusCircle className="mr-2 h-4 w-4" />Добавить платеж</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Регистрация платежа</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddPayment} className="space-y-4">
                                <div>
                                    <Label htmlFor="amount">Сумма (руб.)</Label>
                                    <Input name="amount" id="amount" type="number" step="0.01" required placeholder="10000" />
                                </div>
                                <div>
                                    <Label htmlFor="description">Описание</Label>
                                    <Input name="description" id="description" required placeholder="Оплата по акту №123" />
                                </div>
                                <DialogFooter>
                                    <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                        Добавить
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4" /> Печать отчета
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><BookCheck />Финансовый журнал (за период)</CardTitle>
                            <CardDescription>История всех списаний (мойки) и поступлений (платежи) за выбранный период.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="h-[40rem]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background">
                                        <TableRow>
                                            <TableHead className="w-[110px]">Дата</TableHead>
                                            <TableHead>Операция</TableHead>
                                            <TableHead className="text-right w-[120px]">Списание (Дебет)</TableHead>
                                            <TableHead className="text-right w-[120px]">Поступление (Кредит)</TableHead>
                                            <TableHead className="text-right w-[140px]">Баланс</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {journalForPeriod.length > 0 ? journalForPeriod.map(entry => (
                                            <TableRow key={entry.id}>
                                                <TableCell>{format(entry.date, 'dd.MM.yy HH:mm', { locale: ru })}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {entry.type === 'wash' ? <Car className="h-4 w-4 text-gray-500"/> : <HandCoins className="h-4 w-4 text-green-600"/>}
                                                        <div>
                                                            <p className="font-medium">{entry.description}</p>
                                                            {entry.vehicleNumber && <p className="text-xs text-muted-foreground font-mono">{entry.vehicleNumber}</p>}
                                                        </div>
                                                         {entry.type === 'payment' && (
                                                            <DeleteConfirmationButton
                                                                apiPath={`/api/client-transactions/${client.id}?transactionId=${entry.id}`}
                                                                entityId={''} // Not used as full path is provided
                                                                entityName={`платеж "${entry.description}"`}
                                                                toastTitle="Платеж удален"
                                                                toastDescription="Запись о платеже была успешно удалена."
                                                                description={<>Вы уверены, что хотите удалить платеж <strong className="text-foreground">"{entry.description}"</strong> на сумму <strong>{entry.credit} руб.</strong>?</>}
                                                                onSuccess={() => onTransactionDeleted(entry.id, entry.credit)}
                                                            />
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right font-medium text-red-600">
                                                    {entry.debit > 0 ? `-${entry.debit.toLocaleString('ru-RU')} руб.` : '-'}
                                                </TableCell>
                                                 <TableCell className="text-right font-medium text-green-600">
                                                    {entry.credit > 0 ? `+${entry.credit.toLocaleString('ru-RU')} руб.` : '-'}
                                                </TableCell>
                                                 <TableCell className={`text-right font-semibold ${(entry.balanceAfter < 0) ? 'text-destructive' : ''}`}>
                                                    {entry.balanceAfter.toLocaleString('ru-RU')} руб.
                                                </TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center h-24">
                                                    Нет данных за выбранный период.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </div>
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><PiggyBank />Сводка за период</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-base">
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Баланс на начало:</span>
                                <span className="font-semibold">{balanceAtStartOfPeriod.toLocaleString('ru-RU')} руб.</span>
                            </div>
                            <Separator/>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Начислено за мойки:</span>
                                <span className="font-semibold text-red-600">-{periodSummary.periodCharges.toLocaleString('ru-RU')} руб.</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Оплачено:</span>
                                <span className="font-semibold text-green-600">+{periodSummary.periodPayments.toLocaleString('ru-RU')} руб.</span>
                            </div>
                            <Separator />
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Баланс на конец:</span>
                                <span className="font-semibold">{balanceAtEndOfPeriod.toLocaleString('ru-RU')} руб.</span>
                            </div>
                        </CardContent>
                    </Card>
                     <Card className="sticky top-24">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Scale/>Общий баланс</CardTitle>
                        </CardHeader>
                        <CardContent>
                             <div className={`flex justify-between font-bold text-2xl`}>
                                <span>Текущий баланс:</span>
                                <span className={`${(currentClient.balance ?? 0) < 0 ? 'text-destructive' : 'text-green-600'}`}>
                                    {(currentClient.balance ?? 0).toLocaleString('ru-RU', {style: 'currency', currency: 'RUB'})}
                                </span>
                            </div>
                             <p className="text-xs text-muted-foreground pt-2">
                                Отрицательный баланс означает долг клиента перед вами. Положительный - его аванс.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

    
