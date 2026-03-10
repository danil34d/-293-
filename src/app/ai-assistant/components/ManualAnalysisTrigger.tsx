'use client';

import { useState } from 'react';
import { Play, Loader, Download, X, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AnalysisResult {
  id: string;
  type: string;
  status: string;
  result_data?: any;
  created_at: number;
}

export default function ManualAnalysisTrigger() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [showResults, setShowResults] = useState(false);

  async function triggerAnalysis(type: 'daily_summary' | 'employee_performance' | 'anomaly_detection') {
    setLoading(true);
    setMessage('⏳ Запуск анализа...');
    setShowResults(false);

    try {
      // Запуск анализа
      const response = await fetch('/api/ai-assistant/background-analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      const data = await response.json();

      if (!data.success) {
        setMessage(`❌ Ошибка: ${data.error}`);
        setLoading(false);
        return;
      }

      setMessage('⏳ Анализ выполняется... (может занять до 30 секунд)');

      // Ждём завершения анализа (проверяем каждую секунду)
      let attempts = 0;
      const maxAttempts = 40; // 40 секунд

      const checkInterval = setInterval(async () => {
        attempts++;

        if (attempts > maxAttempts) {
          clearInterval(checkInterval);
          setMessage('⚠️ Анализ занял слишком много времени. Проверьте панель уведомлений.');
          setLoading(false);
          return;
        }

        // Получаем последний завершённый анализ этого типа
        const analysesRes = await fetch(`/api/ai-assistant/background-analyses?status=completed&limit=1`);
        const analysesData = await analysesRes.json();

        if (analysesData.success && analysesData.data.length > 0) {
          const latestAnalysis = analysesData.data[0];

          // Проверяем что это наш анализ (по типу и времени - в пределах 45 секунд)
          if (latestAnalysis.type === type &&
              Date.now() - latestAnalysis.created_at < 45000) {
            clearInterval(checkInterval);
            setCurrentAnalysis(latestAnalysis);
            setMessage('✅ Анализ завершён!');
            setShowResults(true);
            setLoading(false);
          }
        }
      }, 1000);

    } catch (error: any) {
      setMessage(`❌ Ошибка: ${error.message}`);
      setLoading(false);
    }
  }

  async function downloadReport(format: 'pdf' | 'docx') {
    if (!currentAnalysis) return;

    setMessage('⏳ Генерация отчёта...');

    try {
      const response = await fetch('/api/ai-assistant/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'analysis',
          format,
          analysisId: currentAnalysis.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const link = document.createElement('a');
        link.href = data.data.downloadUrl;
        link.download = `analysis_${currentAnalysis.type}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setMessage(`✅ Отчёт ${format.toUpperCase()} скачан`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage(`❌ Ошибка: ${data.error}`);
      }
    } catch (error: any) {
      setMessage(`❌ Ошибка: ${error.message}`);
    }
  }

  function getAnalysisName(type: string) {
    switch (type) {
      case 'daily_summary':
        return 'Ежедневный отчёт';
      case 'employee_performance':
        return 'Анализ производительности';
      case 'anomaly_detection':
        return 'Обнаружение аномалий';
      default:
        return type;
    }
  }

  function renderAnalysisContent() {
    if (!currentAnalysis?.result_data) return null;

    const data = typeof currentAnalysis.result_data === 'string'
      ? JSON.parse(currentAnalysis.result_data)
      : currentAnalysis.result_data;

    return (
      <div className="analysis-results">
        {data.summary && (
          <div className="result-section">
            <h4>📊 Сводка</h4>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.summary}</ReactMarkdown>
          </div>
        )}

        {data.analysis && (
          <div className="result-section">
            <h4>📈 Анализ</h4>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.analysis}</ReactMarkdown>
          </div>
        )}

        {data.anomalies && (
          <div className="result-section">
            <h4>⚠️ Обнаруженные аномалии</h4>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.anomalies}</ReactMarkdown>
          </div>
        )}

        {data.revenue && (
          <div className="result-section">
            <h4>💰 Данные по выручке</h4>
            <div className="stats-grid">
              <div className="stat-item">
                <span className="stat-label">Общая выручка:</span>
                <span className="stat-value">{data.revenue.totalRevenue?.toFixed(2) || 'N/A'} руб</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Количество моек:</span>
                <span className="stat-value">{data.revenue.totalWashes || 'N/A'}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Средний чек:</span>
                <span className="stat-value">{data.revenue.averageCheck?.toFixed(2) || 'N/A'} руб</span>
              </div>
            </div>
          </div>
        )}

        {data.employees && Array.isArray(data.employees) && data.employees.length > 0 && (
          <div className="result-section">
            <h4>👥 Топ сотрудников</h4>
            <div className="employees-list">
              {data.employees.slice(0, 5).map((emp: any, idx: number) => (
                <div key={idx} className="employee-item">
                  <span className="employee-rank">#{idx + 1}</span>
                  <span className="employee-name">{emp.name}</span>
                  <span className="employee-stats">
                    {emp.washes} моек • {emp.revenue?.toFixed(0)} руб
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <details open>
        <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '8px' }}>
          🔧 Тестирование фонового анализа
        </summary>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          <button
            className="trigger-analysis-button"
            onClick={() => triggerAnalysis('daily_summary')}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Ежедневный отчёт</span>
          </button>

          <button
            className="trigger-analysis-button"
            onClick={() => triggerAnalysis('employee_performance')}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Производительность</span>
          </button>

          <button
            className="trigger-analysis-button"
            onClick={() => triggerAnalysis('anomaly_detection')}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>Аномалии</span>
          </button>
        </div>

        {message && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            fontSize: '13px',
            color: message.startsWith('✅') ? '#51cf66' : message.startsWith('❌') ? '#fa5252' : '#228be6',
            background: message.startsWith('✅') ? '#f1f9f1' : message.startsWith('❌') ? '#fff5f5' : '#e7f5ff',
            borderRadius: '8px',
            border: `1px solid ${message.startsWith('✅') ? '#51cf66' : message.startsWith('❌') ? '#fa5252' : '#228be6'}`
          }}>
            {message}
          </div>
        )}
      </details>

      {/* Модальное окно с результатами */}
      {showResults && currentAnalysis && (
        <div className="analysis-modal-overlay" onClick={() => setShowResults(false)}>
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{getAnalysisName(currentAnalysis.type)}</h3>
                <p className="modal-subtitle">
                  {new Date(currentAnalysis.created_at).toLocaleString('ru-RU')}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => setShowResults(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-content">
              {renderAnalysisContent()}
            </div>

            <div className="modal-footer">
              {/* PDF temporarily disabled due to font issues in Next.js
              <button
                className="download-btn"
                onClick={() => downloadReport('pdf')}
              >
                <Download className="w-4 h-4" />
                Скачать PDF
              </button>
              */}
              <button
                className="download-btn"
                onClick={() => downloadReport('docx')}
              >
                <Download className="w-4 h-4" />
                Скачать DOCX
              </button>
              <button
                className="close-btn"
                onClick={() => setShowResults(false)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .analysis-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .analysis-modal {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        }

        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #e9ecef;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .modal-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #212529;
        }

        .modal-subtitle {
          margin: 4px 0 0 0;
          font-size: 13px;
          color: #868e96;
        }

        .modal-close {
          background: none;
          border: none;
          color: #868e96;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .modal-close:hover {
          background: #f1f3f5;
          color: #212529;
        }

        .modal-content {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }

        .analysis-results {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .result-section {
          background: #f8f9fa;
          padding: 16px;
          border-radius: 8px;
          border-left: 4px solid #228be6;
        }

        .result-section h4 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: #212529;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }

        .stat-item {
          background: white;
          padding: 12px;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .stat-label {
          font-size: 12px;
          color: #868e96;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          color: #228be6;
        }

        .employees-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .employee-item {
          background: white;
          padding: 12px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .employee-rank {
          font-weight: 700;
          color: #228be6;
          font-size: 16px;
        }

        .employee-name {
          flex: 1;
          font-weight: 500;
        }

        .employee-stats {
          font-size: 13px;
          color: #868e96;
        }

        .modal-footer {
          padding: 16px 24px;
          border-top: 1px solid #e9ecef;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .download-btn {
          padding: 10px 16px;
          background: #228be6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.2s;
        }

        .download-btn:hover {
          background: #1c7ed6;
        }

        .close-btn {
          padding: 10px 16px;
          background: #f1f3f5;
          color: #495057;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s;
        }

        .close-btn:hover {
          background: #e9ecef;
        }
      `}</style>
    </div>
  );
}
