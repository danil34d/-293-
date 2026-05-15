"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Banknote, Loader2 } from "lucide-react";
import { CheckItem, HazardPill, SafetyBar } from "@/components/admin";

export interface PayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  employeeId: string;
  amount: number;
  /** YYYY-MM текущего периода для проверки lock. */
  currentMonth?: string;
  /** Закрыт ли период (полученный из родителя). */
  isPeriodClosed: boolean;
  /** Есть ли несохранённые правки в период (editedAfterPaidCount > 0 в /wash-log). */
  hasUnpaidEdits?: boolean;
  /** Submit handler — родитель вызывает fetch и обрабатывает success. */
  onConfirm: () => Promise<void>;
}

/**
 * Phase 13 / UX полировка пилота Phase 4C3: confirmation modal перед выплатой ZP.
 *
 * 3 чек-листа:
 *  1. Период закрыт (📌 critical если нет — push to /salary-report close button)
 *  2. Нет правок WashEvent после последней выплаты
 *  3. Сумма проверена визуально
 *
 * Submit disabled пока не все 3 чека отмечены.
 */
export function PayModal({
  open,
  onOpenChange,
  employeeName,
  amount,
  currentMonth,
  isPeriodClosed,
  hasUnpaidEdits,
  onConfirm,
}: PayModalProps) {
  const [check1, setCheck1] = React.useState(false);
  const [check2, setCheck2] = React.useState(false);
  const [check3, setCheck3] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setCheck1(false); setCheck2(false); setCheck3(false);
    }
  }, [open]);

  // Auto-check periodClosed если уже закрыт (UX: не заставлять отмечать очевидное).
  React.useEffect(() => {
    if (open && isPeriodClosed) setCheck1(true);
  }, [open, isPeriodClosed]);

  React.useEffect(() => {
    if (open && !hasUnpaidEdits) setCheck2(true);
  }, [open, hasUnpaidEdits]);

  const allChecked = check1 && check2 && check3;

  const handleConfirm = async () => {
    if (!allChecked) return;
    setIsSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            Выплата зарплаты
            <HazardPill level={isPeriodClosed ? 'safe' : 'warn'}>
              {isPeriodClosed ? 'OK' : 'WARN'}
            </HazardPill>
          </DialogTitle>
          <DialogDescription>
            <b>{employeeName}</b> · сумма к выплате:{' '}
            <span className="text-emerald-700 font-bold tabular-nums">
              {amount.toLocaleString('ru-RU')} ₽
            </span>
          </DialogDescription>
        </DialogHeader>

        <SafetyBar
          level={isPeriodClosed && !hasUnpaidEdits ? 'safe' : 'warn'}
          items={[
            { icon: 'lock', label: 'Период', value: currentMonth ? `${currentMonth} ${isPeriodClosed ? '(закрыт)' : '(открыт)'}` : '?' },
            { icon: 'edit-3', label: 'Правки', value: hasUnpaidEdits ? 'есть после оплаты' : 'нет' },
            { icon: 'banknote', label: 'К выплате', value: `${amount.toLocaleString('ru-RU')} ₽` },
          ]}
        />

        <div className="space-y-2 pt-2">
          <CheckItem
            checked={check1}
            onCheck={setCheck1}
            icon="lock"
            title={isPeriodClosed ? 'Период закрыт ✓' : 'Период должен быть закрыт перед выплатой'}
            desc={isPeriodClosed
              ? 'WashEvent правки заблокированы (423 Locked)'
              : 'Откройте /salary-report → "Закрыть период" чтобы правки больше не меняли расчёт'}
            level={isPeriodClosed ? 'safe' : 'critical'}
          />
          <CheckItem
            checked={check2}
            onCheck={setCheck2}
            icon="edit-3"
            title={hasUnpaidEdits ? 'Есть правки после оплаты — проверь!' : 'Правок WashEvent после оплаты нет ✓'}
            desc={hasUnpaidEdits
              ? 'В /wash-log есть мойки с правками после последней выплаты — может быть расхождение'
              : 'Расчёт стабилен'}
            level={hasUnpaidEdits ? 'warn' : 'safe'}
          />
          <CheckItem
            checked={check3}
            onCheck={setCheck3}
            icon="banknote"
            title="Сумма проверена визуально"
            desc={`${amount.toLocaleString('ru-RU')} ₽ — это итог по строке (старт + начислено + операции − уже выплачено)`}
            level="info"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allChecked || isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Подтвердить выплату {amount.toLocaleString('ru-RU')} ₽
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
