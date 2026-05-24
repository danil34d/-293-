"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Banknote, Send, Trash2, Loader2, Printer, CheckCircle2, AlertTriangle } from "lucide-react";
import { HazardPill, CheckItem } from "@/components/admin";
import type { CounterAgent, Invoice, InvoiceStatus, InvoicePaidVia, OurCompany } from "@/types";

interface Props {
  invoice: Invoice;
  counterAgent: CounterAgent | null;
  /** Phase 57c: ИП-исполнитель счёта (наше юр.лицо). */
  ourCompany?: OurCompany | null;
}

const STATUS_COLORS: Record<InvoiceStatus, { label: string; bg: string; fg: string }> = {
  draft:     { label: "📝 Черновик",  bg: "#f1f5f9", fg: "#475569" },
  sent:      { label: "📨 Отправлен", bg: "#dbeafe", fg: "#1d4ed8" },
  paid:      { label: "✅ Оплачен",   bg: "#dcfce7", fg: "#15803d" },
  cancelled: { label: "❌ Отменён",   bg: "#fee2e2", fg: "#dc2626" },
};

function formatMoney(amount: number): string {
  return amount.toLocaleString("ru-RU") + " ₽";
}

export function InvoiceDetailClient({ invoice: initial, counterAgent, ourCompany }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [invoice, setInvoice] = React.useState<Invoice>(initial);
  const [sendModal, setSendModal] = React.useState(false);
  const [paidModal, setPaidModal] = React.useState(false);
  const [deleteModal, setDeleteModal] = React.useState(false);
  const [sendEmail, setSendEmail] = React.useState("");
  const [paidVia, setPaidVia] = React.useState<InvoicePaidVia>("transfer");
  const [paidCheck, setPaidCheck] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const status = STATUS_COLORS[invoice.status];

  async function handleSend() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendEmail ? { sentToEmail: sendEmail } : {}),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Не удалось отправить");
      setInvoice(data.invoice);
      toast({ title: "Помечен как отправленный", description: data.hint || "" });
      setSendModal(false);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePaid() {
    if (!paidCheck) return;
    setSubmitting(true);
    try {
      const r = await fetch(`/api/invoices/${invoice.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidVia }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Не удалось отметить");
      setInvoice(data.invoice);
      toast({ title: "Счёт оплачен ✅", description: `${invoice.number} — ${formatMoney(invoice.totalAmount)}` });
      setPaidModal(false);
      setPaidCheck(false);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось удалить");
      }
      toast({ title: "Счёт удалён" });
      router.push("/invoices");
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  const items = invoice.items;
  const [detailsOpen, setDetailsOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-[13px] text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> К списку счетов
        </Link>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-3.5 h-3.5 mr-1.5" /> Печать
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
        <div
          className="px-9 py-7 text-white"
          style={{
            background: "linear-gradient(135deg, #0088CC 0%, #00B4E0 100%)",
          }}
        >
          <div className="flex justify-between items-start gap-6">
            <div>
              <div className="text-[11px] uppercase tracking-wider opacity-85">Счёт на оплату</div>
              <div className="text-[28px] font-bold mt-1 leading-tight">№ {invoice.number}</div>
              <div className="text-[13px] opacity-90 mt-2">
                от {format(new Date(invoice.createdAt), "d MMMM yyyy", { locale: ru })} г.
              </div>
            </div>
            <div className="text-right">
              <span
                className="inline-block px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                {status.label}
              </span>
              <div className="text-[11px] opacity-80 mt-2">
                Период: {format(new Date(invoice.periodStart), "d MMM", { locale: ru })} —{" "}
                {format(new Date(invoice.periodEnd), "d MMM yyyy", { locale: ru })}
              </div>
            </div>
          </div>
        </div>

        <div className="px-9 py-7">
          <div className="grid grid-cols-2 gap-6 p-5 bg-gray-50 rounded-lg mb-6">
            <div>
              <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Исполнитель</div>
              {/* Phase 57c: динамические реквизиты ИП из БД (вместо hardcoded). */}
              <div className="text-sm mt-1 font-semibold">
                {ourCompany?.fullName || ourCompany?.shortName || "ИП Абанин Даниил Олегович"}
                {ourCompany?.isPrimary && <span className="ml-1.5 text-amber-600">⭐</span>}
              </div>
              <div className="text-[12px] text-gray-600 mt-1">
                {ourCompany?.inn ? `ИНН ${ourCompany.inn}` : "ИНН 333801382869"}
                {ourCompany?.ogrn ? <> · ОГРН {ourCompany.ogrn}</> : null}
              </div>
              {ourCompany?.bankName && (
                <div className="text-[11px] text-gray-500 mt-1 leading-snug">
                  {ourCompany.bankName}
                  {ourCompany.settlementAccount ? <><br/>р/с {ourCompany.settlementAccount}</> : null}
                  {ourCompany.bik ? <> · БИК {ourCompany.bik}</> : null}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Заказчик</div>
              <div className="text-sm mt-1 font-semibold">{counterAgent?.name || invoice.counterAgentName || "?"}</div>
              <div className="text-[12px] text-gray-600 mt-1">
                {counterAgent?.companies?.[0]?.inn ? `ИНН ${counterAgent.companies[0].inn}` : ""}
              </div>
            </div>
          </div>

          <div className="text-sm font-bold mb-3 flex items-center gap-2">
            📊 Итог по услугам{" "}
            <span className="text-[11px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold">
              {items.services.length} услуг
            </span>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-2 py-2.5 text-left text-[10px] uppercase font-bold text-gray-500 tracking-wider">Услуга</th>
                <th className="px-2 py-2.5 text-right text-[10px] uppercase font-bold text-gray-500 tracking-wider w-[80px]">Кол-во</th>
                <th className="px-2 py-2.5 text-right text-[10px] uppercase font-bold text-gray-500 tracking-wider w-[100px]">Цена/шт</th>
                <th className="px-2 py-2.5 text-right text-[10px] uppercase font-bold text-gray-500 tracking-wider w-[110px]">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {items.services.map((s, i) => (
                <tr key={i} className="bg-sky-50/30 border-b border-gray-100">
                  <td className="px-2 py-2.5 font-medium">{s.name}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-[#0088CC] font-semibold">{s.qty} шт</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatMoney(s.pricePerUnit)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-bold">{formatMoney(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="mt-3 p-3 bg-gray-50 rounded-md border-l-[3px] border-slate-400" open={detailsOpen}>
            <summary
              className="cursor-pointer font-semibold text-[13px] text-slate-700 py-1 select-none"
              onClick={(e) => { e.preventDefault(); setDetailsOpen(!detailsOpen); }}
            >
              📋 Детализация по машинам ({items.washes.length} {items.washes.length === 1 ? "мойка" : "моек"}) {detailsOpen ? "— скрыть" : "— раскрыть"}
            </summary>
            {detailsOpen && (
              <table className="w-full text-xs mt-2 border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-bold text-gray-600 w-[90px]">Дата</th>
                    <th className="px-2 py-1.5 text-left font-bold text-gray-600 w-[110px]">Номер</th>
                    <th className="px-2 py-1.5 text-left font-bold text-gray-600">Что мыли</th>
                    <th className="px-2 py-1.5 text-right font-bold text-gray-600 w-[80px]">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {items.washes.map(w => (
                    <tr key={w.id} className="border-b border-gray-200">
                      <td className="px-2 py-1.5 tabular-nums">
                        {format(new Date(w.date), "d MMM HH:mm", { locale: ru })}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[11px] font-bold">
                          {w.plate}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-[11px]">{w.services}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{formatMoney(w.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </details>

          <div
            className="mt-5 p-5 rounded-lg space-y-1"
            style={{ background: "#ecfdf5", borderLeft: "4px solid #10b981" }}
          >
            <div className="flex justify-between text-sm">
              <span>Подытог:</span><span className="tabular-nums">{formatMoney(invoice.subtotal)}</span>
            </div>
            {(invoice.discountAmount ?? 0) > 0 && (
              <div className="flex justify-between text-sm">
                <span>Скидка ({invoice.discountPercent}%):</span>
                <span className="tabular-nums text-rose-700">−{formatMoney(invoice.discountAmount ?? 0)}</span>
              </div>
            )}
            {(invoice.prepayments ?? 0) > 0 && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>Учтённые предоплаты:</span>
                <span className="tabular-nums">−{formatMoney(invoice.prepayments ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-3 mt-2 border-t-2 border-emerald-200 text-emerald-700">
              <span>К ОПЛАТЕ:</span><span className="tabular-nums">{formatMoney(invoice.totalAmount)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-4 p-3 bg-amber-50 rounded-md text-[12px] text-amber-900">
              💡 <strong>Заметка:</strong> {invoice.notes}
            </div>
          )}

          {invoice.status === "sent" && invoice.sentAt && (
            <div className="mt-4 p-3 bg-blue-50 rounded-md text-[12px] text-blue-900">
              📨 Отправлен {format(new Date(invoice.sentAt), "d MMM yyyy 'в' HH:mm", { locale: ru })}
              {invoice.sentToEmail && <> на <code>{invoice.sentToEmail}</code></>}
            </div>
          )}

          {invoice.status === "paid" && invoice.paidAt && (
            <div className="mt-4 p-3 bg-green-50 rounded-md text-[12px] text-green-900">
              ✅ Оплачен {format(new Date(invoice.paidAt), "d MMM yyyy 'в' HH:mm", { locale: ru })}
              {invoice.paidVia && <> ({invoice.paidVia === "cash" ? "наличные" : invoice.paidVia === "card" ? "карта" : "перевод"})</>}
            </div>
          )}
        </div>

        <div className="px-9 py-4 bg-gray-50 border-t border-gray-200 flex flex-wrap gap-2 justify-end">
          {invoice.status === "draft" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setDeleteModal(true)} className="text-rose-700 border-rose-300 hover:bg-rose-50">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Удалить черновик
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSendModal(true)}>
                <Send className="w-3.5 h-3.5 mr-1.5" /> Отметить отправленным
              </Button>
              <Button size="sm" onClick={() => setPaidModal(true)} className="bg-emerald-600 hover:bg-emerald-700">
                <Banknote className="w-3.5 h-3.5 mr-1.5" /> Сразу отметить оплачен
              </Button>
            </>
          )}
          {invoice.status === "sent" && (
            <Button size="sm" onClick={() => setPaidModal(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Banknote className="w-3.5 h-3.5 mr-1.5" /> Отметить оплачен
            </Button>
          )}
          {(invoice.status === "paid" || invoice.status === "cancelled") && (
            <span className="text-[12px] text-gray-500 px-3 py-1.5">Финальный статус — действия недоступны</span>
          )}
        </div>
      </div>

      <Dialog open={sendModal} onOpenChange={setSendModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отправить счёт</DialogTitle>
            <DialogDescription>
              Email-отправка пока не реализована — это пометка для аудита. Введи email если хочешь сохранить адрес.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Email клиента (опционально)</Label>
            <Input
              type="email"
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
              placeholder="accountant@client.ru"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModal(false)} disabled={submitting}>Отмена</Button>
            <Button onClick={handleSend} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Пометить отправленным
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paidModal} onOpenChange={(o) => { setPaidModal(o); if (!o) setPaidCheck(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Banknote className="w-5 h-5" /> Отметить оплачен
              <HazardPill level="safe">{formatMoney(invoice.totalAmount)}</HazardPill>
            </DialogTitle>
            <DialogDescription>
              Подтверди что счёт <b>{invoice.number}</b> на сумму <b>{formatMoney(invoice.totalAmount)}</b> получен от
              <b> {counterAgent?.name || invoice.counterAgentName}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Способ оплаты</Label>
              <Select value={paidVia} onValueChange={(v) => setPaidVia(v as InvoicePaidVia)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Банковский перевод</SelectItem>
                  <SelectItem value="card">Карта</SelectItem>
                  <SelectItem value="cash">Наличные</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CheckItem
              checked={paidCheck}
              onCheck={setPaidCheck}
              icon="check"
              title="Деньги получены"
              desc="После подтверждения счёт перейдёт в статус 'paid' (нельзя редактировать, нельзя удалить)"
              level="safe"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidModal(false)} disabled={submitting}>Отмена</Button>
            <Button onClick={handlePaid} disabled={!paidCheck || submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5" />}
              Подтвердить оплату
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteModal} onOpenChange={setDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="w-5 h-5" /> Удалить черновик?
            </DialogTitle>
            <DialogDescription>
              Счёт <b>{invoice.number}</b> будет удалён безвозвратно. Можно создать заново через «Создать счёт».
              Это безопасно — статус draft, никаких side-effects.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModal(false)} disabled={submitting}>Отмена</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1.5" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
