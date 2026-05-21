'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Package, Users, Wallet, Award, Gift, MinusCircle, ChevronDown, ChevronUp,
  Plus, AlertTriangle, Droplets, TrendingUp, TrendingDown, CheckCircle2, Loader2,
} from 'lucide-react';
import type {
  Employee, EmployeeChemicalCanister, EmployeeTransaction, WashEvent, CanisterMode,
} from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

/**
 * Phase 52b / V2-NEW-1: Секция «Канистры у сотрудников» на /inventory.
 *
 * - Список активных канистр (status='active') с inline-expand
 * - Per-employee: бэйдж режима (purchase/bonus/gift/salary-deduction)
 * - Бэйдж эффективности расхода: ≤600 экономно, 601-650 норма, >650 перерасход
 * - Кнопка «Выдать канистру» → IssueCanisterModal
 */

interface Props {
  canisters: EmployeeChemicalCanister[];
  employees: Employee[];
  washEvents: WashEvent[];
  transactions: EmployeeTransaction[];
}

const CANISTER_MODE_META: Record<CanisterMode, {
  label: string;
  shortDesc: string;
  color: string;
  bg: string;
  border: string;
  Icon: typeof Wallet;
}> = {
  purchase: {
    label: 'Покупка',
    shortDesc: 'долг 3000₽',
    color: '#1d4ed8',
    bg: '#eff6ff',
    border: '#bfdbfe',
    Icon: Wallet,
  },
  bonus: {
    label: 'Премия',
    shortDesc: 'без долга',
    color: '#b45309',
    bg: '#fef3c7',
    border: '#fde68a',
    Icon: Award,
  },
  gift: {
    label: 'Подарок',
    shortDesc: 'расход мойки',
    color: '#9d174d',
    bg: '#fdf2f8',
    border: '#fbcfe8',
    Icon: Gift,
  },
  'salary-deduction': {
    label: 'В счёт ЗП',
    shortDesc: 'удержание',
    color: '#5b21b6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    Icon: MinusCircle,
  },
};

function efficiencyMeta(avgPerWash: number | undefined) {
  if (typeof avgPerWash !== 'number' || avgPerWash <= 0) {
    return { label: '—', color: '#94a3b8', bg: '#f8fafc', Icon: TrendingDown };
  }
  if (avgPerWash <= 600) {
    return { label: 'экономно', color: '#15803d', bg: '#dcfce7', Icon: TrendingDown };
  }
  if (avgPerWash <= 650) {
    return { label: 'норма', color: '#1e40af', bg: '#dbeafe', Icon: CheckCircle2 };
  }
  return { label: 'перерасход', color: '#b91c1c', bg: '#fee2e2', Icon: TrendingUp };
}

function fmtKg(grams: number): string {
  return (grams / 1000).toFixed(1);
}

export function EmployeeCanistersSection({ canisters, employees, washEvents, transactions }: Props) {
  const [issueModalOpen, setIssueModalOpen] = React.useState(false);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const router = useRouter();

  const activeCanisters = canisters.filter((c) => c.status === 'active');
  const empMap = new Map(employees.map((e) => [e.id, e]));

  // Per-employee метрики за текущий месяц
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthWashes = washEvents.filter((e) => {
    const t = Date.parse(e.timestamp || '');
    return Number.isFinite(t) && t >= monthStart.getTime();
  });

  function metricsForEmployee(empId: string) {
    const my = monthWashes.filter((e) => Array.isArray(e.employeeIds) && e.employeeIds.includes(empId));
    const monthChemGrams = my.reduce((s, e) => {
      const total = e.chemicalConsumptionGrams || 0;
      const empCount = (e.employeeIds || []).length || 1;
      return s + total / empCount;
    }, 0);
    return {
      monthWashes: my.length,
      monthChemKg: monthChemGrams / 1000,
    };
  }

  return (
    <div className="zorin-card p-5 my-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[14px] font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Канистры у сотрудников
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {activeCanisters.length} активных канистр · 1 канистра в руки · норма {' '}
            <span className="text-emerald-700">≤600</span> /{' '}
            <span className="text-blue-700">601-650</span> /{' '}
            <span className="text-rose-700">{'>'}650</span> гр/мойка
          </div>
        </div>
        <Button
          onClick={() => setIssueModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Выдать канистру
        </Button>
      </div>

      {activeCanisters.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <div className="text-[14px] font-semibold">Активных канистр нет</div>
          <div className="text-[12px] mt-1">Выдайте первую — статус будет «active»</div>
        </div>
      ) : (
        <div className="space-y-2">
          {activeCanisters.map((c) => {
            const emp = empMap.get(c.employeeId);
            if (!emp) return null;
            const isExpanded = expandedId === c.id;
            const mode = (c.mode || 'purchase') as CanisterMode;
            const meta = CANISTER_MODE_META[mode];
            const eff = efficiencyMeta(emp.avgChemPerWash);
            const ModeIcon = meta.Icon;
            const EffIcon = eff.Icon;
            const m = metricsForEmployee(c.employeeId);
            return (
              <div key={c.id} className="rounded-xl border border-slate-200 overflow-hidden">
                {/* Row header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50/40 text-left transition-colors"
                >
                  <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="font-bold text-slate-900 text-[14px] flex-shrink-0">
                    {emp.fullName}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
                  >
                    <ModeIcon className="w-3 h-3" />
                    {meta.label}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: eff.bg, color: eff.color }}
                  >
                    <EffIcon className="w-3 h-3" />
                    {eff.label} {emp.avgChemPerWash ? `· ${emp.avgChemPerWash}г` : ''}
                  </span>
                  <div className="ml-auto flex items-center gap-4 text-[12px] text-slate-600 flex-shrink-0">
                    <span className="tabular-nums">
                      <Droplets className="w-3 h-3 inline mr-0.5 text-blue-500" />
                      {fmtKg(c.remainingAmountGrams)}/{fmtKg(c.initialAmountGrams)} кг
                    </span>
                    {mode === 'purchase' && c.priceRub > 0 && (
                      <span className="tabular-nums text-rose-700 font-bold">
                        −{c.priceRub.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/40 p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-[12px]">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                        Выдана
                      </div>
                      <div className="font-bold text-slate-900">
                        {format(new Date(c.issuedAt), 'd MMM yyyy', { locale: ru })}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {meta.shortDesc}
                        {c.washPoint && ` · ${c.washPoint === 'wash_1' ? 'Мойка 1' : 'Мойка 2'}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                        Норма расхода
                      </div>
                      <div className="font-bold text-slate-900 tabular-nums">
                        {emp.avgChemPerWash ? `${emp.avgChemPerWash} г/мойка` : '—'}
                      </div>
                      <div className="text-[11px]" style={{ color: eff.color }}>
                        {eff.label}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                        Моек за месяц
                      </div>
                      <div className="font-bold text-slate-900 tabular-nums">{m.monthWashes}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {m.monthChemKg.toFixed(1)} кг химии
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-1">
                        {mode === 'purchase' || mode === 'salary-deduction' ? 'Долг' : 'Цена'}
                      </div>
                      <div
                        className="font-bold tabular-nums"
                        style={{
                          color:
                            mode === 'purchase' || mode === 'salary-deduction'
                              ? '#b91c1c'
                              : '#15803d',
                        }}
                      >
                        {c.priceRub > 0
                          ? `${(mode === 'purchase' || mode === 'salary-deduction') ? '−' : ''}${c.priceRub.toLocaleString('ru-RU')} ₽`
                          : '0 ₽'}
                      </div>
                      {c.notes && (
                        <div className="text-[11px] text-slate-500 mt-0.5 italic">
                          «{c.notes}»
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <IssueCanisterModal
        open={issueModalOpen}
        onOpenChange={setIssueModalOpen}
        employees={employees}
        onIssued={() => router.refresh()}
      />
    </div>
  );
}

// ─── IssueCanisterModal ───

function IssueCanisterModal({
  open, onOpenChange, employees, onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  onIssued: () => void;
}) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = React.useState<string>('');
  const [mode, setMode] = React.useState<CanisterMode>('purchase');
  const [amountKg, setAmountKg] = React.useState<string>('22');
  const [priceRub, setPriceRub] = React.useState<string>('3000');
  const [washPoint, setWashPoint] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState(false);

  const activeEmployees = employees.filter(
    (e) => !e.archived && e.role !== 'kiosk' && e.role !== ('kiosk1' as any)
  );

  function reset() {
    setEmployeeId('');
    setMode('purchase');
    setAmountKg('22');
    setPriceRub('3000');
    setWashPoint('');
    setNotes('');
  }

  async function submit() {
    if (!employeeId) {
      toast({ title: 'Выберите сотрудника', variant: 'destructive' });
      return;
    }
    const grams = Math.round(parseFloat(amountKg) * 1000);
    const price = Math.round(parseFloat(priceRub) || 0);
    if (grams <= 0) {
      toast({ title: 'Объём должен быть > 0', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch('/api/canisters/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          mode,
          amountGrams: grams,
          priceRub: mode === 'bonus' ? 0 : price,
          washPoint: washPoint || undefined,
          notes: notes || undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      const emp = activeEmployees.find((e) => e.id === employeeId);
      toast({
        title: 'Канистра выдана',
        description: `${emp?.fullName} · ${CANISTER_MODE_META[mode].label} · ${amountKg}кг${mode === 'bonus' ? '' : ` · ${price.toLocaleString('ru-RU')}₽`}`,
      });
      onOpenChange(false);
      reset();
      onIssued();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  const modeMeta = CANISTER_MODE_META[mode];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            Выдать канистру
          </DialogTitle>
          <DialogDescription>
            1 канистра = 22 кг / 19 л / ~3 000 ₽. Выберите режим: покупка (долг),
            премия (без долга), подарок (расход мойки) или в счёт ЗП (удержание).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Employee */}
          <div>
            <Label className="text-[12px] font-bold mb-1.5 block">Сотрудник</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите сотрудника" />
              </SelectTrigger>
              <SelectContent>
                {activeEmployees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}
                    {emp.avgChemPerWash ? ` · ${emp.avgChemPerWash} г/мойка` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode radio */}
          <div>
            <Label className="text-[12px] font-bold mb-2 block">Режим выдачи</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['purchase', 'bonus', 'gift', 'salary-deduction'] as CanisterMode[]).map((m) => {
                const meta = CANISTER_MODE_META[m];
                const ModeIcon = meta.Icon;
                const isActive = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="rounded-lg p-3 text-left transition-all"
                    style={{
                      background: isActive ? meta.bg : '#fff',
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor: isActive ? meta.color : '#e2e8f0',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ModeIcon className="w-4 h-4" style={{ color: meta.color }} />
                      <span
                        className="font-bold text-[13px]"
                        style={{ color: isActive ? meta.color : '#0f172a' }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 leading-snug">{meta.shortDesc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount + price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px] font-bold mb-1.5 block">Объём (кг)</Label>
              <Input
                type="number"
                step="0.1"
                value={amountKg}
                onChange={(e) => setAmountKg(e.target.value)}
                placeholder="22"
              />
            </div>
            <div>
              <Label className="text-[12px] font-bold mb-1.5 block">
                Стоимость (₽)
                {mode === 'bonus' && (
                  <span className="ml-2 text-[10px] text-slate-400 font-normal">игнорируется для bonus</span>
                )}
              </Label>
              <Input
                type="number"
                value={mode === 'bonus' ? '0' : priceRub}
                onChange={(e) => setPriceRub(e.target.value)}
                placeholder="3000"
                disabled={mode === 'bonus'}
              />
            </div>
          </div>

          {/* Wash point */}
          <div>
            <Label className="text-[12px] font-bold mb-1.5 block">Мойка (опционально)</Label>
            <Select value={washPoint || 'none'} onValueChange={(v) => setWashPoint(v === 'none' ? '' : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Не привязана" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не привязана</SelectItem>
                <SelectItem value="wash_1">Мойка 1 (Циолковского)</SelectItem>
                <SelectItem value="wash_2">Мойка 2 (Мокрово)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-[12px] font-bold mb-1.5 block">
              {mode === 'bonus' ? 'Причина премии *' : 'Комментарий'}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={mode === 'bonus' ? 'Например: Лидер мая · 64 мойки' : 'опционально'}
              rows={2}
            />
          </div>

          {/* Effect preview */}
          <div
            className="rounded-lg border p-3 text-[12px]"
            style={{ background: modeMeta.bg, borderColor: modeMeta.border }}
          >
            <div className="font-bold mb-1" style={{ color: modeMeta.color }}>
              Что произойдёт после выдачи:
            </div>
            <ul className="list-disc pl-5 space-y-0.5" style={{ color: modeMeta.color }}>
              <li>EmployeeCanister(active, mode={mode}, {amountKg}кг)</li>
              <li>StockMovement (-{Math.round(parseFloat(amountKg) * 1000)}г с главного склада)</li>
              {mode === 'purchase' && <li>EmployeeTransaction(type=purchase, +{priceRub}₽ долг)</li>}
              {mode === 'bonus' && <li>EmployeeTransaction(type=bonus, 0₽, описание = причина)</li>}
              {mode === 'gift' && <li>Expense(category=gift, +{priceRub}₽ расход мойки)</li>}
              {mode === 'salary-deduction' && (
                <li>EmployeeTransaction(type=salary-deduction, +{priceRub}₽ удержание)</li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={submitting || !employeeId} className="bg-blue-600 hover:bg-blue-700">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Выдать канистру
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
