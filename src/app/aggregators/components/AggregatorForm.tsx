
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm, useFieldArray, useWatch, type Control } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlusCircle, Trash2, Save, X } from "lucide-react";
import type { Aggregator } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import React, { useEffect } from 'react';
import { normalizeLicensePlate } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CompanyAccordion, companySchema, baseCompany } from "@/components/common/CompanyAccordion";
import { PriceListEditor, priceListItemSchema } from "@/components/common/PriceListEditor";

const namedPriceListSchema = z.object({
  name: z.string().min(1, "Название прайс-листа не может быть пустым."),
  services: z.array(priceListItemSchema),
});

const aggregatorFormSchema = z.object({
  name: z.string().min(2, "Имя агрегатора должно содержать не менее 2 символов."),
  companies: z.array(companySchema).optional(),
  cars: z.string().optional(),
  priceLists: z.array(namedPriceListSchema).min(1, "Должен быть как минимум один прайс-лист."),
  activePriceListName: z.string().optional(),
  balance: z.coerce.number().optional(),
}).refine(data => {
  if (data.priceLists && data.priceLists.length > 0) {
    // Если есть прайс-листы, то должен быть выбран активный, и он должен существовать в списке
    return data.activePriceListName && data.priceLists.some(pl => pl.name === data.activePriceListName);
  }
  return true;
}, {
  message: "Необходимо выбрать активный прайс-лист.",
  path: ["activePriceListName"],
});


type AggregatorFormValues = z.infer<typeof aggregatorFormSchema>;

interface AggregatorFormProps {
  initialData?: Aggregator | null;
  aggregatorId?: string;
}

export function AggregatorForm({ initialData, aggregatorId }: AggregatorFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const preparedDefaultValues = React.useMemo(() => {
    if (initialData) {
      const formPriceLists = initialData.priceLists && initialData.priceLists.length > 0 
        ? initialData.priceLists.map(p => ({ name: p.name || "", services: p.services?.map(s => ({...s, chemicalConsumption: s.chemicalConsumption ?? 0})) || [] }))
        : [];
      
      let activeName = "";
      if (formPriceLists.length > 0) {
        activeName = initialData.activePriceListName && formPriceLists.some(p => p.name === initialData.activePriceListName)
          ? initialData.activePriceListName
          : formPriceLists[0]?.name || "";
      }

      return {
        name: initialData.name || "",
        companies: initialData.companies && initialData.companies.length > 0 ? initialData.companies.map(c => ({...baseCompany, ...c})) : [],
        cars: initialData.cars?.map(c => c.licensePlate).join('\n') || '',
        priceLists: formPriceLists,
        activePriceListName: activeName,
        balance: initialData.balance ?? 0,
      };
    }
    return {
      name: "",
      companies: [],
      cars: "",
      priceLists: [{ name: "Основной", services: [] }],
      activePriceListName: "Основной",
      balance: 0,
    };
  }, [initialData]);

  const form = useForm<AggregatorFormValues>({
    resolver: zodResolver(aggregatorFormSchema),
    defaultValues: preparedDefaultValues,
    mode: "onChange",
  });
  
  const watchedPriceLists = useWatch({ control: form.control, name: "priceLists" });
  
  useEffect(() => {
    const currentActiveName = form.getValues("activePriceListName");
    
    if (watchedPriceLists && watchedPriceLists.length > 0) {
      const activeNameExists = watchedPriceLists.some(pl => pl.name === currentActiveName && pl.name);
      
      if (!activeNameExists) {
        form.setValue("activePriceListName", watchedPriceLists[0].name, { shouldValidate: true, shouldDirty: true });
      }
    } else if (watchedPriceLists && watchedPriceLists.length === 0) {
      if (currentActiveName) {
        form.setValue("activePriceListName", undefined, { shouldValidate: true, shouldDirty: true });
      }
    }
  }, [watchedPriceLists, form]);


  useEffect(() => {
    form.reset(preparedDefaultValues);
  }, [preparedDefaultValues, form]);
  
  const { fields: priceListsFields, append: appendPriceList, remove: removePriceList } = useFieldArray({
    control: form.control,
    name: "priceLists",
  });
  
  const priceListNames = useWatch({
    control: form.control,
    name: "priceLists",
  });

  async function onSubmit(data: AggregatorFormValues) {
    const currentAggregatorId = aggregatorId || `agg_${data.name.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now()}`;

    const parsedCars = (data.cars || '')
        .split('\n')
        .map(plate => normalizeLicensePlate(plate.trim()))
        .filter(Boolean);

    const aggregatorToSave: Aggregator = {
      id: currentAggregatorId,
      name: data.name,
      companies: data.companies,
      cars: parsedCars.map((normalizedPlate, carIndex) => {
        const existingCar = initialData?.cars?.find(ec => ec.licensePlate === normalizedPlate);
        return {
          id: existingCar?.id || `car_${currentAggregatorId}_${carIndex + 1}_${normalizedPlate}`,
          licensePlate: normalizedPlate,
        };
      }),
      priceLists: data.priceLists || [],
      activePriceListName: data.activePriceListName,
      balance: data.balance,
    };

    try {
      const response = await fetch(`/api/aggregators/${currentAggregatorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(aggregatorToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save aggregator: ${response.statusText}`);
      }
      
      form.reset(data); // Re-sync form state with saved data to make isDirty false
      router.refresh(); 
      toast({
        title: aggregatorId ? "Агрегатор обновлен" : "Агрегатор создан",
        description: `Агрегатор ${aggregatorToSave.name} успешно ${aggregatorId ? 'обновлен' : 'сохранен'}.`,
        variant: "default"
      });
      if (!aggregatorId) {
        router.push('/aggregators');
      }

    } catch (error: any) {
      console.error("Error saving aggregator:", error);
      toast({
        title: "Ошибка сохранения",
        description: error.message || "Не удалось сохранить данные агрегатора.",
        variant: "destructive",
      });
    }
  }
  
  const buttonDisabled = !form.formState.isDirty || form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl">{aggregatorId ? "Редактировать" : "Создать"} агрегатора</CardTitle>
            <CardDescription>Заполните основные данные агрегатора.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Имя агрегатора</FormLabel>
                  <FormControl>
                    <Input placeholder="например, ДС (Дорожная сеть)" {...field} className="text-base"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="balance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Текущий баланс (руб.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="0" {...field} />
                  </FormControl>
                  <FormDescription>
                    Отрицательное значение означает долг агрегатора перед вами. Вы можете вручную изменить это значение для регистрации оплаты.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <CompanyAccordion control={form.control as any} />

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-lg">Прайс-листы</CardTitle>
            <CardDescription>Создайте один или несколько прайс-листов (например, для разных сезонов) и выберите активный.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="activePriceListName"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-base font-semibold">Активный прайс-лист:</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={(value) => field.onChange(value)}
                      value={field.value}
                      className="flex flex-wrap gap-x-6 gap-y-2"
                    >
                      {(priceListNames || []).map((pl, index) => (
                        pl.name && (
                          <FormItem key={index} className="flex items-center space-x-2 space-y-0">
                            <FormControl>
                              <RadioGroupItem value={pl.name} />
                            </FormControl>
                            <FormLabel className="font-normal cursor-pointer">
                              {pl.name || `Прайс-лист №${index + 1}`}
                            </FormLabel>
                          </FormItem>
                        )
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="space-y-4">
              {priceListsFields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-4 relative bg-background shadow-sm">
                    <FormField
                      control={form.control}
                      name={`priceLists.${index}.name`}
                      render={({ field: nameField }) => (
                        <FormItem>
                          <FormLabel className="text-md font-semibold">Название прайс-листа №{index + 1}</FormLabel>
                          <FormControl>
                            <Input placeholder="например, Летний сезон" {...nameField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <PriceListEditor
                        control={form.control}
                        fieldArrayName={`priceLists.${index}.services`}
                    />
                    
                    {priceListsFields.length > 1 && (
                      <Button
                        type="button" variant="destructive" size="sm"
                        className="absolute bottom-3 right-3"
                        onClick={() => removePriceList(index)}>
                        <Trash2 className="mr-2 h-4 w-4" />Удалить прайс-лист
                      </Button>
                    )}
                  </div>
                )
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => appendPriceList({ name: `Сезон ${priceListsFields.length + 1}`, services: [] })}
              className="mt-2"
            >
              <PlusCircle className="mr-2 h-4 w-4" /> Добавить новый прайс-лист
            </Button>
          </CardContent>
        </Card>
        
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-lg">Автопарк (если применимо)</CardTitle>
            <CardDescription>Введите список госномеров, если у агрегатора есть собственный тестовый или корпоративный парк. Обычно это поле оставляют пустым. Каждый номер на новой строке.</CardDescription>
          </CardHeader>
          <CardContent>
             <FormField
                control={form.control}
                name="cars"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>Список номеров машин</FormLabel>
                    <FormControl>
                        <Textarea
                            placeholder="A123BC777
X456YZ152
..."
                            rows={5}
                            {...field}
                            className="font-mono text-sm"
                        />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => router.push('/aggregators')}>
            <X className="mr-2 h-4 w-4" /> Отмена
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={buttonDisabled}>
             <Save className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? (aggregatorId ? "Сохранение..." : "Создание...") : (aggregatorId ? "Сохранить изменения" : "Создать агрегатора")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
