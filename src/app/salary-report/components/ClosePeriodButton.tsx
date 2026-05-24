"use client";

import * as React from "react";
import { Lock, Unlock, Loader2, AlertOctagon } from "lucide-react";

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
import { useToast } from "@/hooks/use-toast";

interface ClosePeriodButtonProps {
  /** Месяц в формате "2026-05". */
  month: string;
  /** Текущий статус периода (получается из родителя через /api/salary-period). */
  periodStatus: { closed: boolean; closedBy?: string | null; closedAt?: string | null } | null;
  /** Callback после успешного toggle — родителю надо перезапросить статус. */
  onChange: () => void;
}

/**
 * UX-safety toolbar button: «Закрыть период» / «Открыть период».
 *
 * После закрытия:
 *  - PUT/DELETE /api/wash-events/[id] для wash-events с timestamp.month=this
 *    возвращает 423 Locked → защищает от пост-выплатных правок.
 *  - Кнопка превращается в «Период закрыт» с возможностью открыть обратно (admin).
 *
 * Закрывает АРХ-НАХОДКИ #6 (post-payment edit ломает баланс).
 */
export function ClosePeriodButton({ month, periodStatus, onChange }: ClosePeriodButtonProps) {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [checked, setChecked] = React.useState({
    understood: false,
    verified: false,
  });

  const isClosed = !!periodStatus?.closed;

  React.useEffect(() => {
    if (!confirmOpen) setChecked({ understood: false, verified: false });
  }, [confirmOpen]);

  const handleAction = async () => {
    setIsSubmitting(true);
    try {
      const action = isClosed ? "open" : "close";
      const response = await fetch("/api/salary-period/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, action }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      toast({
        title: isClosed ? "Период открыт" : "Период закрыт",
        description: isClosed
          ? `Правки моек за ${month} снова разрешены.`
          : `Правки моек за ${month} теперь блокируются (423 Locked).`,
      });
      setConfirmOpen(false);
      onChange();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isClosed) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          title={`Период закрыт ${periodStatus?.closedAt ? new Date(periodStatus.closedAt).toLocaleString("ru-RU") : ""}`}
        >
          <Lock className="w-3.5 h-3.5 mr-1.5" /> Период закрыт
        </Button>
        <Dialog
          open={confirmOpen}
          onOpenChange={(o) => !isSubmitting && setConfirmOpen(o)}
        >
          <DialogContent className="max-w-[520px]">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-50 text-amber-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
                  <Unlock className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <HazardPill level="warn" />
                  <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                    Открыть период {month}?
                  </DialogTitle>
                  <DialogDescription className="text-[12px] text-gray-600 mt-1">
                    Закрыт {periodStatus?.closedAt ? new Date(periodStatus.closedAt).toLocaleString("ru-RU") : "—"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-3">
              <Impact icon="alert-triangle" level="warn">
                После открытия правки моек за <b>{month}</b> снова возможны. Если ZP уже
                выплачена — баланс может разойтись.
              </Impact>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                onClick={handleAction}
                disabled={isSubmitting}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Unlock className="w-3.5 h-3.5 mr-1.5" />
                )}
                Открыть период
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        title="Заблокировать правки моек за этот месяц (защита от пост-выплатных правок)"
      >
        <Lock className="w-3.5 h-3.5 mr-1.5" /> Закрыть период
      </Button>
      <Dialog open={confirmOpen} onOpenChange={(o) => !isSubmitting && setConfirmOpen(o)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 text-emerald-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <HazardPill level="warn" />
                <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                  Закрыть период {month}?
                </DialogTitle>
                <DialogDescription className="text-[12px] text-gray-600 mt-1">
                  После закрытия PUT/DELETE на мойках за <b>{month}</b> вернут 423 Locked.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <Impact icon="shield-check" level="safe">
              Защищает от случайных правок WashEvent после того как ZP за {month} выплачена.
              Это нормальная процедура: выплатили ЗП → закрыли период.
            </Impact>

            <Impact icon="info" level="info">
              <b>Что НЕ блокируется:</b> выплаты EmployeeTransaction (payment, loan, bonus,
              штрафы) — их можно создавать в любое время.
            </Impact>

            <div className="space-y-2 pt-1">
              <CheckItem
                checked={checked.understood}
                onCheck={(v) => setChecked((s) => ({ ...s, understood: v }))}
                icon="lock"
                level="warn"
                title="Понимаю что после закрытия мойки за этот месяц нельзя редактировать"
                desc="Чтобы открыть обратно — нажми «Период закрыт» → «Открыть период» (требует admin)"
              />
              <CheckItem
                checked={checked.verified}
                onCheck={(v) => setChecked((s) => ({ ...s, verified: v }))}
                icon="check-circle"
                level="info"
                title="Проверил отчёт ЗП и согласен с суммами"
                desc="Если найдёшь правку после закрытия — придётся открыть период, исправить, закрыть снова"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={isSubmitting}>
              Отмена
            </Button>
            <Button
              type="button"
              onClick={handleAction}
              disabled={!checked.understood || !checked.verified || isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-200"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5 mr-1.5" />
              )}
              Закрыть период
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
