'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, BookCheck } from 'lucide-react';
import type { UnprocessedCameraVehicle } from '@/lib/camera-pending-range';

interface Props {
  initialItems: UnprocessedCameraVehicle[];
  initialGroupedByDate: Record<string, number>;
  initialRange: { from: string; to: string };
}

function formatDateRu(value: string | null): string {
  if (!value) return '—';
  const normalized = value.includes('_') ? value.replace('_', 'T') : value;
  const d = new Date(normalized);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeRu(value: string | null): string {
  if (!value) return '—';
  const normalized = value.includes('_') ? value.replace('_', 'T') : value;
  const d = new Date(normalized);
  if (!Number.isFinite(d.getTime())) return value;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(sec: number): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}с`;
  return `${m}м ${s}с`;
}

function vehicleClassLabel(cls: string | null): string {
  switch ((cls || '').toLowerCase()) {
    case 'car':
      return 'Легковая';
    case 'truck':
      return 'Грузовая';
    case 'bus':
      return 'Автобус';
    default:
      return cls || '?';
  }
}

function buildWorkstationUrl(item: UnprocessedCameraVehicle): string {
  const params = new URLSearchParams({
    box: String(item.boxNumber),
    camera: '1',
    cameraBox: String(item.boxNumber),
    cameraDir: item.dirName,
    cameraMode: 'edit',
  });
  if (item.plateNumber) params.set('cameraPlate', item.plateNumber);
  if (item.vehicleClass) params.set('cameraVehicleClass', item.vehicleClass);
  if (item.actualStart) params.set('cameraStart', item.actualStart);
  if (item.actualEnd) params.set('cameraEnd', item.actualEnd);
  return `/workstation?${params.toString()}`;
}

function buildThumbnailUrl(item: UnprocessedCameraVehicle): string {
  const params = new URLSearchParams({
    box: String(item.boxNumber),
    dirName: item.dirName,
    kind: 'thumbnail',
  });
  return `/api/camera-session-media?${params.toString()}`;
}

export function UnprocessedClient({
  initialItems,
  initialGroupedByDate,
  initialRange,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [boxFilter, setBoxFilter] = useState<'all' | '1' | '2'>('all');
  const [classFilter, setClassFilter] = useState<'all' | 'car' | 'truck' | 'bus'>('all');

  const filteredItems = useMemo(() => {
    return initialItems.filter((item) => {
      if (boxFilter !== 'all' && String(item.boxNumber) !== boxFilter) return false;
      if (classFilter !== 'all' && (item.vehicleClass || '').toLowerCase() !== classFilter)
        return false;
      return true;
    });
  }, [initialItems, boxFilter, classFilter]);

  const groupedByDate = useMemo(() => {
    const result: Record<string, UnprocessedCameraVehicle[]> = {};
    for (const item of filteredItems) {
      if (!result[item.dateKey]) result[item.dateKey] = [];
      result[item.dateKey].push(item);
    }
    return result;
  }, [filteredItems]);

  const sortedDateKeys = useMemo(
    () => Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a)),
    [groupedByDate]
  );

  const applyDateRange = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', from);
    params.set('to', to);
    router.push(`/wash-log/unprocessed?${params.toString()}`);
  }, [from, to, router, searchParams]);

  const totalUnprocessed = filteredItems.length;

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🚗 Неоформленные мойки
          </h1>
          <p className="text-sm text-muted-foreground">
            Машины зафиксированные камерами, но не оформленные в системе.
            {totalUnprocessed > 0 && (
              <span className="ml-1">
                Найдено <strong>{totalUnprocessed}</strong> за {initialRange.from} — {initialRange.to}.
              </span>
            )}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/wash-log" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <BookCheck className="h-4 w-4" />
            Журнал оформленных моек
          </Link>
        </Button>
      </div>

      {/* Фильтры */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">С даты</label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                max={to}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">По дату</label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                min={from}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Бокс</label>
              <Select value={boxFilter} onValueChange={(v) => setBoxFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все боксы</SelectItem>
                  <SelectItem value="1">Бокс 1</SelectItem>
                  <SelectItem value="2">Бокс 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Тип</label>
              <Select value={classFilter} onValueChange={(v) => setClassFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все типы</SelectItem>
                  <SelectItem value="car">Легковые</SelectItem>
                  <SelectItem value="truck">Грузовые</SelectItem>
                  <SelectItem value="bus">Автобусы</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={applyDateRange}>Обновить</Button>
          </div>
        </CardContent>
      </Card>

      {/* Сводка по дням */}
      {Object.keys(initialGroupedByDate).length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(initialGroupedByDate)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([date, count]) => (
                  <Badge key={date} variant="outline">
                    {formatDateRu(date)}: <strong className="ml-1">{count}</strong>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Список */}
      {totalUnprocessed === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            ✅ За выбранный период все мойки оформлены. Молодцы!
          </CardContent>
        </Card>
      ) : (
        sortedDateKeys.map((dateKey) => (
          <Card key={dateKey}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {formatDateRu(dateKey)}{' '}
                <span className="text-sm text-muted-foreground font-normal">
                  ({groupedByDate[dateKey].length} {groupedByDate[dateKey].length === 1 ? 'мойка' : 'моек'})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid gap-px bg-border">
                {groupedByDate[dateKey].map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[80px_1fr_auto] sm:grid-cols-[100px_1fr_auto] gap-3 p-3 bg-card hover:bg-accent/50 transition"
                  >
                    {/* Превью */}
                    <a
                      href={buildThumbnailUrl(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block aspect-video bg-muted rounded overflow-hidden"
                    >
                      {item.hasThumbnail ? (
                        <img
                          src={buildThumbnailUrl(item)}
                          alt="кадр"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                          нет фото
                        </div>
                      )}
                    </a>

                    {/* Инфо */}
                    <div className="min-w-0 flex flex-col justify-center">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold">
                          {item.plateNumber || (
                            <span className="text-muted-foreground italic font-normal">
                              номер не определён
                            </span>
                          )}
                        </span>
                        {item.isPlateCorrected && (
                          <Badge variant="secondary" className="text-xs">
                            исправлен оператором
                          </Badge>
                        )}
                        {item.isMergedGroup && (
                          <Badge variant="outline" className="text-xs">
                            {item.mergedSegmentsCount} сегментов
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                        <span>Бокс {item.boxNumber}</span>
                        <span>{vehicleClassLabel(item.vehicleClass)}</span>
                        <span>
                          {formatTimeRu(item.actualStart)} — {formatTimeRu(item.actualEnd)}
                        </span>
                        <span>{formatDuration(item.durationSec)}</span>
                      </div>
                      {item.note && (
                        <div className="text-xs text-amber-600 mt-1 truncate" title={item.note}>
                          📝 {item.note}
                        </div>
                      )}
                    </div>

                    {/* Действие */}
                    <div className="flex items-center">
                      <Button asChild size="sm">
                        <a href={buildWorkstationUrl(item)}>🚀 Оформить</a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Подсказка */}
      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground">
          ℹ️ <strong>Важно:</strong> при оформлении ретроспективной мойки timestamp проставится
          автоматически по времени с камеры (когда машина реально была), а не текущим временем.
          Это влияет на статистику смен и зарплату.
        </CardContent>
      </Card>
    </div>
  );
}
