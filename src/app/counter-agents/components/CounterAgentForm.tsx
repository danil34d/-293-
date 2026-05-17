"use client";

import React, { useEffect } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@/lib/zod-resolver";
import type { CounterAgent, WashEvent } from "@/types";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { normalizeLicensePlate } from "@/lib/utils";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyAccordion, companySchema, baseCompany } from "@/components/common/CompanyAccordion";
import { PriceListEditor, priceListItemSchema } from "@/components/common/PriceListEditor";
import { Cog, Copy, Save, X, Scale, HandCoins } from "lucide-react";
import { DangerGate } from "@/components/admin";

const schema = z.object({
  name: z.string().min(2, "Имя агента должно содержать не менее 2 символов."),
  companies: z.array(companySchema).optional(),
  cars: z.string().optional().superRefine((text, ctx) => {
    if (!text) return;
    const plates = text.split("\n").map((plate) => normalizeLicensePlate(plate.trim())).filter(Boolean);
    const unique = new Set<string>();
    plates.forEach((plate) => {
      if (unique.has(plate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Дублирующийся номерной знак: ${plate}`,
        });
      }
      unique.add(plate);
    });
  }),
  priceList: z.array(priceListItemSchema).optional(),
  additionalPriceList: z.array(priceListItemSchema).optional(),
  allowCustomServices: z.boolean().optional(),
  balance: z.coerce.number().optional(),
});

type Values = z.infer<typeof schema>;
type CarFilter = "all" | "recent" | "stale" | "never";
type TabKey = "general" | "cars" | "pricing" | "companies";

interface Props {
  initialData?: CounterAgent | null;
  agentId?: string;
  referenceAgents?: CounterAgent[];
  washEvents?: WashEvent[];
}

const RECENT_DAYS = 30;

function normalizeItems(items: CounterAgent["priceList"]) {
  return items?.map((item) => ({
    serviceName: item.serviceName || "",
    price: item.price ?? 0,
    chemicalConsumption: item.chemicalConsumption ?? 0,
  })) || [];
}

function getBalanceMeta(balance: number) {
  if (balance < 0) {
    return { label: "Долг", className: "border-rose-200 bg-rose-50 text-rose-700", hint: "Контрагент должен оплатить мойки" };
  }
  if (balance > 0) {
    return { label: "Предоплата", className: "border-emerald-200 bg-emerald-50 text-emerald-700", hint: "У контрагента есть запас по оплате" };
  }
  return { label: "Ноль", className: "border-slate-200 bg-slate-50 text-slate-700", hint: "Баланс сейчас закрыт" };
}

function getCarStatusLabel(status: Exclude<CarFilter, "all">) {
  if (status === "recent") return "Недавно мылись";
  if (status === "stale") return "Давно не мылись";
  return "Не мылись";
}

function tabByField(field?: keyof Values): TabKey {
  if (field === "cars") return "cars";
  if (field === "companies") return "companies";
  if (field === "priceList" || field === "additionalPriceList" || field === "allowCustomServices") return "pricing";
  return "general";
}

function parseCarLines(text: string) {
  const rawLines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const normalizedLines = rawLines
    .map((line) => ({ raw: line, normalized: normalizeLicensePlate(line) }))
    .filter((line) => line.normalized);

  const uniqueNormalized = Array.from(new Set(normalizedLines.map((line) => line.normalized)));
  const invalidLines = rawLines.filter((line) => !normalizeLicensePlate(line));

  return {
    rawLines,
    normalizedLines,
    uniqueNormalized,
    invalidLines,
    duplicateCount: normalizedLines.length - uniqueNormalized.length,
  };
}

export function CounterAgentForm({
  initialData,
  agentId,
  referenceAgents = [],
  washEvents = [],
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<TabKey>("general");
  const [priceSourceId, setPriceSourceId] = React.useState("");
  const [carFilter, setCarFilter] = React.useState<CarFilter>("all");
  const [carSearchQuery, setCarSearchQuery] = React.useState("");
  const [quickCarInput, setQuickCarInput] = React.useState("");
  const [bulkCarsInput, setBulkCarsInput] = React.useState("");
  const [balanceAdjustment, setBalanceAdjustment] = React.useState("1000");
  // Phase 6.3: balance под DangerGate-замком на edit (на create — открыт)
  const isExisting = !!agentId;
  const [balanceUnlocked, setBalanceUnlocked] = React.useState(!isExisting);

  const defaults = React.useMemo(() => ({
    name: initialData?.name || "",
    companies: initialData?.companies?.length ? initialData.companies.map((company) => ({ ...baseCompany, ...company })) : [baseCompany],
    cars: initialData?.cars?.map((car) => car.licensePlate).join("\n") || "",
    priceList: normalizeItems(initialData?.priceList),
    additionalPriceList: normalizeItems(initialData?.additionalPriceList),
    allowCustomServices: initialData?.allowCustomServices ?? true,
    balance: initialData?.balance ?? 0,
  }), [initialData]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onChange",
  });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const watchedCars = form.watch("cars") || "";
  const watchedBalance = Number(form.watch("balance") ?? 0);
  const watchedCompanies = form.watch("companies") || [];
  const watchedPriceList = form.watch("priceList") || [];
  const watchedAdditionalPriceList = form.watch("additionalPriceList") || [];
  const balanceMeta = React.useMemo(() => getBalanceMeta(watchedBalance), [watchedBalance]);

  const availablePriceSources = React.useMemo(
    () => referenceAgents.filter((agent) => !agent.archived && agent.id !== agentId).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [referenceAgents, agentId]
  );

  const lastWashByPlate = React.useMemo(() => {
    const latest = new Map<string, Date>();
    washEvents.forEach((event) => {
      const plate = normalizeLicensePlate(event.vehicleNumber || "");
      if (!plate) return;
      const eventDate = new Date(event.timestamp);
      const prev = latest.get(plate);
      if (!prev || prev < eventDate) latest.set(plate, eventDate);
    });
    return latest;
  }, [washEvents]);

  const carEntries = React.useMemo(() => {
    const unique = Array.from(new Set(watchedCars.split("\n").map((plate) => normalizeLicensePlate(plate.trim())).filter(Boolean)));
    return unique.map((licensePlate) => {
      const lastWashDate = lastWashByPlate.get(licensePlate);
      const daysSinceLastWash = lastWashDate ? Math.floor((Date.now() - lastWashDate.getTime()) / 86400000) : null;
      const status: Exclude<CarFilter, "all"> = !lastWashDate ? "never" : (daysSinceLastWash ?? 0) <= RECENT_DAYS ? "recent" : "stale";
      return { licensePlate, lastWashDate, daysSinceLastWash, status };
    }).sort((a, b) => {
      if (!a.lastWashDate && !b.lastWashDate) return a.licensePlate.localeCompare(b.licensePlate, "ru");
      if (!a.lastWashDate) return 1;
      if (!b.lastWashDate) return -1;
      return b.lastWashDate.getTime() - a.lastWashDate.getTime();
    });
  }, [lastWashByPlate, watchedCars]);

  const carCounts = React.useMemo(() => ({
    all: carEntries.length,
    recent: carEntries.filter((item) => item.status === "recent").length,
    stale: carEntries.filter((item) => item.status === "stale").length,
    never: carEntries.filter((item) => item.status === "never").length,
  }), [carEntries]);

  const filteredCars = React.useMemo(
    () => carFilter === "all" ? carEntries : carEntries.filter((item) => item.status === carFilter),
    [carEntries, carFilter]
  );

  const rawNormalizedCars = React.useMemo(
    () => watchedCars.split("\n").map((plate) => normalizeLicensePlate(plate.trim())).filter(Boolean),
    [watchedCars]
  );

  const duplicateCarsCount = React.useMemo(
    () => rawNormalizedCars.length - carEntries.length,
    [rawNormalizedCars, carEntries.length]
  );

  const visibleCars = React.useMemo(() => {
    const normalizedQuery = normalizeLicensePlate(carSearchQuery.trim());
    if (!normalizedQuery) {
      return filteredCars;
    }

    return filteredCars.filter((item) => item.licensePlate.includes(normalizedQuery));
  }, [carFilter, carSearchQuery, filteredCars]);

  const bulkImportPreview = React.useMemo(() => {
    const parsed = parseCarLines(bulkCarsInput);
    const existingCars = new Set(carEntries.map((item) => item.licensePlate));
    const alreadyExists = parsed.uniqueNormalized.filter((plate) => existingCars.has(plate));
    const toAdd = parsed.uniqueNormalized.filter((plate) => !existingCars.has(plate));

    return {
      ...parsed,
      alreadyExists,
      toAdd,
    };
  }, [bulkCarsInput, carEntries]);

  const filledCompaniesCount = React.useMemo(
    () => watchedCompanies.filter((company) => Object.values(company || {}).some((value) => String(value ?? "").trim() !== "")).length,
    [watchedCompanies]
  );

  function setBalanceValue(value: number) {
    form.setValue("balance", value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  }

  function setCarsValue(plates: string[]) {
    form.setValue("cars", plates.join("\n"), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }

  function cleanupCarsList() {
    const cleanedCars = Array.from(new Set(rawNormalizedCars));
    setCarsValue(cleanedCars);
    toast({
      title: "Автопарк очищен",
      description: `Оставлено ${cleanedCars.length} уникальных номеров.`,
    });
  }

  function sortCarsList() {
    const sortedCars = Array.from(new Set(rawNormalizedCars)).sort((a, b) => a.localeCompare(b, "ru"));
    setCarsValue(sortedCars);
    toast({
      title: "Автопарк отсортирован",
      description: `Список отсортирован по номеру. Всего ${sortedCars.length} машин.`,
    });
  }

  function removeCar(licensePlate: string) {
    const nextCars = rawNormalizedCars.filter((plate) => plate !== licensePlate);
    setCarsValue(Array.from(new Set(nextCars)));
  }

  function appendCars(plates: string[]) {
    const mergedCars = Array.from(new Set([...rawNormalizedCars, ...plates]));
    setCarsValue(mergedCars);
  }

  function addSingleCar() {
    const normalizedPlate = normalizeLicensePlate(quickCarInput.trim());

    if (!normalizedPlate) {
      toast({
        title: "Некорректный номер",
        description: "Введите номер машины в понятном формате.",
        variant: "destructive",
      });
      return;
    }

    if (carEntries.some((item) => item.licensePlate === normalizedPlate)) {
      toast({
        title: "Машина уже есть",
        description: `Номер ${normalizedPlate} уже присутствует в автопарке.`,
        variant: "destructive",
      });
      return;
    }

    appendCars([normalizedPlate]);
    setQuickCarInput("");
    toast({
      title: "Машина добавлена",
      description: `Номер ${normalizedPlate} добавлен в автопарк.`,
    });
  }

  function importCars() {
    if (bulkImportPreview.toAdd.length === 0) {
      toast({
        title: "Нечего добавлять",
        description: "Во вставке нет новых номеров для автопарка.",
        variant: "destructive",
      });
      return;
    }

    appendCars(bulkImportPreview.toAdd);
    setBulkCarsInput("");
    toast({
      title: "Импорт завершен",
      description: `Добавлено ${bulkImportPreview.toAdd.length} новых машин.`,
    });
  }

  function collectCarsForSubmit(sourceText: string) {
    const parsedCars = sourceText
      .split("\n")
      .map((plate) => normalizeLicensePlate(plate.trim()))
      .filter(Boolean);
    const pendingQuickRaw = quickCarInput.trim();
    const pendingQuickPlate = pendingQuickRaw ? normalizeLicensePlate(pendingQuickRaw) : "";
    const pendingBulk = parseCarLines(bulkCarsInput);
    const mergedCars = Array.from(new Set([
      ...parsedCars,
      ...(pendingQuickPlate ? [pendingQuickPlate] : []),
      ...pendingBulk.uniqueNormalized,
    ]));

    return {
      parsedCars,
      mergedCars,
      pendingQuickRaw,
      pendingQuickPlate,
      pendingBulk,
    };
  }

  function applyBalance(direction: "increase" | "decrease") {
    const amount = Number(balanceAdjustment);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Некорректная сумма", description: "Введите положительную сумму для корректировки баланса.", variant: "destructive" });
      return;
    }
    const current = Number(form.getValues("balance") ?? 0);
    setBalanceValue(direction === "increase" ? current + amount : current - amount);
  }

  function copyPriceFromAgent() {
    if (!priceSourceId) {
      toast({ title: "Источник не выбран", description: "Выберите контрагента, из которого нужно скопировать прайс.", variant: "destructive" });
      return;
    }
    const source = availablePriceSources.find((agent) => agent.id === priceSourceId);
    if (!source) {
      toast({ title: "Контрагент не найден", description: "Не удалось найти выбранный источник прайса.", variant: "destructive" });
      return;
    }
    form.setValue("priceList", normalizeItems(source.priceList), { shouldDirty: true, shouldTouch: true });
    form.setValue("additionalPriceList", normalizeItems(source.additionalPriceList), { shouldDirty: true, shouldTouch: true });
    form.setValue("allowCustomServices", source.allowCustomServices ?? true, { shouldDirty: true, shouldTouch: true });
    toast({ title: "Прайс скопирован", description: `Прайс перенесен из "${source.name}".` });
  }

  function onInvalid(errors: FieldErrors<Values>) {
    const field = Object.keys(errors)[0] as keyof Values | undefined;
    const nextTab = tabByField(field);
    setActiveTab(nextTab);
    toast({ title: "Форма заполнена не полностью", description: "Проверьте активную вкладку.", variant: "destructive" });
  }

  async function onSubmit(data: Values) {
    const currentAgentId = agentId || `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const {
      parsedCars,
      mergedCars,
      pendingQuickRaw,
      pendingQuickPlate,
      pendingBulk,
    } = collectCarsForSubmit(data.cars || "");

    if (pendingQuickRaw && !pendingQuickPlate) {
      setActiveTab("cars");
      toast({
        title: "Проверьте быстрый ввод",
        description: "В поле быстрого добавления остался номер, который не удалось распознать. Исправьте его или очистите поле.",
        variant: "destructive",
      });
      return;
    }

    const agentToSave: CounterAgent = {
      id: currentAgentId,
      name: data.name,
      archived: initialData?.archived,
      archivedAt: initialData?.archivedAt,
      companies: data.companies || [],
      cars: mergedCars.map((plate, index) => {
        const existingCar = initialData?.cars.find((car) => car.licensePlate === plate);
        return { id: existingCar?.id || `car_${currentAgentId}_${index + 1}_${plate}`, licensePlate: plate };
      }),
      priceList: data.priceList || [],
      additionalPriceList: data.additionalPriceList || [],
      allowCustomServices: data.allowCustomServices,
      balance: data.balance,
    };

    try {
      const response = await fetch(`/api/counter-agents/${currentAgentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentToSave),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save agent: ${response.statusText}`);
      }
      const normalizedCarsText = mergedCars.join("\n");
      form.reset({ ...data, cars: normalizedCarsText });
      setQuickCarInput("");
      setBulkCarsInput("");
      router.refresh();
      toast({
        title: agentId ? "Агент обновлен" : "Агент создан",
        description: (
          <span>
            Контрагент <strong>{agentToSave.name}</strong> успешно сохранен.
            {mergedCars.length > parsedCars.length ? ` Автоматически добавлено номеров: ${mergedCars.length - parsedCars.length}.` : ""}
            {pendingBulk.invalidLines.length > 0 ? ` Пропущено невалидных строк: ${pendingBulk.invalidLines.length}.` : ""}
          </span>
        ),
      });
      if (!agentId) router.push("/counter-agents");
    } catch (error: any) {
      console.error("Error saving counter agent:", error);
      toast({ title: "Ошибка сохранения", description: error.message || "Не удалось сохранить данные контрагента.", variant: "destructive" });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6 md:space-y-8">
        <Card className="border-dashed shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="font-headline text-xl">Быстрый обзор</CardTitle>
                <CardDescription>Сводка по карточке контрагента: баланс, автопарк, прайс и реквизиты.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className={balanceMeta.className}>{balanceMeta.label}</Badge>
                {initialData?.archived ? <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">В архиве</Badge> : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border bg-muted/20 p-4"><div className="text-sm text-muted-foreground">Баланс</div><div className="mt-2 text-2xl font-semibold">{watchedBalance.toLocaleString("ru-RU")} ₽</div><div className="mt-1 text-sm text-muted-foreground">{balanceMeta.hint}</div></div>
              <div className="rounded-lg border bg-muted/20 p-4"><div className="text-sm text-muted-foreground">Автопарк</div><div className="mt-2 text-2xl font-semibold">{carCounts.all}</div><div className="mt-1 text-sm text-muted-foreground">{carCounts.recent} недавно, {carCounts.stale} давно, {carCounts.never} без моек</div></div>
              <div className="rounded-lg border bg-muted/20 p-4"><div className="text-sm text-muted-foreground">Прайс</div><div className="mt-2 text-2xl font-semibold">{watchedPriceList.length + watchedAdditionalPriceList.length}</div><div className="mt-1 text-sm text-muted-foreground">{watchedPriceList.length} основных, {watchedAdditionalPriceList.length} дополнительных</div></div>
              <div className="rounded-lg border bg-muted/20 p-4"><div className="text-sm text-muted-foreground">Реквизиты</div><div className="mt-2 text-2xl font-semibold">{filledCompaniesCount}</div><div className="mt-1 text-sm text-muted-foreground">Заполненных карточек компаний</div></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setActiveTab("general")}>Основное</Button>
              <Button type="button" variant="outline" onClick={() => setActiveTab("cars")}>Автопарк</Button>
              <Button type="button" variant="outline" onClick={() => setActiveTab("pricing")}>Прайс и услуги</Button>
              <Button type="button" variant="outline" onClick={() => setActiveTab("companies")}>Реквизиты</Button>
              {agentId ? <Button type="button" variant="outline" onClick={() => router.push(`/counter-agents/${agentId}/finance`)}>Финансы</Button> : null}
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)} className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 md:grid-cols-4">
            <TabsTrigger value="general">Основное</TabsTrigger>
            <TabsTrigger value="cars">Автопарк</TabsTrigger>
            <TabsTrigger value="pricing">Прайс и услуги</TabsTrigger>
            <TabsTrigger value="companies">Реквизиты</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="font-headline text-xl">{agentId ? "Редактировать" : "Создать"} контрагента</CardTitle>
                <CardDescription>Заполните основные данные контрагента.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Имя агента</FormLabel><FormControl><Input placeholder="например, ООО 'Авто Коммерц'" {...field} className="text-base" /></FormControl><FormMessage /></FormItem>
                )} />
                {/* Phase 6.3: balance был под DangerGate.
                    Phase 25 (17.05.2026): backend теперь ИГНОРИРУЕТ balance в PUT
                    (server-side audit enforcement, см. /api/counter-agents/[id]/route.ts).
                    Поэтому форма показывает balance read-only + явный CTA на PaymentModal. */}
                {isExisting ? (
                  <div className="rounded-xl border-2 border-amber-200 bg-amber-50/30 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-amber-100 p-2 flex-shrink-0">
                        <Scale className="h-5 w-5 text-amber-700" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] uppercase tracking-wider font-bold text-amber-700 flex items-center gap-1.5">
                          🔒 Баланс защищён от прямой правки
                        </div>
                        <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                          <div className="text-3xl font-extrabold tabular-nums">
                            {(initialData?.balance ?? 0).toLocaleString("ru-RU")} ₽
                          </div>
                          <Badge variant="outline" className={balanceMeta.className}>{balanceMeta.label}</Badge>
                        </div>
                        <div className="text-[12px] text-muted-foreground mt-1">{balanceMeta.hint}</div>
                        <div className="mt-3 text-[12px] text-amber-900 leading-snug">
                          Phase 25 (17.05.2026): прямая правка баланса в этой форме <b>отключена</b> на уровне сервера
                          (PUT игнорирует поле <code className="bg-amber-100 px-1 rounded text-[11px]">balance</code>).
                          Любое изменение должно идти через <b>«Добавить платёж»</b> в списке контрагентов
                          — это создаёт <code className="bg-amber-100 px-1 rounded text-[11px]">ClientTransaction(type='payment')</code> с audit-меткой.
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button type="button" variant="outline" onClick={() => router.push('/counter-agents')}>
                        <HandCoins className="w-4 h-4 mr-1.5" /> К списку → Добавить платёж
                      </Button>
                      {agentId ? (
                        <Button type="button" variant="ghost" onClick={() => router.push(`/counter-agents/${agentId}/finance`)}>
                          Открыть финансы
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <FormField control={form.control} name="balance" render={({ field }) => (
                    <FormItem><FormLabel>Стартовый баланс (руб.)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} /></FormControl><FormDescription>Отрицательное значение = долг клиента, положительное = предоплата.</FormDescription><FormMessage /></FormItem>
                  )} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cars" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="font-headline text-lg">Автопарк</CardTitle>
                <CardDescription>Вставьте список госномеров, каждый на новой строке.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Быстро добавить одну машину</div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <Input
                        value={quickCarInput}
                        onChange={(event) => setQuickCarInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addSingleCar();
                          }
                        }}
                        placeholder="Например, А123ВС777"
                        className="sm:flex-1"
                      />
                      <Button type="button" onClick={addSingleCar}>
                        Добавить
                      </Button>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Номер нормализуется автоматически и сразу добавляется в основной список.
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-sm font-medium">Массовый импорт</div>
                    <Textarea
                      value={bulkCarsInput}
                      onChange={(event) => setBulkCarsInput(event.target.value)}
                      placeholder={`А123ВС777\nХ456УZ152\n...`}
                      rows={5}
                      className="mt-3 font-mono text-sm"
                    />
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">К добавлению: {bulkImportPreview.toAdd.length}</div>
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">Уже есть: {bulkImportPreview.alreadyExists.length}</div>
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">Дубли во вставке: {bulkImportPreview.duplicateCount}</div>
                      <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">Невалидные: {bulkImportPreview.invalidLines.length}</div>
                    </div>
                    {bulkImportPreview.toAdd.length > 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Будут добавлены: {bulkImportPreview.toAdd.slice(0, 6).join(", ")}{bulkImportPreview.toAdd.length > 6 ? "..." : ""}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={importCars} disabled={bulkImportPreview.toAdd.length === 0}>
                        Импортировать в автопарк
                      </Button>
                      {bulkCarsInput ? (
                        <Button type="button" variant="ghost" onClick={() => setBulkCarsInput("")}>
                          Очистить вставку
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <FormField control={form.control} name="cars" render={({ field }) => (
                  <FormItem><FormLabel>Список номеров машин</FormLabel><FormControl><Textarea placeholder={`A123BC777\nX456YZ152\n...`} rows={15} {...field} className="font-mono text-sm" /></FormControl><FormDescription>Русские буквы будут автоматически преобразованы в латинские.</FormDescription><FormMessage /></FormItem>
                )} />
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm text-muted-foreground">Уникальные машины</div>
                    <div className="mt-2 text-2xl font-semibold">{carCounts.all}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm text-muted-foreground">Дубликаты в вставке</div>
                    <div className="mt-2 text-2xl font-semibold">{duplicateCarsCount}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm text-muted-foreground">Сейчас показано</div>
                    <div className="mt-2 text-2xl font-semibold">{visibleCars.length}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <Input
                    value={carSearchQuery}
                    onChange={(event) => setCarSearchQuery(event.target.value)}
                    placeholder="Поиск по номеру"
                    className="lg:max-w-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={cleanupCarsList}>
                      Нормализовать список
                    </Button>
                    <Button type="button" variant="outline" onClick={sortCarsList}>
                      Сортировать A-Z
                    </Button>
                    {carSearchQuery ? (
                      <Button type="button" variant="ghost" onClick={() => setCarSearchQuery("")}>
                        Сбросить поиск
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={carFilter === "all" ? "default" : "outline"} size="sm" onClick={() => setCarFilter("all")}>Все ({carCounts.all})</Button>
                    <Button type="button" variant={carFilter === "recent" ? "default" : "outline"} size="sm" onClick={() => setCarFilter("recent")}>Недавно мылись ({carCounts.recent})</Button>
                    <Button type="button" variant={carFilter === "stale" ? "default" : "outline"} size="sm" onClick={() => setCarFilter("stale")}>Давно не мылись ({carCounts.stale})</Button>
                    <Button type="button" variant={carFilter === "never" ? "default" : "outline"} size="sm" onClick={() => setCarFilter("never")}>Не мылись ({carCounts.never})</Button>
                  </div>
                  <div className="rounded-md border">
                    {visibleCars.length > 0 ? (
                      <div className="divide-y">
                        {visibleCars.map((entry) => (
                          <div key={entry.licensePlate} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                            <div className="font-mono text-sm font-medium">{entry.licensePlate}</div>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground md:justify-end">
                              <span className={`rounded-full px-2 py-1 text-xs font-medium ${entry.status === "recent" ? "bg-emerald-100 text-emerald-700" : entry.status === "stale" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{getCarStatusLabel(entry.status)}</span>
                              <span>{entry.lastWashDate ? `Последняя мойка: ${entry.lastWashDate.toLocaleDateString("ru-RU")} (${entry.daysSinceLastWash} дн. назад)` : "По журналу моек пока не встречалась"}</span>
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeCar(entry.licensePlate)}>
                                Удалить
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <div className="px-4 py-6 text-sm text-muted-foreground">Для текущего фильтра и поиска машин пока нет.</div>}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-6">
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="font-headline text-lg">Индивидуальный прайс-лист</CardTitle>
                <CardDescription>Специальные цены на основные услуги для этого контрагента.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {availablePriceSources.length > 0 ? (
                  <div className="rounded-lg border p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Copy className="h-4 w-4" />Скопировать прайс из другого контрагента</div>
                    <div className="flex flex-col gap-3 md:flex-row">
                      <Select value={priceSourceId} onValueChange={setPriceSourceId}>
                        <SelectTrigger className="md:flex-1"><SelectValue placeholder="Выберите контрагента-источник" /></SelectTrigger>
                        <SelectContent>{availablePriceSources.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button type="button" variant="outline" onClick={copyPriceFromAgent}><Copy className="mr-2 h-4 w-4" />Копировать прайс</Button>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">Копируются основные услуги, дополнительные услуги и настройка произвольных доп. услуг.</p>
                  </div>
                ) : null}
                <PriceListEditor control={form.control} fieldArrayName="priceList" emptyListMessage="Прайс-лист пока пуст." buttonText="Добавить основную услугу" />
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="font-headline text-lg flex items-center gap-2"><Cog className="h-5 w-5" />Дополнительные услуги и настройки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField control={form.control} name="allowCustomServices" render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Разрешить произвольные доп. услуги</FormLabel>
                      <FormDescription>Разрешить сотруднику добавлять кастомные услуги с произвольным названием и ценой.</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Разрешить произвольные доп. услуги" /></FormControl>
                  </FormItem>
                )} />
                <Separator />
                <div>
                  <h3 className="mb-2 text-md font-semibold">Прайс-лист на доп. услуги</h3>
                  <p className="mb-4 text-sm text-muted-foreground">Список предопределенных дополнительных услуг для рабочей станции.</p>
                  <PriceListEditor control={form.control} fieldArrayName="additionalPriceList" emptyListMessage="Список доп. услуг пуст." buttonText="Добавить доп. услугу в прайс" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="companies" className="space-y-6">
            <CompanyAccordion control={form.control as any} />
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={() => router.push("/counter-agents")}><X className="mr-2 h-4 w-4" /> Отмена</Button>
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
            <Save className="mr-2 h-4 w-4" />
            {form.formState.isSubmitting ? (agentId ? "Сохранение..." : "Создание...") : (agentId ? "Сохранить изменения" : "Создать агента")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
