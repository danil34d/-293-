'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, Car, Camera, Sun, Moon, Box,
  ClipboardList, BookCheck, ExternalLink
} from 'lucide-react';
import type { Employee, WashEvent, WashId } from '@/types';
import type { PendingCameraVehicle } from '@/lib/camera-pending';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PendingCameraSessionsPanel } from '@/components/camera/PendingCameraSessionsPanel';

interface OperationsClientProps {
  box1Employees: Employee[];
  box2Employees: Employee[];
  todayEvents: WashEvent[];
  initialPendingVehicles: PendingCameraVehicle[];
  allEmployees: Employee[];
  currentShiftType: string;
  washId: WashId;
}

function buildCameraStreamUrl(boxNumber: number, wide = false) {
  if (boxNumber !== 1) {
    return null;
  }

  const params = new URLSearchParams({
    width: wide ? '960' : '640',
    quality: wide ? '60' : '45',
    fps: wide ? '8' : '5',
  });

  return `/api/camera-stream/${boxNumber}?${params.toString()}`;
}

function CameraPreview({ boxNumber }: { boxNumber: number }) {
  const [failed, setFailed] = useState(false);
  const streamUrl = useMemo(() => buildCameraStreamUrl(boxNumber), [boxNumber]);
  const openUrl = useMemo(() => buildCameraStreamUrl(boxNumber, true), [boxNumber]);

  if (!streamUrl || !openUrl) {
    return (
      <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center border border-white/10">
        <div className="text-center text-gray-500">
          <Camera className="h-8 w-8 mx-auto mb-1 opacity-50" />
          <p className="text-xs">Субпоток пока подключен только для камеры 1</p>
          <p className="text-[11px] text-gray-400 mt-1">Для этого бокса поток еще не заведен</p>
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center border border-white/10">
        <div className="text-center text-gray-500">
          <Camera className="h-8 w-8 mx-auto mb-1 opacity-50" />
          <p className="text-xs">Не удалось открыть sub stream</p>
          <p className="text-[11px] text-gray-400 mt-1">Проверь dashboard камер на порту 8050</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
      <img
        src={streamUrl}
        alt={`Камера бокса ${boxNumber}`}
        className="aspect-video w-full bg-black object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
        onLoad={() => setFailed(false)}
      />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80">
        камера 1 · sub stream
      </div>
      <a
        href={openUrl}
        target="_blank"
        rel="noreferrer"
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white/80 transition hover:bg-black/80 hover:text-white"
        title={`Открыть камеру бокса ${boxNumber}`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function BoxCard({
  boxNumber,
  employees,
  events,
  pendingVehicles,
  allEmployees,
  color,
  onDismissed,
}: {
  boxNumber: number;
  employees: Employee[];
  events: WashEvent[];
  pendingVehicles: PendingCameraVehicle[];
  allEmployees: Employee[];
  color: string;
  onDismissed: (dirName: string) => void;
}) {
  const total = events.reduce((sum, e) => sum + (e.totalAmount || 0), 0);
  const recentEvents = [...events]
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 5);

  return (
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 text-lg ${color}`}>
          <Box className="h-5 w-5" />
          Бокс {boxNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            <Users className="h-3 w-3 inline mr-1" />
            Команда
          </h4>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет сотрудников</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {employees.map(emp => (
                <span
                  key={emp.id}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    boxNumber === 1
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {emp.fullName.split(' ').slice(0, 2).join(' ')}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Camera */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            <Camera className="h-3 w-3 inline mr-1" />
            Камера
          </h4>
          <CameraPreview boxNumber={boxNumber} />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold">{events.length}</p>
            <p className="text-xs text-muted-foreground">Заказов</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{total.toLocaleString('ru-RU')}</p>
            <p className="text-xs text-muted-foreground">Выручка ₽</p>
          </div>
        </div>

        {/* Quick action */}
        <Button className="w-full" asChild>
          <Link href={`/workstation?box=${boxNumber}`}>
            <ClipboardList className="h-4 w-4 mr-2" />
            Оформить заказ — Бокс {boxNumber}
          </Link>
        </Button>

        {/* Recent orders */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Последние заказы
          </h4>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">Нет заказов</p>
          ) : (
            <div className="space-y-1">
              {recentEvents.map(event => {
                const time = event.timestamp
                  ? new Date(event.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                  : '';
                const names = (event.employeeIds || [])
                  .map(id => allEmployees.find(e => e.id === id)?.fullName?.split(' ')[0] || '')
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div key={event.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 text-sm">
                    <div className="flex items-center gap-2">
                      <Car className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{event.vehicleNumber || '—'}</span>
                      {names && <span className="text-xs text-muted-foreground">{names}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{event.totalAmount ? `${event.totalAmount} ₽` : ''}</span>
                      <span className="text-muted-foreground">{time}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <PendingCameraSessionsPanel
          boxNumber={boxNumber}
          pendingVehicles={pendingVehicles}
          boxEmployees={employees}
          allEmployees={allEmployees}
          basePath="/workstation"
          source="operations"
          onDismissed={onDismissed}
        />
      </CardContent>
    </Card>
  );
}

const WASH_LABELS: Record<WashId, string> = {
  wash_1: 'Мойка 1 (Циолковского)',
  wash_2: 'Мойка 2',
};

export function OperationsClient({
  box1Employees,
  box2Employees,
  todayEvents,
  initialPendingVehicles,
  allEmployees,
  currentShiftType,
  washId,
}: OperationsClientProps) {
  const router = useRouter();
  const [pendingVehicles, setPendingVehicles] = useState(initialPendingVehicles);
  const handlePendingDismissed = (dirName: string) => {
    setPendingVehicles((current) => current.filter((vehicle) => vehicle.dirName !== dirName));
  };

  useEffect(() => {
    let ignore = false;

    async function loadPendingVehicles() {
      try {
        const response = await fetch('/api/camera-pending', {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!response.ok) return;

        const data = (await response.json()) as { items?: PendingCameraVehicle[] };
        if (!ignore && Array.isArray(data.items)) {
          setPendingVehicles(data.items);
        }
      } catch (error) {
        console.error('Failed to refresh pending camera vehicles:', error);
      }
    }

    loadPendingVehicles();
    const intervalId = window.setInterval(loadPendingVehicles, 30000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const box1Events = todayEvents.filter(e => e.boxNumber === 1);
  const box2Events = todayEvents.filter(e => e.boxNumber === 2);
  const box1PendingVehicles = pendingVehicles.filter(v => v.boxNumber === 1);
  const box2PendingVehicles = pendingVehicles.filter(v => v.boxNumber === 2);
  const totalRevenue = todayEvents.reduce((sum, e) => sum + (e.totalAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Центр управления</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {(['wash_1', 'wash_2'] as WashId[]).map((wid) => (
                <button
                  key={wid}
                  onClick={() => router.push(wid === 'wash_1' ? '/operations' : '/operations?wash=wash_2')}
                  className={`px-3 py-1.5 transition-colors ${
                    washId === wid
                      ? 'bg-blue-600 text-white font-medium'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {wid === 'wash_1' ? 'Мойка 1' : 'Мойка 2'}
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              {currentShiftType === 'day' ? (
                <><Sun className="h-3.5 w-3.5 text-amber-500" /> Дневная смена</>
              ) : (
                <><Moon className="h-3.5 w-3.5 text-indigo-500" /> Ночная смена</>
              )}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <Link href="/wash-log">
              <BookCheck className="h-4 w-4 mr-2" />
              Журнал
            </Link>
          </Button>
          <Button asChild>
            <Link href="/workstation">
              <ClipboardList className="h-4 w-4 mr-2" />
              Оформить заказ
            </Link>
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold">{todayEvents.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Заказов сегодня</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold text-green-700">{totalRevenue.toLocaleString('ru-RU')} ₽</p>
            <p className="text-xs text-muted-foreground mt-1">Выручка</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold">{box1Employees.length + box2Employees.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Сотрудников на смене</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold text-amber-700">{pendingVehicles.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Неоформлено камерами</p>
          </CardContent>
        </Card>
      </div>

      {/* Boxes */}
      <div className={`grid grid-cols-1 ${washId === 'wash_1' ? 'lg:grid-cols-2' : ''} gap-6`}>
        {washId === 'wash_1' && (
          <BoxCard
            boxNumber={1}
            employees={box1Employees}
            events={box1Events}
            pendingVehicles={box1PendingVehicles}
            allEmployees={allEmployees}
            color="text-blue-600"
            onDismissed={handlePendingDismissed}
          />
        )}
        <BoxCard
          boxNumber={2}
          employees={box2Employees}
          events={box2Events}
          pendingVehicles={box2PendingVehicles}
          allEmployees={allEmployees}
          color="text-emerald-600"
          onDismissed={handlePendingDismissed}
        />
      </div>
    </div>
  );
}
