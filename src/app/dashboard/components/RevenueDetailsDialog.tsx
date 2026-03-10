
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WashEvent, Employee } from "@/types";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Briefcase, DollarSign, Users, Car } from "lucide-react";
import React from "react";

interface RevenueDetailsDialogProps {
  children: React.ReactNode;
  washEvents: WashEvent[];
  employees: Employee[];
  paymentDistribution: {
    retailRevenue: number;
    aggregatorRevenue: number;
    counterAgentRevenue: number;
  };
}

const paymentMethodTranslations: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
};


export function RevenueDetailsDialog({ children, washEvents, employees, paymentDistribution }: RevenueDetailsDialogProps) {
  const employeeMap = new Map(employees.map(e => [e.id, e.fullName]));

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Детализация общей выручки</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-3 my-4">
            <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-5 w-5 text-green-500"/>
                    <h3 className="font-semibold">Розница</h3>
                </div>
                <p className="text-2xl font-bold">{paymentDistribution.retailRevenue.toLocaleString('ru-RU')} руб.</p>
            </div>
            <div className="rounded-lg border p-4">
                 <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="h-5 w-5 text-indigo-500"/>
                    <h3 className="font-semibold">Агрегаторы</h3>
                </div>
                <p className="text-2xl font-bold">{paymentDistribution.aggregatorRevenue.toLocaleString('ru-RU')} руб.</p>
            </div>
            <div className="rounded-lg border p-4">
                 <div className="flex items-center gap-2 mb-1">
                    <Users className="h-5 w-5 text-orange-500"/>
                    <h3 className="font-semibold">Контрагенты</h3>
                </div>
                <p className="text-2xl font-bold">{paymentDistribution.counterAgentRevenue.toLocaleString('ru-RU')} руб.</p>
            </div>
        </div>
        <div className="flex-1 min-h-0">
        <ScrollArea className="h-full rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-[150px]">Дата</TableHead>
                <TableHead>Клиент / Машина</TableHead>
                <TableHead>Исполнители</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {washEvents.map((event) => {
                const clientName = event.sourceName || paymentMethodTranslations[event.paymentMethod] || "Неизвестно";
                return (
                <TableRow key={event.id}>
                  <TableCell>{format(new Date(event.timestamp), 'dd.MM.yy HH:mm', { locale: ru })}</TableCell>
                  <TableCell>
                    <div className="font-medium">{clientName}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                       <Car className="h-3.5 w-3.5"/>
                       <span className="font-mono">{event.vehicleNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                        {event.employeeIds.map(id => (
                            <Badge key={id} variant="secondary">{employeeMap.get(id)?.split(' ')[0] || 'Неизв.'}</Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{(event.netAmount ?? event.totalAmount).toLocaleString('ru-RU')} руб.</TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
        </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
