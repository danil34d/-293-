"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Loader2, PlusCircle, Search, BrainCircuit, Eye, Calendar as CalendarIcon,
  Archive, FileText, Wand2,
} from "lucide-react";
import { SafetyBar } from "@/components/admin";
import type { Report, ReportStatus } from "@/types";

interface Props {
  initialReports: Report[];
}

const STATUS_LABELS: Record<ReportStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Активен", color: "#15803d", bg: "#dcfce7" },
  archived: { label: "В архиве", color: "#64748b", bg: "#f1f5f9" },
};

export function ReportsListClient({ initialReports }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [reports, setReports] = React.useState<Report[]>(initialReports);
  const [statusFilter, setStatusFilter] = React.useState<"all" | ReportStatus>("draft");
  const [search, setSearch] = React.useState("");

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createForm, setCreateForm] = React.useState({
    periodStart: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    periodEnd: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    question: "",
    title: "",
  });
  const [creating, setCreating] = React.useState(false);

  const filtered = React.useMemo(() => {
    return reports.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!r.title.toLowerCase().includes(s) && !r.prompt.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [reports, statusFilter, search]);

  const counts = React.useMemo(() => ({
    all: reports.length,
    draft: reports.filter(r => r.status === "draft").length,
    archived: reports.filter(r => r.status === "archived").length,
  }), [reports]);

  async function submitCreate() {
    setCreating(true);
    try {
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodStart: createForm.periodStart,
          periodEnd: createForm.periodEnd,
          question: createForm.question || undefined,
          title: createForm.title || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Создание не удалось");
      toast({ title: "Отчёт создан", description: data.report.title });
      setCreateOpen(false);
      setCreateForm({ ...createForm, question: "", title: "" });
      router.push(`/reports/${data.report.id}`);
    } catch (err: any) {
      toast({ title: "Ошибка создания", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <SafetyBar
        level="info"
        items={[
          { icon: "file-text", label: "Всего отчётов", value: `${counts.all}` },
          { icon: "edit-3", label: "Активные", value: counts.draft > 0 ? `${counts.draft}` : "—" },
          { icon: "archive", label: "В архиве", value: counts.archived > 0 ? `${counts.archived}` : "—" },
          { icon: "brain", label: "Модель", value: "Gemini 1.5 Flash" },
        ]}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(["draft", "all", "archived"] as const).map(id => (
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

        <div className="relative flex-1 max-w-[320px] ml-auto">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Название или вопрос"
            className="pl-9 text-[13px]"
          />
        </div>

        <Button onClick={() => setCreateOpen(true)} className="gap-2 bg-[#0088CC] hover:bg-[#0077B5]">
          <BrainCircuit className="w-4 h-4" />
          Создать отчёт
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-50/60 border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-500 font-bold">
              <th className="px-5 py-2.5">Название</th>
              <th className="px-3 py-2.5">Период</th>
              <th className="px-3 py-2.5 text-center">Статус</th>
              <th className="px-3 py-2.5 text-center">Создан</th>
              <th className="px-3 py-2.5 text-right w-[80px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(rep => {
              const s = STATUS_LABELS[rep.status];
              return (
                <tr key={rep.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-semibold text-slate-900">{rep.title}</div>
                    {rep.prompt && rep.prompt !== "Сгенерируй аналитический отчёт по производительности за указанный период." && (
                      <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1" title={rep.prompt}>
                        💬 {rep.prompt}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-gray-600">
                    {format(new Date(rep.periodStart), "d MMM", { locale: ru })} —{" "}
                    {format(new Date(rep.periodEnd), "d MMM yyyy", { locale: ru })}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                      style={{ background: s.bg, color: s.color }}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center text-[11px] text-gray-500">
                    {format(new Date(rep.createdAt), "d MMM", { locale: ru })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/reports/${rep.id}`}
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
                <td colSpan={5}>
                  <div className="px-5 py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <div className="text-[14px] font-semibold text-gray-700">
                      {reports.length === 0 ? "Отчётов пока нет" : "Ничего не найдено"}
                    </div>
                    <div className="text-[12px] text-gray-500 mt-1">
                      {reports.length === 0
                        ? 'Нажмите «Создать отчёт» — AI сгенерирует и сохранит.'
                        : "Попробуйте сменить фильтр или очистить поиск"}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5" />
              Создать AI-отчёт
            </DialogTitle>
            <DialogDescription>
              AI проанализирует данные за указанный период (мойки, сотрудники, расходы) и сгенерирует
              структурированный отчёт. Сохранение в БД с автогенерацией названия.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
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
              <Label className="text-sm font-medium">Название (опц.)</Label>
              <Input
                value={createForm.title}
                onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                placeholder="Если пусто — автогенерация (напр. «Отчёт за май 2026»)"
                className="mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Вопрос к AI (опц.)</Label>
              <Textarea
                value={createForm.question}
                onChange={e => setCreateForm({ ...createForm, question: e.target.value })}
                placeholder="Например: «Какие сотрудники самые продуктивные? Какие проблемы выявил?» Если пусто — будет стандартный отчёт по производительности."
                rows={3}
                className="mt-1 text-[13px]"
              />
              <div className="text-[10px] text-slate-500 mt-1">
                AI получит данные за период + ваш вопрос, вернёт структурированный markdown.
              </div>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-[12px] text-blue-900">
              ⏱ Генерация ~10-30 сек. После сохранения откроется страница отчёта.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Отмена
            </Button>
            <Button
              onClick={submitCreate}
              disabled={creating}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? (
                <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> AI анализирует…</>
              ) : (
                <><BrainCircuit className="w-4 h-4 mr-1.5" /> Сгенерировать и сохранить</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
