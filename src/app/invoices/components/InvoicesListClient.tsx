"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, PlusCircle, Search, FileText, Banknote, Send, Eye, Calendar as CalendarIcon } from "lucide-react";
import { SafetyBar, HazardPill } from "@/components/admin";
import type { CounterAgent, Invoice, InvoiceStatus } from "@/types";

interface Props {
  initialInvoices: Invoice[];
  counterAgents: CounterAgent[];
}

const STATUS_LABELS: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Черновик", color: "#64748b", bg: "#f1f5f9" },
  sent: { label: "Отправлен", color: "#1d4ed8", bg: "#dbeafe" },
  paid: { label: "Оплачен", color: "#15803d", bg: "#dcfce7" },
  cancelled: { label: "Отменён", color: "#dc2626", bg: "#fee2e2" },
};

function formatMoney(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽";
}

export function InvoicesListClient({ initialInvoices, counterAgents }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [invoices, setInvoices] = React.useState<Invoice[]>(initialInvoices);
  const [statusFilter, setStatusFilter] = React.useState<"all" | InvoiceStatus>("all");
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    counterAgentId: "",
    periodStart: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    periodEnd: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    discountPercent: "",
    notes: "",
  });
  const [creating, setCreating] = React.useState(false);
  const [preview, setPreview] = React.useState<any>(null);

  const counterAgentMap = React.useMemo(
    () => new Map(counterAgents.map(c => [c.id, c.name])),
    [counterAgents]
  );

  const filtered = React.useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const agentName = (inv.counterAgentName || counterAgentMap.get(inv.counterAgentId) || "").toLowerCase();
        if (!inv.number.toLowerCase().includes(s) && !agentName.includes(s)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search, counterAgentMap]);

  const counts = React.useMemo(() => ({
    all: invoices.length,
    draft: invoices.filter(i => i.status === "draft").length,
    sent: invoices.filter(i => i.status === "sent").length,
    paid: invoices.filter(i => i.status === "paid").length,
    cancelled: invoices.filter(i => i.status === "cancelled").length,
  }), [invoices]);

  const totalOutstanding = React.useMemo(
    () => invoices.filter(i => i.status === "sent").reduce((sum, i) => sum + i.totalAmount, 0),
    [invoices]
  );

  async function loadPreview() {
    if (!createForm.counterAgentId) {
      toast({ title: "Выберите контрагента", variant: "destructive" });
      return;
    }
    setCreating(true);
    setPreview(null);
    try {
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterAgentId: createForm.counterAgentId,
          periodStart: createForm.periodStart,
          periodEnd: createForm.periodEnd,
          discountPercent: createForm.discountPercent ? Number(createForm.discountPercent) : undefined,
          preview: true,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Preview failed");
      setPreview(data.preview);
    } catch (err: any) {
      toast({ title: "Ошибка preview", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function submitCreate() {
    if (!createForm.counterAgentId) {
      toast({ title: "Выберите контрагента", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterAgentId: createForm.counterAgentId,
          periodStart: createForm.periodStart,
          periodEnd: createForm.periodEnd,
          discountPercent: createForm.discountPercent ? Number(createForm.discountPercent) : undefined,
          notes: createForm.notes || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Создание не удалось");
      toast({ title: "Счёт создан", description: `№ ${data.invoice.number}` });
      setCreateOpen(false);
      setPreview(null);
      setCreateForm({ ...createForm, counterAgentId: "", notes: "" });
      router.push(`/invoices/${data.invoice.id}`);
    } catch (err: any) {
      toast({ title: "Ошибка создания", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <SafetyBar
        level={totalOutstanding > 0 ? "warn" : "info"}
        items={[
          { icon: "file-text", label: "Всего счетов", value: `${counts.all}` },
          { icon: "edit-3", label: "Черновики", value: counts.draft > 0 ? `${counts.draft}` : "—" },
          { icon: "send", label: "Ожидают оплаты", value: counts.sent > 0 ? `${counts.sent} (${formatMoney(totalOutstanding)})` : "—" },
          { icon: "check-circle-2", label: "Оплачены", value: counts.paid > 0 ? `${counts.paid}` : "—" },
        ]}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(["all", "draft", "sent", "paid", "cancelled"] as const).map(id => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all"
              style={{
                background: statusFilter === id ? "#fff" : "transparent",
                color: statusFilter === id ? "#0088CC" : "#64748b",
                boxShadow: statusFilter === id ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
              }}
            >
              {id === "all" ? "Все" : STATUS_LABELS[id].label} <span className="text-[10px] opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-[280px] ml-auto">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="№ счёта или клиент"
            className="pl-9 text-[13px]"
          />
        </div>

        <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#0088CC] hover:bg-[#0077B5]">
          <PlusCircle className="w-4 h-4" />
          Создать счёт
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50/60 border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              <th className="px-5 py-2.5">№</th>
              <th className="px-3 py-2.5">Контрагент</th>
              <th className="px-3 py-2.5">Период</th>
              <th className="px-3 py-2.5 text-right">Сумма</th>
              <th className="px-3 py-2.5 text-center">Статус</th>
              <th className="px-3 py-2.5 text-center">Создан</th>
              <th className="px-3 py-2.5 text-right w-[80px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(inv => {
              const s = STATUS_LABELS[inv.status];
              const agentName = inv.counterAgentName || counterAgentMap.get(inv.counterAgentId) || "?";
              return (
                <tr key={inv.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3 font-mono font-semibold">{inv.number}</td>
                  <td className="px-3 py-3">{agentName}</td>
                  <td className="px-3 py-3 text-[12px] text-gray-600">
                    {format(new Date(inv.periodStart), "d MMM", { locale: ru })} —{" "}
                    {format(new Date(inv.periodEnd), "d MMM yyyy", { locale: ru })}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold">{formatMoney(inv.totalAmount)}</td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: s.bg, color: s.color }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-[11px] text-gray-500">
                    {format(new Date(inv.createdAt), "d MMM", { locale: ru })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Открыть"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="px-5 py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <div className="text-[14px] font-semibold text-gray-700">
                      {invoices.length === 0 ? "Счетов пока нет" : "Ничего не найдено"}
                    </div>
                    <div className="text-[12px] text-gray-500 mt-1">
                      {invoices.length === 0
                        ? 'Нажмите «Создать счёт» — выберите контрагента и период.'
                        : "Попробуйте сменить фильтр или очистить поиск"}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5" />
              Создать счёт
            </DialogTitle>
            <DialogDescription>
              Выберите контрагента и период — система соберёт все завершённые мойки за этот период.
              Сначала можно посмотреть превью, потом сохранить.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm font-medium">Контрагент</Label>
              <Select
                value={createForm.counterAgentId}
                onValueChange={(v) => setCreateForm({ ...createForm, counterAgentId: v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Выберите..." />
                </SelectTrigger>
                <SelectContent>
                  {counterAgents.filter(c => !c.archived).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium">Период с</Label>
                <Input
                  type="date"
                  value={createForm.periodStart}
                  onChange={e => setCreateForm({ ...createForm, periodStart: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">по</Label>
                <Input
                  type="date"
                  value={createForm.periodEnd}
                  onChange={e => setCreateForm({ ...createForm, periodEnd: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Скидка % (опционально)</Label>
              <Input
                type="number"
                value={createForm.discountPercent}
                onChange={e => setCreateForm({ ...createForm, discountPercent: e.target.value })}
                placeholder="Например: 5"
                className="mt-1"
              />
            </div>

            {preview && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 space-y-1 text-sm">
                <div className="font-semibold text-emerald-900">📋 Preview за период:</div>
                <div className="grid grid-cols-2 gap-1 text-emerald-800">
                  <div>Моек:</div><div className="font-bold">{preview.washCount} шт</div>
                  <div>Подытог:</div><div className="font-bold">{formatMoney(preview.subtotal)}</div>
                  {preview.discountAmount > 0 && (
                    <>
                      <div>Скидка:</div><div className="text-rose-700">−{formatMoney(preview.discountAmount)}</div>
                    </>
                  )}
                  {preview.prepayments > 0 && (
                    <>
                      <div>Предоплаты:</div><div className="text-gray-600">−{formatMoney(preview.prepayments)}</div>
                    </>
                  )}
                  <div className="font-bold text-base">К оплате:</div>
                  <div className="font-bold text-base text-emerald-700">{formatMoney(preview.totalAmount)}</div>
                </div>
              </div>
            )}

            <div>
              <Label className="text-sm font-medium">Заметка (опц.)</Label>
              <Input
                value={createForm.notes}
                onChange={e => setCreateForm({ ...createForm, notes: e.target.value })}
                placeholder="Внутренняя заметка для счёта"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Отмена
            </Button>
            <Button variant="outline" onClick={loadPreview} disabled={creating || !createForm.counterAgentId}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-1.5" />}
              Превью
            </Button>
            <Button
              onClick={submitCreate}
              disabled={creating || !createForm.counterAgentId}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1.5" />}
              Создать черновик
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
