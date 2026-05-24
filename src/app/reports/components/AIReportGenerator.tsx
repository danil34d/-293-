
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrainCircuit, Loader2, Wand2, Calendar, Save, Check } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { generatePerformanceReport } from '@/ai/flows/generate-performance-report';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from '@/hooks/use-toast';

export function AIReportGenerator() {
  const router = useRouter();
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleGenerateReport = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      setError('Пожалуйста, выберите полный диапазон дат.');
      return;
    }

    setIsLoading(true);
    setReport(null);
    setError(null);
    setSaved(false);

    try {
      const result = await generatePerformanceReport({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        question: 'Сгенерируй аналитический отчет по производительности за указанный период.'
      });
      setReport(result.reportMarkdown);
    } catch (err: any) {
      console.error('Failed to generate AI report:', err);
      setError('Не удалось сгенерировать отчет. Попробуйте изменить период или повторить попытку позже. Проверьте, что вы добавили свой Gemini API Key в файл .env');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveReport = async () => {
    if (!dateRange?.from || !dateRange?.to) return;
    setIsSaving(true);
    try {
      const r = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: dateRange.from.toISOString(),
          periodEnd: dateRange.to.toISOString(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Не удалось сохранить');
      setSaved(true);
      toast({ title: 'Отчёт сохранён', description: data.report.title });
      setTimeout(() => router.push(`/reports/${data.report.id}`), 800);
    } catch (err: any) {
      toast({ title: 'Ошибка сохранения', description: err.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const formatDateRange = () => {
    if (!dateRange?.from) return 'Выберите даты';
    if (!dateRange?.to) return `${format(dateRange.from, 'dd.MM.yyyy')} - ...`;
    return `${format(dateRange.from, 'dd.MM.yyyy')} - ${format(dateRange.to, 'dd.MM.yyyy')}`;
  };

  return (
    <div className="ai-report-generator">
      <div className="report-config-card">
        <div className="config-header">
          <h3 className="config-title">
            <Wand2 size={20} />
            Параметры отчета
          </h3>
        </div>
        <div className="config-content">
          <div className="config-controls">
            <div className="date-range-picker">
              <div className="date-range-input">
                <Calendar size={16} className="date-range-icon" />
                <span>{formatDateRange()}</span>
              </div>
            </div>
            <button
              className="generate-button"
              onClick={handleGenerateReport}
              disabled={isLoading || !dateRange?.from}
            >
              {isLoading ? (
                <Loader2 size={16} className="spinner" />
              ) : (
                <BrainCircuit size={16} className="icon" />
              )}
              {isLoading ? 'Анализ данных...' : 'Сгенерировать отчет'}
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="loading-state">
          <Loader2 size={40} className="loading-spinner" />
          <p className="loading-title">AI анализирует данные...</p>
          <p className="loading-subtitle">Это может занять до 30 секунд.</p>
        </div>
      )}

      {error && (
         <div className="alert error">
            <div className="alert-title">Ошибка</div>
            <div className="alert-description">{error}</div>
         </div>
      )}

      {report && (
        <div className="report-display-card">
          <div className="report-content">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
              <div className="text-[12px] text-slate-600">
                💡 Это preview — не сохранён в БД. Чтобы вернуться к этому отчёту позже, сохраните его.
              </div>
              {saved ? (
                <button
                  className="generate-button flex items-center gap-1.5 bg-emerald-600"
                  disabled
                >
                  <Check size={16} /> Сохранён, открываю…
                </button>
              ) : (
                <button
                  className="generate-button flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleSaveReport}
                  disabled={isSaving}
                  title="Сохранить отчёт в БД для последующего просмотра"
                >
                  {isSaving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
                  {isSaving ? 'Сохраняю…' : 'Сохранить в БД'}
                </button>
              )}
            </div>
            <div className="report-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
