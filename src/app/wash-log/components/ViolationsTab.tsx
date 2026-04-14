"use client";

import { useState, useMemo, useCallback } from 'react';
import type { Employee, Violation, ViolationType } from '@/types';
import { VIOLATION_TYPE_LABELS } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { isManagerOrAbove } from '@/lib/employee-role';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertTriangle, Plus, DollarSign, FileWarning } from 'lucide-react';

interface ViolationsTabProps {
  initialViolations: Violation[];
  employees: Employee[];
}

const VIOLATION_TYPES: ViolationType[] = [
  'lateness', 'early_leave', 'no_show', 'equipment_damage',
  'client_complaint', 'quality_issue', 'safety_violation', 'other',
];

export function ViolationsTab({ initialViolations, employees }: ViolationsTabProps) {
  const { employee: currentUser } = useAuth();
  const { toast } = useToast();
  const isManager = isManagerOrAbove(currentUser);

  const [violations, setViolations] = useState<Violation[]>(initialViolations);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // New violation form
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formType, setFormType] = useState<ViolationType>('lateness');
  const [formDescription, setFormDescription] = useState('');
  const [formPenalty, setFormPenalty] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach(e => map.set(e.id, e.fullName));
    return map;
  }, [employees]);

  const filteredViolations = useMemo(() => {
    return violations.filter(v => {
      if (!v.date?.startsWith(selectedMonth)) return false;
      if (filterEmployee !== 'all' && v.employeeId !== filterEmployee) return false;
      if (filterType !== 'all' && v.type !== filterType) return false;
      return true;
    });
  }, [violations, selectedMonth, filterEmployee, filterType]);

  const summary = useMemo(() => {
    let totalPenalty = 0;
    filteredViolations.forEach(v => {
      totalPenalty += v.penaltyAmount || 0;
    });
    return { total: filteredViolations.length, totalPenalty };
  }, [filteredViolations]);

  const handleCreate = useCallback(async () => {
    if (!formEmployeeId) {
      toast({ title: "Ошибка", description: "Выберите сотрудника", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/violations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: formEmployeeId,
          type: formType,
          description: formDescription,
          penaltyAmount: formPenalty ? Number(formPenalty) : undefined,
          date: formDate,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Ошибка создания');
      }

      const data = await res.json();
      setViolations(prev => [data.violation, ...prev]);
      setIsDialogOpen(false);
      setFormDescription('');
      setFormPenalty('');
      toast({ title: "Нарушение зафиксировано" });
    } catch (error: any) {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [formEmployeeId, formType, formDescription, formPenalty, formDate, toast]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
  };

  const getTypeBadgeVariant = (type: ViolationType) => {
    switch (type) {
      case 'no_show':
      case 'safety_violation':
        return 'destructive' as const;
      case 'equipment_damage':
      case 'client_complaint':
        return 'default' as const;
      default:
        return 'secondary' as const;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">Месяц:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <Select value={filterEmployee} onValueChange={setFilterEmployee}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Все сотрудники" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все сотрудники</SelectItem>
              {employees.map(e => (
                <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {VIOLATION_TYPES.map(t => (
                <SelectItem key={t} value={t}>{VIOLATION_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isManager && (
          <Button onClick={() => setIsDialogOpen(true)} className="ml-auto">
            <Plus className="h-4 w-4 mr-2" />
            Добавить нарушение
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <FileWarning className="h-4 w-4" />
            Нарушений за период
          </div>
          <div className="text-2xl font-bold">{summary.total}</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <DollarSign className="h-4 w-4" />
            Сумма штрафов
          </div>
          <div className="text-2xl font-bold">{summary.totalPenalty.toLocaleString('ru-RU')} ₽</div>
        </div>
      </div>

      {/* Table */}
      {filteredViolations.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-500">
          Нет нарушений за выбранный период
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-600">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Сотрудник</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Тип</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Описание</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Штраф</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Статус</th>
              </tr>
            </thead>
            <tbody>
              {filteredViolations.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">{formatDate(v.date)}</td>
                  <td className="px-4 py-3 font-medium">{employeeMap.get(v.employeeId) || v.employeeId.slice(0, 8)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={getTypeBadgeVariant(v.type)}>
                      {VIOLATION_TYPE_LABELS[v.type] || v.type}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-[300px] truncate">{v.description || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {v.penaltyAmount ? `${v.penaltyAmount.toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {v.resolved ? (
                      <Badge variant="outline" className="text-green-600 border-green-300">Закрыто</Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600 border-orange-300">Открыто</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create violation dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Зафиксировать нарушение
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Сотрудник</Label>
              <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите сотрудника" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Тип нарушения</Label>
              <Select value={formType} onValueChange={(v) => setFormType(v as ViolationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIOLATION_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{VIOLATION_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Дата</Label>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div>
              <Label>Описание</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Описание нарушения..."
              />
            </div>
            <div>
              <Label>Штраф (₽)</Label>
              <Input
                type="number"
                value={formPenalty}
                onChange={(e) => setFormPenalty(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? 'Сохранение...' : 'Зафиксировать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
