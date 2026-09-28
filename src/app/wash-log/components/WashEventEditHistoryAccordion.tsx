'use client';

/**
 * Phase 60h / ТД-31 / АРХ-16 — Просмотр истории правок WashEvent с diff'ом.
 *
 * Раньше editHistory сохранялся в БД, но в UI показывалось только «изменена N раз».
 * Теперь — accordion с diff'ом каждой правки: что было → что стало.
 * Особое внимание — services.main.employeeConsumptions (chemical edit, который был silent).
 */

import * as React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Beaker, History, User, Calendar, CarFront, Layers, Coins, FileText } from 'lucide-react';
import type { WashEvent, Employee } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Props {
  editHistory?: WashEvent['editHistory'];
  currentState: WashEvent;
  employees: Employee[];
}

interface DiffLine {
  label: string;
  icon: React.ReactNode;
  before: string;
  after: string;
  level: 'critical' | 'warn' | 'info';
}

function formatTimestamp(iso: string): string {
  try {
    return format(new Date(iso), 'dd.MM.yyyy HH:mm', { locale: ru });
  } catch {
    return iso;
  }
}

function getEmployeeName(employees: Employee[], id: string): string {
  return employees.find(e => e.id === id)?.fullName || `?${id.slice(-6)}`;
}

function fmtRub(n: number | undefined): string {
  if (n == null) return '—';
  return `${n.toLocaleString('ru-RU')}₽`;
}

function fmtGrams(n: number | undefined): string {
  if (n == null) return '—';
  return `${n}г`;
}

function diffConsumptions(
  prev: Array<{ employeeId: string; amount: number }> | undefined,
  next: Array<{ employeeId: string; amount: number }> | undefined,
  employees: Employee[],
): string {
  const prevMap = new Map((prev || []).map(c => [c.employeeId, c.amount]));
  const nextMap = new Map((next || []).map(c => [c.employeeId, c.amount]));
  const allIds = new Set([...prevMap.keys(), ...nextMap.keys()]);
  const changed: string[] = [];
  allIds.forEach(id => {
    const p = prevMap.get(id) ?? 0;
    const n = nextMap.get(id) ?? 0;
    if (p !== n) {
      changed.push(`${getEmployeeName(employees, id)}: ${fmtGrams(p)}→${fmtGrams(n)}`);
    }
  });
  return changed.length > 0 ? changed.join(', ') : 'без изменений';
}

function computeDiff(
  prev: Partial<WashEvent>,
  curr: WashEvent,
  employees: Employee[],
): DiffLine[] {
  const lines: DiffLine[] = [];

  if (prev.vehicleNumber !== undefined && prev.vehicleNumber !== curr.vehicleNumber) {
    lines.push({
      label: 'ГРН',
      icon: <CarFront className="w-3.5 h-3.5" />,
      before: prev.vehicleNumber || '—',
      after: curr.vehicleNumber || '—',
      level: 'warn',
    });
  }

  if (prev.totalAmount !== undefined && prev.totalAmount !== curr.totalAmount) {
    lines.push({
      label: 'Сумма',
      icon: <Coins className="w-3.5 h-3.5" />,
      before: fmtRub(prev.totalAmount),
      after: fmtRub(curr.totalAmount),
      level: 'critical',
    });
  }

  if (prev.paymentMethod !== undefined && prev.paymentMethod !== curr.paymentMethod) {
    lines.push({
      label: 'Оплата',
      icon: <Coins className="w-3.5 h-3.5" />,
      before: prev.paymentMethod,
      after: curr.paymentMethod,
      level: 'critical',
    });
  }

  // employee список
  if (prev.employeeIds && JSON.stringify(prev.employeeIds.sort()) !== JSON.stringify([...(curr.employeeIds || [])].sort())) {
    const prevNames = (prev.employeeIds || []).map(id => getEmployeeName(employees, id)).join(', ');
    const currNames = (curr.employeeIds || []).map(id => getEmployeeName(employees, id)).join(', ');
    lines.push({
      label: 'Сотрудники',
      icon: <User className="w-3.5 h-3.5" />,
      before: prevNames || '—',
      after: currNames || '—',
      level: 'critical',
    });
  }

  // main service
  if (prev.services?.main) {
    const prevMain = prev.services.main;
    const currMain = curr.services.main;
    if (prevMain.serviceName !== currMain.serviceName) {
      lines.push({
        label: 'Основная услуга',
        icon: <Layers className="w-3.5 h-3.5" />,
        before: prevMain.serviceName,
        after: currMain.serviceName,
        level: 'critical',
      });
    }
    if (prevMain.price !== currMain.price) {
      lines.push({
        label: 'Цена осн. услуги',
        icon: <Coins className="w-3.5 h-3.5" />,
        before: fmtRub(prevMain.price),
        after: fmtRub(currMain.price),
        level: 'warn',
      });
    }
    if ((prevMain.chemicalConsumption || 0) !== (currMain.chemicalConsumption || 0)) {
      lines.push({
        label: 'Химия (осн)',
        icon: <Beaker className="w-3.5 h-3.5" />,
        before: fmtGrams(prevMain.chemicalConsumption),
        after: fmtGrams(currMain.chemicalConsumption),
        level: 'warn',
      });
    }
    // chemical consumption per employee — это и был silent edit
    const prevCons = (prevMain as any).employeeConsumptions as Array<{ employeeId: string; amount: number }> | undefined;
    const currCons = (currMain as any).employeeConsumptions as Array<{ employeeId: string; amount: number }> | undefined;
    if (JSON.stringify(prevCons || []) !== JSON.stringify(currCons || [])) {
      lines.push({
        label: 'Химия по сотрудникам',
        icon: <Beaker className="w-3.5 h-3.5" />,
        before: diffConsumptions(prevCons, undefined, employees) || '—',
        after: diffConsumptions(prevCons, currCons, employees),
        level: 'critical',
      });
    }
  }

  // additional services count
  if (prev.services?.additional !== undefined) {
    const prevAddCount = prev.services.additional.length;
    const currAddCount = curr.services.additional.length;
    if (prevAddCount !== currAddCount) {
      const prevNames = prev.services.additional.map(s => s.serviceName).join(', ') || '—';
      const currNames = curr.services.additional.map(s => s.serviceName).join(', ') || '—';
      lines.push({
        label: `Доп.услуги (${prevAddCount}→${currAddCount})`,
        icon: <Layers className="w-3.5 h-3.5" />,
        before: prevNames,
        after: currNames,
        level: 'warn',
      });
    }
  }

  if (lines.length === 0) {
    lines.push({
      label: 'Поля контента',
      icon: <FileText className="w-3.5 h-3.5" />,
      before: '—',
      after: '(других полей не изменилось)',
      level: 'info',
    });
  }

  return lines;
}

const LEVEL_COLOR: Record<DiffLine['level'], string> = {
  critical: 'bg-rose-50 border-rose-200 text-rose-900',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
  info: 'bg-slate-50 border-slate-200 text-slate-700',
};

export function WashEventEditHistoryAccordion({ editHistory, currentState, employees }: Props) {
  if (!editHistory || editHistory.length === 0) {
    return null;
  }

  const sorted = [...editHistory].sort((a, b) => (b.editedAt || '').localeCompare(a.editedAt || ''));

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm mt-6 max-w-3xl">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
        <History className="w-4 h-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-slate-800">История правок ({editHistory.length})</h3>
        <Badge variant="secondary" className="ml-auto text-[10px]">audit-trail</Badge>
      </div>
      <Accordion type="multiple" className="px-2">
        {sorted.map((entry, idx) => {
          // Для diff'а нужно сравнить previousState с тем что было «после» — это либо следующая запись (newer), либо currentState (для самой свежей)
          const olderEntry = sorted[idx + 1];
          const afterState: Partial<WashEvent> = olderEntry?.previousState || currentState;
          // Confusingly previousState — это состояние ДО, и сравниваем с состоянием ПОСЛЕ:
          // — Если это самая первая правка (oldest) — diff её previousState vs originalState (currentState)
          // — Иначе — diff её previousState vs previousState следующей (более свежей) правки
          // Но это перепутано. Самая свежая правка — sorted[0]: её previousState показывает что было до НЕЁ.
          // Diff'им previousState[0] vs currentState (самая свежая). Для sorted[1] diff'им её previousState vs sorted[0].previousState.
          const after: any = idx === 0 ? currentState : sorted[idx - 1].previousState;
          const diff = computeDiff(entry.previousState || {}, after as WashEvent, employees);
          const editorName = getEmployeeName(employees, entry.editedBy);
          return (
            <AccordionItem key={idx} value={`edit-${idx}`} className="border-slate-100 last:border-0">
              <AccordionTrigger className="hover:no-underline py-2 text-xs">
                <div className="flex items-center gap-2 flex-1 text-left">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-mono text-slate-700">{formatTimestamp(entry.editedAt)}</span>
                  <span className="text-slate-400">·</span>
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-medium text-slate-800">{editorName}</span>
                  <Badge variant="outline" className="ml-auto mr-2 text-[10px]">
                    {diff.length} изменени{diff.length === 1 ? 'е' : diff.length < 5 ? 'я' : 'й'}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-3">
                <div className="space-y-1.5">
                  {diff.map((line, i) => (
                    <div
                      key={i}
                      className={`rounded border px-2.5 py-1.5 text-[11px] ${LEVEL_COLOR[line.level]}`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold mb-0.5">
                        {line.icon}
                        {line.label}
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[10.5px] ml-5">
                        <span className="line-through opacity-60">{line.before}</span>
                        <ArrowRight className="w-3 h-3 flex-shrink-0" />
                        <span className="font-semibold">{line.after}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {entry.reason && (
                  <div className="mt-2 text-[10px] text-slate-500 italic px-2">
                    Причина: {entry.reason}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
