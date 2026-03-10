
'use client';

import { useState } from 'react';
import { BrainCircuit, Loader2, Wand2, Calendar } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { generatePerformanceReport } from '@/ai/flows/generate-performance-report';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function AIReportGenerator() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      setError('Пожалуйста, выберите полный диапазон дат.');
      return;
    }

    setIsLoading(true);
    setReport(null);
    setError(null);

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
