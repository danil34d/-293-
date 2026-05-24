'use client';

import * as React from 'react';
import { FolderOpen, Download, X, FileText } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from 'docx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { CounterAgent, WashEvent, ClientTransaction, OurCompany } from '@/types';

/**
 * Phase 59-report-month + 59-report-docx (2026-05-24):
 * Кнопка «Отчёт за месяц» в header контрагента.
 *
 * Открывает модал → выбор месяца → клиентская генерация .docx (Word) отчёта
 * → автоматический download. Не требует backend API — все данные у клиента.
 *
 * Структура отчёта повторяет образец и совместима с Microsoft Word / LibreOffice.
 */

interface Props {
  agent: CounterAgent;
  washEvents: WashEvent[];
  transactions: ClientTransaction[];
  ourCompany?: OurCompany | null;
  driverKickbacks?: Array<{ driverName: string; amount: number; status: string; washEventId: string }> | null;
}

const formatMoney = (n: number) => n.toLocaleString('ru-RU') + ' ₽';

function isInMonth(timestamp: string | Date, year: number, monthIdx: number): boolean {
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return d.getFullYear() === year && d.getMonth() === monthIdx;
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function pluralWash(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'мойка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'мойки';
  return 'моек';
}

// ─── DOCX helpers ────────────────────────────────────────────────────────────

function p(text: string, opts: { bold?: boolean; size?: number; spacing?: { before?: number; after?: number }; heading?: HeadingLevel } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, font: 'Times New Roman' })],
    spacing: opts.spacing,
    heading: opts.heading,
    alignment: opts.heading ? AlignmentType.LEFT : AlignmentType.BOTH,
  });
}

function cell(text: string, opts: { bold?: boolean; right?: boolean; shade?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'E7E6E6' } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, font: 'Times New Roman' })],
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      }),
    ],
  });
}

const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' },
};

function makeTable(headers: string[], rows: string[][], opts: { rightCols?: number[] } = {}): Table {
  const rightCols = new Set(opts.rightCols ?? []);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, shade: true, right: rightCols.has(i) })),
      }),
      ...rows.map(r =>
        new TableRow({
          children: r.map((v, i) => cell(v, { right: rightCols.has(i) })),
        })
      ),
    ],
  });
}

// ─── Build the actual .docx ─────────────────────────────────────────────────

function buildReportDocx(
  agent: CounterAgent,
  ourCompany: OurCompany | null | undefined,
  year: number,
  monthIdx: number,
  monthName: string,
  washes: WashEvent[],
  transactions: ClientTransaction[],
  kickbacks: Props['driverKickbacks'],
): Document {
  const periodStart = startOfMonth(new Date(year, monthIdx));
  const periodEnd = endOfMonth(new Date(year, monthIdx));
  const total = washes.reduce((s, w) => s + (w.totalAmount ?? 0), 0);
  const payments = transactions.filter(t => isInMonth(t.date, year, monthIdx) && t.type === 'payment')
    .reduce((s, t) => s + (t.amount ?? 0), 0);
  const monthEndDebt = total - payments;

  // Aggregate services
  const serviceCounts = new Map<string, { count: number; price: number; total: number; isSplit: boolean }>();
  washes.forEach(w => {
    const list = [w.services?.main, ...(w.services?.additional || [])].filter(Boolean) as any[];
    list.forEach(s => {
      if (!s.serviceName) return;
      const key = s.serviceName;
      const existing = serviceCounts.get(key);
      const isSplit = !!s.split?.driverBonus;
      if (existing) {
        existing.count += 1;
        existing.total += s.price ?? 0;
      } else {
        serviceCounts.set(key, { count: 1, price: s.price ?? 0, total: s.price ?? 0, isSplit });
      }
    });
  });

  const kickbacksFiltered = (kickbacks || []).filter(k =>
    washes.some(w => w.id === k.washEventId)
  );
  const kickbacksByDriver = new Map<string, { sum: number; statuses: Set<string> }>();
  kickbacksFiltered.forEach(k => {
    const ex = kickbacksByDriver.get(k.driverName);
    if (ex) {
      ex.sum += k.amount;
      ex.statuses.add(k.status);
    } else {
      kickbacksByDriver.set(k.driverName, { sum: k.amount, statuses: new Set([k.status]) });
    }
  });
  const kickbacksTotal = kickbacksFiltered.reduce((s, k) => s + k.amount, 0);

  const children: any[] = [];

  // ─── Header ───
  children.push(p(`Отчёт ${agent.name} — ${monthName} ${year}`, { heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }));
  children.push(p(`Период: ${format(periodStart, 'dd.MM.yyyy')} — ${format(periodEnd, 'dd.MM.yyyy')}`, { bold: true }));
  children.push(p(`Контрагент: ${agent.name}`));
  if (ourCompany) {
    const reqLine = `ИП-исполнитель: ${ourCompany.fullName || ourCompany.shortName}` +
      (ourCompany.inn ? ` (ИНН ${ourCompany.inn}` : '') +
      (ourCompany.ogrn ? `, ОГРН ${ourCompany.ogrn})` : ourCompany.inn ? ')' : '');
    children.push(p(reqLine));
  }
  if (agent.cars && agent.cars.length > 0) {
    children.push(p(`Машина(ы): ${agent.cars.map(c => c.licensePlate).join(', ')}`));
  }
  children.push(p(`Сгенерирован: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, { spacing: { after: 300 } }));

  // ─── 1. Журнал моек ───
  children.push(p('1. Журнал моек', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  if (washes.length === 0) {
    children.push(p('Моек за период не было.', { spacing: { after: 200 } }));
  } else {
    const sorted = washes.slice().sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const rows: string[][] = sorted.map((w, idx) => {
      const date = format(new Date(w.timestamp), 'dd.MM.yyyy');
      const svcList: string[] = [];
      if (w.services?.main?.serviceName) {
        const isSplit = !!(w.services.main as any).split?.driverBonus;
        svcList.push(`${w.services.main.serviceName}${isSplit ? ' (split)' : ''}`);
      }
      if (Array.isArray(w.services?.additional)) {
        const groups = new Map<string, number>();
        w.services.additional.forEach(s => {
          if (s.serviceName) groups.set(s.serviceName, (groups.get(s.serviceName) ?? 0) + 1);
        });
        groups.forEach((cnt, name) => svcList.push(cnt > 1 ? `${cnt}× ${name}` : name));
      }
      return [
        String(idx + 1),
        date,
        svcList.join(' + '),
        formatMoney(w.totalAmount ?? 0),
      ];
    });
    rows.push(['', 'Итого', '', formatMoney(total)]);
    children.push(makeTable(['#', 'Дата', 'Услуги', 'Сумма'], rows, { rightCols: [3] }));
    children.push(p('', { spacing: { after: 200 } }));
  }

  // ─── 2. Расшифровка услуг ───
  if (serviceCounts.size > 0) {
    children.push(p('2. Расшифровка услуг', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
    const rows = Array.from(serviceCounts.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, info]) => [
        `${name}${info.isSplit ? ' (split)' : ''}`,
        String(info.count),
        formatMoney(info.price),
        formatMoney(info.total),
      ]);
    rows.push(['Итого', '', '', formatMoney(total)]);
    children.push(makeTable(['Услуга', 'Раз', 'Цена', 'Сумма'], rows, { rightCols: [1, 2, 3] }));
    children.push(p('', { spacing: { after: 200 } }));
  }

  // ─── 3. Кикбеки водителям ───
  if (kickbacksFiltered.length > 0) {
    children.push(p('3. Кикбеки водителям', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
    const rows: string[][] = [];
    kickbacksByDriver.forEach((info, driver) => {
      const statusLabel = info.statuses.has('pending') ? 'ждёт оплаты' : info.statuses.has('paid') ? 'выплачен' : Array.from(info.statuses).join(', ');
      rows.push([driver, formatMoney(info.sum), statusLabel]);
    });
    rows.push(['Итого', formatMoney(kickbacksTotal), '']);
    children.push(makeTable(['Водитель', 'Сумма', 'Статус'], rows, { rightCols: [1] }));
    children.push(p('', { spacing: { after: 200 } }));
  }

  // ─── 4. Финансы ───
  children.push(p('4. Финансы', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
  children.push(makeTable(
    ['Показатель', 'Сумма'],
    [
      ['Выручка (выставлено к оплате)', formatMoney(total)],
      ['Платежи от контрагента за месяц', formatMoney(payments)],
      ['К доплате за месяц', formatMoney(monthEndDebt)],
      ['Текущий баланс контрагента', formatMoney(agent.balance ?? 0)],
    ],
    { rightCols: [1] }
  ));
  children.push(p('', { spacing: { after: 200 } }));

  // ─── 5. Реквизиты ───
  if (ourCompany) {
    children.push(p('5. Реквизиты для оплаты', { heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } }));
    children.push(p(`Получатель: ${ourCompany.fullName || ourCompany.shortName}`, { bold: true }));
    if (ourCompany.inn) children.push(p(`ИНН: ${ourCompany.inn}`));
    if (ourCompany.ogrn) children.push(p(`ОГРН: ${ourCompany.ogrn}`));
    if (ourCompany.legalAddress) children.push(p(`Адрес: ${ourCompany.legalAddress}`));
    if (ourCompany.bankName) {
      children.push(p(' '));
      children.push(p(`Банк: ${ourCompany.bankName}`, { bold: true }));
      if (ourCompany.settlementAccount) children.push(p(`Р/с: ${ourCompany.settlementAccount}`));
      if (ourCompany.correspondentAccount) children.push(p(`К/с: ${ourCompany.correspondentAccount}`));
      if (ourCompany.bik) children.push(p(`БИК: ${ourCompany.bik}`));
    }
    children.push(p(' '));
    const monthGen = MONTHS_GENITIVE[monthIdx];
    children.push(p(`Назначение платежа: Оплата за услуги мойки автотранспорта по договору за ${monthGen} ${year} г. Сумма ${formatMoney(monthEndDebt)}. Без НДС.`, { spacing: { after: 300 } }));
  }

  children.push(p('Отчёт сгенерирован автоматически из системы автомойки.', { size: 18 }));
  children.push(p(`Источник: webapp ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, { size: 18 }));

  return new Document({
    creator: 'Carwash Manager',
    title: `Отчёт ${agent.name} ${monthName} ${year}`,
    description: `Месячный отчёт по контрагенту ${agent.name} за ${monthName} ${year}`,
    // Phase 59-doc-style: Times New Roman 12pt, justify — повторяет оригинальный шаблон.
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 },
          paragraph: { spacing: { line: 276 } },
        },
        heading1: {
          run: { font: 'Times New Roman', size: 32, bold: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        heading2: {
          run: { font: 'Times New Roman', size: 26, bold: true },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
      },
    },
    sections: [{ properties: {}, children }],
  });
}

async function downloadDocx(filename: string, doc: Document) {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Phase 59-doc: shared FSA helpers (mirror DocumentsTab) ─────────────────

const ROOT_HANDLE_KEY = 'carwash:reportsRootDirHandle';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('carwash-fsa', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve) => {
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get(ROOT_HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    // @ts-expect-error
    const current = await handle.queryPermission?.({ mode: 'readwrite' });
    if (current === 'granted') return true;
    // @ts-expect-error
    const requested = await handle.requestPermission?.({ mode: 'readwrite' });
    return requested === 'granted';
  } catch {
    return false;
  }
}

async function saveToFolder(
  rootHandle: FileSystemDirectoryHandle,
  ipFolder: string,
  agentName: string,
  monthSubfolder: string,
  filename: string,
  blob: Blob,
): Promise<string> {
  const ip = await rootHandle.getDirectoryHandle(ipFolder, { create: true });
  const ag = await ip.getDirectoryHandle(agentName, { create: true });
  const mo = await ag.getDirectoryHandle(monthSubfolder, { create: true });
  const fh = await mo.getFileHandle(filename, { create: true });
  const writable = await (fh as any).createWritable();
  await writable.write(blob);
  await writable.close();
  return `${ipFolder}/${agentName}/${monthSubfolder}/${filename}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function MonthlyReportButton({ agent, washEvents, transactions, ourCompany, driverKickbacks }: Props) {
  const [open, setOpen] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [rootHandle, setRootHandle] = React.useState<FileSystemDirectoryHandle | null>(null);
  const now = new Date();
  const [year, setYear] = React.useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = React.useState(now.getMonth());

  React.useEffect(() => {
    loadRootHandle().then(h => setRootHandle(h));
  }, []);

  const yearOptions = React.useMemo(() => {
    const years = new Set<number>();
    years.add(now.getFullYear());
    washEvents.forEach(w => {
      const y = new Date(w.timestamp).getFullYear();
      if (Number.isFinite(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [washEvents, now]);

  const monthWashes = React.useMemo(() => {
    return washEvents.filter(w => {
      const linked = (w as any).counterAgentId ?? (w as any).sourceId;
      return linked === agent.id && isInMonth(w.timestamp, year, monthIdx);
    });
  }, [washEvents, agent.id, year, monthIdx]);

  const monthTotal = monthWashes.reduce((s, w) => s + (w.totalAmount ?? 0), 0);
  const monthName = MONTHS[monthIdx];

  // Phase 59-doc-fix: эвристика синхронна с DocumentsTab.ipFolderName().
  // «ИП Орлов К.Р.» → «ИП Орлов», «ИП Абанин» → «ИП Абанин».
  const ipFolderName = (() => {
    const sn = ourCompany?.shortName?.trim();
    if (!sn) return 'ИП';
    const noDots = sn.replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
    const m = noDots.match(/^(ИП|ООО|АО|ЗАО|ОАО|ПАО|НКО)\s+([А-ЯЁA-Z][а-яёA-Za-z]+)/);
    return m ? `${m[1]} ${m[2]}` : noDots;
  })();
  const monthSubfolder = `${year}-${String(monthIdx + 1).padStart(2, '0')} ${monthName}`;
  const safeAgentName = agent.name.replace(/[^\wа-яА-ЯёЁ\- ]/g, '_').trim();

  async function handleDownload() {
    setGenerating(true);
    try {
      const doc = buildReportDocx(agent, ourCompany, year, monthIdx, monthName, monthWashes, transactions, driverKickbacks ?? null);
      const filename = `Отчёт ${safeAgentName} ${monthName} ${year}.docx`;
      const blob = await Packer.toBlob(doc);
      // Если папка подключена — пишем туда, иначе скачиваем обычно
      if (rootHandle && await ensurePermission(rootHandle)) {
        try {
          const path = await saveToFolder(rootHandle, ipFolderName, agent.name, monthSubfolder, filename, blob);
          alert(`✓ Сохранено в папку: ${path}`);
          setOpen(false);
          return;
        } catch (err) {
          console.warn('[MonthlyReport] FSA write failed, falling back to download', err);
        }
      }
      // Fallback — обычный download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (err) {
      console.error('[MonthlyReport] generation failed:', err);
      alert('Не удалось сгенерировать отчёт. Подробности в console.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        onClick={() => setOpen(true)}
      >
        <FolderOpen className="w-4 h-4 mr-1.5" /> Отчёт за месяц
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-500" />
              Отчёт .docx — {agent.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Месяц</label>
                <select
                  value={monthIdx}
                  onChange={(e) => setMonthIdx(Number(e.target.value))}
                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md bg-white"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Год</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md bg-white"
                >
                  {yearOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={`rounded-lg p-3 border ${monthWashes.length > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-[12px] text-slate-600">Найдено за {monthName} {year}:</div>
              <div className="text-lg font-bold tabular-nums mt-1">
                {monthWashes.length} {pluralWash(monthWashes.length)} · {formatMoney(monthTotal)}
              </div>
              {monthWashes.length === 0 && (
                <div className="text-[11px] text-slate-500 mt-1">Отчёт всё равно сгенерируется — будет с пустым журналом и реквизитами.</div>
              )}
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              {rootHandle ? (
                <>
                  ✓ Сохранится в <code className="bg-slate-100 px-1 rounded">{(rootHandle as any).name}\{ipFolderName}\{agent.name}\{monthSubfolder}\Отчёт {safeAgentName} {monthName} {year}.docx</code> с авто-созданием подпапок.
                </>
              ) : (
                <>
                  Скачается <code className="bg-slate-100 px-1 rounded">Отчёт {safeAgentName} {monthName} {year}.docx</code> через браузер (Downloads). Чтобы сохранять прямо в папку — подключи её в табе «Документы».
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={generating}>
              <X className="w-4 h-4 mr-1" /> Отмена
            </Button>
            <Button type="button" onClick={handleDownload} className="bg-indigo-600 hover:bg-indigo-700" disabled={generating}>
              <Download className="w-4 h-4 mr-1.5" /> {generating ? 'Генерация...' : 'Скачать .docx'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
