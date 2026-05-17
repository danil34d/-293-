"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2, HandCoins, ArrowRight, CheckCircle2, Banknote, Building2, CreditCard, ShieldCheck,
} from "lucide-react";
import type { CounterAgent } from "@/types";

interface Props {
  agent: CounterAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaymentRecorded?: (newBalance: number) => void;
}

type PaymentMethod = "cash" | "transfer" | "card";

const METHODS: Array<{ id: PaymentMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "cash",     label: "Наличные", icon: Banknote },
  { id: "transfer", label: "Безнал",   icon: Building2 },
  { id: "card",     label: "Карта",    icon: CreditCard },
];

const QUICK_AMOUNTS = [1000, 5000, 10000, 50000];

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

/**
 * Phase 25b / V2 «counter-agents PaymentModal»:
 * Платёж создаётся как ClientTransaction(type='payment') с audit-меткой —
 * прямая правка balance из UI убрана (Phase 25a server-side enforcement).
 *
 * POST /api/client-transactions/[counterAgentId] body { amount, description }
 * автоматически делает updateBalance(amount) — single source of truth.
 */
export function PaymentModal({ agent, open, onOpenChange, onPaymentRecorded }: Props) {
  const { toast } = useToast();
  const [amountStr, setAmountStr] = React.useState("");
  const [method, setMethod] = React.useState<PaymentMethod>("cash");
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Сброс полей при открытии нового модала
  React.useEffect(() => {
    if (open && agent) {
      setAmountStr("");
      setMethod("cash");
      setComment("");
    }
  }, [open, agent?.id]);

  if (!agent) return null;

  const currentBalance = Number(agent.balance ?? 0);
  const amount = Number(amountStr.replace(/\s/g, "")) || 0;
  const newBalance = currentBalance + amount;
  const closesDebt = currentBalance < 0 && amount >= Math.abs(currentBalance);
  const canSubmit = amount > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !agent) return;
    setSubmitting(true);
    try {
      const methodLabel = METHODS.find(m => m.id === method)?.label ?? method;
      const description = comment.trim()
        ? `${methodLabel} · ${comment.trim()}`
        : `${methodLabel} · платёж`;

      const r = await fetch(`/api/client-transactions/${agent.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, description }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось записать платёж");
      }

      toast({
        title: "Платёж записан ✅",
        description: `${agent.name}: +${formatMoney(amount)} ₽${closesDebt ? " · долг закрыт" : ""}`,
      });
      onPaymentRecorded?.(newBalance);
      onOpenChange(false);
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
            <HandCoins className="w-5 h-5 text-emerald-600" />
            Платёж от {agent.name}
          </DialogTitle>
          <DialogDescription>
            Создаётся <code className="text-[11px] bg-slate-100 px-1 rounded">ClientTransaction(type='payment')</code> с audit-меткой.
            Баланс пересчитается автоматически.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Balance preview */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Текущий баланс</div>
              <div className={`text-[18px] font-extrabold tabular-nums ${currentBalance < 0 ? "text-rose-700" : currentBalance > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                {currentBalance > 0 ? "+" : ""}{formatMoney(currentBalance)} ₽
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-300" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Станет</div>
              <div className={`text-[18px] font-extrabold tabular-nums ${newBalance < 0 ? "text-rose-700" : newBalance > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                {newBalance > 0 ? "+" : ""}{formatMoney(newBalance)} ₽
              </div>
            </div>
          </div>

          {closesDebt && amount > 0 && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-[12px] text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <div>Долг будет закрыт. Просрочка снимется автоматически после записи.</div>
            </div>
          )}

          {/* Amount */}
          <div>
            <Label className="text-[12px] font-semibold mb-1.5 block">Сумма</Label>
            <div className="relative">
              <Input
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^\d ]/g, ""))}
                placeholder="0"
                className="text-[20px] font-bold tabular-nums pr-8"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 font-bold pointer-events-none">₽</span>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {QUICK_AMOUNTS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmountStr(String(v))}
                  className="rounded-md bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors"
                >
                  {formatMoney(v)}
                </button>
              ))}
              {currentBalance < 0 && (
                <button
                  type="button"
                  onClick={() => setAmountStr(String(Math.abs(currentBalance)))}
                  className="rounded-md bg-rose-100 hover:bg-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-700 transition-colors"
                >
                  Закрыть долг ({formatMoney(Math.abs(currentBalance))})
                </button>
              )}
            </div>
          </div>

          {/* Method */}
          <div>
            <Label className="text-[12px] font-semibold mb-1.5 block">Способ</Label>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map(m => {
                const Icon = m.icon;
                const isActive = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={`rounded-lg border px-3 py-2 text-[12px] font-semibold flex items-center gap-1.5 justify-center transition-all ${
                      isActive
                        ? "bg-[#0088CC] text-white border-[#0088CC]"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comment */}
          <div>
            <Label className="text-[12px] font-semibold mb-1.5 block">
              Комментарий <span className="text-slate-400 font-normal">(не обязательно)</span>
            </Label>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Например: оплата по счёту № 125"
              className="text-[13px]"
            />
          </div>

          {/* Audit note */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              Запись будет создана как <code className="bg-white px-1 rounded text-[10px]">ClientTransaction(type='payment')</code>
              {" "}— audit-метка: admin (cookie identity) + текущее время. Прямая правка balance в форме Edit заблокирована
              (Phase 25 server-side enforcement).
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <HandCoins className="w-4 h-4 mr-1.5" />}
            Записать платёж
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
