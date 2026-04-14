
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO, setHours, setMinutes, setSeconds, startOfMinute } from "date-fns";
import type { WashEvent, Employee, CounterAgent, Aggregator, RetailPriceConfig, PriceListItem, PaymentType, WashEventEditHistory } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { normalizeLicensePlate, cn } from "@/lib/utils";

import { Save, X, ListPlus, Trash2, Calendar, Clock, Car, Users, DollarSign, Briefcase, CreditCard, Landmark, ChevronDown, ListChecks, Cog, PlusCircle, Wand, ArrowLeft, Check, Pencil, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";


const washEventSchema = z.object({
  vehicleNumber: z.string().min(1, "Гос. номер не может быть пустым."),
  date: z.date({ required_error: "Необходимо выбрать дату." }),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Неверный формат времени."),
  employeeIds: z.array(z.string()).min(1, "Выберите хотя бы одного исполнителя."),
  paymentMethod: z.enum(["cash", "card", "transfer", "aggregator", "counterAgentContract"]),
  sourceId: z.string().optional(),
  services: z.object({
    main: z.object({
      serviceName: z.string(),
      price: z.number(),
      chemicalConsumption: z.number().optional(),
      isCustom: z.boolean().optional(),
    }),
    additional: z.array(z.object({
      serviceName: z.string(),
      price: z.number(),
      chemicalConsumption: z.number().optional(),
      isCustom: z.boolean().optional(),
    })),
  }).refine(data => data.main.serviceName !== '', {
    message: "Необходимо выбрать основную услугу.",
    path: ['main'],
  }),
});

type WashEventFormValues = z.infer<typeof washEventSchema>;

interface WashEventFormProps {
    initialData: WashEvent;
    employees: Employee[];
    counterAgents: CounterAgent[];
    aggregators: Aggregator[];
    retailPriceConfig: RetailPriceConfig;
}

export function WashEventForm({ initialData, employees, counterAgents, aggregators, retailPriceConfig }: WashEventFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { employee: loggedInEmployee } = useAuth();

  const form = useForm<WashEventFormValues>({
    resolver: zodResolver(washEventSchema),
    defaultValues: {
      vehicleNumber: initialData.vehicleNumber,
      date: parseISO(initialData.timestamp),
      time: format(parseISO(initialData.timestamp), "HH:mm"),
      employeeIds: initialData.employeeIds,
      paymentMethod: initialData.paymentMethod,
      sourceId: initialData.sourceId,
      services: initialData.services,
    },
    mode: "onChange",
  });

  const { fields: additionalServicesFields, append: appendAdditionalService, remove: removeAdditionalService } = useFieldArray({
    control: form.control,
    name: "services.additional",
  });
  
  const paymentMethod = useWatch({ control: form.control, name: "paymentMethod" });
  const sourceId = useWatch({ control: form.control, name: "sourceId" });
  const mainService = useWatch({ control: form.control, name: "services.main" });
  const additionalServices = useWatch({ control: form.control, name: "services.additional" });


  const paymentMethodLabels: Record<WashEvent['paymentMethod'], string> = {
    cash: 'Наличные', card: 'Карта', transfer: 'Перевод',
    aggregator: 'Агрегатор', counterAgentContract: 'Контрагент',
  };

  const paymentMethodIcons: Record<WashEvent['paymentMethod'], React.ElementType> = {
    cash: DollarSign, card: CreditCard, transfer: Landmark,
    aggregator: Briefcase, counterAgentContract: Users,
  };


  // Track whether payment/source have changed from initial values
  const isInitialRender = useRef(true);
  const prevPaymentMethod = useRef(paymentMethod);
  const prevSourceId = useRef(sourceId);

  useEffect(() => {
    // Skip initial render to preserve pre-loaded services
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    // Only reset if payment method or source actually changed (not on mount)
    if (prevPaymentMethod.current !== paymentMethod || prevSourceId.current !== sourceId) {
      form.setValue("services.main", { serviceName: '', price: 0, chemicalConsumption: 0 });
      form.setValue("services.additional", []);
      prevPaymentMethod.current = paymentMethod;
      prevSourceId.current = sourceId;
    }
  }, [paymentMethod, sourceId, form]);
  

  const currentServiceSource = useMemo(() => {
    switch (paymentMethod) {
      case 'cash':
      case 'card':
      case 'transfer':
        return {
          type: 'retail' as const,
          main: retailPriceConfig.mainPriceList,
          additional: retailPriceConfig.additionalPriceList,
          allowCustom: retailPriceConfig.allowCustomRetailServices,
        };
      case 'aggregator':
        const agg = aggregators.find(a => a.id === sourceId);
        if (!agg) return null;
        const activePriceList = agg.priceLists.find(pl => pl.name === agg.activePriceListName) ?? agg.priceLists[0];
        return { type: 'aggregator' as const, main: activePriceList?.services || [], additional: [], allowCustom: false };
      case 'counterAgentContract':
        const agent = counterAgents.find(a => a.id === sourceId);
        if (!agent) return null;
        return {
          type: 'counterAgent' as const,
          main: agent.priceList || [],
          additional: agent.additionalPriceList || [],
          allowCustom: agent.allowCustomServices,
        };
      default:
        return null;
    }
  }, [paymentMethod, sourceId, retailPriceConfig, aggregators, counterAgents]);


  const totalAmount = useMemo(() => {
    const mainPrice = mainService?.price || 0;
    const additionalPrice = additionalServices.reduce((sum, s) => sum + s.price, 0);
    return mainPrice + additionalPrice;
  }, [mainService, additionalServices]);

  const acquiringFee = useMemo(() => {
    return paymentMethod === 'card' ? totalAmount * ((retailPriceConfig.cardAcquiringPercentage || 0) / 100) : 0;
  }, [paymentMethod, totalAmount, retailPriceConfig.cardAcquiringPercentage]);
  
  const netAmount = totalAmount - acquiringFee;

  async function onSubmit(data: WashEventFormValues) {
    if (!loggedInEmployee) {
        toast({ title: "Ошибка", description: "Не удалось определить пользователя для сохранения истории. Пожалуйста, войдите снова.", variant: "destructive"});
        return;
    }

    const [hours, minutes] = data.time.split(':').map(Number);
    const combinedTimestamp = setSeconds(setMinutes(setHours(data.date, hours), minutes), 0);
    
    let newSourceName = initialData.sourceName;
    let newSourceId = data.sourceId;
    let newPriceListName = initialData.priceListName;

    // Logic to update sourceName/priceListName when sourceId or paymentMethod changes
    if (data.sourceId !== initialData.sourceId || data.paymentMethod !== initialData.paymentMethod) {
        if (data.paymentMethod === 'aggregator') {
            const source = aggregators.find(a => a.id === data.sourceId);
            newSourceName = source?.name;
            // Sync priceListName with aggregator's active price list
            newPriceListName = source?.activePriceListName;
        } else if (data.paymentMethod === 'counterAgentContract') {
            const source = counterAgents.find(c => c.id === data.sourceId);
            newSourceName = source?.name;
            newPriceListName = undefined;
        } else {
            // It's a retail payment, so clear the source info
            newSourceName = undefined;
            newSourceId = undefined;
            newPriceListName = undefined;
        }
    }
    
    const { editHistory, ...previousState } = initialData;

    const newHistoryEntry: WashEventEditHistory = {
        editedAt: new Date().toISOString(),
        editedBy: loggedInEmployee.id,
        previousState: previousState,
    };
    
    const updatedEditHistory = [...(initialData.editHistory || []), newHistoryEntry];


    // Recalculate employeeConsumptions for each service when employees change
    const newEmployeeIds = data.employeeIds;
    const recalcService = (service: typeof data.services.main) => {
      const consumption = service.chemicalConsumption || 0;
      if (consumption > 0 && newEmployeeIds.length > 0) {
        const perEmployee = Math.round(consumption / newEmployeeIds.length);
        return {
          ...service,
          employeeConsumptions: newEmployeeIds.map(id => ({ employeeId: id, amount: perEmployee })),
        };
      }
      // If no consumption defined, still sync employee list
      return {
        ...service,
        employeeConsumptions: newEmployeeIds.map(id => ({ employeeId: id, amount: 0 })),
      };
    };

    const updatedServices = {
      main: recalcService(data.services.main),
      additional: data.services.additional.map(s => recalcService(s)),
    };

    const eventToSave: WashEvent = {
      ...initialData,
      vehicleNumber: normalizeLicensePlate(data.vehicleNumber),
      timestamp: combinedTimestamp.toISOString(),
      employeeIds: data.employeeIds,
      paymentMethod: data.paymentMethod,
      sourceId: newSourceId,
      sourceName: newSourceName,
      priceListName: newPriceListName,
      services: updatedServices,
      totalAmount: totalAmount,
      acquiringFee: acquiringFee,
      netAmount: netAmount,
      editHistory: updatedEditHistory,
    };

     try {
      const response = await fetch(`/api/wash-events/${initialData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventToSave),
      });
      if (!response.ok) throw new Error("Не удалось сохранить изменения.");
      toast({ title: "Успех!", description: "Запись о мойке успешно обновлена."});
      router.push('/wash-log');
      router.refresh();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    }
  }

  const [showServicePicker, setShowServicePicker] = useState(!mainService?.serviceName);

  // Helper to get employee short name
  const getEmpName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    if (!emp) return id;
    const parts = emp.fullName.split(' ');
    return parts.length >= 2 ? `${parts[0]} ${parts[1][0]}.` : emp.fullName;
  };

  // Detect changes from initial data
  const hasChanges = form.formState.isDirty;
  const employeesChanged = JSON.stringify(form.getValues('employeeIds').sort()) !== JSON.stringify(initialData.employeeIds.sort());
  const serviceChanged = mainService?.serviceName !== initialData.services.main.serviceName;
  const amountChanged = totalAmount !== initialData.totalAmount;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">

            {/* General Info + Employees — compact single card */}
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-4">
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                  <FormField control={form.control} name="vehicleNumber" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs text-muted-foreground">Гос. номер</FormLabel><FormControl><Input {...field} className="text-lg font-semibold h-10" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs text-muted-foreground">Дата</FormLabel><FormControl>
                      <DatePicker date={field.value} setDate={field.onChange} className="w-full" />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="time" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs text-muted-foreground">Время</FormLabel><FormControl><Input type="time" {...field} className="h-10" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                {/* Employees — chips with popover to edit */}
                <FormField control={form.control} name="employeeIds" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" /> Исполнители
                          {employeesChanged && <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">изменено</Badge>}
                        </FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md cursor-pointer hover:bg-muted/30 min-h-[40px] items-center">
                                    {field.value?.length > 0 ? field.value.map(id => (
                                        <Badge key={id} variant="secondary" className="text-sm py-1 px-2.5">
                                            {getEmpName(id)}
                                        </Badge>
                                    )) : <span className="text-sm text-muted-foreground">Выберите исполнителей</span>}
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
                                </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                <ScrollArea className="h-60"><div className="p-2 space-y-1">
                                {employees.map(emp => (
                                    <FormItem key={emp.id} className="flex flex-row items-center space-x-3 space-y-0 p-2 hover:bg-muted rounded-md">
                                    <FormControl><Checkbox
                                        checked={field.value.includes(emp.id)}
                                        onCheckedChange={(checked) => {
                                        return checked
                                            ? field.onChange([...field.value, emp.id])
                                            : field.onChange(field.value.filter(id => id !== emp.id))
                                        }}
                                    /></FormControl>
                                    <FormLabel className="font-normal flex-1 cursor-pointer">{emp.fullName}</FormLabel>
                                    </FormItem>
                                ))}
                                </div></ScrollArea>
                            </PopoverContent>
                        </Popover>
                        <FormMessage />
                    </FormItem>
                )} />
              </CardContent>
            </Card>

            {/* Payment — compact row */}
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-3">
                <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                    <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">Способ оплаты</FormLabel>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-5 gap-1.5">
                        {(Object.keys(paymentMethodLabels) as Array<keyof typeof paymentMethodLabels>).map(method => (
                            <FormItem key={method}><FormControl>
                            <RadioGroupItem value={method} className="sr-only" />
                            </FormControl><Label className={cn(
                                "flex items-center justify-center gap-1.5 p-2.5 border rounded-md cursor-pointer hover:bg-accent/50 text-xs",
                                field.value === method && "border-primary bg-primary/10 font-medium"
                            )}>
                                {React.createElement(paymentMethodIcons[method], {className: "h-3.5 w-3.5"})}
                                {paymentMethodLabels[method]}
                            </Label></FormItem>
                        ))}
                        </RadioGroup>
                        <FormMessage />
                    </FormItem>
                )} />
                {(paymentMethod === 'aggregator' || paymentMethod === 'counterAgentContract') && (
                    <FormField control={form.control} name="sourceId" render={({ field }) => (
                        <FormItem>
                            <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl><SelectTrigger className="h-9">
                                    <SelectValue placeholder={`Выберите ${paymentMethod === 'aggregator' ? 'агрегатора' : 'контрагента'}`} />
                                </SelectTrigger></FormControl>
                                <SelectContent>
                                {(paymentMethod === 'aggregator' ? aggregators : counterAgents).map(source => (
                                    <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                                ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )} />
                )}
              </CardContent>
            </Card>

            {/* Services — selected service shown prominently, picker toggleable */}
            {currentServiceSource && (
            <Card className="shadow-sm">
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <ListChecks className="h-4 w-4" /> Основная услуга
                    {serviceChanged && <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0">изменено</Badge>}
                  </h3>
                  {mainService?.serviceName && (
                    <Button type="button" variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={() => setShowServicePicker(!showServicePicker)}>
                      <Pencil className="h-3 w-3" /> {showServicePicker ? 'Скрыть список' : 'Изменить'}
                    </Button>
                  )}
                </div>

                {/* Currently selected service — always visible */}
                {mainService?.serviceName ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium">{mainService.serviceName}</span>
                    </div>
                    <span className="font-bold text-primary">{mainService.price} ₽</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">Выберите основную услугу</span>
                  </div>
                )}

                {/* Service picker — collapsible */}
                {(showServicePicker || !mainService?.serviceName) && (
                  <ScrollArea className="h-52 pr-3 border rounded-md"><div className="p-1 space-y-0.5">
                    {currentServiceSource.main.map(service => (
                      <Button key={service.serviceName} type="button"
                        variant={mainService?.serviceName === service.serviceName ? 'default' : 'ghost'}
                        className="w-full justify-between h-auto py-2 text-sm"
                        onClick={() => {
                          form.setValue("services.main", { ...service, chemicalConsumption: service.chemicalConsumption || 0 }, { shouldDirty: true });
                          setShowServicePicker(false);
                        }}
                      >
                        <span className="text-left whitespace-normal">{service.serviceName}</span>
                        <span className="font-semibold ml-2 flex-shrink-0">{service.price} ₽</span>
                      </Button>
                    ))}
                  </div></ScrollArea>
                )}

                {/* Additional services */}
                {(additionalServices.length > 0 || (currentServiceSource.additional.length > 0)) && (
                  <>
                    <Separator />
                    <h3 className="text-sm font-semibold">Дополнительные услуги</h3>
                    <div className="space-y-1.5">
                      {additionalServices.map((service, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded-md text-sm">
                          <span>{service.serviceName}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{service.price} ₽</span>
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeAdditionalService(index)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {currentServiceSource.additional.length > 0 && (
                      <Popover><PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="text-xs h-8"><PlusCircle className="mr-1.5 h-3.5 w-3.5"/>Добавить</Button>
                      </PopoverTrigger><PopoverContent>
                        <ScrollArea className="h-48"><div className="space-y-1">
                          {currentServiceSource.additional.map(service => (
                            <Button key={service.serviceName} type="button" variant="ghost" className="w-full justify-start text-sm" onClick={() => appendAdditionalService({ ...service, chemicalConsumption: service.chemicalConsumption || 0 })}>{service.serviceName} ({service.price} ₽)</Button>
                          ))}
                        </div></ScrollArea>
                      </PopoverContent></Popover>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            )}

          </div>

          {/* Summary Column — sticky sidebar */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20 shadow-sm">
              <CardContent className="pt-5 space-y-4">
                {/* Service & amount summary */}
                <div className="space-y-2.5">
                  {mainService?.serviceName && (
                    <div>
                      <p className="text-xs text-muted-foreground">Услуга</p>
                      <p className="text-sm font-medium leading-tight">{mainService.serviceName}</p>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Основная:</span>
                    <span className="font-medium">{mainService?.price || 0} ₽</span>
                  </div>
                  {additionalServices.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Доп. ({additionalServices.length}):</span>
                      <span className="font-medium">{additionalServices.reduce((s, v) => s + v.price, 0)} ₽</span>
                    </div>
                  )}
                  {paymentMethod === 'card' && acquiringFee > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Эквайринг ({retailPriceConfig.cardAcquiringPercentage}%):</span>
                      <span className="text-destructive">-{acquiringFee.toFixed(0)} ₽</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">Итого:</span>
                    <span className="text-2xl font-bold">{totalAmount.toLocaleString('ru-RU')} <span className="text-base font-normal text-muted-foreground">₽</span></span>
                  </div>
                  {amountChanged && (
                    <div className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      было: {initialData.totalAmount.toLocaleString('ru-RU')} ₽
                    </div>
                  )}
                </div>

                {/* Employees in summary */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Команда</p>
                  <div className="flex flex-wrap gap-1">
                    {form.getValues('employeeIds').map(id => (
                      <Badge key={id} variant="secondary" className="text-xs">{getEmpName(id)}</Badge>
                    ))}
                  </div>
                </div>

                {/* Payment badge */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {React.createElement(paymentMethodIcons[paymentMethod], {className: "h-3.5 w-3.5"})}
                  <span>{paymentMethodLabels[paymentMethod]}</span>
                  {sourceId && (paymentMethod === 'aggregator' || paymentMethod === 'counterAgentContract') && (
                    <span className="text-foreground font-medium">
                      • {(paymentMethod === 'aggregator' ? aggregators : counterAgents).find(s => s.id === sourceId)?.name}
                    </span>
                  )}
                </div>

                <Separator />

                {/* Action buttons */}
                <div className="flex flex-col space-y-2">
                  <Button type="submit" disabled={form.formState.isSubmitting || !hasChanges} className="gap-2">
                    <Save className="h-4 w-4" /> Сохранить
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => router.push('/wash-log')} className="text-xs text-muted-foreground">
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Назад к журналу
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  )
}
