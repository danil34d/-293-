"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sun, Moon, MinusCircle, Clock, Calendar, MessageSquare,
  ChevronDown, ChevronUp, Loader2, Save, X, Settings2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { Employee } from '@/types';

interface EmployeePreferencesManagerProps {
  employees: Employee[];
}

const shiftTypeLabel = (t?: string) => {
  if (t === 'day') return 'День';
  if (t === 'night') return 'Ночь';
  return 'Любая';
};

const shiftTypeIcon = (t?: string) => {
  if (t === 'day') return <Sun className="h-3 w-3 text-amber-500" />;
  if (t === 'night') return <Moon className="h-3 w-3 text-indigo-500" />;
  return <MinusCircle className="h-3 w-3 text-gray-400" />;
};

const loadLabel = (l?: string) => {
  if (l === 'less') return 'Мало';
  if (l === 'more') return 'Много';
  return 'Стандарт';
};

const loadColor = (l?: string) => {
  if (l === 'less') return 'text-blue-600 bg-blue-50';
  if (l === 'more') return 'text-green-600 bg-green-50';
  return 'text-gray-600 bg-gray-50';
};

const availLabel = (a?: string) => {
  if (a === 'weekdays_only') return 'Будни';
  if (a === 'weekends_only') return 'Вых.';
  return 'Все';
};

export function EmployeePreferencesManager({ employees }: EmployeePreferencesManagerProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  // Override form state
  const [overrideForm, setOverrideForm] = useState<{
    preferredShiftType?: string;
    weekdayPreferredShiftType?: string;
    weekendPreferredShiftType?: string;
    targetShiftsPerMonth?: number;
    shiftLoadPreference?: string;
    availableDays?: string;
    canWork24hShifts?: boolean;
    note?: string;
  }>({});

  const handleExpand = (emp: Employee) => {
    if (expandedId === emp.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(emp.id);
    // Pre-fill form with existing overrides or employee preferences
    const o = emp.managerOverrides || {};
    setOverrideForm({
      preferredShiftType: o.preferredShiftType || emp.preferredShiftType || 'any',
      weekdayPreferredShiftType: o.weekdayPreferredShiftType || emp.weekdayPreferredShiftType || '',
      weekendPreferredShiftType: o.weekendPreferredShiftType || emp.weekendPreferredShiftType || '',
      targetShiftsPerMonth: o.targetShiftsPerMonth || emp.targetShiftsPerMonth || 15,
      shiftLoadPreference: o.shiftLoadPreference || emp.shiftLoadPreference || 'standard',
      availableDays: o.availableDays || emp.availableDays || 'all',
      canWork24hShifts: o.canWork24hShifts ?? emp.canWork24hShifts ?? false,
      note: o.note || '',
    });
  };

  const handleSaveOverride = async (empId: string) => {
    setSaving(empId);
    try {
      const body: any = {};
      if (overrideForm.preferredShiftType) body.preferredShiftType = overrideForm.preferredShiftType;
      if (overrideForm.weekdayPreferredShiftType) body.weekdayPreferredShiftType = overrideForm.weekdayPreferredShiftType;
      if (overrideForm.weekendPreferredShiftType) body.weekendPreferredShiftType = overrideForm.weekendPreferredShiftType;
      if (overrideForm.targetShiftsPerMonth != null && overrideForm.targetShiftsPerMonth !== '') body.targetShiftsPerMonth = overrideForm.targetShiftsPerMonth;
      if (overrideForm.shiftLoadPreference) body.shiftLoadPreference = overrideForm.shiftLoadPreference;
      if (overrideForm.availableDays) body.availableDays = overrideForm.availableDays;
      if (overrideForm.canWork24hShifts !== undefined) body.canWork24hShifts = overrideForm.canWork24hShifts;
      if (overrideForm.note !== undefined) body.note = overrideForm.note;

      const res = await fetch(`/api/employees/${empId}/override-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Переопределения сохранены' });
      router.refresh();
    } catch {
      toast({ title: 'Ошибка сохранения', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const handleClearOverrides = async (empId: string) => {
    setSaving(empId);
    try {
      const res = await fetch(`/api/employees/${empId}/override-preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearOverrides: true }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Переопределения сброшены' });
      setExpandedId(null);
      router.refresh();
    } catch {
      toast({ title: 'Ошибка', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Предпочтения сотрудников
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Просматривайте пожелания сотрудников и при необходимости переопределяйте их.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2 font-medium border-b">Сотрудник</th>
              <th className="px-3 py-2 font-medium border-b text-center">Дни</th>
              <th className="px-3 py-2 font-medium border-b text-center">Тип смены</th>
              <th className="px-3 py-2 font-medium border-b text-center">Будни</th>
              <th className="px-3 py-2 font-medium border-b text-center">Вых.</th>
              <th className="px-3 py-2 font-medium border-b text-center">24ч</th>
              <th className="px-3 py-2 font-medium border-b text-center">Цель</th>
              <th className="px-3 py-2 font-medium border-b text-center">Нагрузка</th>
              <th className="px-3 py-2 font-medium border-b">Комментарий</th>
              <th className="px-3 py-2 font-medium border-b w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const hasOverrides = !!emp.managerOverrides && Object.keys(emp.managerOverrides).filter(k => k !== 'updatedAt').length > 0;
              const isExpanded = expandedId === emp.id;

              return (
                <tr key={emp.id} className="border-b hover:bg-gray-50/50">
                  {/* Summary row */}
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800">{emp.fullName}</div>
                    {hasOverrides && (
                      <Badge variant="outline" className="text-[10px] mt-0.5 text-orange-600 border-orange-300 bg-orange-50">
                        Переопределено
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100">
                      {availLabel(emp.managerOverrides?.availableDays || emp.availableDays)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex items-center gap-1 text-xs">
                      {shiftTypeIcon(emp.managerOverrides?.preferredShiftType || emp.preferredShiftType)}
                      {shiftTypeLabel(emp.managerOverrides?.preferredShiftType || emp.preferredShiftType)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {emp.weekdayPreferredShiftType ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        {shiftTypeIcon(emp.weekdayPreferredShiftType)}
                        {shiftTypeLabel(emp.weekdayPreferredShiftType)}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {emp.weekendPreferredShiftType ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        {shiftTypeIcon(emp.weekendPreferredShiftType)}
                        {shiftTypeLabel(emp.weekendPreferredShiftType)}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(emp.managerOverrides?.canWork24hShifts ?? emp.canWork24hShifts) ? (
                      <Clock className="h-4 w-4 text-orange-500 mx-auto" />
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center font-medium">
                    {emp.managerOverrides?.targetShiftsPerMonth || emp.targetShiftsPerMonth || 15}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${loadColor(emp.managerOverrides?.shiftLoadPreference || emp.shiftLoadPreference)}`}>
                      {loadLabel(emp.managerOverrides?.shiftLoadPreference || emp.shiftLoadPreference)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {emp.scheduleNote ? (
                      <span className="text-xs text-gray-600 italic truncate block max-w-[200px]" title={emp.scheduleNote}>
                        {emp.scheduleNote}
                      </span>
                    ) : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => handleExpand(emp)}
                      className="p-1 rounded hover:bg-gray-200 transition-colors"
                      title="Переопределить предпочтения"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Override panel */}
      {expandedId && (() => {
        const emp = employees.find(e => e.id === expandedId);
        if (!emp) return null;
        const isSaving = saving === emp.id;

        return (
          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Переопределение: {emp.fullName}</span>
                <div className="flex gap-2">
                  {emp.managerOverrides && Object.keys(emp.managerOverrides).filter(k => k !== 'updatedAt').length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => handleClearOverrides(emp.id)} disabled={isSaving}>
                      <X className="h-3 w-3 mr-1" /> Сбросить
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleSaveOverride(emp.id)} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                    Сохранить
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Показать что сотрудник выбрал */}
              {emp.scheduleNote && (
                <div className="mb-4 text-sm bg-blue-50 text-blue-800 rounded px-3 py-2 border border-blue-200">
                  <MessageSquare className="h-3 w-3 inline mr-1" />
                  <strong>Сотрудник написал:</strong> «{emp.scheduleNote}»
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Тип смены */}
                <div className="space-y-1">
                  <Label className="text-xs">Тип смены</Label>
                  <Select
                    value={overrideForm.preferredShiftType || 'any'}
                    onValueChange={v => setOverrideForm(f => ({ ...f, preferredShiftType: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">День</SelectItem>
                      <SelectItem value="night">Ночь</SelectItem>
                      <SelectItem value="any">Любая</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Доступность */}
                <div className="space-y-1">
                  <Label className="text-xs">Доступность</Label>
                  <Select
                    value={overrideForm.availableDays || 'all'}
                    onValueChange={v => setOverrideForm(f => ({ ...f, availableDays: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все дни</SelectItem>
                      <SelectItem value="weekdays_only">Только будни</SelectItem>
                      <SelectItem value="weekends_only">Только вых.</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Будни */}
                <div className="space-y-1">
                  <Label className="text-xs">Будни</Label>
                  <Select
                    value={overrideForm.weekdayPreferredShiftType || ''}
                    onValueChange={v => setOverrideForm(f => ({ ...f, weekdayPreferredShiftType: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Общий" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Общий</SelectItem>
                      <SelectItem value="day">День</SelectItem>
                      <SelectItem value="night">Ночь</SelectItem>
                      <SelectItem value="any">Любая</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Выходные */}
                <div className="space-y-1">
                  <Label className="text-xs">Выходные</Label>
                  <Select
                    value={overrideForm.weekendPreferredShiftType || ''}
                    onValueChange={v => setOverrideForm(f => ({ ...f, weekendPreferredShiftType: v === 'none' ? '' : v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Общий" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Общий</SelectItem>
                      <SelectItem value="day">День</SelectItem>
                      <SelectItem value="night">Ночь</SelectItem>
                      <SelectItem value="any">Любая</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Целевые смены */}
                <div className="space-y-1">
                  <Label className="text-xs">Целевые смены/мес.</Label>
                  <Input
                    type="number" min="1" max="31" className="h-8 text-xs"
                    value={overrideForm.targetShiftsPerMonth || 15}
                    onChange={e => setOverrideForm(f => ({ ...f, targetShiftsPerMonth: Number(e.target.value) }))}
                  />
                </div>

                {/* Нагрузка */}
                <div className="space-y-1">
                  <Label className="text-xs">Нагрузка</Label>
                  <Select
                    value={overrideForm.shiftLoadPreference || 'standard'}
                    onValueChange={v => setOverrideForm(f => ({ ...f, shiftLoadPreference: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="less">Меньше</SelectItem>
                      <SelectItem value="standard">Стандарт</SelectItem>
                      <SelectItem value="more">Больше</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 24ч */}
                <div className="space-y-1 flex items-end gap-2 pb-1">
                  <Checkbox
                    id={`24h-${emp.id}`}
                    checked={overrideForm.canWork24hShifts || false}
                    onCheckedChange={c => setOverrideForm(f => ({ ...f, canWork24hShifts: c === true }))}
                  />
                  <Label htmlFor={`24h-${emp.id}`} className="text-xs cursor-pointer">Сутки (24ч)</Label>
                </div>
              </div>

              {/* Комментарий менеджера */}
              <div className="mt-3 space-y-1">
                <Label className="text-xs">Комментарий менеджера</Label>
                <Input
                  className="h-8 text-xs"
                  value={overrideForm.note || ''}
                  onChange={e => setOverrideForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Причина переопределения..."
                  maxLength={300}
                />
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
