"use client";

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Sun, Moon, MinusCircle, Loader2, Clock, Calendar, MessageSquare, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Employee } from '@/types';

interface EmployeePreferencesProps {
  employee: Employee;
  onUpdate: (updated: Employee) => void;
}

export function EmployeePreferences({ employee, onUpdate }: EmployeePreferencesProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [preferredShiftType, setPreferredShiftType] = useState<'day' | 'night' | 'any'>(
    employee.preferredShiftType || 'any'
  );
  const [weekdayPreferredShiftType, setWeekdayPreferredShiftType] = useState<'inherit' | 'day' | 'night' | 'any'>(
    employee.weekdayPreferredShiftType || 'inherit'
  );
  const [weekendPreferredShiftType, setWeekendPreferredShiftType] = useState<'inherit' | 'day' | 'night' | 'any'>(
    employee.weekendPreferredShiftType || 'inherit'
  );
  const [targetShiftsPerMonth, setTargetShiftsPerMonth] = useState<number>(
    employee.targetShiftsPerMonth || 15
  );
  const [shiftLoadPreference, setShiftLoadPreference] = useState<'less' | 'standard' | 'more'>(
    employee.shiftLoadPreference || (employee.wantsMoreShifts ? 'more' : 'standard')
  );
  const [availableDays, setAvailableDays] = useState<'all' | 'weekdays_only' | 'weekends_only'>(
    employee.availableDays || 'all'
  );
  const [canWork24hShifts, setCanWork24hShifts] = useState<boolean>(
    employee.canWork24hShifts || false
  );
  const [scheduleNote, setScheduleNote] = useState<string>(
    employee.scheduleNote || ''
  );

  const hasManagerOverrides = !!employee.managerOverrides && Object.keys(employee.managerOverrides).length > 0;

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const response = await fetch('/api/employee/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preferredShiftType,
          weekdayPreferredShiftType: weekdayPreferredShiftType === 'inherit' ? null : weekdayPreferredShiftType,
          weekendPreferredShiftType: weekendPreferredShiftType === 'inherit' ? null : weekendPreferredShiftType,
          targetShiftsPerMonth,
          shiftLoadPreference,
          availableDays,
          canWork24hShifts,
          scheduleNote: scheduleNote.trim() || null,
          // backward compat
          wantsMoreShifts: shiftLoadPreference === 'more'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      const { employee: updatedEmployee } = await response.json();
      onUpdate(updatedEmployee);

      toast({
        title: 'Предпочтения сохранены',
        description: 'Ваши настройки успешно обновлены'
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: 'Ошибка сохранения',
        description: 'Не удалось сохранить предпочтения',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Описание текущего сценария для краткой сводки
  const getScenarioDescription = (): string => {
    const parts: string[] = [];

    if (availableDays === 'weekdays_only') parts.push('Только будни');
    else if (availableDays === 'weekends_only') parts.push('Только выходные');
    else parts.push('Все дни');

    const effectiveWeekday = weekdayPreferredShiftType === 'inherit' ? preferredShiftType : weekdayPreferredShiftType;
    const effectiveWeekend = weekendPreferredShiftType === 'inherit' ? preferredShiftType : weekendPreferredShiftType;

    if (effectiveWeekday === effectiveWeekend) {
      if (effectiveWeekday === 'day') parts.push('днём');
      else if (effectiveWeekday === 'night') parts.push('ночью');
      else parts.push('любые смены');
    } else {
      const weekdayLabel = effectiveWeekday === 'day' ? 'день' : effectiveWeekday === 'night' ? 'ночь' : 'любые';
      const weekendLabel = effectiveWeekend === 'day' ? 'день' : effectiveWeekend === 'night' ? 'ночь' : 'любые';
      parts.push(`будни: ${weekdayLabel}, выходные: ${weekendLabel}`);
    }

    if (canWork24hShifts) parts.push('готов сутками');

    const loadLabel = shiftLoadPreference === 'less' ? 'мало смен' : shiftLoadPreference === 'more' ? 'много смен' : 'стандарт';
    parts.push(loadLabel);

    return parts.join(' · ');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Мои предпочтения</CardTitle>
        <CardDescription>
          Настройте свои предпочтения для автоматического распределения смен
        </CardDescription>
        {/* Краткая сводка текущего сценария */}
        <div className="mt-2 text-sm bg-blue-50 text-blue-800 rounded-lg px-3 py-2 border border-blue-200">
          <strong>Текущий сценарий:</strong> {getScenarioDescription()}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Менеджерские переопределения — предупреждение */}
        {hasManagerOverrides && (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-lg px-3 py-2 border border-amber-200 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>Менеджер скорректировал ваши предпочтения.</strong>
              {employee.managerOverrides?.note && (
                <div className="mt-1 text-xs italic">«{employee.managerOverrides.note}»</div>
              )}
              <div className="mt-1 text-xs text-amber-600">
                Ваши настройки ниже будут учтены, но переопределения менеджера имеют приоритет.
              </div>
            </div>
          </div>
        )}

        {/* === Доступность по дням === */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-gray-500" />
            Доступность по дням
          </Label>
          <Select
            value={availableDays}
            onValueChange={(value: 'all' | 'weekdays_only' | 'weekends_only') => setAvailableDays(value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все дни (будни и выходные)</SelectItem>
              <SelectItem value="weekdays_only">Только будни (Пн-Пт)</SelectItem>
              <SelectItem value="weekends_only">Только выходные (Сб-Вс)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            Укажите, в какие дни вы готовы работать
          </p>
        </div>

        {/* === Общий предпочитаемый тип смены === */}
        <div className="space-y-2">
          <Label htmlFor="preferredShiftType">Предпочитаемый тип смены</Label>
          <Select
            value={preferredShiftType}
            onValueChange={(value: 'day' | 'night' | 'any') => setPreferredShiftType(value)}
          >
            <SelectTrigger id="preferredShiftType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4 text-amber-500" />
                  <span>Дневные смены (08:00-20:00)</span>
                </div>
              </SelectItem>
              <SelectItem value="night">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-indigo-500" />
                  <span>Ночные смены (20:00-08:00)</span>
                </div>
              </SelectItem>
              <SelectItem value="any">
                <div className="flex items-center gap-2">
                  <MinusCircle className="h-4 w-4 text-gray-500" />
                  <span>Без разницы</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* === Предпочтения по дням недели (будни/выходные) === */}
        <div className="space-y-3 rounded-md border p-3">
          <div className="text-sm font-medium">Детальные предпочтения по дням</div>
          <div className="text-xs text-gray-500">
            Можно задать разный тип смены для будней и выходных. Если не выбрано — используется общий тип выше.
          </div>

          {availableDays !== 'weekends_only' && (
            <div className="space-y-2">
              <Label htmlFor="weekdayPreferredShiftType">Будни (Пн-Пт)</Label>
              <Select
                value={weekdayPreferredShiftType}
                onValueChange={(value: 'inherit' | 'day' | 'night' | 'any') => setWeekdayPreferredShiftType(value)}
              >
                <SelectTrigger id="weekdayPreferredShiftType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Использовать общий</SelectItem>
                  <SelectItem value="day">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-amber-500" />
                      <span>День</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="night">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4 text-indigo-500" />
                      <span>Ночь</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="any">
                    <div className="flex items-center gap-2">
                      <MinusCircle className="h-4 w-4 text-gray-500" />
                      <span>Любые</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {availableDays !== 'weekdays_only' && (
            <div className="space-y-2">
              <Label htmlFor="weekendPreferredShiftType">Выходные (Сб-Вс)</Label>
              <Select
                value={weekendPreferredShiftType}
                onValueChange={(value: 'inherit' | 'day' | 'night' | 'any') => setWeekendPreferredShiftType(value)}
              >
                <SelectTrigger id="weekendPreferredShiftType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Использовать общий</SelectItem>
                  <SelectItem value="day">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-amber-500" />
                      <span>День</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="night">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4 text-indigo-500" />
                      <span>Ночь</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="any">
                    <div className="flex items-center gap-2">
                      <MinusCircle className="h-4 w-4 text-gray-500" />
                      <span>Любые</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* === Суточные смены === */}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="canWork24hShifts"
            checked={canWork24hShifts}
            onCheckedChange={(checked) => setCanWork24hShifts(checked === true)}
            className="mt-0.5"
          />
          <div>
            <Label htmlFor="canWork24hShifts" className="flex items-center gap-1.5 cursor-pointer">
              <Clock className="h-4 w-4 text-orange-500" />
              Готов работать сутками (24ч)
            </Label>
            <p className="text-xs text-gray-500 mt-1">
              Если отмечено, система может назначить вам дневную + ночную смену в один день
            </p>
          </div>
        </div>

        {/* === Количество смен в месяц === */}
        <div className="space-y-2">
          <Label htmlFor="targetShiftsPerMonth">Желаемое количество смен в месяц</Label>
          <Input
            id="targetShiftsPerMonth"
            type="number"
            min="1"
            max="31"
            value={targetShiftsPerMonth}
            onChange={(e) => setTargetShiftsPerMonth(Number(e.target.value))}
          />
          <p className="text-xs text-gray-500">
            Система будет стремиться назначить вам примерно это количество смен
          </p>
        </div>

        {/* === Нагрузка === */}
        <div className="space-y-2">
          <Label htmlFor="shiftLoadPreference">Желаемая нагрузка</Label>
          <Select
            value={shiftLoadPreference}
            onValueChange={(value: 'less' | 'standard' | 'more') => setShiftLoadPreference(value)}
          >
            <SelectTrigger id="shiftLoadPreference">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="less">Хочу меньше смен</SelectItem>
              <SelectItem value="standard">Стандартная нагрузка</SelectItem>
              <SelectItem value="more">Хочу больше смен</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500">
            {shiftLoadPreference === 'less'
              ? 'Система будет назначать вам меньше смен, чем указано выше'
              : shiftLoadPreference === 'more'
              ? 'Система будет стараться назначить больше смен при наличии свободных слотов'
              : 'Система будет стремиться к указанному количеству смен'}
          </p>
        </div>

        {/* === Комментарий === */}
        <div className="space-y-2">
          <Label htmlFor="scheduleNote" className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-gray-500" />
            Комментарий к расписанию
          </Label>
          <Input
            id="scheduleNote"
            type="text"
            value={scheduleNote}
            onChange={(e) => setScheduleNote(e.target.value)}
            placeholder="Например: не могу по средам, предпочитаю бокс 1..."
            maxLength={200}
          />
          <p className="text-xs text-gray-500">
            Свободный текст, который увидит менеджер при составлении расписания
          </p>
        </div>

        <Button onClick={handleSave} disabled={isSaving} className="w-full">
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Сохранить предпочтения
        </Button>
      </CardContent>
    </Card>
  );
}
