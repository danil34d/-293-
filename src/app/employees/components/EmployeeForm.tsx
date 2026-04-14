
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm } from "react-hook-form";
import { z } from "zod";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, X, UserCog, KeyRound, WalletCards, Loader2, ShieldCheck } from "lucide-react";
import type { Employee, EmployeeRole, SalaryScheme } from "@/types";
import { ROLE_LABELS } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


const employeeFormSchema = z.object({
  fullName: z.string().min(5, "ФИО должно содержать не менее 5 символов."),
  phone: z.string().min(5, "Телефон должен содержать не менее 5 символов."),
  paymentDetails: z.string().min(10, "Платежные реквизиты должны содержать не менее 10 символов."),
  hasCar: z.boolean(),
  canSwapShifts: z.boolean(),
  role: z.enum(["admin", "employee", "kiosk"]).default("employee"),
  telegramChatId: z.string().regex(/^-?\d+$/, "Telegram ID должен содержать только цифры.").optional().or(z.literal('')),
  username: z.string().min(3, "Логин должен быть не менее 3 символов.").regex(/^[a-z0-9_]+$/i, "Логин может содержать только латинские буквы, цифры и нижнее подчеркивание.").optional().or(z.literal('')),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов.").optional().or(z.literal('')),
  salarySchemeId: z.string().optional(),
});

type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
type EmployeeFormRole = EmployeeFormValues["role"];

interface EmployeeFormProps {
  initialData?: Employee | null;
  employeeId?: string;
}

function normalizeEmployeeFormRole(role: EmployeeRole | undefined): EmployeeFormRole {
  if (role && ["admin", "employee", "kiosk"].includes(role)) {
    return role as EmployeeFormRole;
  }
  return "employee";
}

export function EmployeeForm({ initialData, employeeId }: EmployeeFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [salarySchemes, setSalarySchemes] = useState<SalaryScheme[]>([]);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(true);

  useEffect(() => {
    async function fetchSchemes() {
      try {
        setIsLoadingSchemes(true);
        const response = await fetch('/api/salary-schemes');
        if (!response.ok) throw new Error("Failed to load salary schemes");
        const data = await response.json();
        setSalarySchemes(data);
      } catch (error) {
        console.error(error);
        toast({ title: "Ошибка", description: "Не удалось загрузить схемы зарплат.", variant: "destructive" });
      } finally {
        setIsLoadingSchemes(false);
      }
    }
    fetchSchemes();
  }, [toast]);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      paymentDetails: "",
      hasCar: false,
      canSwapShifts: true, // По умолчанию обмен разрешён
      role: "employee",
      telegramChatId: "",
      username: "",
      password: "",
      salarySchemeId: "unassigned",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        ...initialData,
        role: normalizeEmployeeFormRole(initialData.role),
        telegramChatId: initialData.telegramChatId || "",
        password: "", // never pre-fill — admin enters new password or leaves empty
        username: initialData.username || "",
        salarySchemeId: initialData.salarySchemeId || "unassigned",
        canSwapShifts: initialData.canSwapShifts !== false, // По умолчанию true
      });
    }
  }, [initialData, form]);

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>, fieldOnChange: (value: string) => void) => {
    const rawValue = e.target.value.replace(/\D/g, '');
    let formattedValue = '';
    
    // Logic for Russian phone numbers
    let numberPart = rawValue;
    if (numberPart.length > 0) {
        if (numberPart.startsWith('7') || numberPart.startsWith('8')) {
            numberPart = numberPart.substring(1);
        }
        
        formattedValue = '+7 (';
        if (numberPart.length > 0) {
            formattedValue += numberPart.substring(0, 3);
        }
        if (numberPart.length > 3) {
            formattedValue += ') ' + numberPart.substring(3, 6);
        }
        if (numberPart.length > 6) {
            formattedValue += '-' + numberPart.substring(6, 8);
        }
        if (numberPart.length > 8) {
            formattedValue += '-' + numberPart.substring(8, 10);
        }
    }

    fieldOnChange(formattedValue);
  };


  async function onSubmit(data: EmployeeFormValues) {
    const currentEmployeeId = employeeId || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const enforcedRole: EmployeeRole = normalizeEmployeeFormRole(data.role);

    const employeeToSave: Employee = {
      id: currentEmployeeId,
      fullName: data.fullName,
      phone: data.phone,
      paymentDetails: data.paymentDetails,
      hasCar: data.hasCar,
      canSwapShifts: data.canSwapShifts,
      role: enforcedRole,
      telegramChatId: data.telegramChatId?.trim() ? data.telegramChatId.trim() : undefined,
      username: data.username,
      password: data.password || "", // empty = keep old (API handles it)
      salarySchemeId: (data.salarySchemeId === 'unassigned' || !data.salarySchemeId) ? undefined : data.salarySchemeId,
    };
    
    const isNew = !employeeId;
    const url = isNew ? '/api/employees' : `/api/employees/${currentEmployeeId}`;
    const method = isNew ? 'POST' : 'PUT';

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(employeeToSave),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save employee: ${response.statusText}`);
      }
      
      router.refresh(); 
      toast({
        title: isNew ? "Сотрудник создан" : "Сотрудник обновлен",
        description: `Данные сотрудника ${employeeToSave.fullName} успешно ${isNew ? 'сохранены' : 'обновлены'}.`,
        variant: "default"
      });
      
      if (isNew) {
        router.push('/employees');
      }

    } catch (error: any) {
      console.error("Error saving employee:", error);
      toast({
        title: "Ошибка сохранения",
        description: error.message || "Не удалось сохранить данные сотрудника.",
        variant: "destructive",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <UserCog />
              {employeeId ? "Редактировать данные сотрудника" : "Новый сотрудник"}
            </CardTitle>
            <CardDescription>Заполните основную информацию о сотруднике.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ФИО</FormLabel>
                  <FormControl>
                    <Input placeholder="Иванов Иван Иванович" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Телефон</FormLabel>
                  <FormControl>
                    <Input 
                      type="tel" 
                      placeholder="+7 (999) 123-45-67" 
                      {...field}
                      onChange={(e) => handlePhoneInputChange(e, field.onChange)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paymentDetails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Платежные реквизиты</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Например: Карта Сбербанка 4276 0000 1111 2222, привязана к номеру +7..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Введите номер карты или другую информацию для перевода зарплаты.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hasCar"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Имеется личный автомобиль
                    </FormLabel>
                    <FormDescription>
                      Отметьте, если у сотрудника есть машина.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Имеется личный автомобиль"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="canSwapShifts"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Разрешён обмен сменами
                    </FormLabel>
                    <FormDescription>
                      Отключите, чтобы запретить сотруднику обмениваться и передавать смены.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label="Разрешён обмен сменами"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <WalletCards />
              Настройки зарплаты
            </CardTitle>
            <CardDescription>Выберите схему расчета зарплаты для этого сотрудника. Схемы создаются в разделе "Схемы зарплат".</CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="salarySchemeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Схема зарплаты</FormLabel>
                  {isLoadingSchemes ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                       <Loader2 className="h-4 w-4 animate-spin"/>
                       <span>Загрузка схем...</span>
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите схему..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Не назначена</SelectItem>
                        {salarySchemes.map((scheme) => (
                          <SelectItem key={scheme.id} value={scheme.id}>
                            {scheme.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <KeyRound />
              Учетные данные для входа
            </CardTitle>
            <CardDescription>Задайте логин и пароль для доступа сотрудника к рабочей станции. Это необязательные поля.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Логин (Username)</FormLabel>
                  <FormControl>
                    <Input placeholder="ivanov_i" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormDescription>
                    Рекомендуется использовать латинские буквы, цифры и нижнее подчеркивание.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Роль</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value as EmployeeRole)}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите роль..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [EmployeeRole, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Администратор — полный доступ. Сотрудник — заказы, график, зарплата. Киоск — общий терминал.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="telegramChatId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telegram Chat ID</FormLabel>
                  <FormControl>
                    <Input placeholder="Например: 123456789" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormDescription>
                    Нужен для Telegram-бота сотрудника. Можно узнать у сотрудника через бота @userinfobot.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Пароль</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder={employeeId ? "Новый пароль (не меняется, если пусто)" : "Задайте пароль"} {...field} value={field.value || ''} autoComplete="off" />
                  </FormControl>
                  <FormDescription>
                    {employeeId ? "Введите новый пароль или оставьте пустым, чтобы сохранить текущий." : "Задайте пароль для входа сотрудника."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => router.push('/employees')}>
            <X className="mr-2 h-4 w-4" /> Отмена
          </Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={form.formState.isSubmitting}>
             <Save className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? (employeeId ? "Сохранение..." : "Создание...") : (employeeId ? "Сохранить изменения" : "Создать сотрудника")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
