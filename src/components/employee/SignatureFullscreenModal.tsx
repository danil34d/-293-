'use client';

/**
 * Phase 60M — SignatureFullscreenModal
 *
 * Full-screen модал для росписи водителя на терминале мойки.
 * Канва на весь экран — водитель уверенно расписывается пальцем,
 * не перекрывая UI и не залезая в края.
 *
 * UX:
 * — Тёмный затемнённый фон (фокус на канве)
 * — Канва на 80% высоты экрана
 * — Подсказка «← Распишитесь здесь пальцем →» когда пусто (исчезает при первом штрихе)
 * — Большие кнопки внизу: «Очистить» + «Готово» (Готово disabled пока нет штрихов)
 * — Закрыть × сверху (отмена)
 * — Поддержка mouse + touch + pen
 * — Lock body scroll пока модал открыт
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Eraser, CheckCircle2, PenLine } from 'lucide-react';

interface Props {
  open: boolean;
  initialSignature?: string | null;
  driverName?: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
}

export default function SignatureFullscreenModal({ open, initialSignature, driverName, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Helper: настроить canvas под текущий размер контейнера + опционально восстановить рисунок
  function setupCanvas(restoreFromDataUrl: string | null = null) {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset любую предыдущую transformation
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    // Восстановить рисунок (масштабируется под новые размеры)
    if (restoreFromDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = restoreFromDataUrl;
    }
  }

  // Lock body scroll + setup canvas when opened
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Setup canvas первый раз
    setTimeout(() => {
      setupCanvas(initialSignature || null);
      setHasInk(!!initialSignature);
    }, 50);

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open, initialSignature]);

  // Phase 60N — пересчёт канвы при resize/orientationchange (поворот телефона landscape↔portrait)
  // Без этого: канва остаётся прежнего размера → рисуется только на половине экрана.
  useEffect(() => {
    if (!open) return;
    let lastSnapshot: string | null = null;
    const handleResize = () => {
      const canvas = canvasRef.current;
      // Сохраняем текущий рисунок (если есть штрихи) чтобы перерисовать после resize
      if (canvas && hasInk) {
        try {
          lastSnapshot = canvas.toDataURL('image/png');
        } catch {
          lastSnapshot = null;
        }
      } else {
        lastSnapshot = null;
      }
      // Небольшая задержка чтобы container успел пересчитать clientWidth/Height после rotate
      setTimeout(() => setupCanvas(lastSnapshot), 100);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [open, hasInk]);

  function getPoint(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) {
        if (e.changedTouches && e.changedTouches.length > 0) {
          clientX = e.changedTouches[0].clientX;
          clientY = e.changedTouches[0].clientY;
        } else {
          return null;
        }
      } else {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const p = getPoint(e);
    if (!p) return;
    setDrawing(true);
    lastPointRef.current = p;
  }

  function moveDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    const p = getPoint(e);
    if (!p) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const last = lastPointRef.current;
    if (last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    lastPointRef.current = p;
    if (!hasInk) setHasInk(true);
  }

  function endDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    lastPointRef.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, container.clientWidth, container.clientHeight);
    setHasInk(false);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-slate-900/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white shadow-md">
        <div className="flex items-center gap-2">
          <PenLine className="w-5 h-5 text-amber-400" />
          <div>
            <div className="text-sm font-bold">Роспись водителя</div>
            {driverName && (
              <div className="text-[11px] text-slate-300">{driverName}</div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-slate-700 active:scale-95"
          title="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Подсказка */}
      <div className="px-4 py-2 bg-amber-50 border-y border-amber-200 text-amber-900 text-[12px] font-semibold flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        {hasInk
          ? 'Готово. Можно нажать «Сохранить» или «Очистить» для повторной попытки.'
          : 'Распишитесь пальцем в белой области ниже'}
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-white m-2 rounded-lg shadow-inner overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />
        {!hasInk && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <PenLine className="w-12 h-12 text-slate-300 mb-2" strokeWidth={1.5} />
            <div className="text-slate-400 text-base font-semibold">← Распишитесь здесь →</div>
            <div className="text-slate-300 text-xs mt-1">пальцем или мышью</div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="grid grid-cols-2 gap-2 px-2 pb-3 pt-1">
        <button
          type="button"
          onClick={clearCanvas}
          disabled={!hasInk}
          className="py-4 rounded-lg bg-slate-200 text-slate-800 font-bold text-base active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          <Eraser className="w-5 h-5" />
          Очистить
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasInk}
          className="py-4 rounded-lg bg-emerald-600 text-white font-bold text-base active:scale-95 disabled:bg-slate-400 disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg"
        >
          <CheckCircle2 className="w-5 h-5" />
          Сохранить
        </button>
      </div>
    </div>
  );
}
