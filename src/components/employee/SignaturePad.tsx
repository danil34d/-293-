'use client';

/**
 * Phase 60b — SignaturePad
 *
 * Простая канва для рисования цифровой росписи водителя на терминале.
 * Поддерживает мышь и тач (планшет/телефон). Возвращает base64 PNG dataURL.
 *
 * Props:
 *   value: текущая роспись (dataURL) — если есть, показываем превью + кнопку «Перерисовать»
 *   onChange(dataUrl | null): вызывается на каждом «отпустил мышь» / «touchend» с готовой dataURL;
 *     null — при нажатии «Очистить»
 *   width/height: размеры канвы (по умолчанию подгоняется к контейнеру: 100% × 140px)
 *
 * UX:
 *   — Если value пустая → показываем канву с placeholder «Распишитесь здесь»
 *   — Если value есть → показываем картинку + кнопку «Перерисовать» / «Очистить»
 *
 * Стилизация: zorin-* классы из основного workstation консоля + tailwind.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  height?: number;
}

export default function SignaturePad({ value, onChange, height = 140 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(!value);
  const [hasInk, setHasInk] = useState(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  // Если value поменялся внешне (например, авто-подтянуло из последней мойки) — показываем превью
  useEffect(() => {
    setEditing(!value);
  }, [value]);

  // Подгон размеров канвы под devicePixelRatio для чёткой росписи
  useEffect(() => {
    if (!editing) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = container.clientWidth;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2.2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    setHasInk(false);
  }, [editing, height]);

  function getPoint(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) {
        // touchend: используем changedTouches
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
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
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
    setHasInk(true);
  }

  function endDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.preventDefault();
    setDrawing(false);
    lastPointRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (hasInk) {
      const dataUrl = canvas.toDataURL('image/png');
      onChange(dataUrl);
    }
  }

  function clear() {
    onChange(null);
    setHasInk(false);
    if (!editing) {
      setEditing(true);
      return;
    }
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = container.clientWidth;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }

  return (
    <div ref={containerRef} className="w-full">
      {!editing && value ? (
        <div className="flex flex-col gap-2">
          <div
            className="rounded-md border border-slate-300 bg-white p-2 flex items-center justify-center"
            style={{ minHeight: height }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Роспись водителя" style={{ maxHeight: height - 10, maxWidth: '100%' }} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setEditing(true); }}
              className="zorin-button secondary flex items-center gap-1 text-sm"
            >
              <PenLine size={14} /> Перерисовать
            </button>
            <button
              type="button"
              onClick={clear}
              className="zorin-button secondary flex items-center gap-1 text-sm"
            >
              <Eraser size={14} /> Очистить
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <canvas
            ref={canvasRef}
            className="rounded-md border-2 border-dashed border-slate-300 bg-white touch-none cursor-crosshair"
            style={{ width: '100%', height }}
            onMouseDown={startDraw}
            onMouseMove={moveDraw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={moveDraw}
            onTouchEnd={endDraw}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 italic">
              {hasInk ? 'Готово. Можно перерисовать.' : 'Распишитесь пальцем или мышью'}
            </span>
            <button
              type="button"
              onClick={clear}
              className="zorin-button secondary flex items-center gap-1 text-xs"
            >
              <Eraser size={12} /> Очистить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
