"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Droplets, Plus, RotateCcw, AlertTriangle, Loader2, Package } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import type { EmployeeChemicalCanister, Inventory } from "@/types";

interface EmployeeCanistersCardProps {
    employeeId: string;
    employeeName: string;
}

const statusLabels: Record<EmployeeChemicalCanister['status'], { label: string; color: string }> = {
    active: { label: 'Активна', color: 'bg-green-500' },
    empty: { label: 'Пустая', color: 'bg-gray-500' },
    returned: { label: 'Возвращена', color: 'bg-blue-500' },
};

export function EmployeeCanistersCard({ employeeId, employeeName }: EmployeeCanistersCardProps) {
    const { toast } = useToast();
    const [canisters, setCanisters] = useState<EmployeeChemicalCanister[]>([]);
    const [inventory, setInventory] = useState<Inventory | null>(null);
    const [loading, setLoading] = useState(true);
    const [issuing, setIssuing] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newCanisterAmount, setNewCanisterAmount] = useState('');
    const [newCanisterPrice, setNewCanisterPrice] = useState('');

    const fetchData = async () => {
        try {
            const [canistersRes, inventoryRes] = await Promise.all([
                fetch(`/api/employee-canisters?employeeId=${employeeId}`),
                fetch('/api/inventory')
            ]);

            if (canistersRes.ok) {
                const data = await canistersRes.json();
                setCanisters(data);
            }
            if (inventoryRes.ok) {
                const inv = await inventoryRes.json();
                setInventory(inv);
                // Set default values from inventory settings
                setNewCanisterAmount(String(inv.settings?.canisterWeightGrams || 21000));
                setNewCanisterPrice(String(inv.settings?.canisterPriceRub || 3000));
            }
        } catch (error) {
            console.error('Error fetching canister data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [employeeId]);

    const activeCanister = canisters.find(c => c.status === 'active');

    const handleIssueCanister = async () => {
        setIssuing(true);
        try {
            const response = await fetch('/api/employee-canisters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId,
                    initialAmountGrams: parseInt(newCanisterAmount) || undefined,
                    priceRub: parseInt(newCanisterPrice) || undefined,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка выдачи канистры');
            }

            toast({
                title: "Канистра выдана",
                description: `Новая канистра выдана сотруднику ${employeeName}`,
            });

            setIsDialogOpen(false);
            fetchData();
        } catch (error: any) {
            toast({
                title: "Ошибка",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIssuing(false);
        }
    };

    const handleReturnCanister = async (canisterId: string) => {
        try {
            const response = await fetch(`/api/employee-canisters/${canisterId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'return' }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка возврата канистры');
            }

            toast({
                title: "Канистра возвращена",
                description: "Остаток химии возвращён на склад",
            });

            fetchData();
        } catch (error: any) {
            toast({
                title: "Ошибка",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    const handleUpdateRemaining = async (canisterId: string, newAmount: number) => {
        try {
            const response = await fetch(`/api/employee-canisters/${canisterId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ remainingAmountGrams: newAmount }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка обновления');
            }

            fetchData();
        } catch (error: any) {
            toast({
                title: "Ошибка",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Droplets className="h-5 w-5" />
                        Химия сотрудника
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </CardContent>
            </Card>
        );
    }

    const percentRemaining = activeCanister
        ? Math.round((activeCanister.remainingAmountGrams / activeCanister.initialAmountGrams) * 100)
        : 0;

    const lowThreshold = 20; // 20% warning threshold

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Droplets className="h-5 w-5 text-blue-500" />
                            Химия сотрудника
                        </CardTitle>
                        <CardDescription>Выданные канистры и остатки</CardDescription>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" disabled={!!activeCanister}>
                                <Plus className="h-4 w-4 mr-2" />
                                Выдать канистру
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Выдать новую канистру</DialogTitle>
                                <DialogDescription>
                                    Канистра будет списана со склада и выдана сотруднику {employeeName}
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Объём (граммы)</Label>
                                    <Input
                                        type="number"
                                        value={newCanisterAmount}
                                        onChange={(e) => setNewCanisterAmount(e.target.value)}
                                        placeholder="21000"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        На складе: {(inventory?.chemicalStockGrams || 0).toLocaleString()} гр.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Стоимость (руб.)</Label>
                                    <Input
                                        type="number"
                                        value={newCanisterPrice}
                                        onChange={(e) => setNewCanisterPrice(e.target.value)}
                                        placeholder="3000"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="outline">Отмена</Button>
                                </DialogClose>
                                <Button onClick={handleIssueCanister} disabled={issuing}>
                                    {issuing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Выдать
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Active Canister */}
                {activeCanister ? (
                    <div className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-blue-500" />
                                <span className="font-medium">Текущая канистра</span>
                            </div>
                            <Badge className={statusLabels[activeCanister.status].color}>
                                {statusLabels[activeCanister.status].label}
                            </Badge>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Остаток:</span>
                                <span className={percentRemaining <= lowThreshold ? 'text-red-500 font-medium' : ''}>
                                    {activeCanister.remainingAmountGrams.toLocaleString()} гр.
                                    из {activeCanister.initialAmountGrams.toLocaleString()} гр.
                                </span>
                            </div>
                            <Progress
                                value={percentRemaining}
                                className={percentRemaining <= lowThreshold ? '[&>div]:bg-red-500' : ''}
                            />
                            {percentRemaining <= lowThreshold && (
                                <div className="flex items-center gap-2 text-sm text-red-500">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>Канистра почти пустая!</span>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">Выдана:</p>
                                <p>{format(new Date(activeCanister.issuedAt), 'dd.MM.yyyy', { locale: ru })}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Стоимость:</p>
                                <p>{activeCanister.priceRub.toLocaleString()} руб.</p>
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleReturnCanister(activeCanister.id)}
                            >
                                <RotateCcw className="h-4 w-4 mr-2" />
                                Вернуть на склад
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 text-muted-foreground">
                        <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
                        <p>Нет активной канистры</p>
                        <p className="text-sm">Выдайте новую канистру сотруднику</p>
                    </div>
                )}

                {/* History */}
                {canisters.filter(c => c.status !== 'active').length > 0 && (
                    <div className="pt-4 border-t">
                        <h4 className="text-sm font-medium mb-2">История канистр</h4>
                        <div className="space-y-2">
                            {canisters.filter(c => c.status !== 'active').slice(0, 5).map(canister => (
                                <div key={canister.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                                    <div>
                                        <span className="text-muted-foreground">
                                            {format(new Date(canister.issuedAt), 'dd.MM.yyyy', { locale: ru })}
                                        </span>
                                        <span className="mx-2">—</span>
                                        <span>{canister.initialAmountGrams.toLocaleString()} гр.</span>
                                    </div>
                                    <Badge variant="outline" className={statusLabels[canister.status].color}>
                                        {statusLabels[canister.status].label}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
