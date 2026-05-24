"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2, Lock, AlertOctagon } from "lucide-react";

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

interface WashDeleteModalProps {
  /** Открыть/закрыть модал. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** WashEvent данные. */
  eventId: string;
  vehicleNumber: string;
  eventDate: string;
  totalAmount: number;
  paymentLabel: string;
  /** Имена сотрудников этой мойки. */
  employeeNames: string[];
  /** Связан с CounterAgent / Aggregator (для возврата баланса). */
  counterAgentName?: string;
  aggregatorName?: string;
  /** Закрыт ли период этой мойки. Если да — UI блокирует удаление через lock-state. */
  periodLocked?: boolean;
  /** Месяц периода (для warning). */
  month?: string;
  /** Колбек после успешного удаления. */
  onDeleted?: () => void;
}

/**
 * UX-safety Delete-модал для WashEvent.
 *
 * Дизайн-образец: admin-pilot/wash-log.jsx WashDeleteModal (Phase 6.1).
 *
 * Что показывает:
 * - Карточка с deails мойки (Номер / Время / Услуга / Сумма)
 * - Impact «ЗП пересчитается у X» — конкретные имена + сумма
 * - Impact «Баланс контрагента вернётся» — если b2b
 * - 2 CheckItem (ЗП пересчёт / audit-запись)
 * - Кнопка disabled пока все ✓
 *
 * Если periodLocked === true — показываем особое состояние:
 * - Header «Период закрыт» с lock-иконкой
 * - Объяснение что удалить нельзя
 * - Кнопка «Перейти к /salary-report» (открыть период там)
 *
 * Backend защита (Phase 4B) — 423 Locked для wash-events в закрытом периоде —
 * страхует от прямых curl даже если UI пропустит.
 */
export function WashDeleteModal({
  open,
  onOpenChange,
  eventId,
  vehicleNumber,
  eventDate,
  totalAmount,
  paymentLabel,
  employeeNames,
  counterAgentName,
  aggregatorName,
  periodLocked,
  month,
  onDeleted,
}: WashDeleteModalProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [acks, setAcks] = React.useState({ salary: false, audit: false });

  // Reset acks on open change
  React.useEffect(() => {
    if (!open) setAcks({ salary: false, audit: false });
  }, [open]);

  const allChecked = acks.salary && acks.audit;

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/wash-events/${eventId}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 423) {
        // Backend защита сработала — период закрыт
        toast({
          title: "Период закрыт",
          description: body.error || "Удаление моек в закрытом периоде запрещено. Откройте период в /salary-report.",
          variant: "destructive",
        });
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || `Не удалось удалить (HTTP ${response.status})`);
      }
      toast({
        title: "Мойка удалена",
        description: `${vehicleNumber} от ${eventDate} — ZP пересчитана.`,
      });
      onOpenChange(false);
      router.refresh();
      onDeleted?.();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  // Period-locked state — special header, no delete button
  if (periodLocked) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 text-emerald-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <HazardPill level="safe">Период закрыт</HazardPill>
                <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                  Удаление {vehicleNumber} запрещено
                </DialogTitle>
                <DialogDescription className="text-[12px] text-gray-600 mt-1">
                  Мойка относится к закрытому периоду {month || ""}. Правки заблокированы.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3">
            <Impact icon="shield-check" level="safe">
              Это защита от случайных правок после выплаты ЗП. Если действительно нужно
              удалить — откройте период через <b>/salary-report → «Период закрыт» →
              «Открыть период»</b>.
            </Impact>
            <Impact icon="info" level="info">
              После открытия периода ЗП у сотрудников пересчитается. Закрывайте период обратно
              сразу после правок.
            </Impact>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Закрыть
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/salary-report")}
            >
              <Lock className="w-3.5 h-3.5 mr-1.5" /> Перейти к /salary-report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Normal delete flow
  return (
    <Dialog open={open} onOpenChange={(o) => !isDeleting && onOpenChange(o)}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-rose-50 text-rose-700 w-10 h-10 flex items-center justify-center flex-shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <HazardPill level="warn" />
              <DialogTitle className="text-[18px] font-bold text-gray-900 leading-tight mt-1.5">
                Удалить мойку {vehicleNumber}?
              </DialogTitle>
              <DialogDescription className="text-[12px] text-gray-600 mt-1">
                {eventDate} · {totalAmount.toLocaleString("ru-RU")} ₽ · {paymentLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {/* Details card */}
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                Номер
              </div>
              <code className="bg-amber-100 text-gray-900 px-1.5 py-0.5 rounded text-[13px] font-bold tracking-wider mt-1 inline-block">
                {vehicleNumber}
              </code>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                Время
              </div>
              <div className="text-[13px] font-semibold text-gray-900 mt-0.5">{eventDate}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                Оплата
              </div>
              <div className="text-[13px] font-semibold text-gray-900 mt-0.5">
                {paymentLabel}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-wider text-gray-500 font-bold">
                Сумма
              </div>
              <div className="text-[15px] font-extrabold text-gray-900 mt-0.5">
                {totalAmount.toLocaleString("ru-RU")} ₽
              </div>
            </div>
          </div>

          {/* Impact: salary */}
          {employeeNames.length > 0 && (
            <Impact icon="user" level="warn">
              ZP у <b>{employeeNames.join(", ")}</b> пересчитается: вычтется доля от{" "}
              <b>{totalAmount.toLocaleString("ru-RU")} ₽</b> за этот заказ.
            </Impact>
          )}

          {/* Impact: counterAgent balance */}
          {counterAgentName && (
            <Impact icon="building-2" level="warn">
              Баланс контрагента <b>{counterAgentName}</b> вернётся:{" "}
              <b>+{totalAmount.toLocaleString("ru-RU")} ₽</b>.
            </Impact>
          )}
          {aggregatorName && (
            <Impact icon="zap" level="warn">
              Баланс агрегатора <b>{aggregatorName}</b> вернётся:{" "}
              <b>+{totalAmount.toLocaleString("ru-RU")} ₽</b>.
            </Impact>
          )}

          {/* Acknowledgement checklist */}
          <div className="space-y-2 pt-1">
            <CheckItem
              checked={acks.salary}
              onCheck={(v) => setAcks((s) => ({ ...s, salary: v }))}
              icon="user"
              level="warn"
              title="ZP будет пересчитана"
              desc={
                employeeNames.length > 0
                  ? `${employeeNames.join(", ")} увидит изменения в /salary-report за текущий период`
                  : "Изменения отразятся в /salary-report"
              }
            />
            <CheckItem
              checked={acks.audit}
              onCheck={(v) => setAcks((s) => ({ ...s, audit: v }))}
              icon="history"
              level="info"
              title="Запись в audit-журнал"
              desc="Менеджер Про · указано время удаления · откатить невозможно"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={!allChecked || isDeleting}
            className="bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-200"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            )}
            Удалить мойку
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Wrapper-кнопка для использования в строке таблицы.
 * Заменяет существующий DeleteConfirmationButton с расширенным UX.
 */
interface WashDeleteRowButtonProps {
  eventId: string;
  vehicleNumber: string;
  eventDate: string;
  totalAmount: number;
  paymentLabel: string;
  employeeNames: string[];
  counterAgentName?: string;
  aggregatorName?: string;
  periodLocked?: boolean;
  month?: string;
}

export function WashDeleteRowButton(props: WashDeleteRowButtonProps) {
  const [open, setOpen] = React.useState(false);

  // Когда период закрыт — кнопка как lock-иконка (не trash)
  const Icon = props.periodLocked ? Lock : Trash2;
  const title = props.periodLocked
    ? `Удаление запрещено — период ${props.month} закрыт`
    : "Удалить мойку";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        title={title}
        className={
          props.periodLocked
            ? "text-gray-400 hover:bg-gray-100 cursor-help"
            : "text-muted-foreground hover:text-destructive transition-colors"
        }
        aria-label={title}
      >
        <Icon className="h-4 w-4" />
      </Button>
      <WashDeleteModal open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
