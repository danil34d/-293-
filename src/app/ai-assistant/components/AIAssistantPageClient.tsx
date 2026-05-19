'use client';

import { useEffect, useState } from 'react';
import { AIAssistantClient } from './AIAssistantClient';
import BackgroundAnalysisPanel from './BackgroundAnalysisPanel';
import ManualAnalysisTrigger from './ManualAnalysisTrigger';
import type { BackgroundAnalysis } from '@/types/ai-assistant';
import ReactMarkdown from 'react-markdown';
import { CheckCircle2, Download, KeyRound, Save, Trash2, X } from 'lucide-react';
import PlanimumImportCard from './PlanimumImportCard';
import { RateLimitBar, SecurityBanner, HeaderPill } from './AIChatV2Extras';

export default function AIAssistantPageClient() {
  const [selectedAnalysis, setSelectedAnalysis] = useState<BackgroundAnalysis | null>(null);
  const [glmApiKey, setGlmApiKey] = useState('');
  const [glmApiKeySet, setGlmApiKeySet] = useState(false);
  const [keySource, setKeySource] = useState<'env' | 'db' | 'none'>('none');
  const [keySourceWarning, setKeySourceWarning] = useState<string | null>(null);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadKeyStatus() {
      try {
        const response = await fetch('/api/ai-assistant/settings');
        const data = await response.json();
        setGlmApiKeySet(!!data.glmApiKeySet);
        setKeySource(data.keySource ?? 'none');
        setKeySourceWarning(data.keySourceWarning ?? null);
      } catch (error) {
        setKeyMessage('Не удалось загрузить статус API ключа.');
      }
    }

    loadKeyStatus();
  }, []);

  function handleAnalysisClick(analysis: BackgroundAnalysis) {
    setSelectedAnalysis(analysis);
  }

  function closeModal() {
    setSelectedAnalysis(null);
  }

  async function saveApiKey() {
    setIsSavingKey(true);
    setKeyMessage(null);
    try {
      const response = await fetch('/api/ai-assistant/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glmApiKey }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка сохранения');
      setGlmApiKeySet(!!data.glmApiKeySet);
      setKeySource(data.keySource ?? 'none');
      // Phase 19: показываем warnings из backend если есть
      const warnText = Array.isArray(data.warnings) && data.warnings.length > 0
        ? data.warnings.join(' · ')
        : null;
      if (warnText) {
        setKeyMessage(warnText);
        setKeySourceWarning(warnText);
      } else {
        setKeyMessage(data.glmApiKeySet ? 'Ключ сохранен' : 'Ключ удален');
      }
      if (data.glmApiKeySet) setGlmApiKey('');
    } catch (error: any) {
      setKeyMessage(error.message || 'Ошибка сохранения');
    } finally {
      setIsSavingKey(false);
    }
  }

  async function downloadReport(format: 'pdf' | 'docx') {
    if (!selectedAnalysis) return;

    try {
      const response = await fetch('/api/ai-assistant/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'analysis',
          format,
          analysisId: selectedAnalysis.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const link = document.createElement('a');
        link.href = data.data.downloadUrl;
        link.download = `analysis_${selectedAnalysis.type}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`);
    }
  }

  function getAnalysisTitle(type: string): string {
    switch (type) {
      case 'daily_summary':
        return 'Ежедневный отчёт';
      case 'employee_performance':
        return 'Анализ производительности сотрудников';
      case 'anomaly_detection':
        return 'Обнаружение аномалий';
      default:
        return 'Анализ';
    }
  }

  function renderAnalysisContent() {
    if (!selectedAnalysis || !selectedAnalysis.result_data) {
      return <p>Нет данных для отображения</p>;
    }

    let data;
    try {
      data = typeof selectedAnalysis.result_data === 'string'
        ? JSON.parse(selectedAnalysis.result_data)
        : selectedAnalysis.result_data;
    } catch {
      return <p>Ошибка при разборе данных анализа</p>;
    }

    return (
      <div className="analysis-results">
        {data.summary && (
          <div className="result-section">
            <h3>Сводка</h3>
            <ReactMarkdown>{data.summary}</ReactMarkdown>
          </div>
        )}

        {data.analysis && (
          <div className="result-section">
            <h3>Анализ</h3>
            <ReactMarkdown>{data.analysis}</ReactMarkdown>
          </div>
        )}

        {data.anomalies && (
          <div className="result-section">
            <h3>Аномалии</h3>
            <ReactMarkdown>{data.anomalies}</ReactMarkdown>
          </div>
        )}

        {data.revenue && (
          <div className="result-section">
            <h3>Статистика выручки</h3>
            <ul>
              <li>Общая выручка: {data.revenue.totalRevenue?.toFixed(2) || 0} руб</li>
              <li>Количество моек: {data.revenue.totalWashes || 0}</li>
              <li>Средний чек: {data.revenue.averageCheck?.toFixed(2) || 0} руб</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ai-assistant-page">
      {/* Phase 37 / V2-#24: V2 header pill + rate-limit bar */}
      <div className="page-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <HeaderPill />
          <h1 style={{ marginTop: 4 }}>AI Помощник</h1>
          <p>Интеллектуальный анализ и прогнозирование для вашей автомойки</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <RateLimitBar />
          <BackgroundAnalysisPanel onAnalysisClick={handleAnalysisClick} />
        </div>
      </div>

      {/* Phase 37 / V2-#24: Security banner */}
      <div style={{ marginTop: 12 }}>
        <SecurityBanner />
      </div>

      <div className="ai-keys-card">
        <div className="ai-keys-header">
          <div className="ai-keys-title">
            <KeyRound className="w-4 h-4" />
            API ключ (ProxyAPI.ru)
          </div>
          {glmApiKeySet && (
            <div className="ai-keys-status">
              <CheckCircle2 className="w-4 h-4" />
              Ключ установлен
              {keySource === 'env' && (
                <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 700 }}>
                  ENV (защищён)
                </span>
              )}
              {keySource === 'db' && (
                <span style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700 }}>
                  SQLite (plain text)
                </span>
              )}
            </div>
          )}
        </div>
        {/* Phase 19 / finding #5: warning о хранении ключа */}
        {keySourceWarning && (
          <div style={{
            marginTop: 8, marginBottom: 8, padding: '8px 12px',
            background: keySource === 'db' ? '#fffbeb' : '#fef2f2',
            border: `1px solid ${keySource === 'db' ? '#fde68a' : '#fecaca'}`,
            borderRadius: 6, fontSize: 12, color: keySource === 'db' ? '#92400e' : '#991b1b'
          }}>
            ⚠ {keySourceWarning}
          </div>
        )}
        <div className="ai-keys-body">
          <input
            className="ai-keys-input"
            type="password"
            placeholder={keySource === 'env' ? 'env GLM_API_KEY активен — ввод заблокирован' : 'Вставьте API ключ с proxyapi.ru'}
            value={glmApiKey}
            onChange={(e) => setGlmApiKey(e.target.value)}
            disabled={keySource === 'env'}
          />
          <button
            className="ai-keys-btn"
            onClick={saveApiKey}
            disabled={isSavingKey || !glmApiKey.trim() || keySource === 'env'}
          >
            <Save className="w-4 h-4" />
            Сохранить
          </button>
          <button
            className="ai-keys-btn danger"
            onClick={() => { setGlmApiKey(''); saveApiKey(); }}
            disabled={isSavingKey || keySource === 'env'}
          >
            <Trash2 className="w-4 h-4" />
            Удалить
          </button>
          {keyMessage && <span className="ai-keys-message">{keyMessage}</span>}
        </div>
        <div className="ai-keys-hint">
          Получите ключ на <a href="https://proxyapi.ru" target="_blank" rel="noopener noreferrer" style={{color: '#3b82f6', textDecoration: 'underline'}}>proxyapi.ru</a>. Используется модель GPT-4o-mini (OpenAI). Ключ хранится локально.
        </div>
      </div>

      <PlanimumImportCard />
      <ManualAnalysisTrigger />
      <AIAssistantClient />

      {/* Analysis Modal */}
      {selectedAnalysis && (
        <div className="analysis-modal-overlay" onClick={closeModal}>
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{getAnalysisTitle(selectedAnalysis.type)}</h2>
              <button className="modal-close" onClick={closeModal}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-content">
              {renderAnalysisContent()}
            </div>

            <div className="modal-footer">
              <button
                className="download-btn"
                onClick={() => downloadReport('docx')}
              >
                <Download className="w-4 h-4" />
                Скачать DOCX
              </button>
              <button
                className="close-btn"
                onClick={closeModal}
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
          align-items: center;
        }

        .modal-title {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #212529;
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

        .result-section h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
          color: #212529;
        }

        .modal-footer {
          padding: 16px 24px;
          border-top: 1px solid #e9ecef;
          display: flex;
          gap: 12px;
          justify-content: flex-end;
        }

        .download-btn,
        .close-btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .download-btn {
          background: #228be6;
          color: white;
        }

        .download-btn:hover {
          background: #1c7ed6;
        }

        .close-btn {
          background: #e9ecef;
          color: #495057;
        }

        .close-btn:hover {
          background: #dee2e6;
        }
      `}</style>
    </div>
  );
}
