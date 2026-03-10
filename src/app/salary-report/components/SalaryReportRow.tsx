
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeTransactionType } from "@/types";
import { TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle, Gift, MinusCircle, Banknote, FileText, CircleOff } from 'lucide-react';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DeleteConfirmationButton } from "@/components/common/DeleteConfirmationButton";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface SalaryReportRowProps {
    employeeId: string;
    employeeName: string;
    balanceAtStart: number;
    earningsForPeriod: number;
    paymentsForPeriod: number;
    otherOperationsTotal: number;
    onActionSuccess: () => void;
}

const transactionTypeDetails: Record<Exclude<EmployeeTransactionType, 'payment'>, { label: string; icon: React.ElementType, sign: number, color: string }> = {
    bonus: { label: 'Премия', icon: Gift, sign: 1, color: 'text-sky-600' },
    loan: { label: 'Долг/Аванс', icon: MinusCircle, sign: -1, color: 'text-orange-600' },
    purchase: { label: 'Покупка', icon: MinusCircle, sign: -1, color: 'text-red-600' },
    debt_write_off: { label: 'Списание долга', icon: CircleOff, sign: 1, color: 'text-green-600' },
};

function AddTransactionDialog({ employeeId, employeeName, onActionSuccess, router }: { employeeId: string; employeeName: string; onActionSuccess: () => void; router: ReturnType<typeof useRouter>; }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<Exclude<EmployeeTransactionType, 'payment'>>('bonus');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();

    const handleAddTransaction = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const data = {
            type: selectedType,
            amount: parseFloat(formData.get('amount') as string),
            description: formData.get('description') as string,
        };

        if (!data.type || !data.description.trim() || isNaN(data.amount) || data.amount <= 0) {
            toast({ title: "Ошибка валидации", description: "Пожалуйста, заполните все поля корректно.", variant: "destructive"});
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/employees/${employeeId}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error("Не удалось добавить транзакцию.");

            toast({ title: "Успешно!", description: "Транзакция добавлена." });
            setDialogOpen(false);
            router.refresh();
            onActionSuccess();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="sm"><PlusCircle className="mr-2 h-4 w-4"/>Операция</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Добавить операцию для {employeeName}</DialogTitle>
                    <DialogDescription>Добавьте премию, аванс или зарегистрируйте покупку за счет сотрудника.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                     <div className="space-y-2">
                        <Label>Тип операции</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {Object.keys(transactionTypeDetails).map(key => {
                            const typedKey = key as keyof typeof transactionTypeDetails;
                            const { label, icon: Icon } = transactionTypeDetails[typedKey];
                            return (
                               <Button key={key} type="button" variant={selectedType === typedKey ? 'default' : 'outline'} onClick={() => setSelectedType(typedKey)}>
                                  <Icon className="mr-2 h-4 w-4" /> {label}
                               </Button>
                            )
                          })}
                        </div>
                     </div>
                     <div>
                        <Label htmlFor="amount">Сумма (руб.)</Label>
                        <Input id="amount" name="amount" type="number" required />
                    </div>
                    <div>
                        <Label htmlFor="description">Описание</Label>
                        <Input id="description" name="description" required />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Сохранить</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function SalaryReportRow({ employeeId, employeeName, balanceAtStart, earningsForPeriod, paymentsForPeriod, otherOperationsTotal, onActionSuccess }: SalaryReportRowProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPaying, setIsPaying] = useState(false);

    const payableTotal = balanceAtStart + earningsForPeriod + otherOperationsTotal - paymentsForPeriod;

    const handlePay = async () => {
        if (payableTotal <= 0) {
            toast({ title: "Нечего выплачивать", description: "Сумма к выплате равна нулю или отрицательна.", variant: "default" });
            return;
        }

        setIsPaying(true);
        try {
             const response = await fetch(`/api/employees/${employeeId}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'payment',
                    amount: payableTotal,
                    description: `Выплата зарплаты за период`
                }),
            });
            if (!response.ok) throw new Error("Не удалось зарегистрировать выплату.");

            toast({ title: "Успешно!", description: `Сотруднику ${employeeName} выплачено ${payableTotal.toLocaleString('ru-RU')} руб.` });
            router.refresh();
            onActionSuccess();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsPaying(false);
        }
    };

    return (
        <TableRow>
            <TableCell className="font-medium">{employeeName}</TableCell>
            <TableCell className="text-right">{balanceAtStart.toLocaleString('ru-RU')} руб.</TableCell>
            <TableCell className="text-right font-semibold text-green-600">
                +{earningsForPeriod.toLocaleString('ru-RU')} руб.
            </TableCell>
             <TableCell className={`text-right text-red-600`}>
                -{paymentsForPeriod.toLocaleString('ru-RU')} руб.
            </TableCell>
            <TableCell className={`text-right ${otherOperationsTotal >= 0 ? 'text-sky-600' : 'text-orange-600'}`}>
                {otherOperationsTotal.toLocaleString('ru-RU')} руб.
            </TableCell>
            <TableCell className={`text-right font-bold text-lg ${payableTotal < 0 ? 'text-destructive' : 'text-primary'}`}>
                {payableTotal.toLocaleString('ru-RU')} руб.
            </TableCell>
            <TableCell className="text-center space-x-1">
                <Button onClick={handlePay} disabled={isPaying || payableTotal <= 0} size="sm">
                    {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Banknote className="mr-2 h-4 w-4" />}
                    Выплатить
                </Button>
                <Button variant="outline" size="sm" asChild>
                    <Link href={`/employees/${employeeId}/finance`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Детали
                    </Link>
                </Button>
            </TableCell>
        </TableRow>
    );
}
