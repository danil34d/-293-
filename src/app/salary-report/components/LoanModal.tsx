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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { CheckItem, HazardPill } from "@/components/admin";
import { useToast } from "@/hooks/use-toast";

export interface LoanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  employeeId: string;
  /** Положительное число — размер переплаты (модуль payableTotal). */
  overpaymentAmount: number;
  onActionSuccess: () => void;
}

/**
 * Phase 13 / UX полировка пилота: запись переплаты как loan-транзакции.
 *
 * Сценарий: payableTotal < 0 (за период работнику было выплачено больше
 * чем заработано). Это «аванс» / «переплата» — её надо зафиксировать как
 * EmployeeTransaction.type='loan' чтобы в следующем периоде она вычиталась
 * из начисления.
 *
 * 1 CheckItem + комментарий + сумма (по умолчанию = модуль переплаты).
 * Можно поменять сумму вручную (например, часть оформить как loan,
 * часть оставить на следующий период).
 */
export function LoanModal({
  open,
  onOpenChange,
  employeeName,
  employeeId,
  overpaymentAmount,
  onActionSuccess,
}: LoanModalProps) {
  const { toast } = useToast();
  const [amountStr, setAmountStr] = React.useState(String(overpaymentAmount));
  const [comment, setComment] = React.useState('Зачёт переплаты в долг');
  const [check, setCheck] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAmountStr(String(overpaymentAmount));
      setComment('Зачёт переплаты в долг');
      setCheck(false);
    }
  }, [open, overpaymentAmount]);

  const amount = Number(amountStr) || 0;
  const isValid = amount > 0 && check;

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/employees/${employeeId}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'loan',
          amount,
          description: comment || 'Зачёт переплаты в долг',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || 'Не удалось создать loan-транзакцию');

      toast({
        title: 'Переплата зачтена',
        description: `${employeeName}: создан loan ${amount.toLocaleString('ru-RU')} ₽. В следующем периоде вычтется из начисления.`,
      });
      onActionSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Ошибка', description: error?.message ?? 'loan failed', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-orange-600" />
            Зачёт переплаты в долг
            <HazardPill level="warn">WARN</HazardPill>
          </DialogTitle>
          <DialogDescription>
            <b>{employeeName}</b> · переплата:{' '}
            <span className="text-rose-700 font-bold tabular-nums">
              {overpaymentAmount.toLocaleString('ru-RU')} ₽
            </span>
            <br />
            Создаст <code className="bg-orange-50 px-1 rounded">EmployeeTransaction.type='loan'</code> —
            в следующем периоде вычтется из начисления.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="loan-amount" className="text-sm">
              Сумма loan (можно меньше переплаты — остаток перенесётся на следующий период)
            </Label>
            <Input
              id="loan-amount"
              type="number"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              max={overpaymentAmount}
              min={1}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="loan-comment" className="text-sm">Комментарий (для аудита)</Label>
            <Input
              id="loan-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Например: Зачёт переплаты за апрель"
            />
          </div>

          <CheckItem
            checked={check}
            onCheck={setCheck}
            icon="check"
            title="Понимаю что loan уменьшит начисление в следующем периоде"
            desc="Сотрудник увидит у себя в /employee/finance что у него «долг» (положительный loan)"
            level="warn"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className="bg-orange-600 hover:bg-orange-700 gap-2"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            Зачесть {amount.toLocaleString('ru-RU')} ₽ в loan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
