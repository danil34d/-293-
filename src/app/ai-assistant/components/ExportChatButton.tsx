'use client';

import { useState } from 'react';
import { FileDown, Loader } from 'lucide-react';

interface ExportChatButtonProps {
  chatId: string;
  chatTitle: string;
}

export default function ExportChatButton({ chatId, chatTitle }: ExportChatButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  async function exportChat(format: 'pdf' | 'docx') {
    setLoading(true);
    setShowMenu(false);

    try {
      const response = await fetch('/api/ai-assistant/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'chat',
          format,
          chatId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Download the file
        const link = document.createElement('a');
        link.href = data.data.downloadUrl;
        link.download = `${chatTitle}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert(`Ошибка: ${data.error}`);
      }
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="export-button"
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading}
        title="Экспорт чата"
      >
        {loading ? (
          <Loader className="w-4 h-4 animate-spin" />
        ) : (
          <FileDown className="w-4 h-4" />
        )}
      </button>

      {showMenu && (
        <div className="export-menu">
          {/* PDF temporarily disabled
          <button onClick={() => exportChat('pdf')}>
            Экспорт в PDF
          </button>
          */}
          <button onClick={() => exportChat('docx')}>
            Экспорт в DOCX
          </button>
        </div>
      )}

      <style jsx>{`
        .export-button {
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          padding: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .export-button:hover:not(:disabled) {
          background: #f8f9fa;
          border-color: #228be6;
        }

        .export-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .export-menu {
          position: absolute;
          top: 40px;
          right: 0;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          z-index: 100;
          min-width: 150px;
          overflow: hidden;
        }

        .export-menu button {
          width: 100%;
          padding: 10px 16px;
          background: white;
          border: none;
          text-align: left;
          cursor: pointer;
          transition: background 0.2s;
          font-size: 14px;
        }

        .export-menu button:hover {
          background: #f8f9fa;
        }

        .export-menu button:not(:last-child) {
          border-bottom: 1px solid #f1f3f5;
        }
      `}</style>
    </div>
  );
}
