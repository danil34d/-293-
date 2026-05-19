
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, X, Percent, Wallet, Loader2, ListTodo, Library, Info, Globe, Search } from "lucide-react";
import type { SalaryScheme, PriceListItem, Aggregator, CounterAgent, RateSource, SalaryRate } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import React, { useEffect, useState, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getRetailPriceConfig, getAggregatorsData, getCounterAgentsData } from "@/lib/data-loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


const rateValueSchema = z.object({
  rate: z.string().regex(/^\d*\.?\d*$/, "Неверный формат числа").optional().or(z.literal('')),
  deduction: z.string().regex(/^\d*\.?\d*$/, "Неверный формат числа").optional().or(z.literal('')),
});

const formSchema = z.object({
  name: z.string().min(3, "Название схемы должно быть не менее 3 символов."),
  type: z.enum(["percentage", "rate"], {
    required_error: "Необходимо выбрать тип схемы.",
  }),
  percentage: z.coerce.number().optional(),
  fixedDeduction: z.coerce.number().optional(),
  rateSourceId: z.string().optional(),
  rates: z.record(rateValueSchema).optional(),
}).refine(data => {
    if (data.type === 'percentage') {
        return data.percentage !== undefined && data.percentage > 0 && data.percentage <= 100;
    }
    return true;
}, {
    message: "Процент должен быть от 1 до 100.",
    path: ["percentage"],
}).refine(data => {
    if (data.type === 'rate') {
        return !!data.rateSourceId;
    }
    return true;
}, {
    message: "Для типа 'Ставка' необходимо выбрать источник прайс-листа.",
    path: ["rateSourceId"],
});


type FormValues = z.infer<typeof formSchema>;

interface SalarySchemeFormProps {
  initialData?: SalaryScheme | null;
  schemeId?: string;
}

interface RateSourceOption {
    id: string; // Composite key like "aggregator-agg_id-priceListName", "retail", or "all-sources"
    name: string;
    type: 'retail' | 'aggregator' | 'counterAgent' | 'all';
    services: PriceListItem[];
    priceListName?: string;
}

const RateTable = ({
  control,
  services,
}: {
  control: any;
  services: PriceListItem[];
}) => {
  if (services.length === 0) return <p className="text-muted-foreground text-center py-4">У этого источника нет определенных услуг. Чтобы задать ставки, сначала добавьте услуги в соответствующий прайс-лист.</p>;

  return (
    <div className="rounded-md border mt-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название услуги (Цена из прайс-листа)</TableHead>
            <TableHead className="w-[180px] text-right">Вычет из ставки (руб.)</TableHead>
            <TableHead className="w-[180px] text-right">Ставка сотрудника (руб.)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
            <TableRow key={service.serviceName}>
              <TableCell>
                <Label htmlFor={`rates.${service.serviceName}.rate`} className="font-medium">{service.serviceName}</Label>
                <p className="text-xs text-muted-foreground">Цена: {service.price > 0 ? `${service.price} руб.` : 'Не указана'}</p>
              </TableCell>
              <TableCell className="text-right">
                 <FormField
                    control={control}
                    name={`rates.${service.serviceName}.deduction`}
                    render={({ field }) => (
                      <FormItem className="inline-block">
                        <FormControl>
                          <Input
                            id={`rates.${service.serviceName}.deduction`}
                            type="number"
                            placeholder="-"
                            className="w-32 text-right"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
              </TableCell>
              <TableCell className="text-right">
                 <FormField
                    control={control}
                    name={`rates.${service.serviceName}.rate`}
                    render={({ field }) => (
                      <FormItem className="inline-block">
                        <FormControl>
                          <Input
                            id={`rates.${service.serviceName}.rate`}
                            type="number"
                            placeholder="-"
                            className="w-32 text-right"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};


export function SalarySchemeForm({ initialData, schemeId }: SalarySchemeFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [rateSourceOptions, setRateSourceOptions] = useState<RateSourceOption[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(true);
  const [universalServiceSearch, setUniversalServiceSearch] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      type: "percentage",
      percentage: 30,
      fixedDeduction: 0,
      rates: {},
    },
    mode: "onChange",
  });
  
  const schemeType = useWatch({ control: form.control, name: "type" });
  const selectedRateSourceId = useWatch({ control: form.control, name: "rateSourceId"});
  const allRates = useWatch({ control: form.control, name: "rates" });

  const selectedRateSource = useMemo(() => {
    if (!selectedRateSourceId) return null;
    return rateSourceOptions.find(opt => opt.id === selectedRateSourceId) || null;
  }, [selectedRateSourceId, rateSourceOptions]);

  // Fetch all data sources on mount
  useEffect(() => {
    async function fetchAllSources() {
      setIsLoadingSources(true);
      try {
        const [retailData, aggregators, agents] = await Promise.all([
            getRetailPriceConfig(),
            getAggregatorsData(),
            getCounterAgentsData()
        ]);
        
        const options: RateSourceOption[] = [];
        const serviceMap = new Map<string, PriceListItem>();

        // Add retail and collect its services
        const retailServices = [...retailData.mainPriceList, ...retailData.additionalPriceList];
        retailServices.forEach(service => {
            if (!serviceMap.has(service.serviceName) && service.price > 0) {
              serviceMap.set(service.serviceName, { serviceName: service.serviceName, price: service.price || 0 });
            }
        });
        options.push({
            id: 'retail', name: 'Розничный прайс-лист (Наличка)', type: 'retail',
            services: retailServices
        });
        
        // Add aggregators and collect their services
        aggregators.forEach(agg => {
            agg.priceLists.forEach(pl => {
                pl.services.forEach(service => {
                    if (!serviceMap.has(service.serviceName) && service.price > 0) {
                      serviceMap.set(service.serviceName, { serviceName: service.serviceName, price: service.price || 0 });
                    }
                });
                const id = `aggregator-${agg.id}-${pl.name}`;
                options.push({ id: id, name: `${agg.name} (${pl.name})`, type: 'aggregator', services: pl.services, priceListName: pl.name });
            });
        });
        
        // Add counter-agents and collect their services
        agents.forEach(agent => {
            const agentServices = [...(agent.priceList || []), ...(agent.additionalPriceList || [])];
            agentServices.forEach(service => {
                if (!serviceMap.has(service.serviceName) && service.price > 0) {
                  serviceMap.set(service.serviceName, { serviceName: service.serviceName, price: service.price || 0 });
                }
            });
            const id = `counterAgent-${agent.id}`;
            options.push({ id: id, name: agent.name, type: 'counterAgent', services: agentServices });
        });

        const allServicesList = Array.from(serviceMap.values()).sort((a,b) => a.serviceName.localeCompare(b.serviceName));
        const allSourcesOption: RateSourceOption = {
            id: 'all-sources',
            name: 'Все прайс-листы (Универсальная)',
            type: 'all',
            services: allServicesList
        };
        
        setRateSourceOptions([allSourcesOption, ...options]);

      } catch (error: any) {
        toast({ title: "Ошибка", description: `Не удалось загрузить источники прайс-листов: ${error.message}`, variant: "destructive" });
      } finally {
        setIsLoadingSources(false);
      }
    }
    fetchAllSources();
  }, [toast]);

  // When "Universal" source is selected, pre-fill rates to ~50% of the retail price.
  // Phase 41 / АРХ-#15: добавлен toast «Авто-rates установлены, проверьте перед сохранением».
  useEffect(() => {
    if (selectedRateSourceId === 'all-sources' && selectedRateSource?.services) {
      const priceMap = new Map<string, number>();

      const retailSource = rateSourceOptions.find(s => s.id === 'retail');
      if (retailSource) {
          retailSource.services.forEach(service => {
            if (service.price > 0 && !priceMap.has(service.serviceName)) {
              priceMap.set(service.serviceName, service.price);
            }
          });
      }

      const existingRates = form.getValues('rates') || {};
      const newRates: Record<string, { rate: string; deduction: string }> = Object.fromEntries(
        Object.entries(existingRates).map(([serviceName, value]) => [
          serviceName,
          {
            rate: value?.rate ?? '',
            deduction: value?.deduction ?? '',
          },
        ])
      );
      // Phase 41 / АРХ-#15: считаем сколько rates фактически было заполнено auto-50%.
      let autoFilledCount = 0;
      selectedRateSource.services.forEach(service => {
        const price = priceMap.get(service.serviceName) || 0;
        const rate = price > 0 ? Math.floor(price / 2) : 0;

        if (!newRates[service.serviceName]) {
             newRates[service.serviceName] = { rate: '', deduction: '' };
        }

        if (!newRates[service.serviceName].rate && rate > 0) {
            newRates[service.serviceName].rate = String(rate);
            autoFilledCount++;
        }
      });

      form.setValue('rates', newRates, { shouldDirty: true });

      // Phase 41 / АРХ-#15: toast предупреждение, чтобы админ не сохранил скрытые 50%.
      if (autoFilledCount > 0) {
        toast({
          title: 'Авто-ставки установлены',
          description: `Для ${autoFilledCount} услуг ставки автозаполнены = 50% от розничной цены. Проверьте значения перед «Сохранить» — это не всегда корректно.`,
          variant: 'default',
          duration: 6000,
        });
      }
    }
  }, [selectedRateSourceId, selectedRateSource, rateSourceOptions, form, toast]);

  // Set form defaults when initialData is available.
  useEffect(() => {
    if (!initialData) return;

    const valuesToReset: Partial<FormValues> = {
        name: initialData.name,
        type: initialData.type,
        percentage: initialData.percentage || 30,
        fixedDeduction: initialData.fixedDeduction || 0,
        rates: {},
    };

    if (initialData.type === 'rate') {
        const defaultRates = initialData.rates
            ? initialData.rates.reduce((acc, rate: SalaryRate) => {
                acc[rate.serviceName] = { 
                  rate: String(rate.rate),
                  deduction: rate.deduction ? String(rate.deduction) : ''
                };
                return acc;
              }, {} as Record<string, { rate: string; deduction: string }>)
            : {};
        
        let sourceId;
        if (!initialData.rateSource) { // Universal scheme
            sourceId = 'all-sources';
        } else if (initialData.rateSource.type === 'retail') {
            sourceId = 'retail';
        } else if (initialData.rateSource.type === 'aggregator') {
            sourceId = `${initialData.rateSource.type}-${initialData.rateSource.id}-${initialData.rateSource.priceListName}`;
        } else { // counterAgent
            sourceId = `${initialData.rateSource.type}-${initialData.rateSource.id}`;
        }

        valuesToReset.rateSourceId = sourceId;
        valuesToReset.rates = defaultRates;
    }
    
    form.reset(valuesToReset as FormValues);

  }, [initialData, form, rateSourceOptions]);


  async function onSubmit(data: FormValues) {
    const currentSchemeId = schemeId || `scheme_${Date.now()}`;
    
    let schemeToSave: SalaryScheme;
    
    if (data.type === 'percentage') {
        schemeToSave = {
            id: currentSchemeId,
            name: data.name,
            type: 'percentage',
            percentage: data.percentage,
            fixedDeduction: data.fixedDeduction && data.fixedDeduction > 0 ? data.fixedDeduction : undefined,
        };
    } else { // type is 'rate'
        const isUniversal = data.rateSourceId === 'all-sources';
        const sourceInfo = !isUniversal ? rateSourceOptions.find(opt => opt.id === data.rateSourceId) : null;
        
        if (!isUniversal && !sourceInfo) {
            toast({ title: "Ошибка", description: "Выбранный источник прайс-листа не найден.", variant: "destructive"});
            return;
        }

        const ratesArray = data.rates
            ? Object.entries(data.rates)
                .map(([serviceName, { rate, deduction }]) => ({ 
                    serviceName, 
                    rate: Number(rate), 
                    deduction: (deduction && Number(deduction) > 0) ? Number(deduction) : undefined 
                }))
                .filter(item => !isNaN(item.rate) && item.rate > 0)
            : [];
        
        let newRateSource: RateSource | undefined = undefined;
        if (!isUniversal && sourceInfo) {
            let entityId;
            let type: 'retail' | 'aggregator' | 'counterAgent' = 'retail';
            
            if (sourceInfo.type === 'retail') {
                entityId = 'retail';
                type = 'retail';
            } else if (sourceInfo.type === 'aggregator') {
                 const parts = sourceInfo.id.split('-');
                 entityId = parts[1];
                 type = 'aggregator';
            } else { // counterAgent
                 const parts = sourceInfo.id.split('-');
                 entityId = parts[1];
                 type = 'counterAgent';
            }

            newRateSource = {
                type: type,
                id: entityId,
                priceListName: sourceInfo.priceListName,
            };
        }

        schemeToSave = {
            id: currentSchemeId,
            name: data.name,
            type: 'rate',
            rateSource: newRateSource,
            rates: ratesArray,
        };
    }
    
    const isNew = !schemeId;
    const url = isNew ? '/api/salary-schemes' : `/api/salary-schemes/${currentSchemeId}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schemeToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save scheme: ${response.statusText}`);
      }
      
      router.refresh(); 
      toast({
        title: isNew ? "Схема создана" : "Схема обновлена",
        description: `Схема зарплаты "${schemeToSave.name}" успешно ${isNew ? 'сохранена' : 'обновлена'}.`,
        variant: "default"
      });
      
      if (isNew) {
        router.push('/salary-schemes');
      }

    } catch (error: any) {
      console.error("Error saving salary scheme:", error);
      toast({
        title: "Ошибка сохранения",
        description: error.message || "Не удалось сохранить схему.",
        variant: "destructive",
      });
    }
  }

  const universalServicesWithRates = useMemo(() => {
    if (selectedRateSourceId !== 'all-sources' || !selectedRateSource?.services || !allRates) return [];
    return selectedRateSource.services.filter(service => 
        allRates[service.serviceName]?.rate && Number(allRates[service.serviceName].rate) > 0
    );
  }, [selectedRateSourceId, selectedRateSource, allRates]);

  const filteredUniversalServicesWithoutRates = useMemo(() => {
    if (selectedRateSourceId !== 'all-sources' || !selectedRateSource?.services) return [];
    const servicesWithoutRates = selectedRateSource.services.filter(service => 
        !allRates?.[service.serviceName]?.rate || Number(allRates[service.serviceName].rate) <= 0
    );
    if (!universalServiceSearch) return servicesWithoutRates;
    return servicesWithoutRates.filter(s => s.serviceName.toLowerCase().includes(universalServiceSearch.toLowerCase()));
  }, [selectedRateSourceId, selectedRateSource, allRates, universalServiceSearch]);


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <Wallet />
              {schemeId ? "Редактировать схему" : "Новая схема зарплаты"}
            </CardTitle>
            <CardDescription>Заполните информацию о схеме расчета.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Название схемы</FormLabel>
                  <FormControl>
                    <Input placeholder="Например, Стажер (30%) или Ставка 'Мастер'" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                    <FormItem className="space-y-3 pt-2">
                    <FormLabel>Тип схемы</FormLabel>
                    <FormControl>
                      <RadioGroup
                          onValueChange={(value) => {
                              field.onChange(value);
                              form.setValue('rateSourceId', undefined);
                              form.setValue('rates', {});
                          }}
                          defaultValue={field.value}
                          className="grid grid-cols-1 md:grid-cols-2 gap-4"
                      >
                          <Label className="flex flex-col items-start space-x-0 space-y-3 rounded-md border p-4 cursor-pointer hover:bg-accent/50 has-[input:checked]:border-primary has-[input:checked]:bg-primary/5">
                              <div className="flex items-center space-x-3">
                                  <FormControl>
                                      <RadioGroupItem value="percentage" />
                                  </FormControl>
                                  <span className="font-semibold flex items-center gap-2">
                                      <Percent className="h-4 w-4 text-muted-foreground"/>
                                      Процент от выручки
                                  </span>
                              </div>
                              <FormDescription className="pl-8 text-xs leading-snug text-muted-foreground">
                                  Универсальный вариант. Работает для всех типов клиентов (розница, контрагенты, агрегаторы). Сотрудник получает указанный процент от итоговой стоимости.
                              </FormDescription>
                          </Label>

                           <Label className="flex flex-col items-start space-x-0 space-y-3 rounded-md border p-4 cursor-pointer hover:bg-accent/50 has-[input:checked]:border-primary has-[input:checked]:bg-primary/5">
                              <div className="flex items-center space-x-3">
                                  <FormControl>
                                      <RadioGroupItem value="rate" />
                                  </FormControl>
                                  <span className="font-semibold flex items-center gap-2">
                                      <ListTodo className="h-4 w-4 text-muted-foreground"/>
                                      Фиксированная ставка
                                  </span>
                              </div>
                              <FormDescription className="pl-8 text-xs leading-snug text-muted-foreground">
                                  Позволяет установить фиксированную оплату за выполнение конкретных услуг из прайс-листов розницы, контрагентов или агрегаторов.
                              </FormDescription>
                          </Label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
            />
          </CardContent>
        </Card>

        {schemeType === 'percentage' && (
             <Card className="shadow-md animate-in fade-in-20">
                <CardHeader>
                    <CardTitle>Настройка процента</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormField
                        control={form.control}
                        name="percentage"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Процент от выручки</FormLabel>
                                <div className="flex items-center gap-2">
                                    <FormControl>
                                        <Input type="number" placeholder="30" {...field} className="w-32"/>
                                    </FormControl>
                                    <span className="text-lg font-semibold text-muted-foreground">%</span>
                                </div>
                                <FormDescription>Укажите процент от чистой выручки (за вычетом эквайринга), который получит сотрудник.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                    <FormField
                        control={form.control}
                        name="fixedDeduction"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Фиксированный вычет (необязательно)</FormLabel>
                                 <div className="flex items-center gap-2">
                                    <FormControl>
                                        <Input type="number" placeholder="100" {...field} className="w-32"/>
                                    </FormControl>
                                     <span className="text-lg font-semibold text-muted-foreground">руб.</span>
                                </div>
                                <FormDescription>Эта сумма (например, за расходники) будет вычтена из ОБЩЕЙ суммы мойки один раз, ДО расчета процентов.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                        />
                </CardContent>
             </Card>
        )}

        {schemeType === 'rate' && (
            <Card className="shadow-md animate-in fade-in-20">
                <CardHeader>
                    <CardTitle>Настройка ставок</CardTitle>
                    <CardDescription>Выберите источник прайс-листа, чтобы задать ставки для его услуг.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FormField
                        control={form.control}
                        name="rateSourceId"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel className="flex items-center gap-2 text-md font-semibold"><Library/> Источник прайс-листа</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                                <SelectTrigger disabled={isLoadingSources}>
                                <SelectValue placeholder={isLoadingSources ? "Загрузка источников..." : "Выберите источник..."} />
                                </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="all-sources">
                                  <div className="flex items-center gap-2">
                                    <Globe className="h-4 w-4" />
                                    Все прайс-листы (Универсальная)
                                  </div>
                                </SelectItem>
                                <Separator />
                                <SelectGroup>
                                    <SelectLabel>Для розничных клиентов</SelectLabel>
                                    <SelectItem value="retail">{rateSourceOptions.find(o => o.id === 'retail')?.name}</SelectItem>
                                </SelectGroup>
                                {rateSourceOptions.filter(o => o.type === 'aggregator').length > 0 && <SelectGroup>
                                <SelectLabel>Для Агрегаторов</SelectLabel>
                                {rateSourceOptions.filter(o => o.type === 'aggregator').map(opt => (
                                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                                ))}
                                </SelectGroup>}
                                {rateSourceOptions.filter(o => o.type === 'counterAgent').length > 0 && <SelectGroup>
                                <SelectLabel>Для Контрагентов</SelectLabel>
                                {rateSourceOptions.filter(o => o.type === 'counterAgent').map(opt => (
                                    <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
                                ))}
                                </SelectGroup>}
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    
                    {isLoadingSources ? (
                        <div className="flex items-center gap-2 text-muted-foreground justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin"/>
                            <span>Загрузка...</span>
                        </div>
                    ) : selectedRateSourceId === 'all-sources' ? (
                        <div className="space-y-6 pt-4">
                            <Alert className="bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-200 [&>svg]:text-amber-500">
                                <Info className="h-4 w-4" />
                                <AlertTitle className="font-semibold">Важно: о дублирующихся услугах</AlertTitle>
                                <AlertDescription>
                                    Универсальная схема работает со всеми услугами по их названию. Если у разных клиентов есть услуги с одинаковым названием, но разной ценой, установленная здесь ставка будет применяться ко всем ним. Цены в списке ниже показаны для справки и взяты из первого найденного прайс-листа (в приоритете - розничный).
                                </AlertDescription>
                            </Alert>
                            {universalServicesWithRates.length > 0 && (
                                <div>
                                    <h4 className="text-md font-semibold mb-2">Заданные ставки ({universalServicesWithRates.length})</h4>
                                    <RateTable control={form.control} services={universalServicesWithRates} />
                                </div>
                            )}
                            <div>
                                <h4 className="text-md font-semibold mb-2">Все доступные услуги для назначения ставок</h4>
                                <div className="relative mb-2">
                                    <Input 
                                        placeholder="Поиск по названию услуги..."
                                        value={universalServiceSearch}
                                        onChange={(e) => setUniversalServiceSearch(e.target.value)}
                                        className="pl-8"
                                    />
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                </div>
                                <RateTable control={form.control} services={filteredUniversalServicesWithoutRates} />
                            </div>
                        </div>
                    ) : selectedRateSource ? (
                        <RateTable control={form.control} services={selectedRateSource.services} />
                    ) : null}
                </CardContent>
            </Card>
        )}


        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => router.push('/salary-schemes')}>
            <X className="mr-2 h-4 w-4" /> Отмена
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={form.formState.isSubmitting}>
             <Save className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? (schemeId ? "Сохранение..." : "Создание...") : (schemeId ? "Сохранить изменения" : "Создать схему")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
