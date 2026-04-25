'use client';

import { useState } from 'react';
import { Calendar, CheckCircle2, AlertCircle, Loader2, Link2 } from 'lucide-react';

interface ImportResult {
  success: boolean;
  error?: string;
  planimumNames?: string[];
  systemNames?: string[];
  data?: {
    message: string;
    month: string;
    washId: string;
    scheduleTitle: string;
    shiftsCreated: number;
    shiftsDeleted: number;
    daysWithShifts: number;
    totalDays: number;
    matchedEmployees: string[];
    unmatchedEmployees: string[];
  };
}

export default function PlanimumImportCard() {
  const [url, setUrl] = useState('');
  const [washId, setWashId] = useState<'wash_1' | 'wash_2'>('wash_1');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleImport() {
    if (!url.trim() || isLoading) return;

    setIsLoading(true);
    setResult(null);

    try {
      const resp = await fetch('/api/schedule/import-planimum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          washId,
          clearExisting: true,
        }),
      });

      const data: ImportResult = await resp.json();
      setResult(data);

      if (data.success) {
        setUrl('');
      }
    } catch (err: any) {
      setResult({ success: false, error: err.message || 'Ошибка сети' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="planimum-card">
      <div className="planimum-header">
        <div className="planimum-title">
          <Calendar className="w-4 h-4" />
          Импорт расписания из Planimum
        </div>
      </div>

      <div className="planimum-body">
        <div className="planimum-row">
          <div className="planimum-input-group">
            <Link2 className="planimum-input-icon w-4 h-4" />
            <input
              className="planimum-input"
              type="text"
              placeholder="https://planimum.ru/schedule/display/2026/04/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="planimum-row planimum-controls">
          <div className="planimum-wash-select">
            <label className={`planimum-wash-option ${washId === 'wash_1' ? 'active' : ''}`}>
              <input
                type="radio"
                name="washId"
                value="wash_1"
                checked={washId === 'wash_1'}
                onChange={() => setWashId('wash_1')}
                disabled={isLoading}
              />
              Мойка 1 (Циолковского)
            </label>
            <label className={`planimum-wash-option ${washId === 'wash_2' ? 'active' : ''}`}>
              <input
                type="radio"
                name="washId"
                value="wash_2"
                checked={washId === 'wash_2'}
                onChange={() => setWashId('wash_2')}
                disabled={isLoading}
              />
              Мойка 2
            </label>
          </div>

          <button
            className="planimum-btn"
            onClick={handleImport}
            disabled={isLoading || !url.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 spinner" />
                Импорт...
              </>
            ) : (
              'Импортировать'
            )}
          </button>
        </div>

        {result && (
          <div className={`planimum-result ${result.success ? 'success' : 'error'}`}>
            {result.success && result.data ? (
              <>
                <div className="planimum-result-header">
                  <CheckCircle2 className="w-5 h-5" />
                  {result.data.message}
                </div>
                <div className="planimum-result-stats">
                  <span>Смен создано: <b>{result.data.shiftsCreated}</b></span>
                  <span>Дней: <b>{result.data.daysWithShifts}</b> / {result.data.totalDays}</span>
                  {result.data.shiftsDeleted > 0 && (
                    <span>Удалено старых: {result.data.shiftsDeleted}</span>
                  )}
                </div>
                {result.data.matchedEmployees.length > 0 && (
                  <div className="planimum-result-employees">
                    <b>Сопоставлено ({result.data.matchedEmployees.length}):</b>
                    {result.data.matchedEmployees.map((m, i) => (
                      <span key={i} className="planimum-match">{m}</span>
                    ))}
                  </div>
                )}
                {result.data.unmatchedEmployees.length > 0 && (
                  <div className="planimum-result-unmatched">
                    <b>Не найдены в системе:</b>{' '}
                    {result.data.unmatchedEmployees.join(', ')}
                  </div>
                )}
                <div className="planimum-result-link">
                  <a href="/schedule">Открыть расписание &rarr;</a>
                </div>
              </>
            ) : (
              <div className="planimum-result-header">
                <AlertCircle className="w-5 h-5" />
                {result.error || 'Произошла ошибка'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="planimum-hint">
        Вставьте ссылку из planimum.ru. Существующие смены за выбранный месяц будут заменены.
      </div>

      <style jsx>{`
        .planimum-card {
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .planimum-header {
          padding: 16px 20px 0;
        }
        .planimum-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 15px;
          color: #212529;
        }
        .planimum-body {
          padding: 12px 20px;
        }
        .planimum-row {
          margin-bottom: 10px;
        }
        .planimum-input-group {
          position: relative;
          display: flex;
          align-items: center;
        }
        .planimum-input-icon {
          position: absolute;
          left: 12px;
          color: #868e96;
          pointer-events: none;
        }
        .planimum-input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }
        .planimum-input:focus {
          border-color: #228be6;
          box-shadow: 0 0 0 3px rgba(34, 139, 230, 0.1);
        }
        .planimum-input:disabled {
          background: #f8f9fa;
        }
        .planimum-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .planimum-wash-select {
          display: flex;
          gap: 8px;
        }
        .planimum-wash-option {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          color: #495057;
        }
        .planimum-wash-option:hover {
          border-color: #adb5bd;
        }
        .planimum-wash-option.active {
          border-color: #228be6;
          background: #e7f5ff;
          color: #1971c2;
        }
        .planimum-wash-option input {
          display: none;
        }
        .planimum-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 24px;
          background: #228be6;
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .planimum-btn:hover:not(:disabled) {
          background: #1c7ed6;
        }
        .planimum-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .planimum-result {
          padding: 14px;
          border-radius: 8px;
          margin-top: 4px;
          font-size: 13px;
        }
        .planimum-result.success {
          background: #ebfbee;
          border: 1px solid #b2f2bb;
        }
        .planimum-result.error {
          background: #fff5f5;
          border: 1px solid #ffc9c9;
        }
        .planimum-result-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          margin-bottom: 8px;
          color: inherit;
        }
        .planimum-result.success .planimum-result-header {
          color: #2b8a3e;
        }
        .planimum-result.error .planimum-result-header {
          color: #c92a2a;
        }
        .planimum-result-stats {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 8px;
          color: #495057;
        }
        .planimum-result-employees {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
          margin-bottom: 6px;
          color: #495057;
        }
        .planimum-match {
          background: #d3f9d8;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }
        .planimum-result-unmatched {
          color: #868e96;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .planimum-result-link {
          margin-top: 8px;
        }
        .planimum-result-link a {
          color: #228be6;
          text-decoration: none;
          font-weight: 500;
        }
        .planimum-result-link a:hover {
          text-decoration: underline;
        }
        .planimum-hint {
          padding: 0 20px 14px;
          font-size: 12px;
          color: #868e96;
        }
      `}</style>
    </div>
  );
}
