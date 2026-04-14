

"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Employee, EmployeeTransaction, EmployeeTransactionType, SalaryReportData, WashEvent, SalaryScheme, SalaryBreakdownItem, PriceListItem, EmployeeConsumption, WashComment } from "@/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format, isWithinInterval, startOfMonth, endOfMonth, startOfToday, endOfToday, eachDayOfInterval, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { PiggyBank, HandCoins, MinusCircle, PlusCircle, Droplets, Gift, Loader2, BookCheck, Users, ShoppingCart, History, X, Info, CalendarClock, MessageSquare, CircleOff } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import { DeleteConfirmationButton } from "@/components/common/DeleteConfirmationButton";
import { ScrollArea } from "@/components/ui/scroll-area";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { generateSalaryReport } from "@/services/salary-calculator";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { DialogDescription } from "@/components/ui/dialog";
import { EarningsChart } from "./EarningsChart";
import { EmployeeCanistersCard } from "./EmployeeCanistersCard";
import { getAllFinanceDataForEmployee } from "@/lib/data-loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { CommentDialog } from "@/components/common/CommentDialog";
import { isEmployeeAdmin } from "@/lib/employee-role";


const CHEMICAL_CANISTER_PRICE = 3000;
const CHEMICAL_CANISTER_WEIGHT_G = 20000; // 20 kg in grams

interface AllData {
    allWashEvents: WashEvent[];
    allSchemes: SalaryScheme[];
    initialTransactions: EmployeeTransaction[];
    allEmployees: Employee[];
    employeeViolations?: any[];
}

interface FinanceDashboardProps {
    employee: Employee;
    initialData?: AllData; // Make it optional for external fetching
    embedded?: boolean;
    onTransactionUpdate?: (employeeId: string, newTransactions: EmployeeTransaction[]) => void;
}

const transactionTypeDetails: Record<EmployeeTransactionType, { label: string; icon: React.ElementType, sign: number, color: string }> = {
    payment: { label: 'Выплата ЗП', icon: HandCoins, sign: -1, color: 'text-green-600' },
    bonus: { label: 'Премия', icon: Gift, sign: 1, color: 'text-sky-600' },
    loan: { label: 'Долг/Аванс', icon: MinusCircle, sign: -1, color: 'text-orange-600' },
    purchase: { label: 'Покупка', icon: MinusCircle, sign: -1, color: 'text-red-600' },
    debt_write_off: { label: 'Списание долга', icon: CircleOff, sign: 1, color: 'text-green-600' },
};

interface EditableConsumption {
  [washEventId: string]: {
    main: number,
    additional: Record<string, number> // service.id -> amount
  };
}

function WashEventDetailsDialog({ event, breakdownItem, employeeMap, children, onCommentSave }: { event: WashEvent, breakdownItem?: SalaryBreakdownItem, employeeMap: Map<string, string>, children: React.ReactNode, onCommentSave: (eventId: string, newComments: WashComment[]) => Promise<void> }) {
    const lastEdit = event.editHistory && event.editHistory.length > 0 ? event.editHistory[event.editHistory.length - 1] : null;
    const previousState = lastEdit?.previousState as WashEvent | undefined;
    const hasComments = event.driverComments && event.driverComments.length > 0;

    const renderServiceList = (services: {main: PriceListItem, additional: PriceListItem[]}, title: string) => (
        <div>
            <h4 className="font-semibold text-sm mb-1">{title}</h4>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
                <li>{services.main.serviceName} ({services.main.price} руб.)</li>
                {services.additional.map((s, i) => (
                    <li key={i}>{s.serviceName} ({s.price} руб.)</li>
                ))}
            </ul>
        </div>
    );

    const renderDetail = (label: string, value: React.ReactNode, isDifferent = false) => (
        <div className={`p-2 rounded-md ${isDifferent ? 'bg-amber-100 dark:bg-amber-900/40 ring-1 ring-amber-300 dark:ring-amber-800' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{value}</p>
        </div>
    );

    const isTotalAmountDiff = previousState && event.totalAmount !== previousState.totalAmount;
    const isServiceDiff = previousState && (
        event.services.main.serviceName !== previousState.services.main.serviceName ||
        event.services.additional.length !== previousState.services.additional.length ||
        event.services.additional.some((s, i) => s.serviceName !== previousState.services.additional[i]?.serviceName)
    );
    const isTeamDiff = previousState && (
        event.employeeIds.join(',') !== previousState.employeeIds.join(',')
    );

    return (
        <Dialog>
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center justify-between">
                       <span>Детали мойки: {event.vehicleNumber}</span>
                    </DialogTitle>
                    <DialogDescription>
                        {format(new Date(event.timestamp), 'd MMMM yyyy в HH:mm', { locale: ru })}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    {/* Previous State Column */}
                    {lastEdit && previousState && (
                        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                            <h3 className="font-semibold text-center text-muted-foreground">До изменений</h3>
                            {renderDetail("Услуги", renderServiceList(previousState.services, ''), isServiceDiff)}
                            {renderDetail("Команда", previousState.employeeIds.map(id => employeeMap.get(id)?.split(' ')[0] || id).join(', '), isTeamDiff)}
                            {renderDetail("Сумма", `${previousState.totalAmount.toLocaleString('ru-RU')} руб.`, isTotalAmountDiff)}
                        </div>
                    )}
                    
                    {/* Current State Column */}
                    <div className={`space-y-4 p-4 border rounded-lg ${lastEdit ? 'col-span-1' : 'col-span-2'}`}>
                       <h3 className={`font-semibold text-center ${lastEdit ? 'text-primary' : 'text-muted-foreground'}`}>{lastEdit ? "После изменений" : "Детали"}</h3>
                        {renderDetail("Услуги", renderServiceList(event.services, ''), isServiceDiff)}
                        {renderDetail("Команда", event.employeeIds.map(id => employeeMap.get(id)?.split(' ')[0] || id).join(', '), isTeamDiff)}
                        {renderDetail("Сумма", `${event.totalAmount.toLocaleString('ru-RU')} руб.`, isTotalAmountDiff)}
                    </div>
                </div>

                {breakdownItem && (
                    <div className="mt-4 p-4 rounded-lg bg-sky-50 border border-sky-200 dark:bg-sky-900/50 dark:border-sky-800">
                        <h3 className="font-semibold text-sky-800 dark:text-sky-300">Расчет начислений для этого сотрудника:</h3>
                        <p className="text-2xl font-bold text-sky-700 dark:text-sky-200">
                           + {breakdownItem.earnings.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                        </p>
                        {breakdownItem.formula && (
                            <p className="text-sm text-muted-foreground mt-1">
                                {breakdownItem.formula}
                            </p>
                        )}
                        {breakdownItem.unpaidServices.length > 0 && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                <span className="font-semibold">Не оплачено (нет ставки):</span> {breakdownItem.unpaidServices.join(', ')}
                            </p>
                        )}
                    </div>
                )}
                {lastEdit && (
                     <p className="text-xs text-muted-foreground text-center mt-2">
                        Последнее изменение внес: {employeeMap.get(lastEdit.editedBy) || 'Неизвестно'} {format(new Date(lastEdit.editedAt), 'dd.MM.yyyy HH:mm')}
                    </p>
                )}

                <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
                    <CommentDialog
                         event={event}
                         employeeMap={employeeMap}
                         trigger={
                            <Button variant={hasComments ? "default" : "outline"} className={cn("gap-2", hasComments && "bg-sky-600 hover:bg-sky-700")}>
                                <MessageSquare className="h-4 w-4" />
                                {hasComments ? `Комментарии (${event.driverComments?.length})` : "Добавить комментарий"}
                            </Button>
                         }
                    />
                    <DialogClose asChild>
                        <Button variant="outline">Закрыть</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function AddTransactionDialog({ employee, isSubmitting, setIsSubmitting, onTransactionAdded }: { employee: Employee; isSubmitting: boolean; setIsSubmitting: (isSubmitting: boolean) => void; onTransactionAdded: (transaction: EmployeeTransaction) => void }) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<EmployeeTransactionType>('payment');
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
            const response = await fetch(`/api/employees/${employee.id}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error("Не удалось добавить транзакцию.");
            const result = await response.json();
            
            onTransactionAdded(result.transaction);
            toast({ title: "Успешно!", description: "Транзакция добавлена в журнал." });
            setDialogOpen(false);
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button><PlusCircle className="mr-2 h-4 w-4" />Добавить операцию</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Добавить финансовую операцию для {employee.fullName}</DialogTitle>
                    <DialogDescription>
                        Используйте эту форму для регистрации выплат, премий или авансов.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddTransaction} className="space-y-4">
                     <div className="space-y-2">
                        <Label>Тип операции</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {(Object.keys(transactionTypeDetails) as EmployeeTransactionType[]).filter(key => key !== 'purchase').map(key => {
                            const { label, icon: Icon } = transactionTypeDetails[key];
                            return (
                               <Button 
                                  key={key} 
                                  type="button"
                                  variant={selectedType === key ? 'default' : 'outline'}
                                  onClick={() => setSelectedType(key)}
                                  className="flex flex-col h-auto p-2"
                                >
                                  <Icon className="mb-1 h-5 w-5" />
                                  {label}
                               </Button>
                            )
                          })}
                        </div>
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="amount">Сумма (руб.)</Label>
                        <Input id="amount" name="amount" type="number" required placeholder="5000" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="description">Описание</Label>
                        <Input id="description" name="description" required placeholder="Зарплата за первую половину месяца" />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                            Сохранить
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ChemicalConsumptionDialog({ employee, washEvents, dailyEarnings, onConsumptionUpdate, children }: { employee: Employee, washEvents: WashEvent[], dailyEarnings: {date: string; earnings: number}[], onConsumptionUpdate: () => void, children: React.ReactNode }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consumptionValues, setConsumptionValues] = useState<EditableConsumption>({});

  const costPerGram = useMemo(() => CHEMICAL_CANISTER_PRICE / CHEMICAL_CANISTER_WEIGHT_G, []);

  const dailyEarningsMap = useMemo(() => {
    return new Map(dailyEarnings.map(d => [d.date, d.earnings]));
  }, [dailyEarnings]);


  const washesByDay = useMemo(() => {
    const grouped: Record<string, WashEvent[]> = {};
    washEvents.forEach(event => {
      const day = format(new Date(event.timestamp), 'yyyy-MM-dd');
      if (!grouped[day]) {
        grouped[day] = [];
      }
      grouped[day].push(event);
    });
    return Object.entries(grouped).sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime());
  }, [washEvents]);

  useEffect(() => {
    if (isOpen) {
      const initialValues: EditableConsumption = {};
      washEvents.forEach(event => {
        initialValues[event.id] = { main: 0, additional: {} };
        
        const mainConsumption = event.services.main.employeeConsumptions?.find(c => c.employeeId === employee.id)?.amount;
        if (mainConsumption !== undefined) {
          initialValues[event.id].main = mainConsumption;
        }

        event.services.additional.forEach((service: any) => {
          if (!service.id) return;
          const additionalConsumption = service.employeeConsumptions?.find((c: EmployeeConsumption) => c.employeeId === employee.id)?.amount;
          if (additionalConsumption !== undefined) {
            if (!initialValues[event.id].additional) {
                initialValues[event.id].additional = {};
            }
            initialValues[event.id].additional[service.id] = additionalConsumption;
          }
        });
      });
      setConsumptionValues(initialValues);
    }
  }, [isOpen, washEvents, employee.id]);

  const handleValueChange = (washEventId: string, serviceId: string, value: string) => {
    const amount = parseInt(value, 10);
    const validAmount = isNaN(amount) ? 0 : amount;

    setConsumptionValues(prev => {
        const newEventConsumptions = { ...(prev[washEventId] || { main: 0, additional: {} }) };
        if (serviceId === 'main') {
            newEventConsumptions.main = validAmount;
        } else {
            newEventConsumptions.additional = { ...newEventConsumptions.additional, [serviceId]: validAmount };
        }
        return { ...prev, [washEventId]: newEventConsumptions };
    });
};


  const handleSave = async () => {
    setIsSubmitting(true);
    let updatedCount = 0;
    try {
      const updates = washEvents.map(async (event) => {
        const eventConsumptions = consumptionValues[event.id];
        if (!eventConsumptions) return;

        let hasChanged = false;

        const originalMainConsumption = event.services.main.employeeConsumptions?.find(ec => ec.employeeId === employee.id)?.amount ?? 0;
        if(originalMainConsumption !== (eventConsumptions.main ?? 0)) {
            hasChanged = true;
        }
        
        const updatedMainService = {
          ...event.services.main,
          employeeConsumptions: (event.services.main.employeeConsumptions || []).map(ec => {
            if (ec.employeeId === employee.id) {
              return { ...ec, amount: eventConsumptions.main ?? 0 };
            }
            return ec;
          })
        };

        const updatedAdditionalServices = event.services.additional.map((service: any) => {
            const originalAddConsumption = service.employeeConsumptions?.find((c: EmployeeConsumption) => c.employeeId === employee.id)?.amount ?? 0;
            if(originalAddConsumption !== (eventConsumptions.additional?.[service.id] ?? 0)){
                hasChanged = true;
            }
          return {
            ...service,
            employeeConsumptions: (service.employeeConsumptions || []).map((ec: EmployeeConsumption) => {
              if (ec.employeeId === employee.id && eventConsumptions.additional?.[service.id] !== undefined) {
                return { ...ec, amount: eventConsumptions.additional[service.id] };
              }
              return ec;
            })
          };
        });

        if (hasChanged) {
          updatedCount++;
          const updatedEvent: WashEvent = {
            ...event,
            services: {
              main: updatedMainService,
              additional: updatedAdditionalServices
            }
          };
          
          const response = await fetch(`/api/wash-events/${event.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedEvent),
          });

          if (!response.ok) {
            throw new Error(`Не удалось обновить мойку для ${event.vehicleNumber}`);
          }
        }
      });

      await Promise.all(updates);

      if (updatedCount > 0) {
        toast({ title: "Успех!", description: `Данные о расходе химии обновлены для ${updatedCount} моек.` });
        onConsumptionUpdate();
      } else {
        toast({ title: "Нет изменений", description: "Данные о расходе химии не изменились.", variant: "default" });
      }
      setIsOpen(false);
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl">
          <DialogHeader>
              <DialogTitle>Детализация и редактирование расхода химии</DialogTitle>
              <DialogDescription>
                  Индивидуальный расход химии для сотрудника {employee.fullName} за выбранный период. Вы можете изменить значения и сохранить их.
              </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[70vh] -mx-6 px-6">
            <div className="space-y-6 py-2">
              {washesByDay.length > 0 ? (
                washesByDay.map(([day, dayEvents]) => {
                  const dayEarnings = dailyEarningsMap.get(format(parseISO(day), 'dd.MM')) ?? 0;
                  
                  const dayTotalConsumption = dayEvents.reduce((total, event) => {
                      const consumptions = consumptionValues[event.id];
                      if (!consumptions) return total;
                      const mainConsumption = consumptions.main || 0;
                      const additionalConsumption = Object.values(consumptions.additional || {}).reduce((sum, val) => sum + val, 0);
                      return total + mainConsumption + additionalConsumption;
                  }, 0);

                  const dayChemicalCost = dayTotalConsumption * costPerGram;
                  const dayNetEarnings = dayEarnings - dayChemicalCost;
                  
                  return (
                    <Card key={day} className="overflow-hidden">
                       <CardHeader className="bg-muted/50 p-4">
                            <CardTitle className="flex justify-between items-center">
                                <span className="text-lg">{format(parseISO(day), 'd MMMM yyyy, cccc', { locale: ru })}</span>
                                <Badge variant={dayNetEarnings > 0 ? "secondary" : "destructive"}>
                                    Чистыми: {dayNetEarnings.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })}
                                </Badge>
                            </CardTitle>
                            <CardDescription className="flex gap-4 text-xs">
                                <span>Заработано: <strong className="text-green-600">{dayEarnings.toLocaleString('ru-RU')} руб.</strong></span>
                                <span>Расход химии: <strong className="text-red-600">-{dayChemicalCost.toLocaleString('ru-RU')} руб.</strong> ({dayTotalConsumption} гр.)</span>
                            </CardDescription>
                       </CardHeader>
                       <CardContent className="p-0">
                          <Table>
                              <TableHeader>
                                  <TableRow>
                                      <TableHead className="w-[80px]">Время</TableHead>
                                      <TableHead>Машина</TableHead>
                                      <TableHead>Услуга</TableHead>
                                      <TableHead className="text-right w-[150px]">Расход (гр.)</TableHead>
                                  </TableRow>
                              </TableHeader>
                              <TableBody>
                                  {dayEvents.flatMap(event => {
                                      const mainConsumption = event.services.main.employeeConsumptions?.find(c => c.employeeId === employee.id)?.amount;
                                      return [
                                          <TableRow key={event.id + '-main'}>
                                              <TableCell>{format(new Date(event.timestamp), 'HH:mm')}</TableCell>
                                              <TableCell className="font-mono">{event.vehicleNumber}</TableCell>
                                              <TableCell>{event.services.main.serviceName} (осн.)</TableCell>
                                              <TableCell className="text-right">
                                                  <Input
                                                      type="number"
                                                      className="w-24 ml-auto text-right"
                                                      value={consumptionValues[event.id]?.main ?? mainConsumption ?? ''}
                                                      onChange={(e) => handleValueChange(event.id, 'main', e.target.value)}
                                                      placeholder="0"
                                                  />
                                              </TableCell>
                                          </TableRow>,
                                          ...event.services.additional.map((service: any) => {
                                              const addConsumption = service.employeeConsumptions?.find((c: EmployeeConsumption) => c.employeeId === employee.id)?.amount;
                                              return (
                                                  <TableRow key={event.id + '-' + service.id}>
                                                      <TableCell></TableCell>
                                                      <TableCell></TableCell>
                                                      <TableCell className="pl-6 text-muted-foreground">{service.serviceName}</TableCell>
                                                      <TableCell className="text-right">
                                                          <Input
                                                              type="number"
                                                              className="w-24 ml-auto text-right"
                                                              value={consumptionValues[event.id]?.additional?.[service.id] ?? addConsumption ?? ''}
                                                              onChange={(e) => handleValueChange(event.id, service.id, e.target.value)}
                                                              placeholder="0"
                                                          />
                                                      </TableCell>
                                                  </TableRow>
                                              );
                                          })
                                      ];
                                  })}
                              </TableBody>
                          </Table>
                       </CardContent>
                    </Card>
                  )
                })
              ) : (
                  <div className="text-center text-muted-foreground py-16">
                      Нет данных о расходе химии за этот период.
                  </div>
              )}
            </div>
          </ScrollArea>
          <DialogFooter>
              <DialogClose asChild><Button type="button" variant="secondary">Отмена</Button></DialogClose>
              <Button onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                Сохранить изменения
              </Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function FinanceDashboard({ employee, initialData, embedded = false, onTransactionUpdate }: FinanceDashboardProps) {
    const { toast } = useToast();
    const [allData, setAllData] = useState<AllData | null>(initialData || null);
    const [dataLoadingError, setDataLoadingError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [transactions, setTransactions] = useState<EmployeeTransaction[]>(initialData?.initialTransactions || []);
    const router = useRouter();
    const { employee: loggedInEmployee } = useAuth();
    const isManagerView = isEmployeeAdmin(loggedInEmployee);
    
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    
    const [salaryData, setSalaryData] = useState<SalaryReportData | undefined>(undefined);
    
    const loadData = async () => {
        if (initialData) return; // Data was passed in, no need to fetch
        try {
            setDataLoadingError(null);
            const data = await getAllFinanceDataForEmployee(employee.id);
            setAllData(data);
            setTransactions(data.initialTransactions);
        } catch (e: any) {
            console.error("Failed to load finance data:", e);
            setDataLoadingError(e.message || "Не удалось загрузить данные.");
        }
    };
    
    useEffect(() => {
        loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [employee.id, initialData]);

    const { allWashEvents, allSchemes, allEmployees, employeeViolations } = allData || { allWashEvents: [], allSchemes: [], allEmployees: [], employeeViolations: [] };

    const employeeMap = useMemo(() => new Map(allEmployees.map(e => [e.id, e.fullName])), [allEmployees]);
    
    const employeeWashEvents = useMemo(() => {
        if (!dateRange?.from || !allWashEvents) return [];
        return allWashEvents.filter(event => 
            event.employeeIds.includes(employee.id) &&
            isWithinInterval(new Date(event.timestamp), {
                start: dateRange.from!,
                end: dateRange.to || dateRange.from!,
            })
        );
    }, [allWashEvents, employee.id, dateRange]);
    
    useEffect(() => {
        async function calculateAndSetReport() {
            if (!dateRange?.from || !employee || !allData) return;
            
            const filteredEvents = allWashEvents.filter(event => 
                event.employeeIds.includes(employee.id) &&
                isWithinInterval(new Date(event.timestamp), {
                    start: dateRange.from!,
                    end: dateRange.to || dateRange.from!,
                })
            );
            
            // Filter violations for the selected period
            const filteredViolations = (employeeViolations || []).filter((v: any) =>
                v.date && dateRange.from && isWithinInterval(new Date(v.date + 'T00:00:00'), {
                    start: dateRange.from!,
                    end: dateRange.to || dateRange.from!,
                })
            );

            try {
                const reportResult = await generateSalaryReport(filteredEvents, [employee], allSchemes, filteredViolations);
                setSalaryData(reportResult[0]);
            } catch (error) {
                console.error("Failed to generate salary report:", error);
            }
        }

        calculateAndSetReport();
    }, [dateRange, allWashEvents, allSchemes, employee, allData, employeeViolations]);

    const filteredTransactions = useMemo(() => {
        if (!dateRange?.from) return [];
        return (transactions || []).filter(t => isWithinInterval(new Date(t.date), {
            start: dateRange.from!,
            end: dateRange.to || dateRange.from!,
        }));
    }, [transactions, dateRange]);


    const periodSummary = useMemo(() => {
        const summary = {
            totalEarned: salaryData?.totalEarnings ?? 0,
            totalPenalties: salaryData?.totalPenalties ?? 0,
            payments: 0,
            bonuses: 0,
            loansAndPurchases: 0,
            debtWriteOffs: 0,
            tips: 0,
            balance: 0,
        };

        // Чаевые из моек
        employeeWashEvents.forEach(e => {
            if (e.tips && e.tips > 0) {
                const share = e.tips / (e.employeeIds?.length || 1);
                summary.tips += share;
            }
        });

        filteredTransactions.forEach(t => {
            switch(t.type) {
                case 'payment': summary.payments += t.amount; break;
                case 'bonus': summary.bonuses += t.amount; break;
                case 'loan':
                case 'purchase':
                    summary.loansAndPurchases += t.amount; break;
                case 'debt_write_off':
                    summary.debtWriteOffs += t.amount; break;
            }
        });

        // debt_write_off увеличивает баланс, штрафы уменьшают
        summary.balance = summary.totalEarned + summary.bonuses + summary.debtWriteOffs - summary.payments - summary.loansAndPurchases - summary.totalPenalties;
        return summary;
    }, [salaryData, filteredTransactions, employeeWashEvents]);

    const [timeReportData, setTimeReportData] = useState({ today: 0, month: 0, todayPenalties: 0, monthPenalties: 0 });
    useEffect(() => {
        const calculateReports = async () => {
            if (!allData) return { today: 0, month: 0 };
            
            const todayStart = startOfToday();
            const todayEnd = endOfToday();
            const monthStart = startOfMonth(new Date());

            const todayEvents = allWashEvents.filter(event => 
                event.employeeIds.includes(employee.id) &&
                isWithinInterval(new Date(event.timestamp), { start: todayStart, end: todayEnd })
            );
            
            const monthEvents = allWashEvents.filter(event => 
                event.employeeIds.includes(employee.id) &&
                isWithinInterval(new Date(event.timestamp), { start: monthStart, end: todayEnd })
            );

            // Filter violations for today and month
            const todayViolations = (employeeViolations || []).filter((v: any) =>
                v.date && isWithinInterval(new Date(v.date + 'T00:00:00'), { start: todayStart, end: todayEnd })
            );
            const monthViolations = (employeeViolations || []).filter((v: any) =>
                v.date && isWithinInterval(new Date(v.date + 'T00:00:00'), { start: monthStart, end: todayEnd })
            );

            const todayReport = await generateSalaryReport(todayEvents, [employee], allSchemes, todayViolations);
            const monthReport = await generateSalaryReport(monthEvents, [employee], allSchemes, monthViolations);

            return {
                today: todayReport[0]?.totalEarnings ?? 0,
                month: monthReport[0]?.totalEarnings ?? 0,
                todayPenalties: todayReport[0]?.totalPenalties ?? 0,
                monthPenalties: monthReport[0]?.totalPenalties ?? 0,
            };
        };
        
        calculateReports().then(setTimeReportData);
    }, [allWashEvents, employee, allSchemes, allData, employeeViolations]);
    

    const chemicalConsumption = useMemo(() => {
        let total = 0;
        employeeWashEvents.forEach(event => {
            const allServices = [event.services.main, ...event.services.additional];
            allServices.forEach((service: any) => {
                if (service?.employeeConsumptions) {
                    const consumptionRecord = service.employeeConsumptions.find(
                        (c: EmployeeConsumption) => c.employeeId === employee.id
                    );
                    if (consumptionRecord && typeof consumptionRecord.amount === 'number' && !isNaN(consumptionRecord.amount)) {
                        total += consumptionRecord.amount;
                    }
                }
            });
        });
        return isNaN(total) ? 0 : total;
    }, [employeeWashEvents, employee.id]);
    
    const chemicalCost = useMemo(() => {
        const costPerGram = CHEMICAL_CANISTER_PRICE / CHEMICAL_CANISTER_WEIGHT_G;
        return chemicalConsumption * costPerGram;
    }, [chemicalConsumption]);

    const breakdownMap = useMemo(() => {
        const map = new Map<string, SalaryBreakdownItem>();
        if (salaryData?.breakdown) {
            salaryData.breakdown.forEach(item => {
                map.set(item.washEventId, item);
            });
        }
        return map;
    }, [salaryData]);

    const dailyEarnings = useMemo(() => {
        if (!salaryData?.breakdown) return [];
        const earningsByDay: Record<string, number> = {};

        salaryData.breakdown.forEach(item => {
            const day = format(parseISO(item.timestamp), 'yyyy-MM-dd');
            if (!earningsByDay[day]) {
                earningsByDay[day] = 0;
            }
            earningsByDay[day] += item.earnings;
        });
        
        if(dateRange?.from && dateRange?.to) {
            const allDays = eachDayOfInterval({start: dateRange.from, end: dateRange.to});
            allDays.forEach(day => {
                const formattedDay = format(day, 'yyyy-MM-dd');
                if(!earningsByDay[formattedDay]) {
                    earningsByDay[formattedDay] = 0;
                }
            });
        }

        return Object.entries(earningsByDay)
            .map(([date, earnings]) => ({ date: format(parseISO(date), 'dd.MM'), earnings }))
            .sort((a,b) => a.date.localeCompare(b.date));

    }, [salaryData, dateRange]);

    const handleTransactionAdded = (newTransaction: EmployeeTransaction) => {
        const newTransactions = [newTransaction, ...transactions].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(newTransactions);
        if (onTransactionUpdate) {
            onTransactionUpdate(employee.id, newTransactions);
        } else {
             router.refresh();
        }
    };

    const handleTransactionDeleted = (deletedTxnId: string) => {
        const newTransactions = transactions.filter(t => t.id !== deletedTxnId);
        setTransactions(newTransactions);
        if (onTransactionUpdate) {
            onTransactionUpdate(employee.id, newTransactions);
        }
    };

    const handleIssueCanister = async () => {
        const data = {
            type: 'purchase' as EmployeeTransactionType,
            amount: CHEMICAL_CANISTER_PRICE,
            description: `Выдача канистры химии (${CHEMICAL_CANISTER_WEIGHT_G / 1000} кг)`
        };
        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/employees/${employee.id}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) throw new Error("Не удалось добавить транзакцию.");
            const result = await response.json();
            
            handleTransactionAdded(result.transaction);
            toast({ title: "Успешно!", description: "Сотруднику выдан долг за канистру." });
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }
    
    const handleCommentSave = async (eventId: string, newComments: WashComment[]) => {
        const eventToUpdate = allWashEvents.find(e => e.id === eventId);
        if (!eventToUpdate) {
            throw new Error("Мойка не найдена");
        }
        if (!loggedInEmployee) {
             throw new Error("Не удалось определить автора комментария.");
        }

        const updatedEvent = { ...eventToUpdate, driverComments: newComments };

        const response = await fetch(`/api/wash-events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedEvent),
        });

        if (!response.ok) {
            throw new Error("Не удалось сохранить комментарий");
        }
        
        // Update local state to reflect change immediately
        setAllData(prevData => {
            if (!prevData) return null;
            return {
                ...prevData,
                allWashEvents: prevData.allWashEvents.map(e => e.id === eventId ? updatedEvent : e)
            }
        });
    };
    
    if (!allData) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }
    
    if (dataLoadingError) {
         return (
            <Alert variant="destructive">
                <AlertTitle>Ошибка загрузки данных</AlertTitle>
                <AlertDescription>{dataLoadingError}</AlertDescription>
            </Alert>
         )
    }

    const mainContent = (
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                {!embedded && <EarningsChart data={dailyEarnings} />}
                {(isManagerView || filteredTransactions.length > 0) && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Финансовый журнал (за период)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader><TableRow>
                                        <TableHead>Дата</TableHead>
                                        <TableHead>Тип / Описание</TableHead>
                                        <TableHead className="text-right">Сумма</TableHead>
                                        {isManagerView && <TableHead className="w-[50px]"></TableHead>}
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {filteredTransactions.length > 0 ? filteredTransactions.map(t => {
                                            const details = transactionTypeDetails[t.type];
                                            const displayAmount = details.sign * t.amount;
                                            const formattedDate = format(new Date(t.date), 'dd.MM.yyyy HH:mm', { locale: ru });
                                            return (
                                                <TableRow key={t.id}>
                                                    <TableCell>{formattedDate}</TableCell>
                                                    <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="flex items-center w-fit flex-shrink-0">
                                                            <details.icon className={`mr-1.5 h-3 w-3 ${details.color}`} /> {details.label}
                                                        </Badge>
                                                        <span className="text-muted-foreground truncate">{t.description}</span>
                                                    </div>
                                                    </TableCell>
                                                    <TableCell className={`text-right font-medium ${displayAmount >= 0 ? 'text-sky-600' : 'text-red-600'}`}>
                                                        {displayAmount >= 0 ? '+' : ''}{t.amount.toLocaleString('ru-RU')} руб.
                                                    </TableCell>
                                                    {isManagerView && (
                                                        <TableCell>
                                                            <DeleteConfirmationButton
                                                                apiPath={`/api/employees/${employee.id}/transactions?transactionId=${t.id}`}
                                                                entityId={''}
                                                                entityName={`транзакцию "${t.description}"`}
                                                                toastTitle="Транзакция удалена"
                                                                toastDescription="Транзакция была успешно удалена."
                                                                description={<>Вы уверены, что хотите удалить транзакцию <strong className="text-foreground">"{t.description}"</strong> на сумму <strong>{t.amount} руб.</strong> от {formattedDate}?</>}
                                                                onSuccess={() => handleTransactionDeleted(t.id)}
                                                            />
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            )
                                        }) : (
                                            <TableRow><TableCell colSpan={isManagerView ? 4 : 3} className="text-center h-24">Финансовых операций за период нет.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
                {!embedded && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><BookCheck />История моек (за период)</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="wash-history-table-wrapper">
                            <TooltipProvider delayDuration={0}>
                                <div className="wash-history-table-scroll">
                                <Table>
                                    <TableHeader><TableRow>
                                        <TableHead className="w-[120px]">Дата</TableHead>
                                        <TableHead className="min-w-[120px]">Машина</TableHead>
                                        <TableHead className="min-w-[200px]">Услуга</TableHead>
                                        <TableHead className="text-center min-w-[100px]">Исполнители</TableHead>
                                        <TableHead className="text-right min-w-[120px]">Начислено</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow></TableHeader>
                                    <TableBody>
                                        {employeeWashEvents.length > 0 ? [...employeeWashEvents].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(event => {
                                        const teamMembers = event.employeeIds.map(id => employeeMap.get(id) || 'Неизвестный').join(', ');
                                        const breakdownItem = breakdownMap.get(event.id);
                                        const firstComment = event.driverComments && event.driverComments.length > 0 ? event.driverComments[event.driverComments.length-1] : null;

                                        return (
                                            <WashEventDetailsDialog key={event.id} event={event} breakdownItem={breakdownItem} employeeMap={employeeMap} onCommentSave={handleCommentSave}>
                                                <TableRow className="cursor-pointer">
                                                    <TableCell>
                                                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                        {event.editHistory && event.editHistory.length > 0 && <Tooltip><TooltipTrigger><History className="h-4 w-4 text-amber-600 cursor-help" /></TooltipTrigger><TooltipContent><p>В данные этой мойки были внесены изменения.</p></TooltipContent></Tooltip>}
                                                        {format(new Date(event.timestamp), 'dd.MM HH:mm', { locale: ru })}
                                                      </div>
                                                    </TableCell>
                                                    <TableCell className="whitespace-nowrap"><span className="font-mono hover:underline">{event.vehicleNumber}</span></TableCell>
                                                    <TableCell className="max-w-[200px]"><Tooltip><TooltipTrigger><p className="truncate">{event.services.main.serviceName.length > 40 ? event.services.main.serviceName.substring(0, 40) + '...' : event.services.main.serviceName}</p></TooltipTrigger><TooltipContent><p>{event.services.main.serviceName}</p></TooltipContent></Tooltip></TableCell>
                                                    <TableCell className="text-center"><Tooltip><TooltipTrigger><div className="flex items-center justify-center whitespace-nowrap"><Users className="h-4 w-4 mr-1 text-muted-foreground" />{event.employeeIds.length}</div></TooltipTrigger><TooltipContent><p>{teamMembers}</p></TooltipContent></Tooltip></TableCell>
                                                    <TableCell className="text-right font-semibold text-green-700 whitespace-nowrap">{(breakdownItem?.earnings ?? 0).toLocaleString('ru-RU')} руб.</TableCell>
                                                    <TableCell className="text-center">
                                                      {firstComment && (
                                                        <Tooltip>
                                                          <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                                                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                                              <MessageSquare className="h-4 w-4 text-sky-600" />
                                                            </Button>
                                                          </TooltipTrigger>
                                                          <TooltipContent><p>{firstComment.text}</p></TooltipContent>
                                                        </Tooltip>
                                                      )}
                                                    </TableCell>
                                                </TableRow>
                                            </WashEventDetailsDialog>
                                        )
                                        }) : <TableRow><TableCell colSpan={6} className="text-center h-24">Нет моек за выбранный период.</TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                                </div>
                            </TooltipProvider>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2"><PiggyBank />Расчётный листок</CardTitle>
                        <Button variant="outline" size="sm" onClick={() => window.print()} className="print-hidden text-xs">
                          Печать
                        </Button>
                      </div>
                      <CardDescription>
                        {dateRange?.from && dateRange?.to
                          ? `${format(dateRange.from, 'dd.MM.yyyy', { locale: ru })} — ${format(dateRange.to, 'dd.MM.yyyy', { locale: ru })}`
                          : 'Текущий месяц'
                        }
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-base">
                        <div className="p-3 border rounded-lg bg-muted/30">
                        <p className="text-sm font-semibold text-muted-foreground flex items-center gap-2"><CalendarClock className="h-4 w-4"/> За выбранный период</p>
                        <Separator className="my-2"/>
                        <div className="space-y-2">
                            <div className="flex justify-between font-semibold"><span className="text-muted-foreground">Заработано:</span><span className="text-green-600">{periodSummary.totalEarned.toLocaleString('ru-RU')} руб.</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Премии:</span><span>{periodSummary.bonuses.toLocaleString('ru-RU')} руб.</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Выплаты ЗП:</span><span>{periodSummary.payments.toLocaleString('ru-RU')} руб.</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Долги/Покупки:</span><span>{periodSummary.loansAndPurchases.toLocaleString('ru-RU')} руб.</span></div>
                            {periodSummary.totalPenalties > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Штрафы:</span><span className="text-red-600">-{periodSummary.totalPenalties.toLocaleString('ru-RU')} руб.</span></div>}
                            {periodSummary.debtWriteOffs > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Списание долгов:</span><span className="text-green-600">+{periodSummary.debtWriteOffs.toLocaleString('ru-RU')} руб.</span></div>}
                            {periodSummary.tips > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Чаевые:</span><span className="text-amber-600">+{Math.round(periodSummary.tips).toLocaleString('ru-RU')} руб.</span></div>}
                            <Separator />
                            <div className={`flex justify-between font-bold text-lg ${periodSummary.balance >= 0 ? 'text-primary' : 'text-red-700'}`}><span>К выплате:</span><span>{periodSummary.balance.toLocaleString('ru-RU')} руб.</span></div>
                        </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between font-semibold"><span className="text-muted-foreground">Начислено за сегодня:</span><span>{timeReportData.today.toLocaleString('ru-RU')} руб.</span></div>
                            {timeReportData.todayPenalties > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">  Штрафы за сегодня:</span><span className="text-red-600">-{timeReportData.todayPenalties.toLocaleString('ru-RU')} руб.</span></div>}
                            <div className="flex justify-between font-semibold"><span className="text-muted-foreground">Начислено за месяц:</span><span>{timeReportData.month.toLocaleString('ru-RU')} руб.</span></div>
                            {timeReportData.monthPenalties > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">  Штрафы за месяц:</span><span className="text-red-600">-{timeReportData.monthPenalties.toLocaleString('ru-RU')} руб.</span></div>}
                        </div>
                    </CardContent>
                </Card>
                 <ChemicalConsumptionDialog employee={employee} washEvents={employeeWashEvents} dailyEarnings={dailyEarnings} onConsumptionUpdate={loadData}>
                    <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <CardHeader><CardTitle className="flex items-center gap-2"><Droplets />Учет химии (за период)</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Всего моек:</span><span className="text-2xl font-bold">{employeeWashEvents.length}</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Расход химии:</span><span className="text-2xl font-bold">{(chemicalConsumption / 1000).toFixed(2)} кг</span></div>
                            <div className="flex justify-between items-baseline"><span className="text-muted-foreground">Примерная стоимость:</span><span className="text-2xl font-bold">{chemicalCost.toLocaleString('ru-RU')} руб.</span></div>
                        </CardContent>
                    </Card>
                </ChemicalConsumptionDialog>

                {/* Employee Canisters Card */}
                {isManagerView && (
                    <EmployeeCanistersCard employeeId={employee.id} employeeName={employee.fullName} />
                )}
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            {!embedded && (
                 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <DateRangePicker date={dateRange} setDate={setDateRange} />
                    {isManagerView && <AddTransactionDialog employee={employee} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting} onTransactionAdded={handleTransactionAdded}/>}
                </div>
            )}
            {mainContent}
        </div>
    );
}
