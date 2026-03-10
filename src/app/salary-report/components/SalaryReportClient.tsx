
"use client";

import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import type { Employee, SalaryScheme, WashEvent, EmployeeTransaction, EmployeeTransactionType, SalaryReportData } from '@/types';
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, FilePieChart, Trophy, Sigma, WalletCards, User, Gift, MinusCircle } from 'lucide-react';
import { getEmployeesData, getWashEventsData, getSalarySchemesData, getAllEmployeeTransactions } from "@/lib/data-loader";
import { SalaryReportRow } from "./SalaryReportRow";
import { generateSalaryReport } from "@/services/salary-calculator";
import { Table, TableBody, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isEmployeeAdmin } from "@/lib/employee-role";


interface FullEmployeeData {
    employee: Employee;
    balanceAtStart: number;
    earningsForPeriod: number;
    paymentsForPeriod: number;
    otherOperationsTotal: number;
}


export function SalaryReportClient() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });

    const [allEmployeeData, setAllEmployeeData] = useState<FullEmployeeData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Define transactionTypeDetails here
    const transactionTypeDetails: Record<EmployeeTransactionType, { sign: number }> = {
        payment: { sign: -1 },
        bonus: { sign: 1 },
        loan: { sign: -1 },
        purchase: { sign: -1 },
        debt_write_off: { sign: 1 },
    };

    const fetchAndProcessData = async () => {
        setIsLoading(true);
        try {
            const [employees, allWashEvents, allSchemes, allTransactions] = await Promise.all([
                (await getEmployeesData()).filter((e) => !isEmployeeAdmin(e)),
                await getWashEventsData(),
                await getSalarySchemesData(),
                await getAllEmployeeTransactions(),
            ]);

            const periodStart = dateRange?.from ? startOfDay(dateRange.from) : null;
            const periodEnd = dateRange?.from ? endOfDay(dateRange.to || dateRange.from) : null;
            
            const employeeDataPromises = employees.map(async (emp) => {
                const employeeTransactions = allTransactions.filter(t => t.employeeId === emp.id);

                const balanceAtStart = await (async () => {
                    if (!periodStart) return 0;

                    let balance = 0;
                    
                    // 1. Calculate all earnings from wash events before the period
                    const previousWashEvents = allWashEvents.filter(we => 
                        new Date(we.timestamp) < periodStart &&
                        we.employeeIds.includes(emp.id)
                    );
                    const previousReport = await generateSalaryReport(previousWashEvents, [emp], allSchemes);
                    balance += previousReport[0]?.totalEarnings ?? 0;

                    // 2. Apply all transactions (payments, bonuses, etc.) before the period
                    const previousTransactions = employeeTransactions.filter(t => new Date(t.date) < periodStart);
                    previousTransactions.forEach(t => {
                        const details = transactionTypeDetails[t.type];
                        if (details) {
                            balance += details.sign * t.amount;
                        }
                    });

                    return balance;
                })();


                const periodWashEvents = allWashEvents.filter(event => 
                    periodStart && periodEnd &&
                    event.employeeIds.includes(emp.id) &&
                    new Date(event.timestamp) >= periodStart &&
                    new Date(event.timestamp) <= periodEnd
                );
                
                const periodReport = (await generateSalaryReport(periodWashEvents, [emp], allSchemes))[0];
                const earningsForPeriod = periodReport?.totalEarnings ?? 0;
                
                const periodTransactions = employeeTransactions.filter(t =>
                    periodStart && periodEnd &&
                    new Date(t.date) >= periodStart &&
                    new Date(t.date) <= periodEnd
                );

                const paymentsForPeriod = periodTransactions
                    .filter(t => t.type === 'payment')
                    .reduce((sum, t) => sum + t.amount, 0);

                const otherOperationsTotal = periodTransactions
                    .filter(t => t.type !== 'payment')
                    .reduce((sum, t) => {
                        const details = transactionTypeDetails[t.type as Exclude<EmployeeTransactionType, 'payment'>];
                        return sum + (details.sign * t.amount);
                    }, 0);
                
                return {
                    employee: emp,
                    balanceAtStart,
                    earningsForPeriod,
                    paymentsForPeriod,
                    otherOperationsTotal
                };
            });
            
            const processedData = await Promise.all(employeeDataPromises);
            setAllEmployeeData(processedData.sort((a,b) => b.earningsForPeriod - a.earningsForPeriod));

        } catch (error) {
            console.error("Failed to fetch initial data for salary report", error);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        fetchAndProcessData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateRange]);

    const summaryStats = useMemo(() => {
        const stats = { totalPayroll: 0, topEarner: { name: '', earnings: 0 }, totalDebt: 0, totalPayable: 0 };
        if (isLoading || allEmployeeData.length === 0) return stats;

        let topEarnings = -1;

        allEmployeeData.forEach(empData => {
            const earnings = empData.earningsForPeriod;
            stats.totalPayroll += earnings;
            if (earnings > topEarnings) {
                topEarnings = earnings;
                stats.topEarner = { name: empData.employee.fullName, earnings };
            }
            
            const totalToPay = empData.balanceAtStart + empData.earningsForPeriod + empData.otherOperationsTotal - empData.paymentsForPeriod;
            if (totalToPay > 0) {
              stats.totalPayable += totalToPay;
            } else {
              stats.totalDebt += totalToPay;
            }
        });
        
        return stats;
    }, [allEmployeeData, isLoading]);


    return (
        <div>
            <div className="mb-4">
                <DateRangePicker date={dateRange} setDate={setDateRange} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card className="shadow-md">
                        <CardHeader>
                            <CardTitle>Ведомость по зарплате</CardTitle>
                            <CardDescription>Полный финансовый отчет по сотрудникам за выбранный период.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {isLoading ? (
                                <div className="flex justify-center items-center py-16">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mr-4" />
                                    <span className="text-muted-foreground">Загрузка и расчет данных...</span>
                                </div>
                            ) : allEmployeeData.length > 0 ? (
                                <ScrollArea className="h-[60vh]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            <TableHead className="w-[200px]">Сотрудник</TableHead>
                                            <TableHead className="text-right">Баланс (до)</TableHead>
                                            <TableHead className="text-right">Начислено</TableHead>
                                            <TableHead className="text-right">Выплачено</TableHead>
                                            <TableHead className="text-right">Прочее</TableHead>
                                            <TableHead className="text-right">К выплате</TableHead>
                                            <TableHead className="w-[200px] text-center">Действия</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allEmployeeData.map((data) => (
                                            <SalaryReportRow 
                                                key={data.employee.id}
                                                employeeId={data.employee.id}
                                                employeeName={data.employee.fullName}
                                                balanceAtStart={data.balanceAtStart}
                                                earningsForPeriod={data.earningsForPeriod}
                                                paymentsForPeriod={data.paymentsForPeriod}
                                                otherOperationsTotal={data.otherOperationsTotal}
                                                onActionSuccess={fetchAndProcessData}
                                            />
                                        ))}
                                    </TableBody>
                                </Table>
                                </ScrollArea>
                            ) : (
                                <div className="text-center text-muted-foreground py-16">
                                    <FilePieChart className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                                    <p>Нет данных для генерации отчета.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
                <div className="lg:col-span-1 space-y-6">
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><Sigma /> Общий ФОТ (за период)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-3xl font-bold text-primary">{summaryStats.totalPayroll.toLocaleString('ru-RU',{style: 'currency', currency: 'RUB'})}</p>
                        </CardContent>
                    </Card>
                     {summaryStats.topEarner.name && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg"><Trophy /> Лучший сотрудник (за период)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-xl font-semibold">{summaryStats.topEarner.name}</p>
                                <p className="text-2xl font-bold text-green-600">{summaryStats.topEarner.earnings.toLocaleString('ru-RU',{style: 'currency', currency: 'RUB'})}</p>
                            </CardContent>
                        </Card>
                     )}
                     <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><WalletCards /> Общие балансы</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between items-center text-md">
                                <span className="font-medium text-muted-foreground">Всего к выплате:</span>
                                <span className="font-bold text-lg text-primary">{summaryStats.totalPayable.toLocaleString('ru-RU')} руб.</span>
                            </div>
                            <div className="flex justify-between items-center text-md">
                                <span className="font-medium text-muted-foreground">Общий долг сотрудников:</span>
                                <span className="font-bold text-lg text-destructive">{Math.abs(summaryStats.totalDebt).toLocaleString('ru-RU')} руб.</span>
                            </div>
                        </CardContent>
                     </Card>
                </div>
            </div>
        </div>
    );
}
