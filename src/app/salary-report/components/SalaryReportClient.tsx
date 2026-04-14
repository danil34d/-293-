
"use client";

import { useState, useEffect, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import type { Employee, SalaryScheme, WashEvent, EmployeeTransaction, EmployeeTransactionType, SalaryReportData } from '@/types';
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, FilePieChart, TrendingUp, Wallet, AlertTriangle, Trophy, EyeOff, Eye } from 'lucide-react';
import { getEmployeesData, getWashEventsData, getSalarySchemesData, getAllEmployeeTransactions, getViolationsData } from "@/lib/data-loader";
import { SalaryReportRow } from "./SalaryReportRow";
import { generateSalaryReport } from "@/services/salary-calculator";
import { Table, TableBody, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isEmployeeAdmin } from "@/lib/employee-role";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";


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
    const [showInactive, setShowInactive] = useState(false);

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
            const [employees, allWashEvents, allSchemes, allTransactions, allViolations] = await Promise.all([
                (await getEmployeesData()).filter((e) => !isEmployeeAdmin(e)),
                await getWashEventsData(),
                await getSalarySchemesData(),
                await getAllEmployeeTransactions(),
                await getViolationsData(),
            ]);

            const periodStart = dateRange?.from ? startOfDay(dateRange.from) : null;
            const periodEnd = dateRange?.from ? endOfDay(dateRange.to || dateRange.from) : null;

            const employeeDataPromises = employees.map(async (emp) => {
                const employeeTransactions = allTransactions.filter(t => t.employeeId === emp.id);

                const balanceAtStart = await (async () => {
                    if (!periodStart) return 0;

                    let balance = 0;

                    const previousWashEvents = allWashEvents.filter(we =>
                        new Date(we.timestamp) < periodStart &&
                        we.employeeIds.includes(emp.id)
                    );
                    const previousViolations = allViolations.filter((v: any) => v.employeeId === emp.id && v.date && new Date(v.date + 'T00:00:00') < periodStart);
                    const previousReport = await generateSalaryReport(previousWashEvents, [emp], allSchemes, previousViolations);
                    balance += (previousReport[0]?.totalEarnings ?? 0) - (previousReport[0]?.totalPenalties ?? 0);

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

                const periodViolations = allViolations.filter((v: any) =>
                    v.employeeId === emp.id && v.date && periodStart && periodEnd &&
                    new Date(v.date + 'T00:00:00') >= periodStart &&
                    new Date(v.date + 'T00:00:00') <= periodEnd
                );
                const periodReport = (await generateSalaryReport(periodWashEvents, [emp], allSchemes, periodViolations))[0];
                const earningsForPeriod = (periodReport?.totalEarnings ?? 0) - (periodReport?.totalPenalties ?? 0);

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

    const { activeEmployees, inactiveEmployees } = useMemo(() => {
        const active: FullEmployeeData[] = [];
        const inactive: FullEmployeeData[] = [];
        allEmployeeData.forEach(d => {
            const payable = d.balanceAtStart + d.earningsForPeriod + d.otherOperationsTotal - d.paymentsForPeriod;
            if (d.earningsForPeriod === 0 && payable === 0 && d.paymentsForPeriod === 0) {
                inactive.push(d);
            } else {
                active.push(d);
            }
        });
        return { activeEmployees: active, inactiveEmployees: inactive };
    }, [allEmployeeData]);

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

    const displayedEmployees = showInactive ? [...activeEmployees, ...inactiveEmployees] : activeEmployees;

    return (
        <div className="space-y-4">
            {/* Date range picker */}
            <div className="mb-2">
                <DateRangePicker date={dateRange} setDate={setDateRange} />
            </div>

            {/* Summary stats strip */}
            {!isLoading && allEmployeeData.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 mb-1">
                                <TrendingUp className="h-3.5 w-3.5" />
                                Общий ФОТ
                            </div>
                            <p className="text-xl font-bold text-gray-900">
                                {summaryStats.totalPayroll.toLocaleString('ru-RU')} <span className="text-sm font-normal text-gray-500">₽</span>
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-xs font-medium text-green-600 mb-1">
                                <Wallet className="h-3.5 w-3.5" />
                                К выплате
                            </div>
                            <p className="text-xl font-bold text-gray-900">
                                {summaryStats.totalPayable.toLocaleString('ru-RU')} <span className="text-sm font-normal text-gray-500">₽</span>
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-white">
                        <CardContent className="p-4">
                            <div className="flex items-center gap-2 text-xs font-medium text-red-500 mb-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Долг сотрудников
                            </div>
                            <p className="text-xl font-bold text-gray-900">
                                {Math.abs(summaryStats.totalDebt).toLocaleString('ru-RU')} <span className="text-sm font-normal text-gray-500">₽</span>
                            </p>
                        </CardContent>
                    </Card>
                    {summaryStats.topEarner.name && (
                        <Card className="border-0 shadow-sm bg-gradient-to-br from-amber-50 to-white">
                            <CardContent className="p-4">
                                <div className="flex items-center gap-2 text-xs font-medium text-amber-600 mb-1">
                                    <Trophy className="h-3.5 w-3.5" />
                                    Лучший сотрудник
                                </div>
                                <p className="text-sm font-semibold text-gray-900 truncate">{summaryStats.topEarner.name}</p>
                                <p className="text-lg font-bold text-green-600">
                                    {summaryStats.topEarner.earnings.toLocaleString('ru-RU')} <span className="text-xs font-normal text-gray-500">₽</span>
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Main table */}
            <Card className="shadow-sm">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <Loader2 className="h-7 w-7 animate-spin text-primary mr-3" />
                            <span className="text-muted-foreground text-sm">Загрузка и расчёт данных...</span>
                        </div>
                    ) : displayedEmployees.length > 0 ? (
                        <>
                            <ScrollArea className="h-[65vh]">
                                <Table>
                                    <TableHeader className="sticky top-0 bg-gray-50/95 backdrop-blur-sm z-10 border-b">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="w-[180px] pl-4 text-xs uppercase tracking-wider font-semibold text-gray-500">Сотрудник</TableHead>
                                            <TableHead className="text-right text-xs uppercase tracking-wider font-semibold text-gray-500">Остаток</TableHead>
                                            <TableHead className="text-right text-xs uppercase tracking-wider font-semibold text-gray-500">Начислено</TableHead>
                                            <TableHead className="text-right text-xs uppercase tracking-wider font-semibold text-gray-500">Выплачено</TableHead>
                                            <TableHead className="text-right text-xs uppercase tracking-wider font-semibold text-gray-500">Прочее</TableHead>
                                            <TableHead className="text-right text-xs uppercase tracking-wider font-semibold text-gray-500 pr-4">Итого</TableHead>
                                            <TableHead className="w-[160px] text-center text-xs uppercase tracking-wider font-semibold text-gray-500"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedEmployees.map((data, idx) => {
                                            const isInactive = inactiveEmployees.includes(data);
                                            return (
                                                <SalaryReportRow
                                                    key={data.employee.id}
                                                    employeeId={data.employee.id}
                                                    employeeName={data.employee.fullName}
                                                    balanceAtStart={data.balanceAtStart}
                                                    earningsForPeriod={data.earningsForPeriod}
                                                    paymentsForPeriod={data.paymentsForPeriod}
                                                    otherOperationsTotal={data.otherOperationsTotal}
                                                    onActionSuccess={fetchAndProcessData}
                                                    isInactive={isInactive}
                                                    rank={!isInactive ? idx + 1 : undefined}
                                                />
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </ScrollArea>
                            {inactiveEmployees.length > 0 && (
                                <div className="border-t px-4 py-2.5 bg-gray-50/50 flex items-center justify-between">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowInactive(!showInactive)}
                                        className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                                    >
                                        {showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                        {showInactive ? 'Скрыть' : 'Показать'} без начислений ({inactiveEmployees.length})
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                        {activeEmployees.length} из {allEmployeeData.length} активных
                                    </span>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center text-muted-foreground py-20">
                            <FilePieChart className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                            <p className="text-sm">Нет данных для генерации отчёта.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
