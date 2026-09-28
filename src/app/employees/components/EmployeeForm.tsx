
"use client";

import { zodResolver } from "@/lib/zod-resolver";
import { useForm } from "react-hook-form";
import { z } from "zod";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { normalizeLicensePlate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, X, UserCog, KeyRound, WalletCards, Loader2, ShieldCheck } from "lucide-react";
import type { Employee, EmployeeRole, SalaryScheme } from "@/types";
import { ROLE_LABELS } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DangerGate, SafetyBar } from "@/components/admin";
import { ConfirmCriticalChangesModal, type CriticalChange } from "./ConfirmCriticalChangesModal";
import { SchemeImpactPreview } from "./SchemeImpactPreview";
import { useWatch } from "react-hook-form";


const employeeFormSchema = z.object({
  fullName: z.string().min(5, "ФИО должно содержать не менее 5 символов."),
  phone: z.string().min(5, "Телефон должен содержать не менее 5 символов."),
  paymentDetails: z.string().min(10, "Платежные реквизиты должны содержать не менее 10 символов."),
  hasCar: z.boolean(),
  carPlates: z.array(z.string()).default([]),
  canSwapShifts: z.boolean(),
  // 🔥 2026-08-09: без kiosk1 селект показывал «Сотрудник» для терминала,
  // а выбор «Киоск (терминал, бокс 1)» из ROLE_LABELS валился на валидации.
  role: z.enum(["admin", "employee", "kiosk", "kiosk1"]).default("employee"),
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
  if (role && ["admin", "employee", "kiosk", "kiosk1"].includes(role)) {
    return role as EmployeeFormRole;
  }
  return "employee";
}

export function EmployeeForm({ initialData, employeeId }: EmployeeFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [plateDraft, setPlateDraft] = useState('');
  const [salarySchemes, setSalarySchemes] = useState<SalaryScheme[]>([]);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(true);

  // UX-safety (Phase 4C2): три опасных поля под замком.
  // По умолчанию locked, пока админ явно не нажмёт «Изменить».
  // Для NEW (employeeId === undefined) — поля сразу unlocked (создаём с нуля).
  const isExisting = !!employeeId;
  const [schemeUnlocked, setSchemeUnlocked] = useState(!isExisting);
  const [roleUnlocked, setRoleUnlocked] = useState(!isExisting);
  const [usernameUnlocked, setUsernameUnlocked] = useState(!isExisting);

  // Конфирм-модал для критичных изменений (только на edit)
  const [pendingConfirm, setPendingConfirm] = useState<{
    changes: CriticalChange[];
    data: EmployeeFormValues;
  } | null>(null);

  // Phase 4D-1: последняя выплата ЗП (для Live Impact Preview warning о расхождении).
  // Источник: ищем последнюю EmployeeTransaction.type='payment' для этого сотрудника.
  const [lastPaidPeriod, setLastPaidPeriod] = useState<string | null>(null);
  useEffect(() => {
    if (!employeeId) return;
    fetch(`/api/employees/${employeeId}/transactions`)
      .then(r => r.ok ? r.json() : [])
      .then((txns: any[]) => {
        const payments = (txns || []).filter(t => t.type === 'payment');
        if (payments.length === 0) return;
        // Берём самый поздний платёж
        const latest = payments.reduce((max, t) => new Date(t.date) > new Date(max.date) ? t : max);
        setLastPaidPeriod(new Date(latest.date).toISOString().slice(0, 7));
      })
      .catch(() => { /* silent */ });
  }, [employeeId]);

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
      carPlates: [],
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
        carPlates: initialData.carPlates ?? [],
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


  /** Detect critical changes vs initialData (для финального confirm-модала). */
  function detectCriticalChanges(data: EmployeeFormValues): CriticalChange[] {
    if (!initialData) return []; // NEW employee — нет diff

    const changes: CriticalChange[] = [];

    const oldScheme = initialData.salarySchemeId || "unassigned";
    const newScheme = data.salarySchemeId || "unassigned";
    if (oldScheme !== newScheme) {
      const oldName = salarySchemes.find((s) => s.id === oldScheme)?.name ?? "Не назначена";
      const newName = salarySchemes.find((s) => s.id === newScheme)?.name ?? "Не назначена";
      changes.push({
        id: "salaryScheme",
        icon: "wallet-cards",
        title: "Схема зарплаты",
        description: (
          <>
            <b>{oldName}</b> → <b>{newName}</b>. ZP пересчитается за все будущие мойки.
            История уже выплаченной ZP не меняется (запись в EmployeeSalarySchemeHistory).
          </>
        ),
        level: "critical",
      });
    }

    const oldRole = initialData.role || "employee";
    const newRole = data.role || "employee";
    if (oldRole !== newRole) {
      changes.push({
        id: "role",
        icon: "shield-check",
        title: "Роль в системе",
        description: (
          <>
            <b>{ROLE_LABELS[oldRole as EmployeeRole] ?? oldRole}</b> →{" "}
            <b>{ROLE_LABELS[newRole as EmployeeRole] ?? newRole}</b>. Меняет доступ;
            сотрудник может остаться со старой cookie до relogin.
          </>
        ),
        level: "critical",
      });
    }

    const oldUsername = initialData.username || "";
    const newUsername = data.username || "";
    if (oldUsername !== newUsername) {
      changes.push({
        id: "username",
        icon: "user",
        title: "Логин (username)",
        description: (
          <>
            <code className="bg-amber-50 px-1 rounded">{oldUsername || "пусто"}</code> →{" "}
            <code className="bg-amber-50 px-1 rounded">{newUsername || "пусто"}</code>.
            Старый логин больше не сработает; сотрудник должен использовать новый.
          </>
        ),
        level: "warn",
      });
    }

    return changes;
  }

  /** Номер приводим к канону (латиница) сразу — дубли кириллица/латиница не нужны. */
  function addPlate(current: string[], onChange: (v: string[]) => void) {
    const plate = normalizeLicensePlate(plateDraft);
    if (!plate) return;
    if (!current.includes(plate)) onChange([...current, plate]);
    setPlateDraft('');
  }

  async function performSave(data: EmployeeFormValues) {
    const currentEmployeeId = employeeId || `emp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    // 🔥 ФИКС 2026-08-09: форма знает только admin/employee/kiosk, а в базе есть
    // ещё роль-устройство 'kiosk1' (терминал бокса). normalizeEmployeeFormRole
    // сводила её к 'employee' — то есть простое сохранение карточки терминала
    // молча лишало его прав. Раньше это не стреляло только потому, что адаптер
    // и так отдавал 'employee' (см. БАГИ-СПОСОБ-ОПЛАТЫ-2026-08-09). Теперь роль
    // читается верно, и форму нужно научить её не трогать.
    const initialRole = initialData?.role as string | undefined;
    const roleIsBeyondForm = !!initialRole
      && !['admin', 'employee', 'kiosk', 'kiosk1'].includes(initialRole);
    const enforcedRole: EmployeeRole = roleIsBeyondForm
      ? (initialRole as EmployeeRole)
      : normalizeEmployeeFormRole(data.role);

    const employeeToSave: Employee = {
      id: currentEmployeeId,
      fullName: data.fullName,
      phone: data.phone,
      paymentDetails: data.paymentDetails,
      hasCar: data.hasCar,
      carPlates: data.carPlates,
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
        headers: { 'Content-Type': 'application/json' },
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

      // Закрыть pending confirm
      setPendingConfirm(null);

      if (isNew) {
        router.push('/employees');
      } else {
        // Re-lock dangerous fields после успешного сохранения
        setSchemeUnlocked(false);
        setRoleUnlocked(false);
        setUsernameUnlocked(false);
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

  async function onSubmit(data: EmployeeFormValues) {
    // UX-safety: на edit — если есть критичные изменения, открываем confirm-modal
    const critical = detectCriticalChanges(data);
    if (critical.length > 0) {
      setPendingConfirm({ changes: critical, data });
      return; // submit будет вызван из onConfirm модала
    }
    // Безопасный путь — сразу save
    await performSave(data);
  }

  // Phase 4D-2: SafetyBar сверху на edit-странице.
  // Tracks current dirty/dangerous changes vs initialData в реальном времени.
  // Используем useWatch для отслеживания изменений без re-render всей формы.
  const watchedScheme = useWatch({ control: form.control, name: 'salarySchemeId' });
  const watchedRole = useWatch({ control: form.control, name: 'role' });
  const watchedUsername = useWatch({ control: form.control, name: 'username' });

  const lockedCount = [
    !schemeUnlocked,
    !roleUnlocked,
    !usernameUnlocked,
  ].filter(Boolean).length;

  const dangerousChangesCount = isExisting ? (
    (watchedScheme !== (initialData?.salarySchemeId || 'unassigned') ? 1 : 0) +
    (watchedRole !== normalizeEmployeeFormRole(initialData?.role) ? 1 : 0) +
    ((watchedUsername || '') !== (initialData?.username || '') ? 1 : 0)
  ) : 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 md:space-y-8">
        {/* Phase 4D-2: SafetyBar сверху (только на edit) */}
        {isExisting && (
          <SafetyBar
            level={dangerousChangesCount > 0 ? 'critical' : 'info'}
            items={[
              {
                icon: 'lock',
                label: 'Опасных полей залочено',
                value: `${lockedCount} из 3`,
              },
              {
                icon: 'banknote',
                label: 'Последняя выплата ЗП',
                value: lastPaidPeriod || 'не было',
              },
              {
                icon: 'edit-3',
                label: 'Несохранённых изменений',
                value: dangerousChangesCount > 0
                  ? `${dangerousChangesCount} критичных`
                  : 'нет',
              },
            ]}
          />
        )}

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
            {/* 🔥 2026-08-09: до этого номер машины сотрудника хранить было негде —
                только галочка «есть автомобиль», да/нет. Номер нужен, чтобы
                система узнавала свою машину на мойке (бесплатные мойки
                сотрудникам). Показываем только когда галочка включена. */}
            {form.watch('hasCar') && (
              <FormField
                control={form.control}
                name="carPlates"
                render={({ field }) => (
                  <FormItem className="rounded-lg border p-4 shadow-sm">
                    <FormLabel className="text-base">Госномера машин</FormLabel>
                    <FormDescription>
                      Номер приводится к латинице автоматически — так же, как номера
                      на мойках. Машин может быть несколько.
                    </FormDescription>
                    {field.value && field.value.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        {field.value.map((plate) => (
                          <span
                            key={plate}
                            className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 font-mono text-sm"
                          >
                            {plate}
                            <button
                              type="button"
                              aria-label={`Убрать номер ${plate}`}
                              // Замер 09.08: без -mr/px/leading область нажатия была 8×20 px —
                              // мимо промахивается и мышь, и палец. Даём 24×24.
                              className="-mr-1 flex h-6 w-6 items-center justify-center rounded text-base leading-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => field.onChange(field.value.filter((p) => p !== plate))}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <FormControl>
                        <Input
                          placeholder="Х096ТВ33"
                          className="font-mono uppercase"
                          value={plateDraft}
                          onChange={(e) => setPlateDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addPlate(field.value, field.onChange);
                            }
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => addPlate(field.value, field.onChange)}
                      >
                        Добавить
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
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

        {/* UX-safety: схема зарплаты под замком (Phase 4C2).
            Закрывает АРХ-НАХОДКИ #2: смена scheme затрагивает расчёт ZP. */}
        {isExisting ? (
          <DangerGate
            label="Схема зарплаты"
            level="critical"
            locked={!schemeUnlocked}
            currentValue={
              (() => {
                const sid = initialData?.salarySchemeId;
                if (!sid) return "Не назначена";
                const scheme = salarySchemes.find((s) => s.id === sid);
                return scheme?.name ?? `(${sid})`;
              })()
            }
            impact="Изменение пересчитает ZP за все будущие мойки. История ранее выплаченных ZP не меняется (фиксируется в EmployeeSalarySchemeHistory)."
            onUnlock={() => setSchemeUnlocked(true)}
            onRelock={() => {
              setSchemeUnlocked(false);
              form.setValue('salarySchemeId', initialData?.salarySchemeId || 'unassigned');
            }}
          >
            <FormField
              control={form.control}
              name="salarySchemeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[12px] text-amber-700">Новая схема</FormLabel>
                  {isLoadingSchemes ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Загрузка схем...</span>
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="border-amber-400 bg-amber-50/40">
                          <SelectValue placeholder="Выберите схему..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unassigned">Не назначена</SelectItem>
                        {salarySchemes
                          .filter((s) => !s.archived || s.id === initialData?.salarySchemeId)
                          .map((scheme) => (
                            <SelectItem key={scheme.id} value={scheme.id}>
                              {scheme.name}
                              {scheme.archived && " (архивная)"}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Phase 4D-1 + Phase 7: Live Impact Preview с реальными данными
                из /api/employees/[id]/scheme-impact (если employeeId есть). */}
            <SchemeImpactPreview
              employeeId={employeeId}
              oldSchemeId={initialData?.salarySchemeId}
              newSchemeId={watchedScheme || 'unassigned'}
              schemes={salarySchemes}
              lastPaidPeriod={lastPaidPeriod}
            />
          </DangerGate>
        ) : (
          /* NEW employee — без замка, обычная карточка */
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
                        <Loader2 className="h-4 w-4 animate-spin" />
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
                          {salarySchemes.filter((s) => !s.archived).map((scheme) => (
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
        )}

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="font-headline text-xl flex items-center gap-2">
              <KeyRound />
              Учетные данные для входа
            </CardTitle>
            <CardDescription>Задайте логин и пароль для доступа сотрудника к рабочей станции. Это необязательные поля.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Username: warn-level DangerGate на edit */}
            {isExisting ? (
              <DangerGate
                label="Логин (username)"
                level="warn"
                locked={!usernameUnlocked}
                currentValue={initialData?.username || <span className="text-gray-400">не задан</span>}
                impact="UNIQUE-поле. Старый логин больше не сработает; сотруднику нужно использовать новый при следующем входе."
                onUnlock={() => setUsernameUnlocked(true)}
                onRelock={() => {
                  setUsernameUnlocked(false);
                  form.setValue('username', initialData?.username || '');
                }}
              >
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          placeholder="ivanov_i"
                          className="border-amber-400 bg-amber-50/40"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormDescription className="text-[11px]">
                        Латинские буквы, цифры и нижнее подчёркивание. Должен быть уникальным.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DangerGate>
            ) : (
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
            )}

            {/* Role: critical-level DangerGate на edit */}
            {isExisting ? (
              <DangerGate
                label="Роль в системе"
                level="critical"
                locked={!roleUnlocked}
                currentValue={ROLE_LABELS[(initialData?.role || 'employee') as EmployeeRole] ?? initialData?.role}
                impact="Меняет уровень доступа. Cookie сотрудника со старой ролью продолжит работать до relogin (TTL 7 дней)."
                onUnlock={() => setRoleUnlocked(true)}
                onRelock={() => {
                  setRoleUnlocked(false);
                  form.setValue('role', normalizeEmployeeFormRole(initialData?.role));
                }}
              >
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-[12px] text-rose-700">
                        <ShieldCheck className="h-4 w-4" /> Новая роль
                      </FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value as EmployeeRole)}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="border-rose-400 bg-rose-50/40">
                            <SelectValue placeholder="Выберите роль..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {(Object.entries(ROLE_LABELS) as [EmployeeRole, string][]).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-[11px]">
                        Администратор — полный доступ. Сотрудник — заказы/график/зарплата. Киоск — общий терминал бокса.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </DangerGate>
            ) : (
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
            )}

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
                    <Input type="password" placeholder={employeeId ? "Новый пароль (не меняется, если пусто)" : "Задайте пароль"} {...field} value={field.value || ''} autoComplete="new-password" />
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

      {/* UX-safety: confirm-modal для критичных изменений (Phase 4C2) */}
      <ConfirmCriticalChangesModal
        open={!!pendingConfirm}
        changes={pendingConfirm?.changes ?? []}
        employeeName={initialData?.fullName ?? ''}
        isSubmitting={form.formState.isSubmitting}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          if (pendingConfirm) {
            performSave(pendingConfirm.data);
          }
        }}
      />
    </Form>
  );
}
