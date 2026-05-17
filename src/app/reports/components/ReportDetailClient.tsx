"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Archive, Trash2, Loader2, Printer, Edit3, Check, X,
  Brain, Calendar, Wand2,
} from "lucide-react";
import type { Report, ReportStatus } from "@/types";

interface Props {
  report: Report;
}

const STATUS_COLORS: Record<ReportStatus, { label: string; bg: string; fg: string }> = {
  draft:    { label: "📊 Активен",  bg: "#dcfce7", fg: "#15803d" },
  archived: { label: "📦 В архиве", bg: "#f1f5f9", fg: "#475569" },
};

export function ReportDetailClient({ report: initial }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [report, setReport] = React.useState<Report>(initial);
  const [titleEdit, setTitleEdit] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(report.title);
  const [notesEdit, setNotesEdit] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState(report.notes ?? "");
  const [archiveModal, setArchiveModal] = React.useState(false);
  const [deleteModal, setDeleteModal] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const status = STATUS_COLORS[report.status];

  async function saveTitle() {
    if (!titleDraft.trim()) {
      toast({ title: "Название не может быть пустым", variant: "destructive" });
      return;
    }
    if (titleDraft === report.title) {
      setTitleEdit(false);
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: titleDraft.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Не удалось обновить");
      setReport(data.report);
      setTitleEdit(false);
      toast({ title: "Название обновлено" });
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveNotes() {
    if (notesDraft === (report.notes ?? "")) {
      setNotesEdit(false);
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Не удалось обновить");
      setReport(data.report);
      setNotesEdit(false);
      toast({ title: "Заметка сохранена" });
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    setSubmitting(true);
    try {
      const action = report.status === "archived" ? "unarchive" : "archive";
      const r = await fetch(
        action === "archive"
          ? `/api/reports/${report.id}/archive`
          : `/api/reports/${report.id}`,
        action === "archive"
          ? { method: "POST" }
          : {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "draft" }),
            }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Не удалось");
      setReport(data.report);
      setArchiveModal(false);
      toast({ title: action === "archive" ? "В архив" : "Возвращён в активные" });
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось удалить");
      }
      toast({ title: "Отчёт удалён" });
      router.push("/reports");
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const isStandardPrompt = report.prompt === "Сгенерируй аналитический отчёт по производительности за указанный период.";

  return (
    <div className="space-y-4">
      {/* Header gradient */}
      <div
        className="rounded-xl text-white p-6 print:bg-white print:text-black print:border print:border-gray-300"
        style={{
          background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
        }}
      >
        <div className="flex items-start gap-4">
          <Link
            href="/reports"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-white/15 hover:bg-white/25 transition-colors flex-shrink-0 print:hidden"
            title="К списку"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-80 mb-1">
              <Brain className="w-3.5 h-3.5" /> AI-Отчёт
            </div>
            {titleEdit ? (
              <div className="flex items-center gap-2">
                <Input
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  className="text-2xl font-bold bg-white/10 border-white/30 text-white placeholder-white/50 h-auto py-1.5"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") { setTitleEdit(false); setTitleDraft(report.title); }
                  }}
                />
                <Button size="sm" variant="ghost" onClick={saveTitle} disabled={submitting} className="text-white hover:bg-white/20">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setTitleEdit(false); setTitleDraft(report.title); }} className="text-white hover:bg-white/20">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-bold">{report.title}</h1>
                <button
                  type="button"
                  onClick={() => setTitleEdit(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-white/80 hover:text-white print:hidden"
                  title="Изменить название"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          <span
            className="inline-block px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider flex-shrink-0"
            style={{ background: status.bg, color: status.fg }}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Meta grid */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-[13px]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Период
          </div>
          <div className="font-semibold text-slate-900">
            {format(new Date(report.periodStart), "d MMM yyyy", { locale: ru })}
          </div>
          <div className="text-[11px] text-slate-600">
            до {format(new Date(report.periodEnd), "d MMM yyyy", { locale: ru })}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Создан</div>
          <div className="font-semibold text-slate-900">
            {format(new Date(report.createdAt), "d MMM yyyy", { locale: ru })}
          </div>
          <div className="text-[11px] text-slate-600">
            {format(new Date(report.createdAt), "HH:mm")}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1 flex items-center gap-1">
            <Brain className="w-3 h-3" /> AI модель
          </div>
          <div className="font-semibold text-slate-900">
            {report.usage?.model ?? "—"}
          </div>
          {report.usage?.tokensIn && (
            <div className="text-[11px] text-slate-600">
              {report.usage.tokensIn}+{report.usage.tokensOut ?? 0} токенов
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Обновлён</div>
          <div className="font-semibold text-slate-900">
            {format(new Date(report.updatedAt), "d MMM HH:mm", { locale: ru })}
          </div>
        </div>
      </div>

      {/* Prompt */}
      {!isStandardPrompt && report.prompt && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-wider text-violet-700 font-bold mb-1 flex items-center gap-1">
            <Wand2 className="w-3 h-3" /> Вопрос к AI
          </div>
          <div className="text-[13px] text-violet-900 whitespace-pre-wrap">{report.prompt}</div>
        </div>
      )}

      {/* Markdown content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 print:border-0 print:p-0">
        <div className="report-markdown prose prose-sm md:prose-base max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {report.reportMarkdown}
          </ReactMarkdown>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            📝 Заметка (для себя)
          </Label>
          {!notesEdit && (
            <Button size="sm" variant="ghost" onClick={() => setNotesEdit(true)} className="h-7 text-xs print:hidden">
              <Edit3 className="w-3 h-3 mr-1" /> Изменить
            </Button>
          )}
        </div>
        {notesEdit ? (
          <div className="space-y-2">
            <Textarea
              value={notesDraft}
              onChange={e => setNotesDraft(e.target.value)}
              rows={3}
              placeholder="Например: «Обсудить с Костылевым в пятницу»"
              className="text-[13px]"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setNotesEdit(false); setNotesDraft(report.notes ?? ""); }}>
                Отмена
              </Button>
              <Button size="sm" onClick={saveNotes} disabled={submitting}>
                {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-slate-700 whitespace-pre-wrap min-h-[1.5em]">
            {report.notes || <span className="text-slate-400 italic">Нет заметок</span>}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" onClick={handlePrint} className="gap-2">
          <Printer className="w-4 h-4" />
          Печать / PDF
        </Button>
        <Button variant="outline" onClick={() => setArchiveModal(true)} disabled={submitting} className="gap-2">
          <Archive className="w-4 h-4" />
          {report.status === "archived" ? "Вернуть из архива" : "В архив"}
        </Button>
        <Button variant="outline" onClick={() => setDeleteModal(true)} disabled={submitting} className="ml-auto gap-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
          <Trash2 className="w-4 h-4" />
          Удалить
        </Button>
      </div>

      {/* Archive modal */}
      <Dialog open={archiveModal} onOpenChange={setArchiveModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {report.status === "archived" ? "Вернуть отчёт из архива?" : "В архив?"}
            </DialogTitle>
            <DialogDescription>
              {report.status === "archived"
                ? "Отчёт снова будет виден в списке активных."
                : "Отчёт исчезнет из списка активных, но останется в БД. Можно вернуть."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveModal(false)} disabled={submitting}>Отмена</Button>
            <Button onClick={handleArchive} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete modal */}
      <Dialog open={deleteModal} onOpenChange={setDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-rose-600">Удалить отчёт безвозвратно?</DialogTitle>
            <DialogDescription>
              Markdown «{report.title}» будет удалён из БД. Откатить нельзя.
              Если нужно временно скрыть — используйте «В архив».
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteModal(false)} disabled={submitting}>Отмена</Button>
            <Button onClick={handleDelete} disabled={submitting} className="bg-rose-600 hover:bg-rose-700">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Удалить навсегда"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
