
"use client";

import { useState, useMemo } from 'react';
import type { WashEvent, Employee, Expense, EmployeeTransaction, EmployeeTransactionType, Inventory, InventoryMaterial, InventorySettings } from "@/types";
import { format, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShoppingCart, Droplets, PackageCheck, PackageOpen, Package, Users, AlertTriangle, Plus, Loader2, Settings, Box, Beaker, Fuel, Gift } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { calculateWashesPerCanister, calculateConcentratePerWash, type DilutionSettings } from '@/lib/utils';
import { Car } from 'lucide-react';
import { RecomputeStockSection } from './RecomputeStockSection';

interface InventoryDashboardProps {
  inventory: Inventory;
  allWashEvents: WashEvent[];
  allExpenses: Expense[];
  allEmployeeTransactions: EmployeeTransaction[];
  employees: Employee[];
}

type StockMovementLocal = {
    id: string;
    date: Date;
    type: 'purchase' | 'consumption' | 'issue';
    description: string;
    amountGrams: number;
    balanceAfterGrams: number;
}

// Default settings if not provided
// ВАЖНО: Канистра 22 кг веса = 19 литров объёма
// Стандарт: фура 90 кубов (тягач+прицеп) = 600 мл концентрата = 6.6 л раствора
const DEFAULT_SETTINGS: InventorySettings = {
    defaultChemicalConsumptionPerWash: 6600, // мл раствора на мойку (даёт 600 мл концентрата)
    canisterWeightGrams: 22000, // 22 кг
    canisterVolumeMl: 19000, // 19 литров
    canisterPriceRub: 3000,
    lowStockThresholdKg: 10,
    autoDeductChemical: true,
    chemicalPricePerKg: 150,
    // Настройки разбавления (по умолчанию 1:10, мерник 5 литров)
    dilutionEnabled: true,
    dilutionRatio: 10, // 1 часть концентрата на 10 частей воды
    measuringContainerMl: 5000, // 5 литров
    solutionPerWash: 6600, // 6.6 л раствора на мойку
    solutionPerWashFull: 6600, // полная мойка фуры 90 кубов
    solutionPerWashPartial: 3300, // частичная мойка
};

export function InventoryDashboard({ inventory, allWashEvents, allExpenses, allEmployeeTransactions, employees }: InventoryDashboardProps) {
    const settings = inventory.settings || DEFAULT_SETTINGS;
    const CHEMICAL_CANISTER_PRICE = settings.canisterPriceRub;
    const CHEMICAL_CANISTER_WEIGHT_KG = settings.canisterWeightGrams / 1000;
    const LOW_STOCK_THRESHOLD_KG = settings.lowStockThresholdKg;

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: endOfMonth(new Date()),
    });
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [localSettings, setLocalSettings] = useState<InventorySettings>(settings);

    const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e.fullName])), [employees]);

    const { journalForPeriod, balanceAtStartOfPeriod } = useMemo(() => {
        const allMovements: Omit<StockMovementLocal, 'balanceAfterGrams'>[] = [];

        // 1. Add purchases from expenses
        allExpenses
            .filter(e => e.category === 'Закупка химии' && e.unit === 'кг' && e.quantity)
            .forEach(e => {
                allMovements.push({
                    id: `exp-${e.id}`,
                    date: new Date(e.date),
                    type: 'purchase',
                    description: e.description || 'Закупка химии',
                    amountGrams: (e.quantity || 0) * 1000
                });
            });

        // 2. Add consumption from washes
        allWashEvents.forEach(event => {
            let totalConsumptionForEvent = 0;
            const allServices = [event.services.main, ...event.services.additional];
            allServices.forEach(service => {
                if (service?.employeeConsumptions) {
                    totalConsumptionForEvent += service.employeeConsumptions.reduce((sum, c) => sum + c.amount, 0);
                } else if(service?.chemicalConsumption) {
                    totalConsumptionForEvent += service.chemicalConsumption;
                }
            });
            if (totalConsumptionForEvent > 0) {
                allMovements.push({
                    id: `wash-${event.id}`,
                    date: new Date(event.timestamp),
                    type: 'consumption',
                    description: `Мойка: ${event.vehicleNumber}`,
                    amountGrams: -totalConsumptionForEvent,
                });
            }
        });

        // 3. Add canister issues to employees
        allEmployeeTransactions
            .filter(t => t.type === 'purchase' && t.description.includes('Выдача канистры химии'))
            .forEach(t => {
                allMovements.push({
                    id: `issue-${t.id}`,
                    date: new Date(t.date),
                    type: 'issue',
                    description: `Выдача сотруднику: ${employeeMap.get(t.employeeId)?.split(' ')[0] || 'Неизвестно'}`,
                    amountGrams: -20000,
                });
            });
        
        allMovements.sort((a, b) => a.date.getTime() - b.date.getTime());
        
        // Calculate running balance and start balance
        let balanceAtStartOfPeriod = inventory.chemicalStockGrams;
        const periodStart = dateRange?.from ? startOfMonth(dateRange.from) : new Date(0); // Use a far past date if no range
        
        // To get the start balance, we reverse the operations that happened after the period started
        const movementsAfterStart = allMovements.filter(m => m.date >= periodStart);
        balanceAtStartOfPeriod = movementsAfterStart.reduce((balance, movement) => balance - movement.amountGrams, inventory.chemicalStockGrams);

        let runningBalance = balanceAtStartOfPeriod;
        const journalWithBalance: StockMovementLocal[] = [];
        
        for (const movement of allMovements) {
            runningBalance += movement.amountGrams;
            if (dateRange?.from && isWithinInterval(movement.date, { start: dateRange.from, end: dateRange.to || dateRange.from })) {
                journalWithBalance.push({ ...movement, balanceAfterGrams: runningBalance });
            }
        }

        journalWithBalance.sort((a, b) => b.date.getTime() - a.date.getTime());

        return { journalForPeriod: journalWithBalance, balanceAtStartOfPeriod };
    }, [allWashEvents, allExpenses, allEmployeeTransactions, employeeMap, inventory.chemicalStockGrams, dateRange]);

    const chemicalsWithEmployees = useMemo(() => {
        const issuesByEmployee: Record<string, { name: string, count: number }> = {};
        allEmployeeTransactions
            .filter(t => t.type === 'purchase' && t.description.includes('Выдача канистры химии'))
            .forEach(t => {
                if (!issuesByEmployee[t.employeeId]) {
                    issuesByEmployee[t.employeeId] = {
                        name: employeeMap.get(t.employeeId) || 'Неизвестный сотрудник',
                        count: 0
                    };
                }
                issuesByEmployee[t.employeeId].count++;
            });
        return Object.values(issuesByEmployee).sort((a, b) => b.count - a.count);
    }, [allEmployeeTransactions, employeeMap]);

    const { toast } = useToast();
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [issueDialogOpen, setIssueDialogOpen] = useState(false);
    const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
    const [gasolinePurchaseDialogOpen, setGasolinePurchaseDialogOpen] = useState(false);
    const [giftCanisterDialogOpen, setGiftCanisterDialogOpen] = useState(false);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [giftEmployeeId, setGiftEmployeeId] = useState<string>('');

    const currentStockKg = inventory.chemicalStockGrams / 1000;
    const isLowStock = currentStockKg < LOW_STOCK_THRESHOLD_KG;

    // Выдача канистры сотруднику (через новое API employee-canisters)
    const handleIssueCanister = async () => {
        if (!selectedEmployeeId) {
            toast({ title: "Ошибка", description: "Выберите сотрудника", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            // Issue canister via new API
            const canisterResponse = await fetch('/api/employee-canisters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: selectedEmployeeId,
                    initialAmountGrams: settings.canisterWeightGrams,
                    priceRub: settings.canisterPriceRub,
                }),
            });

            if (!canisterResponse.ok) throw new Error("Не удалось выдать канистру.");

            // Also create debt transaction for employee
            const transactionData = {
                type: 'purchase' as EmployeeTransactionType,
                amount: CHEMICAL_CANISTER_PRICE,
                description: `Выдача канистры химии (${CHEMICAL_CANISTER_WEIGHT_KG} кг)`
            };

            const transactionResponse = await fetch(`/api/employees/${selectedEmployeeId}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transactionData),
            });

            if (!transactionResponse.ok) {
                console.warn("Канистра выдана, но долг не записан");
            }

            toast({ title: "Успешно!", description: `Канистра выдана сотруднику. Долг: ${CHEMICAL_CANISTER_PRICE} руб.` });
            setIssueDialogOpen(false);
            setSelectedEmployeeId('');
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Закупка химии
    const handlePurchaseChemical = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const quantity = parseFloat(formData.get('quantity') as string);
        const price = parseFloat(formData.get('price') as string);
        const description = formData.get('description') as string || 'Закупка химии';

        if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) {
            toast({ title: "Ошибка", description: "Введите корректные значения", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const quantityGrams = quantity * 1000;

            // Create stock movement for purchase
            const movementResponse = await fetch('/api/stock-movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    materialId: 'mat_chemical_main',
                    type: 'purchase',
                    amount: quantityGrams,
                    description: description,
                }),
            });

            if (!movementResponse.ok) throw new Error("Не удалось обновить остаток.");

            // Also create expense record
            const expense = {
                id: `exp_${Date.now()}`,
                date: new Date().toISOString(),
                category: 'Закупка химии',
                description,
                amount: price,
                quantity,
                unit: 'кг',
            };

            const expenseResponse = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expense),
            });

            if (!expenseResponse.ok) {
                console.warn("Остаток обновлён, но расход не создан");
            }

            toast({ title: "Успешно!", description: `Закупка ${quantity} кг химии оформлена.` });
            setPurchaseDialogOpen(false);
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Закупка бензина (канистры)
    const handlePurchaseGasoline = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const quantity = parseFloat(formData.get('gasoline-quantity') as string);
        const price = parseFloat(formData.get('gasoline-price') as string);
        const description = formData.get('gasoline-description') as string || 'Закупка бензина';

        if (isNaN(quantity) || quantity <= 0 || isNaN(price) || price <= 0) {
            toast({ title: "Ошибка", description: "Введите корректные значения", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            // Создаём запись расхода (expense) для бензина
            const expense = {
                id: `exp_${Date.now()}`,
                date: new Date().toISOString(),
                category: 'Закупка бензина',
                description,
                amount: price,
                quantity,
                unit: 'кг',
            };

            const expenseResponse = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expense),
            });

            if (!expenseResponse.ok) {
                throw new Error("Не удалось сохранить закупку бензина.");
            }

            toast({ title: "Успешно!", description: `Закупка ${quantity} кг бензина на ${price} руб. оформлена.` });
            setGasolinePurchaseDialogOpen(false);
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Подарить канистру сотруднику (без долга, сразу в расходы)
    const handleGiftCanister = async () => {
        if (!giftEmployeeId) {
            toast({ title: "Ошибка", description: "Выберите сотрудника", variant: "destructive" });
            return;
        }

        const selectedEmployee = employees.find(e => e.id === giftEmployeeId);
        const employeeName = selectedEmployee?.fullName || 'Сотрудник';

        setIsSubmitting(true);
        try {
            // 1. Списываем канистру со склада (через API employee-canisters)
            const canisterResponse = await fetch('/api/employee-canisters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: giftEmployeeId,
                    initialAmountGrams: settings.canisterWeightGrams,
                    priceRub: 0, // Подарок - цена 0
                }),
            });

            if (!canisterResponse.ok) throw new Error("Не удалось выдать канистру.");

            // 2. Создаём расход автомойки (expense)
            const expense = {
                id: `exp_${Date.now()}`,
                date: new Date().toISOString(),
                category: 'Подарок сотруднику',
                description: `Подарок канистры химии: ${employeeName} (${CHEMICAL_CANISTER_WEIGHT_KG} кг)`,
                amount: CHEMICAL_CANISTER_PRICE,
                quantity: CHEMICAL_CANISTER_WEIGHT_KG,
                unit: 'кг',
            };

            const expenseResponse = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(expense),
            });

            if (!expenseResponse.ok) {
                console.warn("Канистра выдана, но расход не записан");
            }

            toast({ title: "Успешно!", description: `Канистра подарена сотруднику ${employeeName}. Расход: ${CHEMICAL_CANISTER_PRICE} руб.` });
            setGiftCanisterDialogOpen(false);
            setGiftEmployeeId('');
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderIcon = (type: StockMovementLocal['type']) => {
        switch (type) {
            case 'purchase': return <ShoppingCart className="h-4 w-4 text-green-500 shrink-0"/>;
            case 'consumption': return <ArrowRight className="h-4 w-4 text-red-500 shrink-0"/>;
            case 'issue': return <ArrowRight className="h-4 w-4 text-orange-500 shrink-0"/>;
        }
    };

    const renderBadge = (type: StockMovementLocal['type']) => {
        switch (type) {
            case 'purchase': return <Badge variant="outline" className="text-green-700 border-green-300">Закупка</Badge>;
            case 'consumption': return <Badge variant="outline" className="text-red-700 border-red-300">Расход на мойку</Badge>;
            case 'issue': return <Badge variant="outline" className="text-orange-700 border-orange-300">Выдача сотруднику</Badge>;
        }
    };

    // Сохранение настроек склада
    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            const response = await fetch('/api/inventory', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: localSettings }),
            });

            if (!response.ok) throw new Error("Не удалось сохранить настройки.");

            toast({ title: "Успешно!", description: "Настройки склада сохранены." });
            setSettingsDialogOpen(false);
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingSettings(false);
        }
    };

    // Добавление нового материала
    const handleAddMaterial = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const name = formData.get('name') as string;
        const category = formData.get('category') as string;
        const unit = formData.get('unit') as string;
        const currentStock = parseFloat(formData.get('currentStock') as string) || 0;
        const minStock = parseFloat(formData.get('minStock') as string) || undefined;
        const pricePerUnit = parseFloat(formData.get('pricePerUnit') as string) || undefined;

        if (!name || !category || !unit) {
            toast({ title: "Ошибка", description: "Заполните обязательные поля", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, category, unit, currentStock, minStock, pricePerUnit }),
            });

            if (!response.ok) throw new Error("Не удалось добавить материал.");

            toast({ title: "Успешно!", description: `Материал "${name}" добавлен.` });
            setMaterialDialogOpen(false);
            router.refresh();
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="space-y-6">
            {/* Предупреждение о низком остатке */}
            {isLowStock && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Низкий остаток химии!</AlertTitle>
                    <AlertDescription>
                        На складе осталось менее {LOW_STOCK_THRESHOLD_KG} кг химии. Рекомендуется пополнить запасы.
                    </AlertDescription>
                </Alert>
            )}

            {/* Phase 6.3 / UX-safety: пересчёт остатков из StockMovement */}
            <RecomputeStockSection />

            {/* Кнопки действий */}
            <div className="flex flex-wrap gap-3">
                <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Закупка химии
                        </Button>
                    </DialogTrigger>
                </Dialog>

                <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Users className="mr-2 h-4 w-4" />
                            Выдать канистру сотруднику
                        </Button>
                    </DialogTrigger>
                </Dialog>

                <Dialog open={gasolinePurchaseDialogOpen} onOpenChange={setGasolinePurchaseDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Fuel className="mr-2 h-4 w-4" />
                            Закупка бензина
                        </Button>
                    </DialogTrigger>
                </Dialog>

                <Dialog open={giftCanisterDialogOpen} onOpenChange={setGiftCanisterDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Gift className="mr-2 h-4 w-4" />
                            Подарить канистру
                        </Button>
                    </DialogTrigger>
                </Dialog>

                <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="outline">
                            <Box className="mr-2 h-4 w-4" />
                            Добавить материал
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Добавить новый материал</DialogTitle>
                            <DialogDescription>
                                Создайте новый материал для учёта на складе.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleAddMaterial} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="mat-name">Название *</Label>
                                <Input id="mat-name" name="name" required placeholder="Автошампунь" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="mat-category">Категория *</Label>
                                    <Select name="category" required defaultValue="chemical">
                                        <SelectTrigger>
                                            <SelectValue placeholder="Выберите категорию" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="chemical">Химия</SelectItem>
                                            <SelectItem value="consumable">Расходники</SelectItem>
                                            <SelectItem value="equipment">Оборудование</SelectItem>
                                            <SelectItem value="other">Прочее</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mat-unit">Единица *</Label>
                                    <Select name="unit" required defaultValue="grams">
                                        <SelectTrigger>
                                            <SelectValue placeholder="Выберите единицу" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="grams">Граммы</SelectItem>
                                            <SelectItem value="kg">Килограммы</SelectItem>
                                            <SelectItem value="liters">Литры</SelectItem>
                                            <SelectItem value="pieces">Штуки</SelectItem>
                                            <SelectItem value="sets">Комплекты</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="mat-stock">Начальный остаток</Label>
                                    <Input id="mat-stock" name="currentStock" type="number" step="0.01" placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="mat-min">Мин. остаток</Label>
                                    <Input id="mat-min" name="minStock" type="number" step="0.01" placeholder="100" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mat-price">Цена за единицу (руб.)</Label>
                                <Input id="mat-price" name="pricePerUnit" type="number" step="0.01" placeholder="0.15" />
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                    Добавить
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>

                <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Settings className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Настройки склада</DialogTitle>
                            <DialogDescription>
                                Настройки автоматического учёта химии, канистр и разбавления.
                            </DialogDescription>
                        </DialogHeader>
                        <Tabs defaultValue="general" className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="general">Основные</TabsTrigger>
                                <TabsTrigger value="dilution">Разбавление</TabsTrigger>
                            </TabsList>
                            <TabsContent value="general" className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Норма расхода химии по умолчанию (грамм/мойка)</Label>
                                    <Input
                                        type="number"
                                        value={localSettings.defaultChemicalConsumptionPerWash}
                                        onChange={(e) => setLocalSettings({...localSettings, defaultChemicalConsumptionPerWash: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Вес канистры (грамм)</Label>
                                    <Input
                                        type="number"
                                        value={localSettings.canisterWeightGrams}
                                        onChange={(e) => setLocalSettings({...localSettings, canisterWeightGrams: parseInt(e.target.value) || 0})}
                                    />
                                    <p className="text-xs text-muted-foreground">22 кг = 22000 грамм</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Объём канистры (мл)</Label>
                                    <Input
                                        type="number"
                                        value={localSettings.canisterVolumeMl ?? 19000}
                                        onChange={(e) => setLocalSettings({...localSettings, canisterVolumeMl: parseInt(e.target.value) || 0})}
                                    />
                                    <p className="text-xs text-muted-foreground">19 литров = 19000 мл</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Цена канистры для сотрудников (руб.)</Label>
                                    <Input
                                        type="number"
                                        value={localSettings.canisterPriceRub}
                                        onChange={(e) => setLocalSettings({...localSettings, canisterPriceRub: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Порог низкого остатка (кг)</Label>
                                    <Input
                                        type="number"
                                        value={localSettings.lowStockThresholdKg}
                                        onChange={(e) => setLocalSettings({...localSettings, lowStockThresholdKg: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Цена химии за кг (для расчёта себестоимости)</Label>
                                    <Input
                                        type="number"
                                        value={localSettings.chemicalPricePerKg || 0}
                                        onChange={(e) => setLocalSettings({...localSettings, chemicalPricePerKg: parseInt(e.target.value) || 0})}
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="auto-deduct">Автосписание химии при мойке</Label>
                                    <Switch
                                        id="auto-deduct"
                                        checked={localSettings.autoDeductChemical}
                                        onCheckedChange={(checked) => setLocalSettings({...localSettings, autoDeductChemical: checked})}
                                    />
                                </div>
                            </TabsContent>
                            <TabsContent value="dilution" className="space-y-4 py-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label htmlFor="dilution-enabled">Система разбавления</Label>
                                        <p className="text-sm text-muted-foreground">Концентрат разбавляется водой</p>
                                    </div>
                                    <Switch
                                        id="dilution-enabled"
                                        checked={localSettings.dilutionEnabled ?? false}
                                        onCheckedChange={(checked) => setLocalSettings({...localSettings, dilutionEnabled: checked})}
                                    />
                                </div>

                                {localSettings.dilutionEnabled && (
                                    <>
                                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                                            <p className="font-medium text-blue-800 mb-1">Как это работает:</p>
                                            <p className="text-blue-700">
                                                Концентрат из канистры разбавляется водой в мерном контейнере.
                                                Система автоматически рассчитает расход концентрата на каждую мойку.
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Коэффициент разбавления (1 : X)</Label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-muted-foreground">1 часть концентрата :</span>
                                                <Input
                                                    type="number"
                                                    className="w-20"
                                                    value={localSettings.dilutionRatio ?? 10}
                                                    onChange={(e) => setLocalSettings({...localSettings, dilutionRatio: parseInt(e.target.value) || 10})}
                                                />
                                                <span className="text-sm text-muted-foreground">частей воды</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                При 1:10 — из 500 мл концентрата получится {((localSettings.dilutionRatio ?? 10) + 1) * 500} мл раствора
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>Объём мерного контейнера (мл)</Label>
                                            <Input
                                                type="number"
                                                value={localSettings.measuringContainerMl ?? 5000}
                                                onChange={(e) => setLocalSettings({...localSettings, measuringContainerMl: parseInt(e.target.value) || 5000})}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Обычно 5 литров (5000 мл)
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Расход раствора (полная мойка)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        value={localSettings.solutionPerWashFull ?? 700}
                                                        onChange={(e) => setLocalSettings({...localSettings, solutionPerWashFull: parseInt(e.target.value) || 700})}
                                                    />
                                                    <span className="text-sm text-muted-foreground">мл</span>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Расход раствора (частичная)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        type="number"
                                                        value={localSettings.solutionPerWashPartial ?? 350}
                                                        onChange={(e) => setLocalSettings({...localSettings, solutionPerWashPartial: parseInt(e.target.value) || 350})}
                                                    />
                                                    <span className="text-sm text-muted-foreground">мл</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Калькулятор: на сколько машин хватит канистры */}
                                        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Beaker className="h-5 w-5 text-green-600" />
                                                <span className="font-medium text-green-800">Расчёт расхода канистры</span>
                                            </div>
                                            {(() => {
                                                const canisterVolumeMl = localSettings.canisterVolumeMl ?? 19000;
                                                const canisterWeightKg = (localSettings.canisterWeightGrams ?? 22000) / 1000;
                                                const ratio = localSettings.dilutionRatio ?? 10;
                                                const fullWashMl = localSettings.solutionPerWashFull ?? 700;
                                                const partialWashMl = localSettings.solutionPerWashPartial ?? 350;

                                                // Объём рабочего раствора из канистры (концентрат + вода)
                                                const totalSolutionMl = canisterVolumeMl * (ratio + 1);

                                                const fullWashes = Math.floor(totalSolutionMl / fullWashMl);
                                                const partialWashes = Math.floor(totalSolutionMl / partialWashMl);

                                                // Расход концентрата на мойку (в мл)
                                                const concentratePerFullWash = fullWashMl / (ratio + 1);
                                                const concentratePerPartialWash = partialWashMl / (ratio + 1);

                                                return (
                                                    <div className="space-y-2 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-green-700">Канистра ({canisterWeightKg} кг / {canisterVolumeMl / 1000} л) даёт раствора:</span>
                                                            <span className="font-semibold text-green-800">{(totalSolutionMl / 1000).toFixed(0)} литров</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-green-700">Полных моек ("в круг"):</span>
                                                            <span className="font-semibold text-green-800">~{fullWashes} машин</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-green-700">Частичных моек:</span>
                                                            <span className="font-semibold text-green-800">~{partialWashes} машин</span>
                                                        </div>
                                                        <hr className="border-green-200" />
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-green-600">Концентрата на полную мойку:</span>
                                                            <span className="text-green-700">{concentratePerFullWash.toFixed(0)} мл</span>
                                                        </div>
                                                        <div className="flex justify-between text-xs">
                                                            <span className="text-green-600">Концентрата на частичную:</span>
                                                            <span className="text-green-700">{concentratePerPartialWash.toFixed(0)} мл</span>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </>
                                )}
                            </TabsContent>
                        </Tabs>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                            <Button onClick={handleSaveSettings} disabled={isSavingSettings}>
                                {isSavingSettings && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Сохранить
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Диалог закупки химии */}
            <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Оформить закупку химии</DialogTitle>
                        <DialogDescription>
                            Введите количество и стоимость закупленной химии. Остаток на складе увеличится автоматически.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePurchaseChemical} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="quantity">Количество (кг)</Label>
                            <Input id="quantity" name="quantity" type="number" step="0.1" required placeholder="20" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price">Стоимость (руб.)</Label>
                            <Input id="price" name="price" type="number" required placeholder="3000" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Описание (опционально)</Label>
                            <Input id="description" name="description" placeholder="Закупка химии у поставщика" />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Оформить
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Диалог выдачи канистры */}
            <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Выдать канистру химии</DialogTitle>
                        <DialogDescription>
                            Выберите сотрудника для выдачи канистры ({CHEMICAL_CANISTER_WEIGHT_KG} кг).
                            Сотруднику будет записан долг {CHEMICAL_CANISTER_PRICE} руб.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Сотрудник</Label>
                            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Выберите сотрудника" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            {emp.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="p-3 bg-muted rounded-lg text-sm">
                            <p><strong>Канистра:</strong> {CHEMICAL_CANISTER_WEIGHT_KG} кг</p>
                            <p><strong>Стоимость:</strong> {CHEMICAL_CANISTER_PRICE} руб.</p>
                            <p className="text-muted-foreground mt-2">
                                Долг можно списать как бонус через финансовый кабинет сотрудника (операция "Списание долга").
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                        <Button onClick={handleIssueCanister} disabled={isSubmitting || !selectedEmployeeId}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Выдать
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Диалог закупки бензина */}
            <Dialog open={gasolinePurchaseDialogOpen} onOpenChange={setGasolinePurchaseDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Оформить закупку бензина</DialogTitle>
                        <DialogDescription>
                            Введите количество канистр и стоимость закупленного бензина. Если другая партия, укажите детали в описании.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handlePurchaseGasoline} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="gasoline-quantity">Количество (кг)</Label>
                            <Input id="gasoline-quantity" name="gasoline-quantity" type="number" step="0.1" required placeholder="20" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gasoline-price">Стоимость (руб.)</Label>
                            <Input id="gasoline-price" name="gasoline-price" type="number" required placeholder="3000" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gasoline-description">Описание (опционально)</Label>
                            <Input id="gasoline-description" name="gasoline-description" placeholder="Например: 4 канистры по 5 кг" />
                        </div>
                        <DialogFooter>
                            <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                                Оформить
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Диалог подарка канистры */}
            <Dialog open={giftCanisterDialogOpen} onOpenChange={setGiftCanisterDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Подарить канистру сотруднику</DialogTitle>
                        <DialogDescription>
                            Выберите сотрудника для подарка канистры ({CHEMICAL_CANISTER_WEIGHT_KG} кг).
                            Долг НЕ записывается — стоимость идёт в расходы автомойки.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Сотрудник</Label>
                            <Select value={giftEmployeeId} onValueChange={setGiftEmployeeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Выберите сотрудника" />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            {emp.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                            <p><strong>Канистра:</strong> {CHEMICAL_CANISTER_WEIGHT_KG} кг</p>
                            <p><strong>Расход автомойки:</strong> {CHEMICAL_CANISTER_PRICE} руб.</p>
                            <p className="text-green-700 mt-2">
                                Сотрудник получит канистру бесплатно. Стоимость будет записана в расходы категории "Подарок сотруднику".
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                        <Button onClick={handleGiftCanister} disabled={isSubmitting || !giftEmployeeId}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Подарить
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Карточка: Текущий остаток в канистрах и литрах */}
                {(() => {
                    const canisterVolumeMl = localSettings.canisterVolumeMl ?? 19000;
                    const stockMl = inventory.chemicalStockGrams; // теперь это мл
                    const stockLiters = stockMl / 1000;
                    const stockCanisters = stockMl / canisterVolumeMl;

                    return (
                        <Card className={`${isLowStock ? 'border-red-300 bg-red-50/50' : ''}`}>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Package className={`h-5 w-5 ${isLowStock ? 'text-red-500' : 'text-primary'}`} />
                                    Текущий остаток
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className={`text-3xl font-bold ${isLowStock ? 'text-red-600' : 'text-primary'}`}>
                                    {stockCanisters.toFixed(1)} канистр
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {stockLiters.toFixed(1)} л на складе
                                </p>
                            </CardContent>
                        </Card>
                    );
                })()}

                {/* Карточка: остаток в машинах */}
                {(() => {
                    const dilutionSettings: DilutionSettings = {
                        dilutionEnabled: localSettings.dilutionEnabled ?? false,
                        dilutionRatio: localSettings.dilutionRatio ?? 10,
                        measuringContainerMl: localSettings.measuringContainerMl ?? 5000,
                        solutionPerWashFull: localSettings.solutionPerWashFull ?? 700,
                        solutionPerWashPartial: localSettings.solutionPerWashPartial ?? 350,
                    };
                    // inventory.chemicalStockGrams теперь хранит мл
                    const stockMl = inventory.chemicalStockGrams;
                    const fullWashes = calculateWashesPerCanister(stockMl, dilutionSettings, true);
                    const partialWashes = calculateWashesPerCanister(stockMl, dilutionSettings, false);
                    const concentratePerWash = calculateConcentratePerWash(dilutionSettings, true);

                    return (
                        <Card className="bg-green-50/50 border-green-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Car className="h-5 w-5 text-green-600" />
                                    Хватит на
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold text-green-600">~{fullWashes} машин</p>
                                <p className="text-sm text-muted-foreground">
                                    полных моек ({concentratePerWash} мл/мойка)
                                </p>
                                {localSettings.dilutionEnabled && (
                                    <p className="text-xs text-green-700 mt-1">
                                        или ~{partialWashes} частичных
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    );
                })()}

                {/* Карточка: На начало периода в литрах */}
                {(() => {
                    const canisterVolumeMl = localSettings.canisterVolumeMl ?? 19000;
                    const startLiters = balanceAtStartOfPeriod / 1000;
                    const startCanisters = balanceAtStartOfPeriod / canisterVolumeMl;
                    return (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <PackageOpen className="h-5 w-5" />
                                    На начало периода
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-3xl font-bold">{startCanisters.toFixed(1)} канистр</p>
                                <p className="text-sm text-muted-foreground">
                                    {startLiters.toFixed(1)} л
                                    {dateRange?.from && ` на ${format(dateRange.from, 'dd.MM.yyyy')}`}
                                </p>
                            </CardContent>
                        </Card>
                    );
                })()}

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-lg">
                           <Users className="h-5 w-5 text-orange-600" />
                           Химия у сотрудников
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-20">
                           {chemicalsWithEmployees.length > 0 ? (
                               <Table>
                                 <TableBody>
                                   {chemicalsWithEmployees.map(emp => (
                                     <TableRow key={emp.name}>
                                       <TableCell className="p-1 font-medium text-sm">{emp.name}</TableCell>
                                       <TableCell className="p-1 text-right font-semibold text-sm">{(emp.count * 20).toLocaleString('ru-RU')} кг</TableCell>
                                       <TableCell className="p-1 text-right text-muted-foreground text-xs">({emp.count} кан.)</TableCell>
                                     </TableRow>
                                   ))}
                                 </TableBody>
                               </Table>
                           ) : (
                               <p className="text-sm text-muted-foreground text-center pt-4">Нет выданной химии</p>
                           )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Журнал движения химических средств</CardTitle>
                    <div className="flex justify-between items-center">
                        <p className="text-muted-foreground">История всех поступлений и списаний химии.</p>
                        <DateRangePicker date={dateRange} setDate={setDateRange} />
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[60vh] rounded-md border">
                        <Table>
                            <TableHeader className="sticky top-0 bg-background z-10">
                            <TableRow>
                                <TableHead className="w-[150px]">Дата</TableHead>
                                <TableHead>Операция</TableHead>
                                <TableHead className="text-right">Изменение</TableHead>
                                <TableHead className="text-right">Остаток</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {journalForPeriod.length > 0 ? (
                                journalForPeriod.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell>{format(entry.date, 'dd.MM.yy HH:mm', { locale: ru })}</TableCell>
                                    <TableCell>
                                    <div className="flex items-center gap-2">
                                        {renderIcon(entry.type)}
                                        <div>
                                            <p className="font-medium">{entry.description}</p>
                                            {renderBadge(entry.type)}
                                        </div>
                                    </div>
                                    </TableCell>
                                    <TableCell className={`text-right font-semibold ${entry.amountGrams > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {entry.amountGrams > 0 ? '+' : ''}{(entry.amountGrams / 1000).toFixed(3)} кг
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {(entry.balanceAfterGrams / 1000).toFixed(3)} кг
                                    </TableCell>
                                </TableRow>
                            ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                    Нет операций за выбранный период. <Button variant="link" asChild><Link href="/expenses/new">Добавьте первую закупку химии.</Link></Button>
                                    </TableCell>
                                </TableRow>
                            )}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </CardContent>
            </Card>
        </div>
    );
}

