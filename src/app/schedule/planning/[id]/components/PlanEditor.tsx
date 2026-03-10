"use client";

import { useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Ban, Plane, CheckCircle, Circle, Settings, Sparkles, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { SchedulePlan, Employee, EmployeePlanConfig, EmployeeDayStatusEntry, EmployeeDayStatus, DailyRequirement } from '@/types';

interface PlanEditorProps {
  plan: SchedulePlan;
  employees: Employee[];
  initialDayStatuses: EmployeeDayStatusEntry[];
}

interface WeatherForecastDay {
  date: string;
  precipMm: number;
  snowCm: number;
  weatherCode: number | null;
  tMin: number | null;
  tMax: number | null;
  windMax: number | null;
  isStrongPrecip: boolean;
  isGoodWeather: boolean;
  loadLevel: 'low' | 'normal' | 'high' | 'peak';
  recommendedBox1Day: number;
  recommendedBox2Day: number;
  recommendedTotal: number;
  reason: string;
  hint: string;
  icon: string;
  windHint: string | null;
}

interface WeatherForecastResponse {
  ok: true;
  targetMonth: string;
  generatedAt: string;
  stale: boolean;
  thresholds: { precipMm: number; snowCm: number };
  days: WeatherForecastDay[];
  meta: {
    forecastDaysInMonth: number;
    strongDaysInMonth: number;
    surgeDaysInMonth?: number;
    peakDays?: number;
    highDays?: number;
    lowDays?: number;
    forecastWindow?: { start: string | null; end: string | null };
    journalFile?: string;
  };
}

// Color coding for load levels
const LOAD_LEVEL_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  low:    { bg: 'bg-green-50',  border: 'border-green-400', text: 'text-green-700',  label: 'Мало' },
  normal: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-700', label: 'Средне' },
  high:   { bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', label: 'Много' },
  peak:   { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-700',    label: 'ПИК' },
};

const STATUS_CONFIG = {
  free: { label: 'Свободен', color: 'bg-gray-100 border-gray-300', icon: Circle, textColor: 'text-gray-600' },
  doesnt_want: { label: 'Не хочет', color: 'bg-red-100 border-red-300', icon: Ban, textColor: 'text-red-600' },
  vacation_sick: { label: 'Отпуск/Больничный', color: 'bg-blue-100 border-blue-300', icon: Plane, textColor: 'text-blue-600' },
  must_work: { label: 'Должен работать', color: 'bg-green-100 border-green-300', icon: CheckCircle, textColor: 'text-green-600' },
  auto_assigned: { label: 'Авто-назначен', color: 'bg-green-50 border-green-200', icon: Sparkles, textColor: 'text-green-500' }
};

export function PlanEditor({ plan, employees, initialDayStatuses }: PlanEditorProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(employees[0]?.id || '');
  const [dayStatuses, setDayStatuses] = useState<EmployeeDayStatusEntry[]>(initialDayStatuses);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [dailyRequirements, setDailyRequirements] = useState<DailyRequirement[]>(plan.dailyRequirements || []);
  const [editMode, setEditMode] = useState<'statuses' | 'requirements' | 'employees'>('statuses');
  const [selectedRequirementDates, setSelectedRequirementDates] = useState<Set<string>>(new Set());
  const [weatherForecast, setWeatherForecast] = useState<WeatherForecastResponse | null>(null);
  const [weatherForecastLoading, setWeatherForecastLoading] = useState(false);
  const [box2Disabled, setBox2Disabled] = useState(false);
  const [bulkSlot, setBulkSlot] = useState<'box1Day' | 'box1Night' | 'box2Day' | 'box2Night'>('box1Day');
  const [bulkValue, setBulkValue] = useState<number>(0);
  const [employeeConfigs, setEmployeeConfigs] = useState<EmployeePlanConfig[]>(plan.employeeConfigs || []);
  const [employeeConfigsSaving, setEmployeeConfigsSaving] = useState(false);
  const [nightDisabled, setNightDisabled] = useState<boolean>(() => {
    const reqs = plan.dailyRequirements || [];
    const hasNight = reqs.some((r) => (r.box1NightRequired || 0) > 0 || (r.box2NightRequired || 0) > 0);
    // Default: nights disabled unless explicitly present in requirements.
    return !hasNight;
  });

  const monthStart = startOfMonth(new Date(plan.month + '-01'));
  const monthEnd = endOfMonth(new Date(plan.month + '-01'));
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);

  // Get status for specific employee and date
  const getStatus = (employeeId: string, date: string): EmployeeDayStatus => {
    const status = dayStatuses.find(s => s.employeeId === employeeId && s.date === date);
    return status?.status || 'free';
  };

  // Get daily requirement for a specific date
  const getRequirement = (date: string) => {
    const req = dailyRequirements.find(r => r.date === date);
    return {
      box1Day: req?.box1DayRequired || 0,
      box1Night: req?.box1NightRequired || 0,
      box2Day: req?.box2DayRequired || 0,
      box2Night: req?.box2NightRequired || 0,
    };
  };

  // Update daily requirement
  const updateRequirement = async (
    date: string,
    field: 'box1Day' | 'box1Night' | 'box2Day' | 'box2Night',
    count: number
  ) => {
    const normalizeCount = (value: number): number => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      return Math.max(0, Math.min(2, Math.trunc(num)));
    };

    try {
      const sanitizedCount = normalizeCount(count);
      const existingReq = dailyRequirements.find(r => r.date === date);

      const fieldMap = {
        box1Day: 'box1DayRequired',
        box1Night: 'box1NightRequired',
        box2Day: 'box2DayRequired',
        box2Night: 'box2NightRequired'
      };

      const newRequirement: DailyRequirement = {
        date,
        requiredCount: 0, // Will calculate total
        box1DayRequired: existingReq?.box1DayRequired || 0,
        box1NightRequired: existingReq?.box1NightRequired || 0,
        box2DayRequired: existingReq?.box2DayRequired || 0,
        box2NightRequired: existingReq?.box2NightRequired || 0,
        [fieldMap[field]]: sanitizedCount
      };

      // Calculate total
      newRequirement.requiredCount =
        (newRequirement.box1DayRequired || 0) +
        (newRequirement.box1NightRequired || 0) +
        (newRequirement.box2DayRequired || 0) +
        (newRequirement.box2NightRequired || 0);

      const previousRequirements = dailyRequirements;
      const nextDailyRequirements = [
        ...previousRequirements.filter((r) => r.date !== date),
        // Keep explicit 0-requirement entries too: they represent "закрыто", and should not be treated as "пусто".
        newRequirement,
      ].sort((a, b) => a.date.localeCompare(b.date));

      // Optimistic update
      setDailyRequirements(nextDailyRequirements);

      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyRequirements: nextDailyRequirements })
      });

      if (!response.ok) {
        setDailyRequirements(previousRequirements);
        throw new Error('Failed to update requirement');
      }

      router.refresh();
    } catch (error) {
      console.error('Error updating requirement:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось сохранить требование',
        variant: 'destructive'
      });
    }
  };

  const toggleRequirementDateSelection = (dateStr: string, checked?: boolean) => {
    setSelectedRequirementDates((prev) => {
      const next = new Set(prev);
      const willSelect = checked !== undefined ? checked : !next.has(dateStr);
      if (willSelect) next.add(dateStr);
      else next.delete(dateStr);
      return next;
    });
  };

  const clearRequirementSelection = () => {
    setSelectedRequirementDates(new Set());
  };

  const selectRequirementDates = (mode: 'all' | 'weekdays' | 'weekends') => {
    const next = new Set<string>();
    for (const day of daysInMonth) {
      const dow = getDay(day); // 0=Sun..6=Sat
      const isWeekend = dow === 0 || dow === 6;
      if (mode === 'all') next.add(format(day, 'yyyy-MM-dd'));
      if (mode === 'weekdays' && !isWeekend) next.add(format(day, 'yyyy-MM-dd'));
      if (mode === 'weekends' && isWeekend) next.add(format(day, 'yyyy-MM-dd'));
    }
    setSelectedRequirementDates(next);
  };

  const applyRequirementPreset = async (preset: 'normal' | 'bad_weather' | 'closed') => {
    if (selectedRequirementDates.size === 0) {
      toast({
        title: 'Выберите дни',
        description: 'Отметьте дни галочкой в правом верхнем углу карточки.',
        variant: 'destructive',
      });
      return;
    }

    const presetLabel =
      preset === 'normal'
        ? 'Норма (2 сотрудника, бокс 1 день)'
        : preset === 'bad_weather'
          ? 'Погода (1 сотрудник, бокс 1 день)'
          : 'Закрыто (всё 0)';

    const values =
      preset === 'normal'
        ? { box1DayRequired: 2, box1NightRequired: 0, box2DayRequired: 0, box2NightRequired: 0 }
        : preset === 'bad_weather'
          ? { box1DayRequired: 1, box1NightRequired: 0, box2DayRequired: 0, box2NightRequired: 0 }
          : { box1DayRequired: 0, box1NightRequired: 0, box2DayRequired: 0, box2NightRequired: 0 };

    const previousRequirements = dailyRequirements;
    const selected = new Set(selectedRequirementDates);
    const nextDailyRequirements: DailyRequirement[] = [];

    for (const req of previousRequirements) {
      if (!selected.has(req.date)) nextDailyRequirements.push(req);
    }

    for (const date of Array.from(selected).sort()) {
      const requiredCount =
        values.box1DayRequired + values.box1NightRequired + values.box2DayRequired + values.box2NightRequired;
      nextDailyRequirements.push({
        date,
        requiredCount,
        ...values,
      });
    }

    nextDailyRequirements.sort((a, b) => a.date.localeCompare(b.date));

    // Optimistic update
    setDailyRequirements(nextDailyRequirements);

    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyRequirements: nextDailyRequirements }),
      });

      if (!response.ok) {
        setDailyRequirements(previousRequirements);
        throw new Error('Failed to apply requirement preset');
      }

      toast({
        title: 'Требования обновлены',
        description: `${presetLabel}. Дней: ${selectedRequirementDates.size}.`,
      });

      setSelectedRequirementDates(new Set());
      router.refresh();
    } catch (error) {
      console.error('Error applying requirement preset:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось применить пресет требований',
        variant: 'destructive',
      });
    }
  };

  const setNightDisabledForMonth = async (disabled: boolean) => {
    setNightDisabled(disabled);
    if (!disabled) return;

    const hasNight = dailyRequirements.some((r) => (r.box1NightRequired || 0) > 0 || (r.box2NightRequired || 0) > 0);
    if (!hasNight) return;

    const previousRequirements = dailyRequirements;
    const nextDailyRequirements: DailyRequirement[] = [];

    for (const r of previousRequirements) {
      const box1DayRequired = Math.max(0, Math.min(2, Math.trunc(Number(r.box1DayRequired || 0))));
      const box2DayRequired = Math.max(0, Math.min(2, Math.trunc(Number(r.box2DayRequired || 0))));

      const requiredCount = box1DayRequired + box2DayRequired;
      if (requiredCount <= 0) continue;

      nextDailyRequirements.push({
        date: r.date,
        requiredCount,
        box1DayRequired,
        box1NightRequired: 0,
        box2DayRequired,
        box2NightRequired: 0,
      });
    }

    nextDailyRequirements.sort((a, b) => a.date.localeCompare(b.date));
    setDailyRequirements(nextDailyRequirements);

    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyRequirements: nextDailyRequirements }),
      });

      if (!response.ok) {
        setDailyRequirements(previousRequirements);
        throw new Error('Failed to disable night shifts');
      }

      toast({
        title: 'Ночные смены отключены',
        description: 'Все ночные требования обнулены. Автозаполнение не будет создавать ночные смены.',
      });

      router.refresh();
    } catch (error) {
      console.error('Error disabling night shifts:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось отключить ночные смены',
        variant: 'destructive',
      });
    }
  };

  // Toggle date selection
  const toggleDateSelection = (dateStr: string) => {
    const newSelection = new Set(selectedDates);
    if (newSelection.has(dateStr)) {
      newSelection.delete(dateStr);
    } else {
      newSelection.add(dateStr);
    }
    setSelectedDates(newSelection);
  };

  // Apply status to selected dates
  const applyStatus = async (status: EmployeeDayStatus) => {
    if (selectedDates.size === 0) {
      toast({
        title: 'Выберите дни',
        description: 'Кликните на дни в календаре для выбора',
        variant: 'destructive'
      });
      return;
    }

    if (!selectedEmployeeId) {
      toast({
        title: 'Выберите сотрудника',
        variant: 'destructive'
      });
      return;
    }

    try {
      const updates: EmployeeDayStatusEntry[] = [];

      for (const date of Array.from(selectedDates)) {
        const existingStatus = dayStatuses.find(
          s => s.employeeId === selectedEmployeeId && s.date === date
        );

        const statusEntry: EmployeeDayStatusEntry = {
          id: existingStatus?.id || `status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          employeeId: selectedEmployeeId,
          date,
          status
        };

        // Save or update via API
        const response = await fetch(
          existingStatus
            ? `/api/employee-day-statuses/${existingStatus.id}`
            : '/api/employee-day-statuses',
          {
            method: existingStatus ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(statusEntry)
          }
        );

        if (!response.ok) throw new Error('Failed to save status');

        updates.push(statusEntry);
      }

      // Update local state
      setDayStatuses(prev => {
        const filtered = prev.filter(
          s => !(s.employeeId === selectedEmployeeId && selectedDates.has(s.date))
        );
        return [...filtered, ...updates];
      });

      setSelectedDates(new Set());

      toast({
        title: 'Статусы обновлены',
        description: `Установлен статус "${STATUS_CONFIG[status].label}" для ${selectedDates.size} дней`
      });

      router.refresh();
    } catch (error) {
      console.error('Error saving statuses:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось сохранить статусы',
        variant: 'destructive'
      });
    }
  };

  const setBox2DisabledForMonth = async (disabled: boolean) => {
    setBox2Disabled(disabled);
    if (!disabled) return;

    const previousRequirements = dailyRequirements;
    const nextDailyRequirements: DailyRequirement[] = [];

    for (const r of previousRequirements) {
      const box1DayRequired = Math.max(0, Math.min(2, Math.trunc(Number(r.box1DayRequired || 0))));
      const box1NightRequired = Math.max(0, Math.min(2, Math.trunc(Number(r.box1NightRequired || 0))));
      const box2DayRequired = 0;
      const box2NightRequired = 0;

      const requiredCount = box1DayRequired + box1NightRequired + box2DayRequired + box2NightRequired;
      nextDailyRequirements.push({
        ...r,
        box1DayRequired,
        box1NightRequired,
        box2DayRequired,
        box2NightRequired,
        requiredCount,
      });
    }

    nextDailyRequirements.sort((a, b) => a.date.localeCompare(b.date));
    setDailyRequirements(nextDailyRequirements);

    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyRequirements: nextDailyRequirements }),
      });

      if (!response.ok) {
        setDailyRequirements(previousRequirements);
        throw new Error('Failed to disable box 2 requirements');
      }

      toast({
        title: 'Бокс 2 отключен',
        description: 'Все требования по боксу 2 обнулены для этого месяца.',
      });

      router.refresh();
    } catch (error) {
      console.error('Error disabling box2:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось отключить бокс 2',
        variant: 'destructive',
      });
    }
  };

  const applyBulkSlotToSelectedDays = async () => {
    if (selectedRequirementDates.size === 0) {
      toast({
        title: 'Выберите дни',
        description: 'Отметьте дни галочкой в правом верхнем углу карточки.',
        variant: 'destructive',
      });
      return;
    }

    if (nightDisabled && (bulkSlot === 'box1Night' || bulkSlot === 'box2Night')) {
      toast({
        title: 'Ночные смены отключены',
        description: 'Снимите галочку "Ночные смены отключены", чтобы менять ночные поля.',
        variant: 'destructive',
      });
      return;
    }

    if (box2Disabled && (bulkSlot === 'box2Day' || bulkSlot === 'box2Night')) {
      toast({
        title: 'Бокс 2 отключен',
        description: 'Снимите галочку "Бокс 2 отключен", чтобы менять требования по боксу 2.',
        variant: 'destructive',
      });
      return;
    }

    const normalizeCount = (value: number): number => {
      const num = Number(value);
      if (!Number.isFinite(num)) return 0;
      return Math.max(0, Math.min(2, Math.trunc(num)));
    };

    const previousRequirements = dailyRequirements;
    const reqByDate = new Map<string, DailyRequirement>();
    for (const r of previousRequirements) reqByDate.set(r.date, { ...r });

    const selected = new Set(selectedRequirementDates);

    for (const date of selected) {
      const existing = reqByDate.get(date);
      const next: DailyRequirement = existing
        ? { ...existing }
        : {
            date,
            requiredCount: 0,
            box1DayRequired: 0,
            box1NightRequired: 0,
            box2DayRequired: 0,
            box2NightRequired: 0,
          };

      const val = normalizeCount(bulkValue);
      if (bulkSlot === 'box1Day') next.box1DayRequired = val;
      if (bulkSlot === 'box1Night') next.box1NightRequired = val;
      if (bulkSlot === 'box2Day') next.box2DayRequired = val;
      if (bulkSlot === 'box2Night') next.box2NightRequired = val;

      const box1DayRequired = normalizeCount(Number(next.box1DayRequired || 0));
      const box1NightRequired = normalizeCount(Number(next.box1NightRequired || 0));
      const box2DayRequired = normalizeCount(Number(next.box2DayRequired || 0));
      const box2NightRequired = normalizeCount(Number(next.box2NightRequired || 0));

      next.box1DayRequired = box1DayRequired;
      next.box1NightRequired = box1NightRequired;
      next.box2DayRequired = box2DayRequired;
      next.box2NightRequired = box2NightRequired;
      next.requiredCount = box1DayRequired + box1NightRequired + box2DayRequired + box2NightRequired;

      reqByDate.set(date, next);
    }

    const nextDailyRequirements = Array.from(reqByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    setDailyRequirements(nextDailyRequirements);

    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyRequirements: nextDailyRequirements }),
      });

      if (!response.ok) {
        setDailyRequirements(previousRequirements);
        throw new Error('Failed to apply bulk changes');
      }

      toast({
        title: 'Требования обновлены',
        description: `Применено к дням: ${selected.size}.`,
      });

      router.refresh();
    } catch (error) {
      console.error('Bulk apply error:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось применить изменения',
        variant: 'destructive',
      });
    }
  };

  const loadWeatherForecast = async () => {
    setWeatherForecastLoading(true);
    try {
      const res = await fetch(`/api/weather/forecast?month=${encodeURIComponent(plan.month)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error((errorData as any)?.error || 'Не удалось загрузить прогноз');
      }
      const json = (await res.json()) as WeatherForecastResponse;
      if (!json?.ok) {
        throw new Error('Некорректный ответ прогноза');
      }
      setWeatherForecast(json);

      // In case a user switches between plans/months, reset selection for clarity.
      setSelectedRequirementDates(new Set());

      toast({
        title: 'Прогноз загружен',
        description: `Дней: ${json.meta?.forecastDaysInMonth ?? json.days.length}. Мало машин: ${json.meta?.lowDays ?? 0}. Много: ${json.meta?.highDays ?? 0}. ПИК: ${json.meta?.peakDays ?? 0}.`,
      });
    } catch (error: any) {
      console.error('Weather forecast load error:', error);
      toast({
        title: 'Погода недоступна',
        description: error?.message || 'Не удалось загрузить прогноз',
        variant: 'destructive',
      });
    } finally {
      setWeatherForecastLoading(false);
    }
  };

  const selectStrongPrecipDays = () => {
    if (!weatherForecast) {
      toast({
        title: 'Сначала загрузите прогноз',
        description: 'Нажмите "Загрузить прогноз", чтобы выбрать дни с сильными осадками.',
        variant: 'destructive',
      });
      return;
    }

    const dates = weatherForecast.days.filter((d) => d.loadLevel === 'low').map((d) => d.date);
    setSelectedRequirementDates(new Set(dates));
    toast({ title: `Выделено дней с осадками: ${dates.length}`, description: 'Можно применить пресет "Плохая погода" (1 человек)' });
  };

  const selectSurgeDays = () => {
    if (!weatherForecast) {
      toast({
        title: 'Сначала загрузите прогноз',
        description: 'Нажмите "Загрузить прогноз", чтобы выбрать дни "пика".',
        variant: 'destructive',
      });
      return;
    }

    const dates = weatherForecast.days.filter((d) => d.loadLevel === 'peak' || d.loadLevel === 'high').map((d) => d.date);
    setSelectedRequirementDates(new Set(dates));
    toast({ title: `Выделено дней с высокой нагрузкой: ${dates.length}`, description: 'Можно увеличить людей на эти дни' });
  };

  const applyWeatherToEmptyDays = async () => {
    if (!weatherForecast) {
      toast({
        title: 'Сначала загрузите прогноз',
        description: 'Нажмите "Загрузить прогноз", затем примените автозаполнение.',
        variant: 'destructive',
      });
      return;
    }

    const existingDates = new Set(dailyRequirements.map((r) => r.date));
    const forecastByDate = new Map<string, WeatherForecastDay>();
    for (const d of weatherForecast.days) forecastByDate.set(d.date, d);

    const previousRequirements = dailyRequirements;
    const nextDailyRequirements: DailyRequirement[] = [...previousRequirements];

    let filledDays = 0;
    let strongDays = 0;
    let surgeDays = 0;
    let noForecastDays = 0;

    for (const day of daysInMonth) {
      const dateStr = format(day, 'yyyy-MM-dd');
      if (existingDates.has(dateStr)) continue;

      const forecast = forecastByDate.get(dateStr);
      const hasForecast = Boolean(forecast);
      const recommendedBox1Day = hasForecast ? Math.max(0, Math.min(2, Math.trunc(Number(forecast!.recommendedBox1Day)))) : 2;
      const recommendedBox2Day = hasForecast
        ? (box2Disabled ? 0 : Math.max(0, Math.min(2, Math.trunc(Number(forecast!.recommendedBox2Day)))))
        : 0;

      if (hasForecast) {
        if (forecast!.isStrongPrecip) strongDays++;
        if (forecast!.reason === 'surge_after_precip' && !box2Disabled) surgeDays++;
      } else {
        noForecastDays++;
      }

      nextDailyRequirements.push({
        date: dateStr,
        requiredCount: recommendedBox1Day + recommendedBox2Day,
        box1DayRequired: recommendedBox1Day,
        box1NightRequired: 0,
        box2DayRequired: recommendedBox2Day,
        box2NightRequired: 0,
      });
      filledDays++;
    }

    nextDailyRequirements.sort((a, b) => a.date.localeCompare(b.date));
    setDailyRequirements(nextDailyRequirements);

    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyRequirements: nextDailyRequirements }),
      });

      if (!response.ok) {
        setDailyRequirements(previousRequirements);
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any)?.error || 'Не удалось сохранить требования');
      }

      toast({
        title: 'Требования обновлены',
        description: `Заполнено пустых дней: ${filledDays}. Сильные осадки (1): ${strongDays}. Пики (3): ${surgeDays}. Дней без прогноза: ${noForecastDays} (применена норма 2).`,
      });

      router.refresh();
    } catch (error: any) {
      console.error('Error applying weather requirements:', error);
      toast({
        title: 'Ошибка сохранения',
        description: error?.message || 'Не удалось применить требования по погоде',
        variant: 'destructive',
      });
    }
  };

  const buildPatternJournal = async () => {
    try {
      const res = await fetch(`/api/pattern-journal/month?month=${encodeURIComponent(plan.month)}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error((errorData as any)?.error || 'Не удалось собрать журнал');
      }
      const json = await res.json();
      toast({
        title: 'Журнал собран',
        description: typeof (json as any)?.journalFile === 'string'
          ? `Файл: ${(json as any).journalFile}`
          : 'Файл журнала сохранен в data/_meta/pattern-journal',
      });
    } catch (error: any) {
      console.error('Pattern journal error:', error);
      toast({
        title: 'Ошибка',
        description: error?.message || 'Не удалось собрать журнал',
        variant: 'destructive',
      });
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedDates(new Set());
  };

  const selectStatusDates = (mode: 'all' | 'weekdays' | 'weekends' | 'none') => {
    const next = new Set<string>();
    if (mode !== 'none') {
      for (const day of daysInMonth) {
        const dow = getDay(day); // 0=Sun..6=Sat
        const isWeekend = dow === 0 || dow === 6;
        const dateStr = format(day, 'yyyy-MM-dd');
        if (mode === 'all') next.add(dateStr);
        if (mode === 'weekdays' && !isWeekend) next.add(dateStr);
        if (mode === 'weekends' && isWeekend) next.add(dateStr);
      }
    }
    setSelectedDates(next);
  };

  const clearStatusesForEmployeeForMonth = async (employeeId: string) => {
    const monthStr = plan.month;
    const toDelete = dayStatuses.filter((s) => s.employeeId === employeeId && s.date.startsWith(monthStr));
    if (toDelete.length === 0) {
      toast({
        title: 'Нечего очищать',
        description: 'Для выбранного сотрудника нет исключений (по умолчанию все дни свободны).',
      });
      return;
    }

    if (!window.confirm(`Очистить статусы за ${monthStr} для сотрудника?\nУдалится записей: ${toDelete.length}`)) {
      return;
    }

    try {
      for (const status of toDelete) {
        const res = await fetch(`/api/employee-day-statuses/${status.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any)?.error || 'Не удалось удалить статус');
        }
      }

      setDayStatuses((prev) => prev.filter((s) => !(s.employeeId === employeeId && s.date.startsWith(monthStr))));
      setSelectedDates(new Set());

      toast({
        title: 'Готово',
        description: `Очищено записей: ${toDelete.length}. Теперь дни считаются "Свободен" по умолчанию.`,
      });

      router.refresh();
    } catch (error: any) {
      console.error('Error clearing employee day statuses:', error);
      toast({
        title: 'Ошибка',
        description: error?.message || 'Не удалось очистить статусы',
        variant: 'destructive',
      });
    }
  };

  const clearAllStatusesForMonth = async () => {
    const monthStr = plan.month;
    const toDelete = dayStatuses.filter((s) => s.date.startsWith(monthStr));
    if (toDelete.length === 0) {
      toast({
        title: 'Нечего очищать',
        description: 'За этот месяц нет сохраненных статусов сотрудников.',
      });
      return;
    }

    if (!window.confirm(`Сбросить ВСЕ статусы сотрудников за ${monthStr}?\nУдалится записей: ${toDelete.length}`)) {
      return;
    }

    try {
      for (const status of toDelete) {
        const res = await fetch(`/api/employee-day-statuses/${status.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any)?.error || 'Не удалось удалить статус');
        }
      }

      setDayStatuses((prev) => prev.filter((s) => !s.date.startsWith(monthStr)));
      setSelectedDates(new Set());

      toast({
        title: 'Готово',
        description: `Сброшено записей: ${toDelete.length}. По умолчанию все сотрудники "Свободен".`,
      });

      router.refresh();
    } catch (error: any) {
      console.error('Error clearing month day statuses:', error);
      toast({
        title: 'Ошибка',
        description: error?.message || 'Не удалось сбросить статусы месяца',
        variant: 'destructive',
      });
    }
  };

  // --- План: настройки сотрудников (employeeConfigs) ---
  const employeeConfigById = useMemo(() => {
    const map = new Map<string, EmployeePlanConfig>();
    for (const cfg of employeeConfigs) {
      if (cfg?.employeeId) map.set(cfg.employeeId, cfg);
    }
    return map;
  }, [employeeConfigs]);

  const buildDefaultEmployeeConfig = (emp: Employee): EmployeePlanConfig => ({
    employeeId: emp.id,
    targetShiftsCount: emp.targetShiftsPerMonth || 15,
    preferredShiftType: emp.preferredShiftType || 'any',
    wantsMoreShifts: typeof emp.wantsMoreShifts === 'boolean' ? emp.wantsMoreShifts : false,
  });

  const sortEmployeeConfigs = (configs: EmployeePlanConfig[]): EmployeePlanConfig[] => {
    const order = new Map(employees.map((e, idx) => [e.id, idx]));
    return [...configs].sort((a, b) => {
      const ai = order.get(a.employeeId) ?? Number.MAX_SAFE_INTEGER;
      const bi = order.get(b.employeeId) ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.employeeId.localeCompare(b.employeeId);
    });
  };

  const setEmployeeIncluded = (emp: Employee, included: boolean) => {
    setEmployeeConfigs((prev) => {
      const exists = prev.some((c) => c.employeeId === emp.id);
      if (included && !exists) {
        return sortEmployeeConfigs([...prev, buildDefaultEmployeeConfig(emp)]);
      }
      if (!included && exists) {
        return prev.filter((c) => c.employeeId !== emp.id);
      }
      return prev;
    });
  };

  const updateEmployeeConfig = (employeeId: string, patch: Partial<EmployeePlanConfig>) => {
    setEmployeeConfigs((prev) =>
      prev.map((c) => (c.employeeId === employeeId ? { ...c, ...patch } : c))
    );
  };

  const includeAllEmployees = () => {
    const next = employees.map(buildDefaultEmployeeConfig);
    setEmployeeConfigs(sortEmployeeConfigs(next));
  };

  const excludeAllEmployees = () => {
    setEmployeeConfigs([]);
  };

  const syncEmployeeConfigValuesFromEmployees = () => {
    const empById = new Map(employees.map((e) => [e.id, e]));
    setEmployeeConfigs((prev) => {
      const next = prev.map((cfg) => {
        const emp = empById.get(cfg.employeeId);
        if (!emp) return cfg;
        return {
          ...cfg,
          targetShiftsCount: emp.targetShiftsPerMonth || 15,
          preferredShiftType: emp.preferredShiftType || 'any',
          wantsMoreShifts: typeof emp.wantsMoreShifts === 'boolean' ? emp.wantsMoreShifts : false,
        };
      });
      return sortEmployeeConfigs(next);
    });
  };

  const saveEmployeeConfigsToPlan = async () => {
    setEmployeeConfigsSaving(true);
    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeConfigs }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any)?.error || 'Не удалось сохранить настройки сотрудников');
      }

      toast({
        title: 'Сохранено',
        description: `Настройки сотрудников плана обновлены. Участвуют: ${employeeConfigs.length}.`,
      });

      router.refresh();
    } catch (error: any) {
      console.error('Error saving employee configs:', error);
      toast({
        title: 'Ошибка сохранения',
        description: error?.message || 'Не удалось сохранить настройки сотрудников',
        variant: 'destructive',
      });
    } finally {
      setEmployeeConfigsSaving(false);
    }
  };

  // Days of week header
  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  // Fill starting empty cells based on first day of month
  const firstDayOfWeek = getDay(monthStart); // 0 = Sunday, 1 = Monday, ...
  const startPadding = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Convert to Monday-based

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <Card>
        <CardHeader>
          <CardTitle>Режим редактирования</CardTitle>
	        </CardHeader>
	        <CardContent>
	          <div className="flex gap-2">
	            <Button
	              variant={editMode === 'statuses' ? 'default' : 'outline'}
	              onClick={() => setEditMode('statuses')}
	              className="flex-1"
	            >
	              <Circle className="h-4 w-4 mr-2" />
	              Статусы сотрудников
	            </Button>
	            <Button
	              variant={editMode === 'requirements' ? 'default' : 'outline'}
	              onClick={() => setEditMode('requirements')}
	              className="flex-1"
	            >
	              <Users className="h-4 w-4 mr-2" />
	              Требования по дням
	            </Button>
	            <Button
	              variant={editMode === 'employees' ? 'default' : 'outline'}
	              onClick={() => setEditMode('employees')}
	              className="flex-1"
	            >
	              <Settings className="h-4 w-4 mr-2" />
	              Сотрудники плана
	            </Button>
	          </div>
	        </CardContent>
	      </Card>

      {editMode === 'statuses' ? (
        <>
          {/* Employee selector */}
          <Card>
            <CardHeader>
              <CardTitle>Выбор сотрудника</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Quick tools */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Быстрые действия</span>
                <Badge variant="secondary">Выбрано: {selectedDates.size}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-gray-600">
                По умолчанию все дни считаются <span className="font-medium">Свободен</span>. Обычно отмечайте только исключения
                (не хочет / отпуск / должен работать).
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => selectStatusDates('all')}>
                  Все
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectStatusDates('weekdays')}>
                  Будни
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectStatusDates('weekends')}>
                  Выходные
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectStatusDates('none')}>
                  Сброс выбора
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectedEmployeeId && clearStatusesForEmployeeForMonth(selectedEmployeeId)}
                >
                  Очистить исключения сотрудника
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearAllStatusesForMonth}
                >
                  Сбросить статусы месяца (все свободны)
                </Button>
              </div>
            </CardContent>
          </Card>

      {/* Status buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Назначить статус</span>
            {selectedDates.size > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{selectedDates.size} выбрано</Badge>
                <Button size="sm" variant="outline" onClick={clearSelection}>
                  Сбросить
                </Button>
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(STATUS_CONFIG).filter(([key]) => key !== 'auto_assigned').map(([key, config]) => {
              const Icon = config.icon;
              return (
                <Button
                  key={key}
                  variant="outline"
                  className={`${config.color} ${config.textColor} border-2`}
                  onClick={() => applyStatus(key as EmployeeDayStatus)}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {config.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Calendar */}
      <Card>
        <CardHeader>
          <CardTitle>{format(monthStart, 'LLLL yyyy', { locale: ru })}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {/* Week day headers */}
            {weekDays.map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                {day}
              </div>
            ))}

            {/* Empty cells for padding */}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}

            {/* Days */}
            {daysInMonth.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const status = getStatus(selectedEmployeeId, dateStr);
              const config = STATUS_CONFIG[status];
              const isSelected = selectedDates.has(dateStr);
              const Icon = config.icon;

              return (
                <button
                  key={dateStr}
                  onClick={() => toggleDateSelection(dateStr)}
                  className={`
                    aspect-square rounded-lg border-2 p-2 flex flex-col items-center justify-center
                    transition-all hover:shadow-md
                    ${config.color}
                    ${isSelected ? 'ring-4 ring-purple-500' : ''}
                  `}
                >
                  <div className="text-sm font-medium">{format(day, 'd')}</div>
                  <Icon className={`h-3 w-3 mt-1 ${config.textColor}`} />
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t">
            <div className="text-sm font-medium text-gray-700 mb-2">Легенда:</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded ${config.color} border-2 flex items-center justify-center`}>
                      <Icon className={`h-3 w-3 ${config.textColor}`} />
                    </div>
                    <span className="text-xs">{config.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
        </>
      ) : editMode === 'requirements' ? (
        <>
          {/* Requirements Calendar */}
          <Card>
            <CardHeader>
              <CardTitle>Требования по дням</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Укажите, сколько сотрудников нужно в каждый день по типам смен и боксам.
              </p>
            </CardHeader>
            <CardContent>
              {/* Quick presets */}
              <div className="mb-4 rounded-lg border p-3 bg-white">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Выбрано: {selectedRequirementDates.size}</Badge>
                    <Button size="sm" variant="outline" onClick={() => selectRequirementDates('all')}>
                      Все
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => selectRequirementDates('weekdays')}>
                      Будни
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => selectRequirementDates('weekends')}>
                      Выходные
                    </Button>
                    <Button size="sm" variant="outline" onClick={clearRequirementSelection}>
                      Сброс
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => applyRequirementPreset('normal')}>
                      Норма: 2 (бокс 1 день)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyRequirementPreset('bad_weather')}>
                      Погода: 1 (бокс 1 день)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (box2Disabled) {
                          toast({
                            title: 'Бокс 2 отключен',
                            description: 'Снимите галочку "Бокс 2 отключен", чтобы использовать пресет "Пик".',
                            variant: 'destructive',
                          });
                          return;
                        }
                        // Inline peak preset: 2 в бокс 1 день + 1 в бокс 2 день.
                        const previousRequirements = dailyRequirements;
                        if (selectedRequirementDates.size === 0) {
                          toast({
                            title: 'Выберите дни',
                            description: 'Отметьте дни галочкой в правом верхнем углу карточки.',
                            variant: 'destructive',
                          });
                          return;
                        }

                        const selected = new Set(selectedRequirementDates);
                        const nextDailyRequirements: DailyRequirement[] = [];

                        for (const req of previousRequirements) {
                          if (!selected.has(req.date)) nextDailyRequirements.push(req);
                        }

                        for (const date of Array.from(selected).sort()) {
                          nextDailyRequirements.push({
                            date,
                            requiredCount: 3,
                            box1DayRequired: 2,
                            box1NightRequired: 0,
                            box2DayRequired: 1,
                            box2NightRequired: 0,
                          });
                        }

                        nextDailyRequirements.sort((a, b) => a.date.localeCompare(b.date));
                        setDailyRequirements(nextDailyRequirements);

                        try {
                          const response = await fetch(`/api/schedule-plans/${plan.id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ dailyRequirements: nextDailyRequirements }),
                          });

                          if (!response.ok) {
                            setDailyRequirements(previousRequirements);
                            throw new Error('Failed to apply peak preset');
                          }

                          toast({
                            title: 'Требования обновлены',
                            description: `Пик (3 сотрудника: 2+1). Дней: ${selected.size}.`,
                          });

                          setSelectedRequirementDates(new Set());
                          router.refresh();
                        } catch (error) {
                          console.error('Error applying peak preset:', error);
                          toast({
                            title: 'Ошибка сохранения',
                            description: 'Не удалось применить пресет "Пик"',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      Пик: 3 (2+1)
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => applyRequirementPreset('closed')}>
                      Закрыто: 0
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Под вашу модель: бокс 1 основной, бокс 2 резервный. Обычно заполняют только <strong>бокс 1 день</strong>,
                  а в "погоду" ставят 1 сотрудника.
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <Checkbox
                    id="nightDisabled"
                    checked={nightDisabled}
                    onCheckedChange={(v) => setNightDisabledForMonth(Boolean(v))}
                  />
                  <div className="text-xs text-gray-600">
                    <label htmlFor="nightDisabled" className="font-medium cursor-pointer">
                      Ночные смены отключены в этом месяце
                    </label>
                    <div className="text-gray-500">
                      Полезно зимой, когда ночью топиться невыгодно. Включение этой опции обнуляет ночные требования и скрывает поля ночи.
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-start gap-2">
                  <Checkbox
                    id="box2Disabled"
                    checked={box2Disabled}
                    onCheckedChange={(v) => setBox2DisabledForMonth(Boolean(v))}
                  />
                  <div className="text-xs text-gray-600">
                    <label htmlFor="box2Disabled" className="font-medium cursor-pointer">
                      Бокс 2 отключен в этом месяце (резерв закрыт)
                    </label>
                    <div className="text-gray-500">
                      Включение обнуляет требования по боксу 2 и (опционально) упрощает ввод, если бокс 2 почти не используется.
                    </div>
                  </div>
                </div>

                {/* Bulk slot tool */}
                <div className="mt-3 rounded-md border bg-gray-50 p-3">
                  <div className="text-xs font-medium text-gray-700 mb-2">
                    Быстрое открытие/закрытие слота (применить к выбранным дням)
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <Select value={bulkSlot} onValueChange={(v) => setBulkSlot(v as any)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="box1Day">Бокс 1 День</SelectItem>
                        {!nightDisabled && <SelectItem value="box1Night">Бокс 1 Ночь</SelectItem>}
                        {!box2Disabled && <SelectItem value="box2Day">Бокс 2 День</SelectItem>}
                        {!box2Disabled && !nightDisabled && <SelectItem value="box2Night">Бокс 2 Ночь</SelectItem>}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      max="2"
                      value={bulkValue}
                      onChange={(e) => setBulkValue(Number(e.target.value))}
                      className="h-8 text-xs text-center w-24"
                      placeholder="0..2"
                    />
                    <Button size="sm" variant="outline" onClick={applyBulkSlotToSelectedDays}>
                      Применить
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Пример: выбрать "Бокс 1 Ночь" и поставить 0, чтобы закрыть ночной слот на выбранные дни.
                  </div>
                </div>
              </div>

              {/* Weather helper */}
              <div className="mb-4 rounded-lg border p-3 bg-white">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-gray-800">Погодный помощник (Вязники)</div>
                      <div className="text-xs text-gray-500">
                        Прогноз нагрузки мойки на основе погоды. Паттерны: осадки → мало; после дождя солнце → ПИК; мороз без метели → много; оттепель+заморозок → пик к вечеру.
                      </div>
                      {weatherForecast && (
                        <div className="text-xs text-gray-600">
                          Прогноз на {weatherForecast.meta?.forecastDaysInMonth ?? 0} дней.{' '}
                          {weatherForecast.stale ? '(кэш) ' : ''}
                          <a href="/schedule?tab=weather" className="text-blue-600 underline hover:text-blue-800">Паттерны погоды</a>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={loadWeatherForecast} disabled={weatherForecastLoading}>
                        {weatherForecastLoading ? 'Загрузка...' : weatherForecast ? 'Обновить прогноз' : 'Загрузить прогноз'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={selectStrongPrecipDays}
                        disabled={!weatherForecast || weatherForecastLoading}
                        title="Выделить дни с осадками (мало машин — нужен 1 человек)"
                      >
                        Дни с осадками
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={selectSurgeDays}
                        disabled={!weatherForecast || weatherForecastLoading || box2Disabled}
                        title="Выделить дни с пиковой нагрузкой (после осадков — нужно 3 человека)"
                      >
                        Дни-пики
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={applyWeatherToEmptyDays}
                      disabled={!weatherForecast || weatherForecastLoading}
                    >
                      Заполнить пустые дни
                    </Button>
                    <Button size="sm" variant="outline" onClick={buildPatternJournal}>
                      Собрать журнал
                    </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Примечание: прогноз ограничен ближайшими днями. Даты без прогноза заполнятся как &quot;Норма: 2&quot;.
                  </div>
                </div>
              </div>

              {/* Legend: slots + weather load levels */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded" />
                    <span>Б1 День</span>
                  </div>
                  {!nightDisabled && (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-500 rounded" />
                      <span>Б1 Ночь</span>
                    </div>
                  )}
                  {!box2Disabled && (
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-400 rounded" />
                      <span>Б2 День</span>
                    </div>
                  )}
                  {weatherForecast && (
                    <>
                      <div className="border-l border-gray-300 pl-4 flex items-center gap-1">
                        <span className="font-medium">Шкала нагрузки:</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-200 border border-green-400 rounded" />
                        <span>Мало машин</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-yellow-200 border border-yellow-400 rounded" />
                        <span>Средне</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-orange-200 border border-orange-400 rounded" />
                        <span>Много</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-red-200 border border-red-400 rounded" />
                        <span>ПИК</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-3">
                {/* Week day headers */}
                {weekDays.map(day => (
                  <div key={day} className="text-center text-xs font-medium text-gray-600 py-1">
                    {day}
                  </div>
                ))}

                {/* Empty cells for padding */}
                {Array.from({ length: startPadding }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}

                {/* Days */}
                {daysInMonth.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const req = getRequirement(dateStr);
                  const isSelected = selectedRequirementDates.has(dateStr);
                  const wDay = weatherForecast?.days.find((d) => d.date === dateStr);
                  const loadColors = wDay ? LOAD_LEVEL_COLORS[wDay.loadLevel] || LOAD_LEVEL_COLORS.normal : null;

                  return (
                    <div
                      key={dateStr}
                      className={`rounded-lg border-2 p-2 hover:border-blue-400 transition-all ${
                        isSelected
                          ? 'ring-4 ring-purple-500 border-purple-500'
                          : loadColors
                            ? `${loadColors.bg} ${loadColors.border}`
                            : 'bg-white border-gray-300'
                      }`}
                    >
                      {/* Day header + weather */}
                      <div className="flex items-center gap-1 mb-1">
                        <div className="flex-1 text-sm font-bold text-gray-700 text-center">
                          {format(day, 'd')}
                        </div>
                        {wDay && <span className="text-sm" title={wDay.hint}>{wDay.icon}</span>}
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => toggleRequirementDateSelection(dateStr, Boolean(v))}
                          aria-label="Выбрать день"
                          className="h-3.5 w-3.5"
                        />
                      </div>

                      {/* Temperature + load badge */}
                      {wDay && (
                        <div className="mb-1.5 space-y-0.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-blue-600 font-medium">
                              {wDay.tMin !== null ? `${wDay.tMin > 0 ? '+' : ''}${Math.round(wDay.tMin)}°` : ''}
                              {wDay.tMax !== null ? ` / ${wDay.tMax > 0 ? '+' : ''}${Math.round(wDay.tMax)}°` : ''}
                            </span>
                            {loadColors && (
                              <span className={`px-1 rounded font-bold ${loadColors.text}`}>{loadColors.label}</span>
                            )}
                          </div>
                          <div className={`text-[9px] leading-tight ${loadColors?.text || 'text-gray-500'}`} title={wDay.windHint || undefined}>
                            {wDay.hint}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        {/* Бокс 1 День */}
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded flex-shrink-0" />
                          <Input
                            type="number"
                            min="0"
                            max="2"
                            value={req.box1Day}
                            onChange={(e) => updateRequirement(dateStr, 'box1Day', Number(e.target.value))}
                            className="h-6 text-xs text-center p-0 w-full"
                            placeholder="0"
                          />
                        </div>

                        {/* Бокс 1 Ночь */}
                        {!nightDisabled && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-500 rounded flex-shrink-0" />
                            <Input
                              type="number"
                              min="0"
                              max="2"
                              value={req.box1Night}
                              onChange={(e) => updateRequirement(dateStr, 'box1Night', Number(e.target.value))}
                              className="h-6 text-xs text-center p-0 w-full"
                              placeholder="0"
                            />
                          </div>
                        )}

                        {/* Бокс 2 День */}
                        {!box2Disabled && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-400 rounded flex-shrink-0" />
                            <Input
                              type="number"
                              min="0"
                              max="2"
                              value={req.box2Day}
                              onChange={(e) => updateRequirement(dateStr, 'box2Day', Number(e.target.value))}
                              className="h-6 text-xs text-center p-0 w-full"
                              placeholder="0"
                            />
                          </div>
                        )}

                        {/* Бокс 2 Ночь */}
                        {!box2Disabled && !nightDisabled && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-blue-400 rounded flex-shrink-0" />
                            <Input
                              type="number"
                              min="0"
                              max="2"
                              value={req.box2Night}
                              onChange={(e) => updateRequirement(dateStr, 'box2Night', Number(e.target.value))}
                              className="h-6 text-xs text-center p-0 w-full"
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Help text */}
              <div className="mt-6 pt-4 border-t">
                <div className="text-sm text-gray-600 space-y-1">
                  <p><strong>Подсказка:</strong> Укажите количество сотрудников для каждого типа смены и бокса.</p>
                  <p>🟢 Зелёные - дневные смены (08:00-20:00)</p>
                  {!nightDisabled && <p>🔵 Синие - ночные смены (20:00-08:00)</p>}
                  <p>Эти данные используются при автоматическом распределении смен.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Сотрудники плана (настройки автозаполнения)</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Здесь менеджер задает параметры, которые использует <strong>Автозаполнение</strong> для распределения смен в этом месяце.
                По умолчанию можно подтянуть их из предпочтений сотрудников (они задаются в <code>/employee/schedule</code>).
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge variant="secondary">Участвуют: {employeeConfigs.length}</Badge>
                <Button size="sm" variant="outline" onClick={includeAllEmployees}>
                  Включить всех
                </Button>
                <Button size="sm" variant="outline" onClick={excludeAllEmployees}>
                  Отключить всех
                </Button>
                <Button size="sm" variant="outline" onClick={syncEmployeeConfigValuesFromEmployees}>
                  Синхронизировать значения
                </Button>
                <Button size="sm" onClick={saveEmployeeConfigsToPlan} disabled={employeeConfigsSaving}>
                  {employeeConfigsSaving ? 'Сохраняем...' : 'Сохранить'}
                </Button>
              </div>

              <div className="text-xs text-gray-600">
                <div><strong>Важно:</strong> "Статусы сотрудников" (отпуск/не хочет/должен) сильнее предпочтений и могут исключать человека из назначения на конкретную дату.</div>
                <div>Предпочтения "будни/выходные" сотрудника учитываются при авто-fill автоматически.</div>
              </div>

              <div className="space-y-2">
                {employees.map((emp) => {
                  const cfg = employeeConfigById.get(emp.id);
                  const included = Boolean(cfg);

                  const empTarget = emp.targetShiftsPerMonth || 15;
                  const empPref = emp.preferredShiftType || 'any';
                  const empWants = typeof emp.wantsMoreShifts === 'boolean' ? emp.wantsMoreShifts : false;
                  const hasOverride = included && (
                    (cfg!.targetShiftsCount !== empTarget) ||
                    ((cfg!.preferredShiftType || 'any') !== empPref) ||
                    (Boolean(cfg!.wantsMoreShifts) !== empWants)
                  );

                  const weekday = emp.weekdayPreferredShiftType || 'inherit';
                  const weekend = emp.weekendPreferredShiftType || 'inherit';

                  const prettyShift = (v: string) => v === 'day' ? 'день' : v === 'night' ? 'ночь' : v === 'any' ? 'любые' : 'общий';

                  return (
                    <div key={emp.id} className="rounded-md border p-3 bg-white">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={included}
                            onCheckedChange={(v) => setEmployeeIncluded(emp, Boolean(v))}
                          />
                          <div>
                            <div className="font-medium">{emp.fullName}</div>
                            <div className="text-xs text-gray-600">
                              Предпочтения сотрудника: цель {empTarget}/мес, общий тип: {prettyShift(empPref)}, будни: {prettyShift(weekday)}, выходные: {prettyShift(weekend)}, доп. смены: {empWants ? 'да' : 'нет'}.
                            </div>
                            {!included && (
                              <div className="text-xs text-gray-500 mt-1">
                                Не участвует в автозаполнении этого плана.
                              </div>
                            )}
                          </div>
                        </div>

                        {included && cfg && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="w-[120px]">
                              <div className="text-xs text-gray-500 mb-1">Цель смен/мес</div>
                              <Input
                                type="number"
                                min="0"
                                max="31"
                                value={cfg.targetShiftsCount}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  const safe = Number.isFinite(n) ? Math.max(0, Math.min(31, Math.trunc(n))) : 0;
                                  updateEmployeeConfig(emp.id, { targetShiftsCount: safe });
                                }}
                                className="h-8"
                              />
                            </div>

                            <div className="w-[170px]">
                              <div className="text-xs text-gray-500 mb-1">Тип смены</div>
                              <Select
                                value={cfg.preferredShiftType || 'any'}
                                onValueChange={(value: 'day' | 'night' | 'any') => updateEmployeeConfig(emp.id, { preferredShiftType: value })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="any">Любые</SelectItem>
                                  <SelectItem value="day">День</SelectItem>
                                  <SelectItem value="night">Ночь</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="w-[200px]">
                              <div className="text-xs text-gray-500 mb-1">Нагрузка</div>
                              <Select
                                value={cfg.wantsMoreShifts ? 'more' : 'standard'}
                                onValueChange={(value) => updateEmployeeConfig(emp.id, { wantsMoreShifts: value === 'more' })}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="standard">Стандартная</SelectItem>
                                  <SelectItem value="more">Хочу больше смен</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {hasOverride && (
                              <Badge variant="outline">Переопределено в плане</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
