
"use client";

import React from 'react';
import type { CounterAgent, Aggregator } from "@/types";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DateRange } from 'react-day-picker';

interface CombinedJournalEntry {
    id: string;
    date: Date;
    type: 'wash' | 'payment';
    description: string;
    vehicleNumber?: string;
    debit: number;
    credit: number;
    balanceAfter: number;
}

interface PeriodSummary {
    periodCharges: number;
    periodPayments: number;
}

interface ClientFinanceReportTemplateProps {
    client: CounterAgent | Aggregator;
    journal: CombinedJournalEntry[];
    summary: PeriodSummary;
    dateRange: DateRange | undefined;
    balanceAtStart: number;
}

export function ClientFinanceReportTemplate({ client, journal, summary, dateRange, balanceAtStart }: ClientFinanceReportTemplateProps) {
    
    const formattedDateRange = dateRange?.from ? 
        (dateRange.to ? 
            `с ${format(dateRange.from, "dd.MM.yyyy", { locale: ru })} по ${format(dateRange.to, "dd.MM.yyyy", { locale: ru })}` 
            : `за ${format(dateRange.from, "dd.MM.yyyy", { locale: ru })}`) 
        : 'за все время';
    
    const balanceAtEnd = journal.length > 0 ? journal[journal.length - 1].balanceAfter : balanceAtStart;

    return (
        <div className="p-8 bg-white text-black font-sans">
             <style>
                {`
                @media print {
                    body { -webkit-print-color-adjust: exact; color-adjust: exact; }
                    @page { size: A4; margin: 20mm; }
                }
                table { border-collapse: collapse; width: 100%; font-size: 10pt; }
                th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                th { background-color: #f2f2f2; }
                h1, h2, h3 { font-family: Arial, sans-serif; }
                `}
            </style>
            <div className="text-center mb-6">
                <h1 className="text-2xl font-bold">Финансовый отчет</h1>
                <p className="text-lg font-semibold">{client.name}</p>
                <p className="text-sm text-gray-600">Отчетный период: {formattedDateRange}</p>
            </div>

            <div className="mb-8 grid grid-cols-3 gap-4 text-center">
                 <div className="border p-3 rounded-lg">
                    <h3 className="text-sm text-gray-500">Баланс на начало периода</h3>
                    <p className="text-xl font-bold">{balanceAtStart.toLocaleString('ru-RU')} руб.</p>
                </div>
                 <div className="border p-3 rounded-lg bg-gray-100">
                    <h3 className="text-sm text-gray-500">Изменение за период</h3>
                    <p className={`text-xl font-bold ${(summary.periodPayments - summary.periodCharges) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(summary.periodPayments - summary.periodCharges).toLocaleString('ru-RU')} руб.
                    </p>
                </div>
                 <div className="border p-3 rounded-lg">
                    <h3 className="text-sm text-gray-500">Баланс на конец периода</h3>
                    <p className={`text-xl font-bold ${balanceAtEnd < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {balanceAtEnd.toLocaleString('ru-RU')} руб.
                    </p>
                </div>
            </div>
            
            <div>
                <h2 className="text-xl font-semibold border-b-2 border-black pb-2 mb-4">Журнал операций</h2>
                {journal.length > 0 ? (
                    <table>
                        <thead>
                            <tr>
                                <th className="w-24">Дата</th>
                                <th>Операция</th>
                                <th className="w-32 text-right">Списание</th>
                                <th className="w-32 text-right">Поступление</th>
                                <th className="w-32 text-right">Баланс</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={4} className="font-bold">Баланс на начало периода</td>
                                <td className="text-right font-bold">{balanceAtStart.toLocaleString('ru-RU')} руб.</td>
                            </tr>
                            {journal.map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-50">
                                    <td>{format(entry.date, "dd.MM.yyyy HH:mm", { locale: ru })}</td>
                                    <td>
                                        <p style={{ fontWeight: 500 }}>{entry.description}</p>
                                        {entry.vehicleNumber && <p className="text-xs text-gray-500">{entry.vehicleNumber}</p>}
                                    </td>
                                    <td className={`text-right font-medium`}>
                                        {entry.debit > 0 ? `${entry.debit.toLocaleString('ru-RU')} руб.` : ''}
                                    </td>
                                    <td className={`text-right font-medium`}>
                                         {entry.credit > 0 ? `${entry.credit.toLocaleString('ru-RU')} руб.` : ''}
                                    </td>
                                     <td className={`text-right font-medium`}>
                                        {entry.balanceAfter.toLocaleString('ru-RU')} руб.
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={2} className="font-bold">Итого за период</td>
                                <td className="text-right font-bold text-red-600">-{summary.periodCharges.toLocaleString('ru-RU')} руб.</td>
                                <td className="text-right font-bold text-green-600">+{summary.periodPayments.toLocaleString('ru-RU')} руб.</td>
                                <td className="text-right font-bold">{balanceAtEnd.toLocaleString('ru-RU')} руб.</td>
                            </tr>
                        </tfoot>
                    </table>
                ) : (
                    <p className="text-center text-gray-500 py-8">Нет операций за выбранный период.</p>
                )}
            </div>

            <div className="mt-12 text-right">
                <p>Дата формирования отчета: {format(new Date(), "dd MMMM yyyy г.", { locale: ru })}</p>
            </div>
        </div>
    );
};
