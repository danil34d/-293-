
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
import { Loader2, PlusCircle, Gift, MinusCircle, Banknote, FileText, CircleOff, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SalaryReportRowProps {
    employeeId: string;
    employeeName: string;
    balanceAtStart: number;
    earningsForPeriod: number;
    paymentsForPeriod: number;
    otherOperationsTotal: number;
    onActionSuccess: () => void;
    isInactive?: boolean;
    rank?: number;
}

const transactionTypeDetails: Record<Exclude<EmployeeTransactionType, 'payment'>, { label: string; icon: React.ElementType, sign: number, color: string }> = {
    bonus: { label: 'Премия', icon: Gift, sign: 1, color: 'text-sky-600' },
    loan: { label: 'Долг/Аванс', icon: MinusCircle, sign: -1, color: 'text-orange-600' },
    purchase: { label: 'Покупка', icon: MinusCircle, sign: -1, color: 'text-red-600' },
    debt_write_off: { label: 'Списание долга', icon: CircleOff, sign: 1, color: 'text-green-600' },
};

function formatMoney(amount: number, showSign = false): string {
    const formatted = Math.abs(amount).toLocaleString('ru-RU');
    if (showSign && amount > 0) return `+${formatted}`;
    if (amount < 0) return `-${formatted}`;
    return formatted;
}

function AddTransactionDialog({ employeeId, employeeName, onActionSuccess, router, children }: { employeeId: string; employeeName: string; onActionSuccess: () => void; router: ReturnType<typeof useRouter>; children: React.ReactNode }) {
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
                {children}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Операция — {employeeName}</DialogTitle>
                    <DialogDescription>Премия, аванс, покупка или списание долга.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                     <div className="space-y-2">
                        <Label>Тип операции</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.keys(transactionTypeDetails).map(key => {
                            const typedKey = key as keyof typeof transactionTypeDetails;
                            const { label, icon: Icon, color } = transactionTypeDetails[typedKey];
                            return (
                               <Button
                                  key={key}
                                  type="button"
                                  variant={selectedType === typedKey ? 'default' : 'outline'}
                                  onClick={() => setSelectedType(typedKey)}
                                  className="justify-start gap-2"
                                  size="sm"
                                >
                                  <Icon className="h-4 w-4" /> {label}
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

export function SalaryReportRow({ employeeId, employeeName, balanceAtStart, earningsForPeriod, paymentsForPeriod, otherOperationsTotal, onActionSuccess, isInactive, rank }: SalaryReportRowProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [isPaying, setIsPaying] = useState(false);
    // Hide button after a successful pay until parent provides fresh props.
    // Prevents the user from triggering duplicate payments while the data
    // refresh round-trips back from the server.
    const [justPaid, setJustPaid] = useState(false);

    const payableTotal = balanceAtStart + earningsForPeriod + otherOperationsTotal - paymentsForPeriod;

    const handlePay = async () => {
        if (payableTotal <= 0) {
            toast({ title: "Нечего выплачивать", description: "Сумма к выплате равна нулю или отрицательна.", variant: "default" });
            return;
        }
        if (isPaying || justPaid) return;

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
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result?.error || "Не удалось зарегистрировать выплату.");
            }

            setJustPaid(true);
            const skipped = result?.skipped === true;
            toast({
                title: skipped ? "Уже выплачено" : "Успешно!",
                description: skipped
                    ? `Дублирующая выплата ${payableTotal.toLocaleString('ru-RU')} руб. отклонена.`
                    : `Сотруднику ${employeeName} выплачено ${payableTotal.toLocaleString('ru-RU')} руб.`,
            });
            router.refresh();
            onActionSuccess();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsPaying(false);
        }
    };

    // Short first name: "Костылев Валерий" -> "Костылев В."
    const shortName = (() => {
        const parts = employeeName.split(' ');
        if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
        return employeeName;
    })();

    return (
        <TableRow className={cn(
            "group transition-colors",
            isInactive && "opacity-40 hover:opacity-70"
        )}>
            {/* Employee name */}
            <TableCell className="pl-4 py-3">
                <Link href={`/employees/${employeeId}/finance`} className="hover:underline">
                    <div className="flex items-center gap-2.5">
                        {rank && (
                            <span className={cn(
                                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                                rank === 1 ? "bg-amber-100 text-amber-700" :
                                rank === 2 ? "bg-gray-100 text-gray-600" :
                                rank === 3 ? "bg-orange-100 text-orange-600" :
                                "bg-transparent text-gray-400"
                            )}>
                                {rank}
                            </span>
                        )}
                        <span className="font-medium text-sm text-gray-900">{shortName}</span>
                    </div>
                </Link>
            </TableCell>

            {/* Balance at start */}
            <TableCell className="text-right py-3">
                <span className={cn("text-sm tabular-nums", balanceAtStart !== 0 ? "text-gray-700" : "text-gray-300")}>
                    {balanceAtStart !== 0 ? formatMoney(balanceAtStart) : '—'}
                </span>
            </TableCell>

            {/* Earnings */}
            <TableCell className="text-right py-3">
                <span className={cn("text-sm font-semibold tabular-nums", earningsForPeriod > 0 ? "text-green-600" : "text-gray-300")}>
                    {earningsForPeriod > 0 ? `+${formatMoney(earningsForPeriod)}` : '—'}
                </span>
            </TableCell>

            {/* Payments */}
            <TableCell className="text-right py-3">
                <span className={cn("text-sm tabular-nums", paymentsForPeriod > 0 ? "text-red-500" : "text-gray-300")}>
                    {paymentsForPeriod > 0 ? `-${formatMoney(paymentsForPeriod)}` : '—'}
                </span>
            </TableCell>

            {/* Other operations */}
            <TableCell className="text-right py-3">
                <span className={cn("text-sm tabular-nums",
                    otherOperationsTotal > 0 ? "text-sky-600" :
                    otherOperationsTotal < 0 ? "text-orange-600" :
                    "text-gray-300"
                )}>
                    {otherOperationsTotal !== 0 ? formatMoney(otherOperationsTotal, true) : '—'}
                </span>
            </TableCell>

            {/* Payable total */}
            <TableCell className="text-right pr-4 py-3">
                <span className={cn(
                    "text-base font-bold tabular-nums",
                    payableTotal > 0 ? "text-gray-900" :
                    payableTotal < 0 ? "text-red-600" :
                    "text-gray-300"
                )}>
                    {payableTotal !== 0 ? formatMoney(payableTotal) : '0'}
                </span>
            </TableCell>

            {/* Actions */}
            <TableCell className="text-center py-3">
                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {payableTotal > 0 && !justPaid && (
                        <Button
                            onClick={handlePay}
                            disabled={isPaying}
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1 bg-green-600 hover:bg-green-700"
                        >
                            {isPaying ? <Loader2 className="h-3 w-3 animate-spin"/> : <Banknote className="h-3 w-3" />}
                            Выплатить
                        </Button>
                    )}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <AddTransactionDialog
                                employeeId={employeeId}
                                employeeName={employeeName}
                                onActionSuccess={onActionSuccess}
                                router={router}
                            >
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                    <PlusCircle className="h-4 w-4 mr-2" />
                                    Операция
                                </DropdownMenuItem>
                            </AddTransactionDialog>
                            <DropdownMenuItem asChild>
                                <Link href={`/employees/${employeeId}/finance`}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    Детали
                                </Link>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </TableCell>
        </TableRow>
    );
}
