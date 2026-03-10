
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, X, ShoppingCart } from "lucide-react";
import type { Expense } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const expenseFormSchema = z.object({
  date: z.date({ required_error: "Дата обязательна." }),
  amount: z.coerce.number().min(0.01, "Сумма должна быть больше нуля."),
  category: z.string().min(1, "Категория обязательна."),
  description: z.string().min(3, "Описание должно содержать не менее 3 символов."),
  quantity: z.coerce.number().optional(),
  unit: z.string().optional(),
  pricePerUnit: z.coerce.number().optional(),
}).refine(data => {
    if (data.category === 'Закупка химии' && data.unit === 'кг' && (!data.quantity || data.quantity <= 0)) {
        return false;
    }
    return true;
}, {
    message: "Количество (в кг) обязательно для закупки химии.",
    path: ["quantity"],
});

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface ExpenseFormProps {
  initialData?: Expense | null;
  expenseId?: string;
}

const expenseCategories = [
    "Аренда",
    "Электричество",
    "Водоснабжение",
    "Закупка химии",
    "Закупка оборудования",
    "Ремонт оборудования",
    "Зарплата (админ/прочее)",
    "Налоги и сборы",
    "Прочее"
];

const units = ["шт.", "л.", "кг.", "кВт⋅ч", "м³"];

export function ExpenseForm({ initialData, expenseId }: ExpenseFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      date: new Date(),
      amount: 0,
      category: "",
      description: "",
      quantity: undefined,
      unit: "",
      pricePerUnit: undefined,
    },
    mode: "onChange",
  });

  const { quantity, pricePerUnit, category } = useWatch({ control: form.control });

  useEffect(() => {
      if (quantity && pricePerUnit) {
          const total = quantity * pricePerUnit;
          if (form.getValues("amount") !== total) {
            form.setValue("amount", parseFloat(total.toFixed(2)), { shouldValidate: true, shouldDirty: true });
          }
      }
  }, [quantity, pricePerUnit, form]);
  
   useEffect(() => {
    if (category === 'Закупка химии') {
      form.setValue('unit', 'кг.');
    }
  }, [category, form]);


  useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        date: new Date(initialData.date),
        quantity: initialData.quantity ?? undefined,
        pricePerUnit: initialData.pricePerUnit ?? undefined,
      });
    }
  }, [initialData, form]);

  async function onSubmit(data: ExpenseFormValues) {
    const currentExpenseId = expenseId || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const expenseToSave: Expense = {
      id: currentExpenseId,
      date: data.date.toISOString(),
      amount: data.amount,
      category: data.category,
      description: data.description,
      quantity: data.quantity && data.quantity > 0 ? data.quantity : undefined,
      unit: data.unit || undefined,
      pricePerUnit: data.pricePerUnit && data.pricePerUnit > 0 ? data.pricePerUnit : undefined,
    };

    const isNew = !expenseId;
    const url = isNew ? '/api/expenses' : `/api/expenses/${currentExpenseId}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save expense`);
      }

      router.refresh();
      toast({
        title: isNew ? "Расход добавлен" : "Расход обновлен",
        description: `Запись о расходе "${expenseToSave.description}" успешно сохранена.`,
        variant: "default",
      });

      if (isNew) {
        router.push('/expenses');
      }

    } catch (error: any) {
      console.error("Error saving expense:", error);
      toast({
        title: "Ошибка сохранения",
        description: error.message || "Не удалось сохранить данные о расходе.",
        variant: "destructive",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
        <Card className="shadow-md max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <ShoppingCart />
              {expenseId ? "Редактировать расход" : "Новая запись о расходе"}
            </CardTitle>
            <CardDescription>Заполните информацию о произведенных затратах. Поля количества и цены необязательны, но помогают вести более точный учет.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Описание</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Например: Аренда помещения за май или Закупка химии 'AquaClean'"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Дата расхода</FormLabel>
                    <FormControl>
                      <DatePicker date={field.value} setDate={field.onChange} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Категория</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите категорию расхода..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expenseCategories.map(category => (
                          <SelectItem key={category} value={category}>{category}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <Separator className="my-6" />

            <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Детализация (необязательно)</p>
                {category === 'Закупка химии' && (
                    <FormDescription>Для закупки химии, пожалуйста, укажите количество в килограммах (кг) для корректного учета на складе.</FormDescription>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="quantity" render={({ field }) => (
                        <FormItem><FormLabel>Количество</FormLabel><FormControl><Input type="number" placeholder="20" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="unit" render={({ field }) => (
                        <FormItem><FormLabel>Ед. изм.</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} disabled={category === 'Закупка химии'}>
                                <FormControl><SelectTrigger><SelectValue placeholder="шт." /></SelectTrigger></FormControl>
                                <SelectContent>
                                    {units.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        <FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="pricePerUnit" render={({ field }) => (
                        <FormItem><FormLabel>Цена за ед.</FormLabel><FormControl><Input type="number" placeholder="1500" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                </div>
            </div>

            <Separator className="my-6"/>

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Итоговая сумма (руб.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="5000" {...field} className="text-xl font-bold h-12" />
                  </FormControl>
                  <FormDescription>Рассчитывается автоматически, если указаны количество и цена, или вводится вручную.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-3 pt-4 max-w-2xl mx-auto">
          <Button type="button" variant="outline" onClick={() => router.push('/expenses')}>
            <X className="mr-2 h-4 w-4" /> Отмена
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={form.formState.isSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? "Сохранение..." : "Сохранить запись"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
