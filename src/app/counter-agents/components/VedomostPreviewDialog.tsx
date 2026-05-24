'use client';

import * as React from 'react';
import { Printer, Download, X, Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { Packer } from 'docx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CounterAgent, WashEvent, OurCompany } from '@/types';
import {
  buildVedomostDocx, vedomostRowsFromWashes, generateContractNumber,
  type VedomostRow,
} from './document-builders';
import { format } from 'date-fns';

/**
 * Phase 59-doc-preview (2026-05-24): editable preview + print + save Ведомости.
 *
 * Полный flow:
 *  1. Открывается модал (full-screen)
 *  2. Сверху — селектор месяца / года / том / blank
 *  3. По центру — таблица с editable cells (Услуги, ФИО водителя, Сумма)
 *  4. Можно добавлять/удалять строки вручную
 *  5. Внизу — две кнопки: «Печать» (открывает print preview в новом окне) и
 *     «Сохранить .docx» (через существующий FSA-flow в подпапку месяца)
 */

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: CounterAgent;
  ourCompany: OurCompany | null | undefined;
  washEvents: WashEvent[];
  /** Колбэк сохранения через FSA — приходит из DocumentsTab. Если null — обычный download. */
  saveDocx: (filename: string, subfolder: string | null, doc: any) => Promise<{ mode: 'folder' | 'download'; path?: string }>;
}

export function VedomostPreviewDialog({ open, onOpenChange, agent, ourCompany, washEvents, saveDocx }: Props) {
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = React.useState(now.getMonth());
  const [volume, setVolume] = React.useState(1);
  const [blank, setBlank] = React.useState(false);
  const [rows, setRows] = React.useState<VedomostRow[]>([]);
  const [saving, setSaving] = React.useState(false);

  // При смене месяца / blank — пересобираем строки из моек
  React.useEffect(() => {
    if (!open) return;
    if (blank) {
      setRows(
        Array.from({ length: 20 }, () => ({ date: '', mark: '', plate: '', services: '', totalRub: 0, driver: '' }))
      );
      return;
    }
    const monthWashes = washEvents.filter(w => {
      const linked = (w as any).counterAgentId ?? (w as any).sourceId;
      if (linked !== agent.id) return false;
      const d = new Date(w.timestamp);
      return d.getFullYear() === year && d.getMonth() === monthIdx;
    });
    setRows(vedomostRowsFromWashes(agent, monthWashes));
  }, [open, year, monthIdx, blank, washEvents, agent]);

  function updateRow(idx: number, patch: Partial<VedomostRow>) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }
  function addRow() {
    setRows(prev => [...prev, { date: '', mark: '', plate: '', services: '', totalRub: 0, driver: '' }]);
  }

  const monthName = MONTHS[monthIdx];
  const customer = agent.companies?.[0] || ({} as any);
  const customerName = customer.companyName || agent.name;
  const total = rows.reduce((s, r) => s + (r.totalRub || 0), 0);
  const cnum = generateContractNumber();
  const contractDateStr = format(new Date(), 'dd.MM.yyyy');
  const volSuffix = volume > 1 ? ` (том ${volume})` : '';

  function buildPrintHtml(): string {
    const rowsHtml = rows.map(r => `
      <tr>
        <td style="text-align:center">${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.mark)}</td>
        <td>${escapeHtml(r.plate)}</td>
        <td>${escapeHtml(r.services)}</td>
        <td style="text-align:right">${(r.totalRub || 0).toLocaleString('ru-RU')}</td>
        <td>${escapeHtml(r.driver)}</td>
        <td></td>
      </tr>
    `).join('');

    const totalRowHtml = rows.length > 0 ? `
      <tr style="background:#E7E6E6; font-weight:bold">
        <td>Итого:</td>
        <td></td>
        <td></td>
        <td style="text-align:right">${rows.length} моек</td>
        <td style="text-align:right">${total.toLocaleString('ru-RU')}</td>
        <td></td>
        <td></td>
      </tr>
    ` : '';

    const ourShortSig = ourCompany?.shortName?.replace(/^ИП\s*/i, '').trim() + ' ___________' || '___________';
    const customerSig = customer.ownerName || '___________';

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Ведомость ${escapeHtml(agent.name)} ${escapeHtml(monthName)} ${year}</title>
<style>
  /* A4 LANDSCAPE с минимальными полями — нужно для 7 колонок */
  @page { size: A4 landscape; margin: 0.7cm; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Times New Roman", serif; font-size: 12pt; color: #000; }
  h1, h2 { text-align: center; margin: 0.3em 0; }
  h1 { font-size: 14pt; }
  h2 { font-size: 12pt; font-weight: normal; }

  table { width: 100%; border-collapse: collapse; margin: 0.8em 0; }
  th, td { border: 1px solid #666; padding: 4px 6px; font-size: 11pt; vertical-align: top; }
  th { background: #E7E6E6; font-weight: bold; }

  /* Phase 59-doc-vedomost-print: при разрыве на страницы — шапка таблицы
     повторяется на каждой новой странице, строки не разрываются. */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }

  .footer { display: flex; justify-content: space-between; margin-top: 2em; }
  .footer > div { width: 45%; }
  /* Подвал держим вместе чтоб не сломался при разрыве */
  .footer { page-break-inside: avoid; break-inside: avoid; }

  @media print {
    .no-print { display: none; }
  }
</style>
</head>
<body>
<h1>Ведомость учёта обслуженного автотранспорта Заказчика${escapeHtml(volSuffix)}</h1>
<h2>по Договору на оказание услуг № ${cnum} от ${contractDateStr} г.</h2>
<h2><b>Период: ${monthName} ${year} г.</b></h2>

<table>
  <thead>
    <tr>
      <th>Дата</th>
      <th>Марка автомобиля</th>
      <th>Гос. номер</th>
      <th>Перечень выполненных работ</th>
      <th>Стоимость, руб.</th>
      <th>ФИО водителя</th>
      <th>Подпись</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml}
    ${totalRowHtml}
  </tbody>
</table>

<div class="footer">
  <div>
    <b>Исполнитель:</b><br>
    ${escapeHtml(ourCompany?.shortName || '')}<br><br>
    ______________ ${escapeHtml(ourShortSig)}
  </div>
  <div>
    <b>Заказчик:</b><br>
    ${escapeHtml(customerName)}<br><br>
    ______________ ${escapeHtml(customerSig)}
  </div>
</div>

<script>
  window.addEventListener('load', () => { setTimeout(() => window.print(), 200); });
</script>
</body>
</html>`;
  }

  function handlePrint() {
    const html = buildPrintHtml();
    const w = window.open('', '_blank', 'width=1024,height=768');
    if (!w) {
      alert('Браузер заблокировал открытие нового окна. Разреши попапы для этого сайта.');
      return;
    }
    w.document.write(html);
    w.document.close();
  }

  async function handleSave() {
    if (!ourCompany) {
      alert('Нет ИП-исполнителя — назначь в табе Профиль.');
      return;
    }
    setSaving(true);
    try {
      const doc = buildVedomostDocx({
        agent,
        ourCompany,
        rows,
        year,
        monthIdx,
        monthName,
        volumeNumber: volume,
        blank,
      });
      const safeAgent = agent.name.replace(/[\\/:*?"<>|]/g, '_').trim();
      const blankSuffix = blank ? ' (бланк)' : '';
      const filename = `Ведомость ${monthName} ${year}${volSuffix.replace(/[()]/g, '')}${blankSuffix} ${safeAgent}.docx`;
      const subfolder = `${year}-${String(monthIdx + 1).padStart(2, '0')} ${monthName}`;
      const res = await saveDocx(filename, subfolder, doc);
      if (res.mode === 'folder') {
        alert(`✓ Сохранено: ${res.path}`);
      } else {
        // download уже сработал
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error('[Vedomost preview] save failed', err);
      alert('Не удалось сохранить: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-500" />
            Ведомость учёта — {agent.name} — {monthName} {year}{volSuffix}
          </DialogTitle>
        </DialogHeader>

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap p-2 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-1">
            <label className="text-[12px] font-semibold text-slate-600">Месяц:</label>
            <select value={monthIdx} onChange={e => setMonthIdx(Number(e.target.value))} className="px-2 py-1 text-[12px] border border-slate-200 rounded bg-white">
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[12px] font-semibold text-slate-600">Год:</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="px-2 py-1 text-[12px] border border-slate-200 rounded bg-white">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[12px] font-semibold text-slate-600">Том:</label>
            <input type="number" min={1} max={20} value={volume} onChange={e => setVolume(Math.max(1, Number(e.target.value)))} className="w-14 px-2 py-1 text-[12px] border border-slate-200 rounded bg-white" />
          </div>
          <label className="flex items-center gap-1 cursor-pointer text-[12px] font-semibold text-slate-700">
            <input type="checkbox" checked={blank} onChange={e => setBlank(e.target.checked)} />
            Пустой бланк
          </label>
          <div className="ml-auto text-[12px] font-bold text-slate-700">
            {rows.length} строк · Итого: {total.toLocaleString('ru-RU')} ₽
          </div>
        </div>

        {/* Editable table */}
        <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="text-left p-2 w-24 font-semibold border-b border-slate-200">Дата</th>
                <th className="text-left p-2 w-32 font-semibold border-b border-slate-200">Марка</th>
                <th className="text-left p-2 w-28 font-semibold border-b border-slate-200">ГРН</th>
                <th className="text-left p-2 font-semibold border-b border-slate-200">Услуги</th>
                <th className="text-right p-2 w-24 font-semibold border-b border-slate-200">Сумма, ₽</th>
                <th className="text-left p-2 w-40 font-semibold border-b border-slate-200">ФИО водителя</th>
                <th className="w-10 border-b border-slate-200"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-8 text-slate-400">
                    Моек за {monthName} {year} не найдено. Жми «+ Добавить строку» если нужно вручную.
                  </td>
                </tr>
              ) : rows.map((r, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-blue-50/40">
                  <td className="p-1">
                    <input
                      type="text"
                      value={r.date}
                      onChange={e => updateRow(idx, { date: e.target.value })}
                      placeholder="дд.мм.гггг"
                      className="w-full px-1 py-1 border border-transparent hover:border-slate-300 rounded text-[12px] focus:outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={r.mark}
                      onChange={e => updateRow(idx, { mark: e.target.value })}
                      className="w-full px-1 py-1 border border-transparent hover:border-slate-300 rounded text-[12px] focus:outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={r.plate}
                      onChange={e => updateRow(idx, { plate: e.target.value })}
                      className="w-full px-1 py-1 border border-transparent hover:border-slate-300 rounded text-[12px] font-mono uppercase focus:outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </td>
                  <td className="p-1">
                    <textarea
                      value={r.services}
                      onChange={e => updateRow(idx, { services: e.target.value })}
                      rows={1}
                      className="w-full px-1 py-1 border border-transparent hover:border-slate-300 rounded text-[12px] resize-y min-h-[26px] focus:outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="number"
                      value={r.totalRub}
                      onChange={e => updateRow(idx, { totalRub: Number(e.target.value) || 0 })}
                      className="w-full px-1 py-1 border border-transparent hover:border-slate-300 rounded text-[12px] text-right tabular-nums focus:outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </td>
                  <td className="p-1">
                    <input
                      type="text"
                      value={r.driver}
                      onChange={e => updateRow(idx, { driver: e.target.value })}
                      placeholder="ФИО"
                      className="w-full px-1 py-1 border border-transparent hover:border-slate-300 rounded text-[12px] focus:outline-none focus:border-indigo-400 focus:bg-white"
                    />
                  </td>
                  <td className="p-1 text-center">
                    <button
                      onClick={() => removeRow(idx)}
                      className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded p-1"
                      title="Удалить строку"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="w-3 h-3 mr-1" /> Добавить строку
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              <X className="w-4 h-4 mr-1" /> Закрыть
            </Button>
            <Button type="button" onClick={handlePrint} className="bg-slate-700 hover:bg-slate-800" disabled={saving || rows.length === 0}>
              <Printer className="w-4 h-4 mr-1.5" /> Печать
            </Button>
            <Button type="button" onClick={handleSave} className="bg-rose-600 hover:bg-rose-700" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
              Сохранить .docx
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
