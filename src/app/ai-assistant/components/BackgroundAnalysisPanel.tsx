'use client';

import { useEffect, useState } from 'react';
import { Bell, TrendingUp, Users, AlertTriangle, Calendar, CheckCircle, XCircle } from 'lucide-react';
import type { BackgroundAnalysis } from '@/types/ai-assistant';

interface BackgroundAnalysisPanelProps {
  onAnalysisClick?: (analysis: BackgroundAnalysis) => void;
}

export default function BackgroundAnalysisPanel({ onAnalysisClick }: BackgroundAnalysisPanelProps) {
  const [analyses, setAnalyses] = useState<BackgroundAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    loadAnalyses();
    // Refresh every 5 minutes
    const interval = setInterval(loadAnalyses, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadAnalyses() {
    try {
      const response = await fetch('/api/ai-assistant/background-analyses?status=completed&is_notified=false&limit=10');
      const data = await response.json();

      if (data.success) {
        setAnalyses(data.data);
        setUnreadCount(data.data.length);
      }
    } catch (error) {
      console.error('Failed to load background analyses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(analysisId: string) {
    try {
      await fetch(`/api/ai-assistant/background-analyses/${analysisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_notified: true }),
      });

      setAnalyses(prev => prev.filter(a => a.id !== analysisId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark analysis as read:', error);
    }
  }

  function getAnalysisIcon(type: string) {
    switch (type) {
      case 'daily_summary':
        return <Calendar className="w-5 h-5" />;
      case 'employee_performance':
        return <Users className="w-5 h-5" />;
      case 'anomaly_detection':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Bell className="w-5 h-5" />;
    }
  }

  function getAnalysisTitle(type: string) {
    switch (type) {
      case 'daily_summary':
        return 'Ежедневный отчёт';
      case 'employee_performance':
        return 'Анализ производительности';
      case 'anomaly_detection':
        return 'Обнаружение аномалий';
      default:
        return 'Анализ';
    }
  }

  function formatDate(timestamp: number) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffHours < 1) return 'Только что';
    if (diffHours < 24) return `${diffHours} ч назад`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Вчера';
    if (diffDays < 7) return `${diffDays} дн назад`;

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function stripMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
      .replace(/\*(.+?)\*/g, '$1')      // Italic
      .replace(/^#+\s+/gm, '')          // Headers
      .replace(/^[-•*]\s+/gm, '')       // Lists
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Links
      .trim();
  }

  if (loading) return null;

  return (
    <div className="background-analysis-panel">
      {/* Notification Bell */}
      <button
        className="notification-bell"
        onClick={() => setShowPanel(!showPanel)}
        title="Фоновые анализы"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      {/* Analysis Panel */}
      {showPanel && (
        <div className="analysis-dropdown">
          <div className="analysis-dropdown-header">
            <h3>Фоновые анализы</h3>
            {unreadCount > 0 && (
              <span className="unread-count">{unreadCount} новых</span>
            )}
          </div>

          <div className="analysis-list">
            {analyses.length === 0 ? (
              <div className="empty-analyses">
                <CheckCircle className="w-8 h-8 text-green-500" />
                <p>Нет новых анализов</p>
              </div>
            ) : (
              analyses.map((analysis) => (
                <div
                  key={analysis.id}
                  className="analysis-item"
                  onClick={() => {
                    if (onAnalysisClick) {
                      onAnalysisClick(analysis);
                      markAsRead(analysis.id);
                      setShowPanel(false);
                    }
                  }}
                >
                  <div className="analysis-icon">
                    {getAnalysisIcon(analysis.type)}
                  </div>
                  <div className="analysis-content">
                    <div className="analysis-title">
                      {getAnalysisTitle(analysis.type)}
                    </div>
                    <div className="analysis-preview">
                      {analysis.result_data && typeof analysis.result_data === 'string'
                        ? stripMarkdown(JSON.parse(analysis.result_data).summary || JSON.parse(analysis.result_data).analysis || '').substring(0, 80) + '...'
                        : 'Новый анализ готов'}
                    </div>
                    <div className="analysis-time">
                      {formatDate(analysis.created_at)}
                    </div>
                  </div>
                  <button
                    className="analysis-dismiss"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsRead(analysis.id);
                    }}
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
