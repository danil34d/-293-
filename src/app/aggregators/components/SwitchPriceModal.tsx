"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, Star, AlertTriangle, Calendar, Bell, ShieldCheck } from "lucide-react";
import type { Aggregator, NamedPriceList } from "@/types";
import { CheckItem } from "@/components/admin";

interface Props {
  aggregator: Aggregator | null;
  targetPriceListName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Phase 27a / V2 «SwitchPriceModal»:
 * Смена активного прайс-листа агрегатора = все НОВЫЕ мойки пойдут по новому прайсу.
 * Прошлые WashEvent не меняются — у них зафиксированы свои цены.
 *
 * До Phase 27: SetActivePriceButton делал прямой PUT без предупреждения —
 * критичная safety gap (V2 README #7 orange-level).
 *
 * Теперь: клик на не-активный прайс → этот модал с warning + 2 CheckItem
 * + сравнение услуг (current.services count → target.services count) +
 * impact описание.
 */
export function SwitchPriceModal({ aggregator, targetPriceListName, open, onOpenChange }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [ackNew, setAckNew] = React.useState(false);
  const [ackOld, setAckOld] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Сброс при открытии нового модала
  React.useEffect(() => {
    if (open) {
      setAckNew(false);
      setAckOld(false);
    }
  }, [open, aggregator?.id, targetPriceListName]);

  if (!aggregator || !targetPriceListName) return null;

  const currentName = aggregator.activePriceListName ?? "—";
  const currentPL: NamedPriceList | undefined = aggregator.priceLists?.find(pl => pl.name === currentName);
  const targetPL: NamedPriceList | undefined = aggregator.priceLists?.find(pl => pl.name === targetPriceListName);

  const currentCount = currentPL?.services?.length ?? 0;
  const targetCount = targetPL?.services?.length ?? 0;
  const delta = targetCount - currentCount;

  const allChecked = ackNew && ackOld;

  async function handleConfirm() {
    if (!aggregator || !targetPriceListName || !allChecked) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/aggregators/${aggregator.id}/active-price`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activePriceListName: targetPriceListName }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось переключить прайс");
      }
      toast({
        title: "Активный прайс изменён ✅",
        description: `${aggregator.name}: «${targetPriceListName}» теперь активен. Все НОВЫЕ мойки пойдут по нему.`,
      });
      onOpenChange(false);
      router.refresh();
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Сменить активный прайс?
          </DialogTitle>
          <DialogDescription>
            <span className="text-amber-700 font-semibold uppercase tracking-wider text-[10px]">⚠ ВАЖНО</span>
            <br/>
            После смены — все НОВЫЕ мойки <b>{aggregator.name}</b> будут считаться по новому прайсу.
            Уже сохранённые WashEvent не изменятся (у них зафиксированы свои цены).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Сравнение Текущий → Целевой */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <div className="rounded-lg bg-white border border-amber-100 p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-amber-700 font-bold">Сейчас</div>
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span className="text-[13px] font-bold text-slate-900">«{currentName}»</span>
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5 tabular-nums">{currentCount} услуг</div>
            </div>
            <ArrowRight className="w-5 h-5 text-amber-500" />
            <div className="rounded-lg bg-amber-100 border-2 border-amber-400 p-2.5">
              <div className="text-[9px] uppercase tracking-wider text-amber-800 font-bold">Станет</div>
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-3.5 h-3.5 text-amber-700" />
                <span className="text-[13px] font-bold text-slate-900">«{targetPriceListName}»</span>
              </div>
              <div className="text-[10px] text-slate-600 mt-0.5 tabular-nums">
                {targetCount} услуг
                {delta !== 0 && (
                  <span className={`ml-1 font-bold ${delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    ({delta > 0 ? "+" : ""}{delta})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Impact описание */}
          <div className="space-y-2 text-[12px]">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-slate-700">
                Все мойки <b>с этого момента</b> с {aggregator.name} будут считаться по новому прайсу.
                Прошлые мойки <b>не затронуты</b>.
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Bell className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="text-slate-700">
                На терминале сотрудника при оформлении мойки от {aggregator.name} появится новый список услуг и цен.
              </div>
            </div>
          </div>

          {/* 2 CheckItem */}
          <div className="space-y-2 pt-1">
            <CheckItem
              checked={ackNew}
              onCheck={setAckNew}
              level="warn"
              icon="check"
              title="Новые мойки пойдут по новому прайсу"
              desc={`Цена услуг с этой минуты будет браться из «${targetPriceListName}»`}
            />
            <CheckItem
              checked={ackOld}
              onCheck={setAckOld}
              level="info"
              icon="history"
              title="Прошлые мойки не изменятся"
              desc="Уже сохранённые WashEvent остаются с ценами того прайса, что был активен в момент мойки"
            />
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              Audit-метка: admin (cookie identity) + текущее время. Action логируется через
              <code className="bg-white px-1 rounded text-[10px] mx-0.5">PUT /api/aggregators/{aggregator.id}/active-price</code>.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!allChecked || submitting}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Star className="w-4 h-4 mr-1.5" />}
            Активировать прайс
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
