"use client";

import * as React from "react";
import { Save, X, AlertOctagon } from "lucide-react";

import { CheckItem, Impact, HazardPill } from "@/components/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Описание одного критичного изменения, показывается админу
 * перед окончательным submit формы редактирования сотрудника.
 */
export interface CriticalChange {
  id: string;
  /** Lucide icon name (e.g. "wallet-cards"). */
  icon: string;
  /** Что меняется (заголовок). */
  title: string;
  /** Контекст (что произойдёт). */
  description: React.ReactNode;
  /** Уровень опасности. */
  level?: "critical" | "warn" | "info";
}

interface ConfirmCriticalChangesModalProps {
  open: boolean;
  changes: CriticalChange[];
  employeeName: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Финальный confirm перед submit edit-формы сотрудника.
 *
 * Открывается ТОЛЬКО если изменилось хотя бы одно опасное поле
 * (salaryScheme / role / username). Иначе submit идёт без модала.
 *
 * Каждая галка = осознанный шаг. Кнопка Save disabled пока не все ✓.
 *
 * См. план: Phase 4C2 в `tender-drifting-journal.md`.
 */
export function ConfirmCriticalChangesModal({
  open,
  changes,
  employeeName,
  isSubmitting,
  onCancel,
  onConfirm,
}: ConfirmCriticalChangesModalProps) {
  // Каждое изменение требует своей галки
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!open) setChecked({});
  }, [open]);

  const allChecked = changes.length > 0 && changes.every((c) => checked[c.id]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isSubmitting) onCancel();
      }}
    >
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-50 text-rose-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <HazardPill level="critical" />
              <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                Подтвердите изменения сотрудника
              </DialogTitle>
              <DialogDescription className="text-[12px] text-gray-600 mt-1">
                <b>{employeeName}</b> — у вас {changes.length}{" "}
                {changes.length === 1 ? "критичное изменение" : "критичных изменений"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <Impact icon="alert-triangle" level="warn">
            Каждое изменение пересчитает что-то важное в системе. Отметьте галкой,
            что понимаете эффект каждого.
          </Impact>

          <div className="space-y-2">
            {changes.map((change) => (
              <CheckItem
                key={change.id}
                checked={!!checked[change.id]}
                onCheck={(v) => setChecked((prev) => ({ ...prev, [change.id]: v }))}
                icon={change.icon}
                level={change.level ?? "critical"}
                title={change.title}
                desc={change.description}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Отмена
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!allChecked || isSubmitting}
            className="bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-200"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {isSubmitting ? "Сохранение..." : "Подтвердить и сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
