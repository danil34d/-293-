"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Archive, ArrowLeft, AlertOctagon, Loader2 } from "lucide-react";

import { Impact, HazardPill } from "@/components/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@/types";

interface EmployeeImpact {
  washEvents: number;
  transactions: number;
  shifts: number;
  violations: number;
  canisters: number;
  dayStatuses: number;
}

interface EmployeeDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  /** После успеха — родителю надо обновить список. */
  onChange?: () => void;
}

/**
 * UX-safety 2-режимный модал для удаления сотрудника (Phase 6.2).
 *
 * Дизайн-образец: admin-pilot/employees-list.jsx EmployeeDeleteModal.
 *
 * Mode 1 «choose»:
 *  - 🟢 Archive (рекомендуется) — POST /api/employees/[id]/archive
 *  - 🔴 Hard delete (вторая ветка) — переходит в mode 2
 *
 * Mode 2 «hard-delete»:
 *  - Impact с описанием cascade на 7 таблиц
 *  - 2 CheckItem (баланс / история)
 *  - Input ФИО для подтверждения
 *  - DELETE /api/employees/[id]?force=true (force-bypass pre-check 409)
 *
 * Backend защита:
 *  - DELETE /api/employees/[id] возвращает 409 если есть history (Phase 6.2A)
 *  - Сделать hard delete можно только через ?force=true (явное намерение)
 *  - emp_manager_admin защищён в роуте (403)
 */
export function EmployeeDeleteModal({
  open,
  onOpenChange,
  employee,
  onChange,
}: EmployeeDeleteModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = React.useState<"choose" | "hard-delete">("choose");
  const [confirmName, setConfirmName] = React.useState("");
  const [acks, setAcks] = React.useState({ balance: false, history: false });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [impact, setImpact] = React.useState<EmployeeImpact | null>(null);

  // Reset state на каждом open
  React.useEffect(() => {
    if (open) {
      setMode("choose");
      setConfirmName("");
      setAcks({ balance: false, history: false });
      setImpact(null);
    }
  }, [open, employee?.id]);

  // Pre-fetch impact при открытии (read-only, безопасно)
  React.useEffect(() => {
    if (!open || !employee?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/employees/${employee.id}/impact`);
        if (cancelled) return;
        if (r.ok) {
          const body = await r.json();
          setImpact(body.impact);
        }
      } catch (e) {
        if (cancelled) return;
        // silent — UI просто покажет архив-only
      }
    })();
    return () => { cancelled = true; };
  }, [open, employee?.id]);

  if (!employee) return null;

  const hasHistory = !!impact && (impact.washEvents > 0 || impact.transactions > 0 || impact.shifts > 0 || impact.violations > 0);
  const canHardDelete = acks.balance && acks.history && confirmName === employee.fullName;

  async function handleArchive() {
    if (!employee) return;
    setIsSubmitting(true);
    try {
      const r = await fetch(`/api/employees/${employee.id}/archive`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      toast({
        title: "Архивирован",
        description: `${employee.fullName} — пропал из активных списков, история сохранена.`,
      });
      onOpenChange(false);
      router.refresh();
      onChange?.();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleHardDelete() {
    if (!employee) return;
    setIsSubmitting(true);
    try {
      const r = await fetch(`/api/employees/${employee.id}?force=true`, { method: "DELETE" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      toast({
        title: "Удалён навсегда",
        description: `${employee.fullName} — все связанные записи удалены каскадом.`,
        variant: "destructive",
      });
      onOpenChange(false);
      router.refresh();
      onChange?.();
    } catch (e: any) {
      toast({ title: "Ошибка удаления", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Mode 1: choose
  if (mode === "choose") {
    return (
      <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-50 text-rose-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <HazardPill level="critical" />
                <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                  Что сделать с {employee.fullName}?
                </DialogTitle>
                <DialogDescription className="text-[12px] text-gray-600 mt-1">
                  {hasHistory && impact && (
                    <>История: <b>{impact.washEvents}</b> моек · <b>{impact.transactions}</b> транзакций · <b>{impact.shifts}</b> смен</>
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            {hasHistory && (
              <Impact icon="history" level="warn">
                Hard-delete <b>каскадом удалит</b> 7 таблиц: WashEventEmployee · ShiftEmployee ·
                EmployeeTransaction · EmployeeDayStatus · EmployeeCanister · Violation +
                StockMovement.employeeId → SET NULL. Отчёты за прошлые периоды изменятся.
              </Impact>
            )}

            {/* Archive option — primary safe choice */}
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                  <Archive className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-bold text-emerald-900">
                    Архивировать (рекомендуется)
                  </div>
                  <div className="text-[12px] text-emerald-800 mt-1 leading-snug">
                    Сотрудник пропадёт из активных списков, графиков и автодополнений.
                    История моек, ZP и транзакции <b>сохраняются</b> — отчёты за прошлые
                    периоды остаются точными. Восстановить можно в любой момент.
                  </div>
                  <Button
                    type="button"
                    onClick={handleArchive}
                    disabled={isSubmitting}
                    size="sm"
                    className="mt-3 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Archive className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Архивировать
                  </Button>
                </div>
              </div>
            </div>

            {/* Hard delete — secondary, scary */}
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-[14px] font-bold text-rose-900">
                    Удалить навсегда
                  </div>
                  <div className="text-[12px] text-rose-800 mt-1 leading-snug">
                    Каскадно удалит {hasHistory && impact ? `${impact.washEvents} WashEvent, ${impact.transactions} EmployeeTransaction, ${impact.shifts} ShiftEmployee, ` : ""}
                    {(impact?.violations ?? 0) > 0 && `${impact?.violations} Violation, `}
                    остальные связанные записи. Отчёты за прошлые месяцы изменятся.
                    Откатить невозможно.
                  </div>
                  <Button
                    type="button"
                    onClick={() => setMode("hard-delete")}
                    disabled={isSubmitting}
                    variant="outline"
                    size="sm"
                    className="mt-3 bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300"
                  >
                    Перейти к удалению →
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Mode 2: hard-delete
  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-100 text-rose-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <HazardPill level="critical" />
              <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                Удалить {employee.fullName} навсегда
              </DialogTitle>
              <DialogDescription className="text-[12px] text-gray-600 mt-1">
                Каскад на {hasHistory && impact ? `${impact.washEvents + impact.transactions + impact.shifts + impact.violations + impact.canisters + impact.dayStatuses} записей в 7 таблицах` : "связанных записей"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <Impact icon="alert-octagon" level="critical">
            Cascade удалит записи из <b>7 таблиц</b>: Employee · WashEventEmployee ·
            EmployeeTransaction · ShiftEmployee · EmployeeDayStatus · EmployeeCanister ·
            Violation. Отчёты <b>/salary-report</b> и <b>/dashboard</b> за прошлые периоды
            пересчитаются.
          </Impact>

          <div>
            <div className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">
              Подтвердите, что понимаете последствия
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAcks((s) => ({ ...s, balance: !s.balance }))}
                className={`w-full rounded-xl border p-3 flex items-start gap-3 text-left transition-all ${
                  acks.balance
                    ? "bg-rose-50 border-rose-300"
                    : "bg-white border-gray-200 hover:border-rose-200"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    acks.balance ? "bg-rose-600" : "border-2 border-gray-300"
                  }`}
                >
                  {acks.balance && <span className="text-white text-xs">✓</span>}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-gray-900">
                    Финансовых хвостов нет / готов потерять
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Незакрытые балансы (если есть) пропадут навсегда. Лучше сначала свести
                    баланс через /salary-report.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAcks((s) => ({ ...s, history: !s.history }))}
                className={`w-full rounded-xl border p-3 flex items-start gap-3 text-left transition-all ${
                  acks.history
                    ? "bg-rose-50 border-rose-300"
                    : "bg-white border-gray-200 hover:border-rose-200"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    acks.history ? "bg-rose-600" : "border-2 border-gray-300"
                  }`}
                >
                  {acks.history && <span className="text-white text-xs">✓</span>}
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-gray-900">
                    История моек и выплат удалится
                  </div>
                  <div className="text-[11px] text-gray-600 mt-0.5">
                    Дашборд и /salary-report за прошлые месяцы пересчитаются.
                    Аналитика покажет другие числа.
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <label className="block text-[12px] font-semibold text-gray-700 mb-1.5">
              Для подтверждения введите ФИО:{" "}
              <code className="bg-white px-1.5 py-0.5 rounded text-[12px] border border-gray-200">
                {employee.fullName}
              </code>
            </label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={employee.fullName}
              className="text-[13px]"
            />
            {confirmName && confirmName !== employee.fullName && (
              <div className="text-[11px] text-rose-600 mt-1.5">
                Не совпадает с ФИО
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode("choose")}
            disabled={isSubmitting}
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Назад
          </Button>
          <Button
            type="button"
            onClick={handleHardDelete}
            disabled={!canHardDelete || isSubmitting}
            className="bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-200"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            Удалить навсегда
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
