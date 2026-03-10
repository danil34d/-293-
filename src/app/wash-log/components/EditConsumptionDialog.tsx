
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Droplets } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { WashEvent, Employee, PriceListItem, EmployeeConsumption } from '@/types';
import { useAuth } from '@/contexts/AuthContext';


interface EditConsumptionDialogProps {
    event: WashEvent;
    employees: Employee[];
}

interface ConsumptionState {
    main: Record<string, number>;
    additional: Record<string, Record<string, number>>; // serviceId -> { employeeId -> amount }
}


export function EditConsumptionDialog({ event, employees }: EditConsumptionDialogProps) {
    const { toast } = useToast();
    const router = useRouter();
    const { employee: loggedInEmployee } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const getInitialConsumptionState = (): ConsumptionState => {
        const mainConsumptions: Record<string, number> = {};
        (event.services.main.employeeConsumptions || []).forEach(c => {
            mainConsumptions[c.employeeId] = c.amount;
        });
        
        const additionalConsumptions: Record<string, Record<string, number>> = {};
        event.services.additional.forEach((service: any) => {
            if (!service.id) return;
            additionalConsumptions[service.id] = {};
            (service.employeeConsumptions || []).forEach((c: EmployeeConsumption) => {
                additionalConsumptions[service.id][c.employeeId] = c.amount;
            });
        });

        return { main: mainConsumptions, additional: additionalConsumptions };
    }

    const [consumptions, setConsumptions] = useState<ConsumptionState>(getInitialConsumptionState);
    
    const handleConsumptionChange = (
        serviceId: string, 
        employeeId: string, 
        value: string
    ) => {
        const amount = parseInt(value, 10);
        if (isNaN(amount) || amount < 0) return;

        if (serviceId === 'main') {
            setConsumptions(prev => ({
                ...prev,
                main: { ...prev.main, [employeeId]: amount }
            }));
        } else {
             setConsumptions(prev => ({
                ...prev,
                additional: { 
                    ...prev.additional, 
                    [serviceId]: { ...prev.additional[serviceId], [employeeId]: amount }
                }
            }));
        }
    };
    
    const handleSubmit = async () => {
        if (!loggedInEmployee) {
            toast({ title: "Ошибка", description: "Не удалось определить пользователя. Пожалуйста, войдите снова.", variant: "destructive" });
            return;
        }
        
        setIsSubmitting(true);
        try {
            const updatedEvent = { ...event };
            
            updatedEvent.services.main.employeeConsumptions = Object.entries(consumptions.main).map(([employeeId, amount]) => ({ employeeId, amount }));
            
            updatedEvent.services.additional = event.services.additional.map((service: any) => {
                const serviceConsumptions = consumptions.additional[service.id];
                return {
                    ...service,
                    employeeConsumptions: serviceConsumptions ? Object.entries(serviceConsumptions).map(([employeeId, amount]) => ({ employeeId, amount })) : []
                };
            });
            
            const response = await fetch(`/api/wash-events/${event.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedEvent),
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Не удалось сохранить изменения.');
            }
            
            toast({ title: "Успех!", description: "Данные о расходе химии обновлены." });
            setIsOpen(false);
            router.refresh();
            
        } catch (error: any) {
            toast({ title: "Ошибка", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="mr-1 text-muted-foreground hover:text-primary transition-colors" aria-label={`Изменить расход для ${event.vehicleNumber}`}>
                    <Droplets className="h-4 w-4" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
                <DialogHeader>
                    <DialogTitle>Редактировать расход химии</DialogTitle>
                </DialogHeader>
                 <div className="text-sm text-muted-foreground">
                    Машина: <span className="font-mono font-medium text-foreground">{event.vehicleNumber}</span>
                </div>

                <ScrollArea className="max-h-[60vh] -mx-4 px-4">
                    <div className="space-y-4 py-2">
                        {/* Main Service */}
                        <div className="p-4 border rounded-lg bg-background shadow-sm">
                            <Label className="font-semibold text-base">{event.services.main.serviceName} (Основная)</Label>
                            <p className="text-sm text-muted-foreground mb-3">Норматив: {event.services.main.chemicalConsumption || 0} гр.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {employees.map(emp => (
                                    <div key={`main-${emp.id}`} className="space-y-1">
                                        <Label htmlFor={`main-chem-${emp.id}`} className="text-xs">{emp.fullName}</Label>
                                        <Input
                                            id={`main-chem-${emp.id}`}
                                            type="number"
                                            placeholder="Расход, гр."
                                            value={consumptions.main[emp.id] ?? ''}
                                            onChange={(e) => handleConsumptionChange('main', emp.id, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Additional Services */}
                        {event.services.additional.map((service: any) => (
                             <div key={service.id} className="p-4 border rounded-lg bg-background">
                                <Label className="font-semibold">{service.serviceName}</Label>
                                <p className="text-sm text-muted-foreground mb-3">Норматив: {service.chemicalConsumption || 0} гр.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {employees.map(emp => (
                                        <div key={`add-${service.id}-${emp.id}`} className="space-y-1">
                                            <Label htmlFor={`add-chem-${service.id}-${emp.id}`} className="text-xs">{emp.fullName}</Label>
                                            <Input
                                                id={`add-chem-${service.id}-${emp.id}`}
                                                type="number"
                                                placeholder="Расход, гр."
                                                value={consumptions.additional[service.id]?.[emp.id] ?? ''}
                                                onChange={(e) => handleConsumptionChange(service.id, emp.id, e.target.value)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                
                <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="ghost">Отмена</Button></DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                        Сохранить
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
