
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import React, { useEffect, useMemo } from 'react';
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

import { Save, X, ListPlus, Trash2, Calendar, Clock, Car, Users, DollarSign, Briefcase, CreditCard, Landmark, ChevronDown, ListChecks, Cog, PlusCircle, Wand } from "lucide-react";


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


  useEffect(() => {
    // Reset service selection when payment method or source changes
    form.setValue("services.main", { serviceName: '', price: 0, chemicalConsumption: 0 });
    form.setValue("services.additional", []);
  }, [paymentMethod, sourceId, form.setValue]);
  

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

    // Logic to update sourceName only when sourceId or paymentMethod changes it.
    if (data.sourceId !== initialData.sourceId || data.paymentMethod !== initialData.paymentMethod) {
        if (data.paymentMethod === 'aggregator') {
            const source = aggregators.find(a => a.id === data.sourceId);
            newSourceName = source?.name;
        } else if (data.paymentMethod === 'counterAgentContract') {
            const source = counterAgents.find(c => c.id === data.sourceId);
            newSourceName = source?.name;
        } else {
            // It's a retail payment, so clear the source info
            newSourceName = undefined;
            newSourceId = undefined;
        }
    }
    
    const { editHistory, ...previousState } = initialData;

    const newHistoryEntry: WashEventEditHistory = {
        editedAt: new Date().toISOString(),
        editedBy: loggedInEmployee.id,
        previousState: previousState,
    };
    
    const updatedEditHistory = [...(initialData.editHistory || []), newHistoryEntry];


    const eventToSave: WashEvent = {
      ...initialData,
      vehicleNumber: normalizeLicensePlate(data.vehicleNumber),
      timestamp: combinedTimestamp.toISOString(),
      employeeIds: data.employeeIds,
      paymentMethod: data.paymentMethod,
      sourceId: newSourceId,
      sourceName: newSourceName,
      services: data.services,
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
             {/* General Info Card */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Car />Общая информация</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="vehicleNumber" render={({ field }) => (
                  <FormItem><FormLabel>Гос. номер</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-2">
                  <FormField control={form.control} name="date" render={({ field }) => (
                    <FormItem><FormLabel>Дата</FormLabel><FormControl>
                      <DatePicker date={field.value} setDate={field.onChange} className="w-full" />
                    </FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="time" render={({ field }) => (
                    <FormItem><FormLabel>Время</FormLabel><FormControl><Input type="time" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="employeeIds" render={({ field }) => (
                    <FormItem className="md:col-span-2">
                        <FormLabel>Исполнители</FormLabel>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-between font-normal">
                                    {field.value?.length > 0 ? `${field.value.length} сотрудников выбрано` : "Выберите исполнителей"}
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
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

            {/* Payment Method Card */}
            <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard />Оплата</CardTitle></CardHeader>
                <CardContent>
                    <FormField control={form.control} name="paymentMethod" render={({ field }) => (
                        <FormItem>
                            <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                            {(Object.keys(paymentMethodLabels) as Array<keyof typeof paymentMethodLabels>).map(method => (
                                <FormItem key={method}><FormControl>
                                <RadioGroupItem value={method} className="sr-only" />
                                </FormControl><Label className={cn(
                                    "flex items-center justify-center gap-2 p-3 border rounded-md cursor-pointer hover:bg-accent/50",
                                    field.value === method && "border-primary bg-primary/10"
                                )}>
                                    {React.createElement(paymentMethodIcons[method], {className: "h-4 w-4"})}
                                    {paymentMethodLabels[method]}
                                </Label></FormItem>
                            ))}
                            </RadioGroup>
                            <FormMessage />
                        </FormItem>
                    )} />
                    {(paymentMethod === 'aggregator' || paymentMethod === 'counterAgentContract') && (
                        <FormField control={form.control} name="sourceId" render={({ field }) => (
                            <FormItem className="mt-4">
                                <FormLabel>Источник</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger>
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

             {/* Services Card */}
            {currentServiceSource && (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ListChecks />Услуги</CardTitle>
                    <CardDescription>Выберите основную и добавьте дополнительные услуги.</CardDescription>
                </CardHeader>
                <CardContent>
                    <h3 className="text-md font-semibold mb-2">Основная услуга</h3>
                    <ScrollArea className="h-48 pr-3 mb-4"><div className="space-y-1">
                        {currentServiceSource.main.map(service => (
                            <Button key={service.serviceName} type="button" variant={mainService?.serviceName === service.serviceName ? 'default' : 'outline'} className="w-full justify-between h-auto py-2" onClick={() => form.setValue("services.main", { ...service, chemicalConsumption: service.chemicalConsumption || 0 }, { shouldDirty: true })}>
                                <span className="text-left whitespace-normal">{service.serviceName}</span>
                                <span className="font-bold">{service.price} руб.</span>
                            </Button>
                        ))}
                    </div></ScrollArea>
                    <Separator />
                    <h3 className="text-md font-semibold mt-4 mb-2">Дополнительные услуги</h3>
                    <div className="space-y-2">
                        {additionalServices.map((service, index) => (
                           <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                             <span>{service.serviceName}</span>
                             <div className="flex items-center gap-2">
                               <span>{service.price} руб.</span>
                               <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeAdditionalService(index)}><Trash2 className="h-4 w-4" /></Button>
                             </div>
                           </div>
                        ))}
                    </div>
                    
                    {currentServiceSource.additional.length > 0 && (
                        <Popover><PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="sm" className="mt-2"><PlusCircle className="mr-2 h-4 w-4"/>Добавить из списка</Button>
                        </PopoverTrigger><PopoverContent>
                            <ScrollArea className="h-48"><div className="space-y-1">
                                {currentServiceSource.additional.map(service => (
                                    <Button key={service.serviceName} type="button" variant="ghost" className="w-full justify-start" onClick={() => appendAdditionalService({ ...service, chemicalConsumption: service.chemicalConsumption || 0 })}>{service.serviceName} ({service.price} руб.)</Button>
                                ))}
                            </div></ScrollArea>
                        </PopoverContent></Popover>
                    )}

                </CardContent>
            </Card>
            )}

          </div>

          {/* Summary Column */}
          <div className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader><CardTitle>Сводка по мойке</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Основная услуга:</span> <span className="font-semibold">{mainService?.price?.toFixed(2) || '0.00'} руб.</span></div>
                <div className="flex justify-between items-center"><span className="text-muted-foreground">Доп. услуги:</span> <span className="font-semibold">{additionalServices.reduce((sum, s) => sum + s.price, 0).toFixed(2)} руб.</span></div>
                <Separator />
                <div className="flex justify-between items-center text-lg"><span className="text-muted-foreground">Итого:</span> <span className="font-bold">{totalAmount.toFixed(2)} руб.</span></div>
                {paymentMethod === 'card' && acquiringFee > 0 && (
                    <>
                    <div className="flex justify-between items-center text-sm"><span className="text-muted-foreground">Эквайринг ({retailPriceConfig.cardAcquiringPercentage}%):</span> <span className="font-semibold text-destructive">-{acquiringFee.toFixed(2)} руб.</span></div>
                     <div className="flex justify-between items-center font-semibold"><span className="text-muted-foreground">К получению:</span> <span>{netAmount.toFixed(2)} руб.</span></div>
                    </>
                )}
              </CardContent>
              <CardContent>
                <div className="flex flex-col space-y-2">
                    <Button type="submit" size="lg" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                        <Save className="mr-2 h-4 w-4" /> Сохранить изменения
                    </Button>
                    <Button type="button" variant="outline" size="lg" onClick={() => router.push('/wash-log')}>
                        <X className="mr-2 h-4 w-4" /> Отмена
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
