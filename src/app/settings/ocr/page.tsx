"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trash2, RefreshCw, Download, ImageOff, Info, Upload, Camera, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface OcrFailedEntry {
  filename: string;
  savedAt: string;
  reason: string;
  sizeBytes: number;
}

interface TestResult {
  success: boolean;
  plateNumber?: string;
  error?: string;
  failedFilename?: string;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function shortReason(reason: string) {
  if (reason.startsWith('not_recognized:')) return 'Не распознан';
  if (reason.startsWith('error:')) return 'Ошибка OCR';
  if (reason.startsWith('ocr_corrected_by_user:')) return 'Исправлено';
  if (reason.startsWith('telegram_ocr_failed:')) return 'Telegram';
  return reason.slice(0, 40);
}

function reasonColor(reason: string): string {
  if (reason.startsWith('ocr_corrected_by_user:')) return '#16a34a';
  if (reason.startsWith('error:')) return '#dc2626';
  if (reason.startsWith('telegram_ocr_failed:')) return '#2563eb';
  return '#6b7280';
}

function parseOcrCorrection(reason: string): { original?: string; corrected?: string; source?: string } | null {
  if (!reason.startsWith('ocr_corrected_by_user:')) return null;
  const originalMatch = reason.match(/original="([^"]*)"/);
  const correctedMatch = reason.match(/corrected="([^"]*)"/);
  const sourceMatch = reason.match(/source="([^"]*)"/);
  return {
    original: originalMatch?.[1],
    corrected: correctedMatch?.[1],
    source: sourceMatch?.[1],
  };
}

export default function OcrFailedPage() {
  const [items, setItems] = useState<OcrFailedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  // Тестирование OCR
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testPreview, setTestPreview] = useState<string | null>(null);
  const testInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ocr-failed');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
      setItems(data.items || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deleteOne = async (filename: string) => {
    if (!confirm(`Удалить фото ${filename}?`)) return;
    setDeleting(filename);
    try {
      await fetch(`/api/ocr-failed?filename=${encodeURIComponent(filename)}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.filename !== filename));
      if (selectedImg === filename) setSelectedImg(null);
    } finally {
      setDeleting(null);
    }
  };

  const clearAll = async () => {
    if (!confirm(`Очистить все ${items.length} фото? Это действие нельзя отменить.`)) return;
    setClearingAll(true);
    try {
      await fetch('/api/ocr-failed?all=1', { method: 'DELETE' });
      setItems([]);
      setSelectedImg(null);
    } finally {
      setClearingAll(false);
    }
  };

  const downloadAll = () => {
    items.forEach((item) => {
      const a = document.createElement('a');
      a.href = `/api/ocr-failed/${item.filename}`;
      a.download = item.filename;
      a.click();
    });
  };

  // Тестирование OCR
  const handleTestUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Превью
    const reader = new FileReader();
    reader.onload = () => setTestPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Отправляем на распознавание
    setTestLoading(true);
    setTestResult(null);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 65000);

      const res = await fetch('/api/recognize-plate', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      const data = await res.json();
      setTestResult(data);

      // Обновляем список если фото было сохранено
      if (data.failedFilename) {
        load();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setTestResult({ success: false, error: 'Таймаут — OCR не ответил за 30 секунд' });
      } else {
        setTestResult({ success: false, error: err?.message || 'Ошибка запроса' });
      }
    } finally {
      setTestLoading(false);
      if (testInputRef.current) testInputRef.current.value = '';
    }
  };

  // Статистика
  const correctedCount = items.filter(i => i.reason.startsWith('ocr_corrected_by_user:')).length;
  const failedCount = items.filter(i => i.reason.startsWith('not_recognized:') || i.reason.startsWith('error:')).length;
  const telegramCount = items.filter(i => i.reason.startsWith('telegram_ocr_failed:')).length;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/settings" style={{ display: 'flex', alignItems: 'center', color: '#6b7280', textDecoration: 'none' }}>
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>OCR — распознавание номеров</h1>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
            Тестирование, неудачные фото и статистика распознавания.
          </p>
        </div>
      </div>

      {/* ════════════ Тест OCR ════════════ */}
      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px',
        padding: '20px', marginBottom: '24px',
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600, color: '#166534' }}>
          <Camera size={18} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
          Тестирование OCR
        </h2>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#15803d' }}>
          Загрузите фото номерного знака для проверки распознавания.
        </p>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Кнопка загрузки */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 18px',
            borderRadius: '8px', background: '#16a34a', color: '#fff',
            cursor: testLoading ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600,
            opacity: testLoading ? 0.6 : 1,
          }}>
            {testLoading ? (
              <><Loader2 size={16} className="animate-spin" /> Распознаём...</>
            ) : (
              <><Upload size={16} /> Загрузить фото</>
            )}
            <input
              ref={testInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleTestUpload}
              disabled={testLoading}
            />
          </label>

          {/* Превью и результат */}
          {(testPreview || testResult) && (
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              {testPreview && (
                <img
                  src={testPreview}
                  alt="Тест"
                  style={{
                    height: '80px', borderRadius: '8px', border: '2px solid #d1d5db',
                    objectFit: 'contain', background: '#fff',
                  }}
                />
              )}
              {testResult && (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px',
                  background: testResult.success ? '#dcfce7' : '#fef2f2',
                  border: `1px solid ${testResult.success ? '#86efac' : '#fecaca'}`,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '14px', fontWeight: 600,
                    color: testResult.success ? '#166534' : '#991b1b',
                  }}>
                    {testResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                    {testResult.success
                      ? `Распознан: ${testResult.plateNumber}`
                      : `Не распознан`
                    }
                  </div>
                  {testResult.error && (
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                      {testResult.error}
                    </div>
                  )}
                  {testResult.failedFilename && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                      Фото сохранено: {testResult.failedFilename}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════════ Статистика ════════════ */}
      {items.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px', marginBottom: '20px',
        }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700 }}>{items.length}</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>Всего фото</div>
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#dc2626' }}>{failedCount}</div>
            <div style={{ fontSize: '12px', color: '#991b1b' }}>Не распознано</div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{correctedCount}</div>
            <div style={{ fontSize: '12px', color: '#166534' }}>Исправлено</div>
          </div>
          {telegramCount > 0 && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb' }}>{telegramCount}</div>
              <div style={{ fontSize: '12px', color: '#1e40af' }}>Telegram</div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ Toolbar ════════════ */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
            borderRadius: '6px', border: '1px solid #e5e7eb', background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>

        {items.length > 0 && (
          <>
            <button
              onClick={downloadAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                borderRadius: '6px', border: '1px solid #d1fae5', background: '#ecfdf5',
                cursor: 'pointer', fontSize: '13px', fontWeight: 500, color: '#065f46'
              }}
            >
              <Download size={14} />
              Скачать все ({items.length})
            </button>
            <button
              onClick={clearAll}
              disabled={clearingAll}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                borderRadius: '6px', border: '1px solid #fee2e2', background: '#fef2f2',
                cursor: clearingAll ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500, color: '#991b1b'
              }}
            >
              <Trash2 size={14} />
              Очистить всё
            </button>
          </>
        )}
      </div>

      {/* ════════════ Полноразмерное превью ════════════ */}
      {selectedImg && (
        <div style={{
          marginBottom: '20px', background: '#000', borderRadius: '12px',
          overflow: 'hidden', position: 'relative',
        }}>
          <button
            onClick={() => setSelectedImg(null)}
            style={{
              position: 'absolute', top: '8px', right: '8px', zIndex: 2,
              background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
              borderRadius: '50%', width: '32px', height: '32px',
              cursor: 'pointer', fontSize: '18px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
          <img
            src={`/api/ocr-failed/${selectedImg}`}
            alt="Полное фото"
            style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }}
          />
        </div>
      )}

      {/* ════════════ Grid фото ════════════ */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Загрузка...</div>
      ) : error ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', color: '#991b1b' }}>
          Ошибка: {error}
        </div>
      ) : items.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px', background: '#f9fafb',
          borderRadius: '12px', border: '2px dashed #e5e7eb'
        }}>
          <ImageOff size={40} style={{ color: '#d1d5db', marginBottom: '12px' }} />
          <p style={{ color: '#6b7280', fontSize: '15px', margin: 0 }}>
            Неудачных фото пока нет.
          </p>
          <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '6px' }}>
            Используйте тестирование выше чтобы проверить OCR на ваших фото.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {items.map((item) => {
            const correction = parseOcrCorrection(item.reason);
            const isSelected = selectedImg === item.filename;

            return (
              <div
                key={item.filename}
                style={{
                  background: '#fff', borderRadius: '10px', overflow: 'hidden',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Image */}
                <div
                  style={{
                    position: 'relative', height: '160px', cursor: 'pointer',
                    background: '#f3f4f6', overflow: 'hidden',
                  }}
                  onClick={() => setSelectedImg(isSelected ? null : item.filename)}
                >
                  <img
                    src={`/api/ocr-failed/${item.filename}`}
                    alt="OCR фото"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                  {/* Бейдж статуса */}
                  <div style={{
                    position: 'absolute', top: '8px', left: '8px',
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                  }}>
                    <span style={{ color: reasonColor(item.reason) }}>●</span>{' '}
                    {shortReason(item.reason)}
                  </div>
                </div>

                {/* Meta */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '12px', color: '#374151', fontWeight: 600, marginBottom: '6px' }}>
                    {formatDate(item.savedAt)}
                  </div>

                  {/* Данные исправления */}
                  {correction && (
                    <div style={{ fontSize: '12px', marginBottom: '6px', lineHeight: 1.5 }}>
                      {correction.original && correction.original !== 'not_recognized' && (
                        <div><span style={{ color: '#ef4444' }}>OCR:</span> <strong>{correction.original}</strong></div>
                      )}
                      {correction.original === 'not_recognized' && (
                        <div style={{ color: '#ef4444' }}>OCR не распознал</div>
                      )}
                      {correction.corrected && correction.corrected !== 'unknown' && (
                        <div><span style={{ color: '#22c55e' }}>Верно:</span> <strong>{correction.corrected}</strong></div>
                      )}
                      {correction.source && (
                        <div style={{ color: '#9ca3af', fontSize: '11px' }}>
                          {correction.source === 'web' ? 'Веб' : correction.source === 'telegram' ? 'Telegram' : correction.source}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Размер */}
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>{formatBytes(item.sizeBytes)}</div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <a
                      href={`/api/ocr-failed/${item.filename}`}
                      download={item.filename}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '4px', padding: '6px', borderRadius: '6px',
                        border: '1px solid #e5e7eb', background: '#f9fafb',
                        fontSize: '12px', color: '#374151', textDecoration: 'none', fontWeight: 500,
                      }}
                    >
                      <Download size={12} />
                      Скачать
                    </a>
                    <button
                      onClick={() => deleteOne(item.filename)}
                      disabled={deleting === item.filename}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '4px', padding: '6px', borderRadius: '6px',
                        border: '1px solid #fee2e2', background: '#fef2f2',
                        fontSize: '12px', color: '#dc2626', cursor: 'pointer', fontWeight: 500,
                      }}
                    >
                      <Trash2 size={12} />
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
