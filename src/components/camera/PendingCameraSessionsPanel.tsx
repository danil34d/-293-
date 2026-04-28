'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Truck, Trash2 } from 'lucide-react';
import type { Employee } from '@/types';
import type { PendingCameraVehicle } from '@/lib/camera-pending';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const VEHICLE_CLASS_LABELS: Record<string, string> = {
  car: 'легковой',
  truck: 'грузовик',
  bus: 'автобус',
};

function formatSessionTime(value: string | null | undefined) {
  if (!value) return '—';
  const match = value.match(/(?:[_T\s])(\d{2})[:-](\d{2})(?:[:-]\d{2})?$/);
  if (match) {
    return `${match[1]}:${match[2]}`;
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return value;
}

function getPendingVehicleStatus(vehicle: PendingCameraVehicle) {
  if (!vehicle.plateNumber) {
    return {
      label: 'Обработка номера',
      description: 'Сессия собрана, ждём итоговое распознавание номера',
      badgeClassName: 'bg-white/90 text-amber-700',
    };
  }

  return {
    label: 'Ожидает оформления',
    description: 'Номер подтверждён камерой, сотрудник может оформить заказ',
    badgeClassName: 'bg-white/90 text-blue-700',
  };
}

function buildCameraEntryHref(
  basePath: string,
  boxNumber: number,
  vehicle: PendingCameraVehicle,
  mode: 'checkout' | 'edit',
) {
  const params = new URLSearchParams({
    box: String(boxNumber),
    camera: '1',
    cameraBox: String(boxNumber),
    cameraDir: vehicle.dirName,
    cameraMode: mode,
  });

  if (vehicle.plateNumber) {
    params.set('cameraPlate', vehicle.plateNumber);
  }

  if (vehicle.vehicleClass) {
    params.set('cameraVehicleClass', vehicle.vehicleClass);
  }

  if (vehicle.start) {
    params.set('cameraStart', vehicle.start);
  }

  if (vehicle.end) {
    params.set('cameraEnd', vehicle.end);
  }

  return `${basePath}?${params.toString()}`;
}

interface PendingCameraSessionsPanelProps {
  boxNumber: 1 | 2;
  pendingVehicles: PendingCameraVehicle[];
  boxEmployees: Employee[];
  allEmployees: Employee[];
  basePath: '/workstation' | '/kiosk/order';
  source: 'operations' | 'kiosk-order';
  onDismissed?: (dirName: string) => void;
}

export function PendingCameraSessionsPanel({
  boxNumber,
  pendingVehicles,
  boxEmployees,
  allEmployees,
  basePath,
  source,
  onDismissed,
}: PendingCameraSessionsPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedVehicle, setSelectedVehicle] = useState<PendingCameraVehicle | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableEmployees = useMemo(() => {
    const fromBox = boxEmployees.filter((employee) => employee.role !== 'kiosk');
    if (fromBox.length > 0) return fromBox;
    return allEmployees.filter((employee) => employee.role !== 'kiosk');
  }, [allEmployees, boxEmployees]);

  const openDismissDialog = (vehicle: PendingCameraVehicle) => {
    setSelectedVehicle(vehicle);
    setSelectedEmployeeId(availableEmployees[0]?.id || '');
  };

  const closeDismissDialog = () => {
    if (isSubmitting) return;
    setSelectedVehicle(null);
    setSelectedEmployeeId('');
  };

  async function handleDismissVehicle() {
    if (!selectedVehicle) return;
    if (!selectedEmployeeId) {
      toast({
        title: 'Нужно выбрать сотрудника',
        description: 'Укажи, кто именно подтвердил, что машина не мылась.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/camera-pending/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dirName: selectedVehicle.dirName,
          boxNumber,
          plateNumber: selectedVehicle.plateNumber,
          vehicleClass: selectedVehicle.vehicleClass,
          start: selectedVehicle.start,
          end: selectedVehicle.end,
          employeeId: selectedEmployeeId,
          source,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          typeof errorData?.error === 'string'
            ? errorData.error
            : 'Не удалось отметить, что машина не мылась.'
        );
      }

      toast({
        title: 'Сессия отмечена',
        description: 'Запись сохранена как "не мылась", карточка снята из очереди.',
      });

      onDismissed?.(selectedVehicle.dirName);
      closeDismissDialog();
      router.refresh();
    } catch (error: any) {
      console.error('Failed to dismiss camera pending session:', error);
      toast({
        title: 'Ошибка отметки',
        description: error?.message || 'Не удалось сохранить отметку о выезде без мойки.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Truck className="mr-1 inline h-3 w-3" />
        Неоформленные машины
      </h4>
      {pendingVehicles.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          Нет неоформленных машин
        </p>
      ) : (
        <div className="space-y-2">
          {pendingVehicles.map((vehicle) => {
            const status = getPendingVehicleStatus(vehicle);

            return (
              <div
                key={vehicle.id}
                className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {vehicle.plateNumber || 'Без номера'}
                      </span>
                      {vehicle.isPlateCorrected && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800" title="Номер исправлен оператором в дашборде камер">
                          ✓ исправлен оператором
                        </span>
                      )}
                      <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        {VEHICLE_CLASS_LABELS[vehicle.vehicleClass || ''] || vehicle.vehicleClass || 'машина'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.badgeClassName}`}>
                        {status.label}
                      </span>
                      {vehicle.isMergedGroup && vehicle.mergedSegmentsCount && vehicle.mergedSegmentsCount > 1 && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-800" title="Эта запись — объединение нескольких сегментов одной мойки">
                          {vehicle.mergedSegmentsCount} сегментов
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Сессия завершена в {formatSessionTime(vehicle.end || vehicle.start)} · бокс {boxNumber}
                    </p>
                    {vehicle.note && (
                      <p className="mt-1 text-[11px] italic text-amber-900">
                        💬 {vehicle.note}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground/90">
                      {status.description}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      {vehicle.dirName}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-amber-300 bg-white hover:bg-amber-100"
                      asChild
                    >
                      <Link href={buildCameraEntryHref(basePath, boxNumber, vehicle, vehicle.plateNumber ? 'checkout' : 'edit')}>
                        Оформить
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-950"
                      asChild
                    >
                      <Link href={buildCameraEntryHref(basePath, boxNumber, vehicle, 'edit')}>
                        Исправить номер
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-rose-700 hover:bg-rose-100 hover:text-rose-800"
                      onClick={() => openDismissDialog(vehicle)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Не мылась
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={Boolean(selectedVehicle)} onOpenChange={(open) => { if (!open) closeDismissDialog(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Подтвердить удаление из очереди</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Эта машина заехала, постояла и уехала без мойки. Мы сохраним запись в журнале, чтобы было видно, кто её снял.
                </p>
                <div className="rounded-md border bg-muted/30 p-3">
                  <div><strong>Машина:</strong> {selectedVehicle?.plateNumber || 'Без номера'}</div>
                  <div><strong>Сессия:</strong> {selectedVehicle?.dirName}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Кто подтвердил удаление</label>
                  <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите сотрудника" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEmployees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Отмена</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDismissVehicle} disabled={isSubmitting}>
              {isSubmitting ? 'Сохраняем...' : 'Подтвердить'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
