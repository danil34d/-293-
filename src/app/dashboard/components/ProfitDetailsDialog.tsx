
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WashEvent, Employee, Expense, EmployeeTransaction } from "@/types";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ShoppingCart, HandCoins, Car, Droplets } from "lucide-react";
import React from "react";

interface ProfitDetailsDialogProps {
  children: React.ReactNode;
  washEvents: WashEvent[];
  expenses: Expense[];
  employeeTransactions: EmployeeTransaction[];
}

export function ProfitDetailsDialog({ children, washEvents, expenses, employeeTransactions }: ProfitDetailsDialogProps) {
  const salaryPayments = employeeTransactions.filter(t => t.type === 'payment' || t.type === 'bonus');
  const totalRevenue = washEvents.reduce((sum, event) => sum + (event.netAmount ?? event.totalAmount), 0);
  const totalOpEx = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalSalary = salaryPayments.reduce((sum, t) => sum + t.amount, 0);

  // Calculate chemical cost from wash events
  const totalChemicalCost = washEvents.reduce((sum, event) => sum + (event.chemicalCostRub ?? 0), 0);

  const totalProfit = totalRevenue - totalOpEx - totalSalary - totalChemicalCost;


  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Детализация прибыли</DialogTitle>
          <DialogDescription>
            Расшифровка доходов и расходов за выбранный период. 
            Итоговая прибыль: <span className="font-bold">{totalProfit.toLocaleString('ru-RU', {style: 'currency', currency: 'RUB'})}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-4">
            <div className="rounded-lg border p-4 bg-green-50 border-green-200">
                <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-5 w-5 text-green-600"/>
                    <h3 className="font-semibold text-green-800">Общая выручка</h3>
                </div>
                <p className="text-2xl font-bold text-green-700">{totalRevenue.toLocaleString('ru-RU')} руб.</p>
            </div>
            <div className="rounded-lg border p-4 bg-red-50 border-red-200">
                 <div className="flex items-center gap-2 mb-1">
                    <ShoppingCart className="h-5 w-5 text-red-600"/>
                    <h3 className="font-semibold text-red-800">Операц. расходы</h3>
                </div>
                <p className="text-2xl font-bold text-red-700">{totalOpEx.toLocaleString('ru-RU')} руб.</p>
            </div>
            <div className="rounded-lg border p-4 bg-orange-50 border-orange-200">
                 <div className="flex items-center gap-2 mb-1">
                    <HandCoins className="h-5 w-5 text-orange-600"/>
                    <h3 className="font-semibold text-orange-800">Зарплаты</h3>
                </div>
                <p className="text-2xl font-bold text-orange-700">{totalSalary.toLocaleString('ru-RU')} руб.</p>
            </div>
            <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
                 <div className="flex items-center gap-2 mb-1">
                    <Droplets className="h-5 w-5 text-blue-600"/>
                    <h3 className="font-semibold text-blue-800">Себест. химии</h3>
                </div>
                <p className="text-2xl font-bold text-blue-700">{totalChemicalCost.toLocaleString('ru-RU')} руб.</p>
            </div>
        </div>

        <Tabs defaultValue="revenue" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="revenue">Доходы ({washEvents.length})</TabsTrigger>
                <TabsTrigger value="opex">Опер. расходы ({expenses.length})</TabsTrigger>
                <TabsTrigger value="salaries">Выплаты персоналу ({salaryPayments.length})</TabsTrigger>
            </TabsList>
            <div className="flex-1 min-h-0 mt-2">
                <ScrollArea className="h-full rounded-md border">
                    <TabsContent value="revenue" className="m-0">
                        <Table>
                             <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Клиент / Машина</TableHead>
                                    <TableHead className="text-right">Сумма</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {washEvents.map(event => (
                                    <TableRow key={event.id}>
                                        <TableCell>{format(new Date(event.timestamp), 'dd.MM.yy HH:mm', { locale: ru })}</TableCell>
                                        <TableCell>
                                            <p className="font-medium">{event.sourceName || 'Розница'}</p>
                                            <p className="text-xs text-muted-foreground font-mono">{event.vehicleNumber}</p>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-green-700">{(event.netAmount ?? event.totalAmount).toLocaleString('ru-RU')} руб.</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TabsContent>
                     <TabsContent value="opex" className="m-0">
                        <Table>
                             <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Описание / Категория</TableHead>
                                    <TableHead className="text-right">Сумма</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {expenses.map(exp => (
                                    <TableRow key={exp.id}>
                                        <TableCell>{format(new Date(exp.date), 'dd.MM.yyyy', { locale: ru })}</TableCell>
                                        <TableCell>
                                            <p className="font-medium">{exp.description}</p>
                                            <Badge variant="outline" className="mt-1">{exp.category}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-red-700">{exp.amount.toLocaleString('ru-RU')} руб.</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TabsContent>
                     <TabsContent value="salaries" className="m-0">
                        <Table>
                             <TableHeader className="sticky top-0 bg-background z-10">
                                <TableRow>
                                    <TableHead>Дата</TableHead>
                                    <TableHead>Описание</TableHead>
                                    <TableHead className="text-right">Сумма</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {salaryPayments.map(t => (
                                    <TableRow key={t.id}>
                                        <TableCell>{format(new Date(t.date), 'dd.MM.yyyy', { locale: ru })}</TableCell>
                                        <TableCell>
                                            <p className="font-medium">{t.description}</p>
                                            <Badge variant="outline" className="mt-1">{t.type === 'payment' ? 'Выплата ЗП' : 'Премия'}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-semibold text-orange-700">{t.amount.toLocaleString('ru-RU')} руб.</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TabsContent>
                </ScrollArea>
            </div>
        </Tabs>

      </DialogContent>
    </Dialog>
  );
}
