
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ListPlus, Trash2, Save, Loader2, AlertTriangle, Cog, Printer, Lightbulb, Sparkles, User, Calendar } from "lucide-react";
import type { RetailPriceConfig, WashEvent, Employee } from "@/types";
import { useToast } from "@/hooks/use-toast";
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { getRetailPriceConfig } from "@/lib/data-loader";
import { useReactToPrint } from "react-to-print";
import { PrintablePriceList } from "./PrintablePriceList";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const priceListItemSchema = z.object({
  serviceName: z.string().min(1, "Название услуги не может быть пустым."),
  price: z.coerce.number().min(0, "Цена должна быть положительным числом или нулем."),
  chemicalConsumption: z.coerce.number().min(0, "Расход должен быть положительным числом или нулем.").optional(),
});

const formSchema = z.object({
  mainPriceList: z.array(priceListItemSchema),
  additionalPriceList: z.array(priceListItemSchema),
  allowCustomRetailServices: z.boolean().optional(),
  cardAcquiringPercentage: z.coerce.number().min(0, "Процент не может быть отрицательным").max(100, "Процент не может быть больше 100").optional(),
  dismissedCustomServices: z.array(z.string()).optional(),
});

type RetailPriceListFormValues = z.infer<typeof formSchema>;

interface SuggestedService {
    name: string;
    count: number;
    avgPrice: number;
    creators: { id: string; name: string }[];
    dates: string[];
}

const SuggestedServices = ({
    washEvents,
    employees,
    onAddToMain,
    onAddToAdditional,
    onDismiss,
    dismissedServices,
}: {
    washEvents: WashEvent[];
    employees: Employee[];
    onAddToMain: (name: string, price: number) => void;
    onAddToAdditional: (name: string, price: number) => void;
    onDismiss: (name: string) => void;
    dismissedServices: string[];
}) => {
    const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e.fullName])), [employees]);

    const suggestions = useMemo(() => {
        const customServices = new Map<string, { prices: number[], creators: Set<string>, dates: string[] }>();

        washEvents.forEach(event => {
            const allServices = [event.services.main, ...event.services.additional];
            allServices.forEach(service => {
                if (service?.isCustom) {
                    if (dismissedServices.includes(service.serviceName)) return;

                    if (!customServices.has(service.serviceName)) {
                        customServices.set(service.serviceName, { prices: [], creators: new Set(), dates: [] });
                    }
                    const entry = customServices.get(service.serviceName)!;
                    entry.prices.push(service.price);
                    entry.dates.push(event.timestamp);
                    event.employeeIds.forEach(id => entry.creators.add(id));
                }
            });
        });
        
        return Array.from(customServices.entries()).map(([name, data]) => ({
            name,
            count: data.prices.length,
            avgPrice: Math.round(data.prices.reduce((a, b) => a + b, 0) / data.prices.length / 50) * 50,
            creators: Array.from(data.creators).map(id => ({ id, name: employeeMap.get(id) || 'Неизвестно' })),
            dates: data.dates.sort((a,b) => new Date(b).getTime() - new Date(a).getTime()),
        })).sort((a, b) => b.count - a.count);

    }, [washEvents, employeeMap, dismissedServices]);

    if (suggestions.length === 0) {
        return null;
    }

    return (
         <Card className="shadow-md border-amber-300 bg-amber-50">
            <CardHeader>
                <CardTitle className="font-headline text-lg flex items-center gap-2 text-amber-900"><Sparkles className="text-amber-500"/>Предложенные услуги</CardTitle>
                <CardDescription className="text-amber-800">
                    Это услуги, которые сотрудники добавляли вручную. Проанализируйте их и добавьте в прайс или скройте.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <Accordion type="multiple" className="w-full">
                {suggestions.map(s => (
                     <AccordionItem value={s.name} key={s.name}>
                        <AccordionTrigger className="hover:no-underline p-2 bg-white rounded-md border text-left">
                            <div className="flex-1">
                                <p className="font-semibold text-base">{s.name}</p>
                                <p className="text-xs text-muted-foreground">Использовано: {s.count} раз(а), средняя цена: ~{s.avgPrice} руб.</p>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 px-2 space-y-3">
                           <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-xs font-semibold flex items-center gap-1.5"><User className="h-3 w-3"/>Добавляли сотрудники:</h4>
                                    <ul className="text-xs list-disc pl-5 text-muted-foreground">
                                        {s.creators.map(c => <li key={c.id}>{c.name}</li>)}
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold flex items-center gap-1.5"><Calendar className="h-3 w-3"/>Даты добавления:</h4>
                                     <ul className="text-xs list-disc pl-5 text-muted-foreground">
                                        {s.dates.slice(0, 3).map(d => <li key={d}>{format(new Date(d), 'dd.MM.yyyy HH:mm', {locale: ru})}</li>)}
                                        {s.dates.length > 3 && <li>и еще {s.dates.length - 3}...</li>}
                                    </ul>
                                </div>
                           </div>
                            <div className="flex gap-2 justify-end pt-2 border-t mt-2">
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDismiss(s.name)}>
                                    <Trash2 className="mr-2 h-4 w-4" /> Скрыть
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onAddToAdditional(s.name, s.avgPrice)}>
                                    В доп. прайс
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => onAddToMain(s.name, s.avgPrice)}>
                                    В осн. прайс
                                </Button>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
                </Accordion>
            </CardContent>
        </Card>
    )
}

interface RetailPriceListFormProps {
    allWashEvents: WashEvent[];
    allEmployees: Employee[];
}

export function RetailPriceListForm({ allWashEvents, allEmployees }: RetailPriceListFormProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);
  
  const form = useForm<RetailPriceListFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mainPriceList: [],
      additionalPriceList: [],
      allowCustomRetailServices: true,
      cardAcquiringPercentage: 1.2,
      dismissedCustomServices: [],
    },
    mode: "onChange",
  });
  
  const mainPriceList = useWatch({ control: form.control, name: "mainPriceList" });
  const additionalPriceList = useWatch({ control: form.control, name: "additionalPriceList" });
  const dismissedCustomServices = useWatch({ control: form.control, name: "dismissedCustomServices" });


  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: "Прайс-лист Автомойки",
  });
  
  const { fields: mainFields, append: appendMain, remove: removeMain } = useFieldArray({
    control: form.control,
    name: "mainPriceList",
  });

  const { fields: additionalFields, append: appendAdditional, remove: removeAdditional } = useFieldArray({
    control: form.control,
    name: "additionalPriceList",
  });

  const addServiceToMain = (name: string, price: number) => {
    appendMain({ serviceName: name, price, chemicalConsumption: 0 });
    toast({ title: "Услуга добавлена", description: `"${name}" добавлена в основной прайс-лист. Не забудьте сохранить изменения.` });
  };
  const addServiceToAdditional = (name: string, price: number) => {
    appendAdditional({ serviceName: name, price, chemicalConsumption: 0 });
    toast({ title: "Услуга добавлена", description: `"${name}" добавлена в дополнительный прайс-лист. Не забудьте сохранить изменения.` });
  };
  const handleDismissService = (name: string) => {
    const currentDismissed = form.getValues("dismissedCustomServices") || [];
    if (!currentDismissed.includes(name)) {
        form.setValue("dismissedCustomServices", [...currentDismissed, name], { shouldDirty: true });
        toast({ title: "Предложение скрыто", description: `Услуга "${name}" больше не будет появляться в предложениях.`});
    }
  };


  useEffect(() => {
    async function fetchPriceList() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await getRetailPriceConfig();
        form.reset({
          mainPriceList: data.mainPriceList || [],
          additionalPriceList: data.additionalPriceList || [],
          allowCustomRetailServices: data.allowCustomRetailServices ?? true,
          cardAcquiringPercentage: data.cardAcquiringPercentage ?? 1.2,
          dismissedCustomServices: data.dismissedCustomServices || [],
        });
      } catch (e: any) {
        setError(e.message || "Произошла ошибка при загрузке данных.");
        toast({ title: "Ошибка", description: e.message, variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    }
    fetchPriceList();
  }, [form, toast]);

  async function onSubmit(data: RetailPriceListFormValues) {
    try {
      const response = await fetch('/api/retail-price-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Не удалось сохранить прайс-лист.`);
      }
      
      toast({
        title: "Успешно!",
        description: `Розничный прайс-лист успешно обновлен.`,
        variant: "default"
      });
      form.reset(data); // Re-sync form state with saved data
    } catch (error: any) {
      console.error("Error saving retail price list:", error);
      toast({
        title: "Ошибка сохранения",
        description: error.message,
        variant: "destructive",
      });
    }
  }
  
  if (isLoading) {
    return (
        <div className="flex items-center justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-muted-foreground">Загрузка прайс-листа...</p>
        </div>
    );
  }
  
  if (error) {
      return (
          <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Ошибка Загрузки</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
          </Alert>
      );
  }
  
  return (
    <Form {...form}>
       <div style={{ display: "none" }}>
        <div ref={printRef}>
          <PrintablePriceList 
            mainPriceList={mainPriceList}
            additionalPriceList={additionalPriceList}
          />
        </div>
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
        
        <SuggestedServices 
            washEvents={allWashEvents}
            employees={allEmployees}
            onAddToMain={addServiceToMain}
            onAddToAdditional={addServiceToAdditional}
            onDismiss={handleDismissService}
            dismissedServices={dismissedCustomServices || []}
        />

        <div className="flex justify-end">
            <Button type="button" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Распечатать прайс-лист
            </Button>
        </div>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-lg">Основные услуги</CardTitle>
            <CardDescription>Управляйте основными услугами и ценами для клиентов, оплачивающих наличными или картой. Эти цены будут использоваться на рабочей станции.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mainFields.map((field, index) => (
              <div key={field.id} className="p-4 border rounded-lg space-y-3 relative bg-background shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <FormField
                    control={form.control}
                    name={`mainPriceList.${index}.serviceName`}
                    render={({ field: serviceNameField }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Название услуги №{index + 1}</FormLabel>
                        <FormControl>
                          <Input placeholder="например, Седельный тягач (европеец)" {...serviceNameField} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`mainPriceList.${index}.price`}
                    render={({ field: priceField }) => (
                      <FormItem>
                        <FormLabel>Цена (руб.)</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="1100" {...priceField} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`mainPriceList.${index}.chemicalConsumption`}
                    render={({ field: chemicalField }) => (
                        <FormItem>
                            <FormLabel>Расход химии (гр.)</FormLabel>
                            <FormControl>
                                <Input type="number" placeholder="300" {...chemicalField} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                 <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMain(index)}
                    aria-label="Удалить услугу"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendMain({ serviceName: "", price: 0, chemicalConsumption: 0 })}
              className="mt-2"
            >
              <ListPlus className="mr-2 h-4 w-4" /> Добавить основную услугу
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-md">
            <CardHeader>
                <CardTitle className="font-headline text-lg flex items-center gap-2"><Cog className="h-5 w-5"/>Дополнительные услуги и настройки</CardTitle>
                <CardDescription>Управляйте дополнительными услугами и возможностью добавлять произвольные услуги для розничных клиентов.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <FormField
                    control={form.control}
                    name="allowCustomRetailServices"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                        <div className="space-y-0.5">
                            <FormLabel className="text-base">
                            Разрешить произвольные доп. услуги
                            </FormLabel>
                            <FormDescription>
                            Разрешить сотруднику на рабочей станции добавлять кастомные услуги с произвольным названием и ценой для розничных клиентов.
                            </FormDescription>
                        </div>
                        <FormControl>
                            <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label="Разрешить произвольные доп. услуги для розницы"
                            />
                        </FormControl>
                        </FormItem>
                    )}
                />
                 <FormField
                    control={form.control}
                    name="cardAcquiringPercentage"
                    render={({ field }) => (
                        <FormItem className="rounded-lg border p-4 shadow-sm">
                          <FormLabel className="text-base">Комиссия за эквайринг по картам</FormLabel>
                           <div className="flex items-center gap-2">
                             <FormControl>
                                <Input type="number" placeholder="1.2" {...field} />
                              </FormControl>
                              <span className="text-lg font-semibold text-muted-foreground">%</span>
                           </div>
                          <FormDescription>
                            Укажите процент, который банк взимает за обработку платежей по картам.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                    )}
                />
                <Separator />
                <div>
                  <h3 className="text-md font-semibold mb-2">Прайс-лист на доп. услуги</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                      Список предопределенных дополнительных услуг (например, мойка двигателя).
                  </p>
                  {additionalFields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-3 relative bg-background shadow-sm mb-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                      <FormField
                          control={form.control}
                          name={`additionalPriceList.${index}.serviceName`}
                          render={({ field: serviceNameField }) => (
                          <FormItem className="md:col-span-2">
                              <FormLabel>Название доп. услуги №{index + 1}</FormLabel>
                              <FormControl>
                              <Input placeholder="например, Мойка двигателя" {...serviceNameField} />
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                      <FormField
                          control={form.control}
                          name={`additionalPriceList.${index}.price`}
                          render={({ field: priceField }) => (
                          <FormItem>
                              <FormLabel>Цена (руб.)</FormLabel>
                              <FormControl>
                              <Input type="number" placeholder="850" {...priceField} />
                              </FormControl>
                              <FormMessage />
                          </FormItem>
                          )}
                      />
                       <FormField
                        control={form.control}
                        name={`additionalPriceList.${index}.chemicalConsumption`}
                        render={({ field: chemicalField }) => (
                            <FormItem>
                                <FormLabel>Расход химии (гр.)</FormLabel>
                                <FormControl>
                                    <Input type="number" placeholder="100" {...chemicalField} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                      </div>
                      <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                          onClick={() => removeAdditional(index)}
                          aria-label="Удалить дополнительную услугу"
                      >
                          <Trash2 className="h-4 w-4" />
                      </Button>
                  </div>
                  ))}
                  <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => appendAdditional({ serviceName: "", price: 0, chemicalConsumption: 0 })}
                  className="mt-2"
                  >
                  <ListPlus className="mr-2 h-4 w-4" /> Добавить доп. услугу
                  </Button>
                </div>
            </CardContent>
        </Card>


         <div className="flex justify-end space-x-3 pt-4">
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
             {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4" />}
            {form.formState.isSubmitting ? "Сохранение..." : "Сохранить прайс-листы"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
