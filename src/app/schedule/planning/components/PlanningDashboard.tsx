"use client";

import { useEffect, useMemo, useState } from 'react';
import { addMonths, format, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToastAction } from '@/components/ui/toast';
import { Plus, Copy, CheckCircle, Calendar, Users, Trash2, Sparkles, Settings } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { DailyRequirement, SchedulePlan, Employee, WashId } from '@/types';
import { DEFAULT_WASH_ID, normalizeWashId } from '@/lib/wash';

interface PlanningDashboardProps {
  initialPlans: SchedulePlan[];
  employees: Employee[];
  initialWashId?: WashId;
}

type CreateRequirementsTemplate = 'empty' | 'from_shifts_prev_month';

interface PatternSuggestResponse {
  ok: true;
  targetMonth: string;
  sourceMonth: string;
  dailyRequirements: DailyRequirement[];
  weekdayPattern: Record<string, { box1Day: number; box1Night: number; box2Day: number; box2Night: number; requiredCount: number }>;
  meta: { shiftsInSourceMonth: number; derivedFrom: 'shifts' | 'defaults' };
}

function getWashLabel(washId: WashId | string): string {
  return normalizeWashId(washId) === 'wash_2' ? 'Мойка 2' : 'Мойка 1';
}

export function PlanningDashboard({ initialPlans, employees, initialWashId }: PlanningDashboardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [plans, setPlans] = useState<SchedulePlan[]>(initialPlans);
  const [selectedWashId, setSelectedWashId] = useState<WashId>(() => normalizeWashId(initialWashId));
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCloneDialogOpen, setIsCloneDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SchedulePlan | null>(null);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanMonth, setNewPlanMonth] = useState('');
  const [cloneTargetMonth, setCloneTargetMonth] = useState('');
  const [createTemplate, setCreateTemplate] = useState<CreateRequirementsTemplate>('from_shifts_prev_month');
  const [patternSuggest, setPatternSuggest] = useState<PatternSuggestResponse | null>(null);
  const [patternSuggestLoading, setPatternSuggestLoading] = useState(false);
  const [patternSourceMonth, setPatternSourceMonth] = useState('');
  const [patternIncludeNights, setPatternIncludeNights] = useState(false);
  const [patternBox2Reserve, setPatternBox2Reserve] = useState(true);
  const [newPlanWashId, setNewPlanWashId] = useState<WashId>(() => normalizeWashId(initialWashId));

  const [autoFillDialogOpen, setAutoFillDialogOpen] = useState(false);
  const [autoFillPlan, setAutoFillPlan] = useState<SchedulePlan | null>(null);
  const [autoFillClearExisting, setAutoFillClearExisting] = useState(false);
  const [autoFillSyncEmployeeConfigs, setAutoFillSyncEmployeeConfigs] = useState(true);
  const [autoFillSubmitting, setAutoFillSubmitting] = useState(false);

  // Filter plans by selected wash, then group by month
  const filteredPlans = plans.filter(p => normalizeWashId(p.washId) === selectedWashId);
  const plansByMonth = filteredPlans.reduce((acc, plan) => {
    if (!acc[plan.month]) {
      acc[plan.month] = [];
    }
    acc[plan.month].push(plan);
    return acc;
  }, {} as Record<string, SchedulePlan[]>);

  const patternPreviewText = useMemo(() => {
    if (!patternSuggest) return '';
    const wp = patternSuggest.weekdayPattern || {};
    const order: Array<[string, string]> = [
      ['mon', 'Пн'],
      ['tue', 'Вт'],
      ['wed', 'Ср'],
      ['thu', 'Чт'],
      ['fri', 'Пт'],
      ['sat', 'Сб'],
      ['sun', 'Вс'],
    ];
    const lines: string[] = [];
    for (const [key, label] of order) {
      const row = (wp as any)[key];
      if (!row) continue;
      const total = Number(row.requiredCount) || 0;
      lines.push(`${label}: ${total} (б1д ${row.box1Day}, б1н ${row.box1Night}, б2д ${row.box2Day}, б2н ${row.box2Night})`);
    }
    return lines.join('\n');
  }, [patternSuggest]);

  async function loadPatternSuggestion(month: string) {
    setPatternSuggestLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('targetMonth', month);
      if (patternSourceMonth) params.set('sourceMonth', patternSourceMonth);
      params.set('includeNights', patternIncludeNights ? 'true' : 'false');
      params.set('box2Reserve', patternBox2Reserve ? 'true' : 'false');
      params.set('washId', newPlanWashId);

      const res = await fetch(`/api/schedule-plans/pattern-suggest?${params.toString()}`);
      if (!res.ok) throw new Error('Не удалось получить шаблон требований');
      const json = (await res.json()) as PatternSuggestResponse;
      if (!json?.ok || !Array.isArray(json.dailyRequirements)) {
        throw new Error('Некорректный ответ шаблона');
      }
      setPatternSuggest(json);
    } catch (error: any) {
      console.error('Pattern suggestion error:', error);
      setPatternSuggest(null);
      toast({
        title: 'Шаблон требований недоступен',
        description: error?.message || 'Не удалось построить шаблон из истории',
        variant: 'destructive',
      });
    } finally {
      setPatternSuggestLoading(false);
    }
  }

  useEffect(() => {
    if (!isCreateDialogOpen) return;
    if (!newPlanMonth) {
      setPatternSourceMonth('');
      return;
    }

    // Default: previous month relative to the plan month.
    const prevMonth = format(subMonths(new Date(`${newPlanMonth}-01T00:00:00`), 1), 'yyyy-MM');
    setPatternSourceMonth(prevMonth);
  }, [isCreateDialogOpen, newPlanMonth]);

  useEffect(() => {
    if (!isCreateDialogOpen) return;

    if (createTemplate === 'empty') {
      setPatternSuggest(null);
      setPatternSuggestLoading(false);
      return;
    }

    if (!newPlanMonth) {
      setPatternSuggest(null);
      return;
    }

    if (!patternSourceMonth) {
      setPatternSuggest(null);
      return;
    }

    loadPatternSuggestion(newPlanMonth);
  }, [isCreateDialogOpen, createTemplate, newPlanMonth, patternSourceMonth, patternIncludeNights, patternBox2Reserve, newPlanWashId]);

  const handleCreatePlan = async () => {
    if (!newPlanName || !newPlanMonth) {
      toast({
        title: 'Заполните все поля',
        description: 'Укажите название и месяц плана',
        variant: 'destructive'
      });
      return;
    }

    const suggestedDailyRequirements = createTemplate === 'from_shifts_prev_month'
      ? patternSuggest?.dailyRequirements
      : undefined;

    const newPlan: SchedulePlan = {
      id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      washId: newPlanWashId,
      name: newPlanName,
      month: newPlanMonth,
      createdAt: new Date().toISOString(),
      createdBy: 'emp_manager_admin', // TODO: Get from session
      isActive: false,
      employeeConfigs: employees.map(emp => ({
        employeeId: emp.id,
        targetShiftsCount: emp.targetShiftsPerMonth || 15,
        preferredShiftType: emp.preferredShiftType || 'any',
        wantsMoreShifts: emp.wantsMoreShifts || false
      })),
      dailyRequirements: Array.isArray(suggestedDailyRequirements) ? suggestedDailyRequirements : []
    };

    try {
      const response = await fetch('/api/schedule-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPlan)
      });

      if (!response.ok) throw new Error('Failed to create plan');

      const { plan } = await response.json();
      setPlans([plan, ...plans]);
      setIsCreateDialogOpen(false);
      setNewPlanName('');
      setNewPlanMonth('');
      setCreateTemplate('from_shifts_prev_month');
      setPatternSuggest(null);
      setPatternSourceMonth('');
      setPatternIncludeNights(false);
      setPatternBox2Reserve(true);
      setNewPlanWashId(selectedWashId);

      toast({
        title: 'План создан',
        description: `План "${plan.name}" План успешно создан`
      });

      router.refresh();
    } catch (error) {
      console.error('Error creating plan:', error);
      toast({
        title: 'Ошибка создания',
        description: 'Не удалось создать план',
        variant: 'destructive'
      });
    }
  };

  const handleClonePlan = async () => {
    if (!selectedPlan || !cloneTargetMonth) {
      toast({
        title: 'Заполните все поля',
        description: 'Выберите месяц для клонирования',
        variant: 'destructive'
      });
      return;
    }

    try {
      const response = await fetch(`/api/schedule-plans/${selectedPlan.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetMonth: cloneTargetMonth })
      });

      if (!response.ok) throw new Error('Failed to clone plan');

      const { plan } = await response.json();
      setPlans([plan, ...plans]);
      setIsCloneDialogOpen(false);
      setSelectedPlan(null);
      setCloneTargetMonth('');

      toast({
        title: 'План склонирован',
        description: `План успешно склонирован на ${format(new Date(cloneTargetMonth + '-01'), 'LLLL yyyy', { locale: ru })}`
      });

      router.refresh();
    } catch (error) {
      console.error('Error cloning plan:', error);
      toast({
        title: 'Ошибка клонирования',
        description: 'Не удалось склонировать план',
        variant: 'destructive'
      });
    }
  };

  const handleActivatePlan = async (plan: SchedulePlan) => {
    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      });

      if (!response.ok) throw new Error('Failed to activate plan');

      const { plan: updatedPlan } = await response.json();

      // Update local state - deactivate other plans in the same month and wash
      setPlans(plans.map(p =>
        p.month === updatedPlan.month && normalizeWashId(p.washId) === normalizeWashId(updatedPlan.washId)
          ? (p.id === updatedPlan.id ? { ...p, isActive: true } : { ...p, isActive: false })
          : p
      ));

      toast({
        title: 'План активирован',
        description: `План "${plan.name}" теперь активен`
      });

      router.refresh();
    } catch (error) {
      console.error('Error activating plan:', error);
      toast({
        title: 'Ошибка активации',
        description: 'Не удалось активировать план',
        variant: 'destructive'
      });
    }
  };

  const handleDeletePlan = async (plan: SchedulePlan) => {
    if (!confirm(`Удалить план "${plan.name}"?`)) return;

    try {
      const response = await fetch(`/api/schedule-plans/${plan.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete plan');

      setPlans(plans.filter(p => p.id !== plan.id));

      toast({
        title: 'План удалён',
        description: `План "${plan.name}" План успешно удалён`
      });

      router.refresh();
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast({
        title: 'Ошибка удаления',
        description: 'Не удалось удалить план',
        variant: 'destructive'
      });
    }
  };

  const handleAutoFill = async (plan: SchedulePlan) => {
    setAutoFillPlan(plan);
    setAutoFillClearExisting(false);
    setAutoFillSyncEmployeeConfigs(true);
    setAutoFillDialogOpen(true);
  };

  const submitAutoFill = async () => {
    if (!autoFillPlan) return;

    setAutoFillSubmitting(true);

    try {
      const planMonth = autoFillPlan.month;
      const planWashId = normalizeWashId(autoFillPlan.washId);
      const openScheduleUrl = `/schedule?month=${encodeURIComponent(planMonth)}&washId=${encodeURIComponent(planWashId)}`;

      const response = await fetch(`/api/schedule-plans/${autoFillPlan.id}/auto-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearExisting: autoFillClearExisting, syncEmployeeConfigs: autoFillSyncEmployeeConfigs })
      });

      if (!response.ok) throw new Error('Failed to auto-fill shifts');

      const { shiftsCreated, shiftsUpdated } = await response.json();

      toast({
        title: 'Автозаполнение выполнено',
        description: `Месяц: ${planMonth}. Создано смен: ${shiftsCreated}, обновлено: ${shiftsUpdated}.`,
        action: (
          <ToastAction altText="Открыть график смен" onClick={() => router.push(openScheduleUrl)}>
            Открыть график
          </ToastAction>
        ),
      });

      setAutoFillDialogOpen(false);
      setAutoFillPlan(null);
      setAutoFillClearExisting(false);
      router.refresh();
    } catch (error) {
      console.error('Error auto-filling shifts:', error);
      toast({
        title: 'Ошибка автозаполнения',
        description: 'Не удалось автоматически создать смены',
        variant: 'destructive'
      });
    } finally {
      setAutoFillSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Wash filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-600">Мойка:</span>
        <Button
          variant={selectedWashId === 'wash_1' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedWashId('wash_1')}
        >
          Мойка 1
        </Button>
        <Button
          variant={selectedWashId === 'wash_2' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedWashId('wash_2')}
        >
          Мойка 2
        </Button>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={() => {
          const next = addMonths(new Date(), 1);
          const nextMonthKey = format(next, 'yyyy-MM');
          const nextMonthLabel = format(next, 'LLLL yyyy', { locale: ru });
          setNewPlanMonth(nextMonthKey);
          setNewPlanName(`График ${nextMonthLabel}`);
          setNewPlanWashId(selectedWashId);
          setIsCreateDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Создать план ({getWashLabel(selectedWashId)})
        </Button>
      </div>

      {/* Plans grouped by month */}
      <div className="space-y-6">
        {Object.keys(plansByMonth).sort().reverse().map(month => (
          <div key={month}>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {format(new Date(month + '-01'), 'LLLL yyyy', { locale: ru })}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plansByMonth[month].map(plan => (
                <Card key={plan.id} className={plan.isActive ? 'border-green-500 border-2' : ''}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{plan.name}</CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {format(new Date(plan.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                        </CardDescription>
                      </div>
                      {plan.isActive && (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Активен
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        <span>{plan.employeeConfigs.length} сотр.</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{plan.dailyRequirements?.filter(d => (d.requiredCount ?? 0) > 0).length || 0} дн. настроено</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {getWashLabel(plan.washId)}
                    </Badge>

                    {plan.clonedFrom && (
                      <Badge variant="outline" className="text-xs">
                        <Copy className="h-3 w-3 mr-1" />
                        Клонирован
                      </Badge>
                    )}

                    <div className="space-y-2 pt-2">
                      <div className="flex gap-2">
                        {!plan.isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleActivatePlan(plan)}
                            className="flex-1"
                          >
                            Активировать
                          </Button>
                        )}

                        <Link href={`/schedule/planning/${plan.id}`} className="flex-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Настроить
                          </Button>
                        </Link>
                      </div>

                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleAutoFill(plan)}
                        className="w-full bg-purple-600 hover:bg-purple-700"
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        Автозаполнить
                      </Button>

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedPlan(plan);
                            setIsCloneDialogOpen(true);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeletePlan(plan)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(plansByMonth).length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-500">Нет созданных планов</p>
              <p className="text-sm text-gray-400 mt-1">Создайте первый план для начала работы</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Plan Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        setIsCreateDialogOpen(open);
        if (!open) {
          setNewPlanName('');
          setNewPlanMonth('');
          setNewPlanWashId(selectedWashId);
          setCreateTemplate('from_shifts_prev_month');
          setPatternSuggest(null);
          setPatternSourceMonth('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать новый план</DialogTitle>
            <DialogDescription>
              Создайте план распределения смен на месяц
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Название плана</label>
              <Input
                placeholder="План на декабрь 2025"
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Месяц</label>
              <Input
                type="month"
                value={newPlanMonth}
                onChange={(e) => setNewPlanMonth(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Мойка</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={newPlanWashId === 'wash_1' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setNewPlanWashId('wash_1')}
                >
                  Мойка 1
                </Button>
                <Button
                  type="button"
                  variant={newPlanWashId === 'wash_2' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setNewPlanWashId('wash_2')}
                >
                  Мойка 2
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Требования по дням (шаблон)</label>
              <Select value={createTemplate} onValueChange={(v: CreateRequirementsTemplate) => setCreateTemplate(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="from_shifts_prev_month">Из прошлого месяца (по факту смен)</SelectItem>
                  <SelectItem value="empty">Пустой (всё 0)</SelectItem>
                </SelectContent>
              </Select>
              {createTemplate === 'from_shifts_prev_month' && (
                <div className="space-y-2 rounded-md border p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Источник шаблона (месяц)</label>
                      <Input
                        type="month"
                        value={patternSourceMonth}
                        onChange={(e) => setPatternSourceMonth(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="patternIncludeNights"
                          checked={patternIncludeNights}
                          onCheckedChange={(v) => setPatternIncludeNights(Boolean(v))}
                        />
                        <Label htmlFor="patternIncludeNights" className="text-sm">
                          Учитывать ночные
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="patternBox2Reserve"
                          checked={patternBox2Reserve}
                          onCheckedChange={(v) => setPatternBox2Reserve(Boolean(v))}
                        />
                        <Label htmlFor="patternBox2Reserve" className="text-sm">
                          Бокс 2 резервный
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 whitespace-pre-wrap">
                    {patternSuggestLoading
                      ? 'Строим шаблон...'
                      : patternSuggest
                        ? [
                          `Источник: ${patternSuggest.sourceMonth} (${patternSuggest.meta.derivedFrom === 'shifts' ? `смен: ${patternSuggest.meta.shiftsInSourceMonth}` : 'нет истории, дефолт'})`,
                          patternPreviewText ? `\n${patternPreviewText}` : '',
                        ].join('')
                        : 'Шаблон не загружен.'}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCreatePlan} disabled={createTemplate === 'from_shifts_prev_month' && patternSuggestLoading}>
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Plan Dialog */}
      <Dialog open={isCloneDialogOpen} onOpenChange={setIsCloneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Клонировать план</DialogTitle>
            <DialogDescription>
              Создайте копию плана "{selectedPlan?.name}" на другой месяц
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Целевой месяц</label>
              <Input
                type="month"
                value={cloneTargetMonth}
                onChange={(e) => setCloneTargetMonth(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCloneDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleClonePlan}>Клонировать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Fill Dialog */}
      <Dialog open={autoFillDialogOpen} onOpenChange={setAutoFillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Автозаполнение смен</DialogTitle>
            <DialogDescription>
              {autoFillPlan
                ? `План: "${autoFillPlan.name}" (${format(new Date(autoFillPlan.month + '-01'), 'LLLL yyyy', { locale: ru })})`
                : 'Выберите план для автозаполнения.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="text-sm text-gray-600">
              По умолчанию автозаполнение:
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>создаёт отсутствующие смены,</li>
                <li>может добавлять сотрудников в уже существующие смены (если в слоте не хватает людей),</li>
                <li>не удаляет лишние смены автоматически.</li>
              </ul>
            </div>

            <div className={`rounded-md border p-3 ${autoFillClearExisting ? 'border-red-300 bg-red-50' : ''}`}>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="autoFillClearExisting"
                  checked={autoFillClearExisting}
                  onCheckedChange={(v) => setAutoFillClearExisting(Boolean(v))}
                />
                <div className="space-y-1">
                  <Label htmlFor="autoFillClearExisting" className="text-sm font-medium">
                    Удалить существующие смены этого месяца и создать заново
                  </Label>
                  <div className="text-xs text-gray-600">
                    Опция опасная: удалит все смены за выбранный месяц только для {autoFillPlan ? getWashLabel(autoFillPlan.washId) : 'Мойка 1'} в <code>data/shifts</code>.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="autoFillSyncEmployeeConfigs"
                  checked={autoFillSyncEmployeeConfigs}
                  onCheckedChange={(v) => setAutoFillSyncEmployeeConfigs(Boolean(v))}
                />
                <div className="space-y-1">
                  <Label htmlFor="autoFillSyncEmployeeConfigs" className="text-sm font-medium">
                    Перед заполнением подтянуть настройки сотрудников из их предпочтений
                  </Label>
                  <div className="text-xs text-gray-600">
                    Обновит в плане значения: цель смен/мес, предпочитаемый тип, «хочу больше смен», и применит их к автозаполнению.
                    Полезно, если сотрудники поменяли предпочтения после создания плана.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAutoFillDialogOpen(false);
                setAutoFillPlan(null);
                setAutoFillClearExisting(false);
              }}
              disabled={autoFillSubmitting}
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (autoFillClearExisting) {
                  if (!confirm('ВНИМАНИЕ: Все существующие смены за этот месяц будут удалены и созданы заново. Продолжить?')) return;
                }
                submitAutoFill();
              }}
              disabled={!autoFillPlan || autoFillSubmitting}
              className={autoFillClearExisting ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {autoFillSubmitting ? 'Заполняем...' : autoFillClearExisting ? 'Удалить и заполнить' : 'Заполнить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
