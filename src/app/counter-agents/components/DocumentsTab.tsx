'use client';

import * as React from 'react';
import { FileText, Download, FolderOpen, AlertCircle, CheckCircle2, Loader2, Save, X, Plug, ArrowRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Document, Packer } from 'docx';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { CounterAgent, WashEvent, OurCompany } from '@/types';
import {
  buildContractDocx, buildAppendix1Docx, buildAppendix3Docx, buildActDocx,
  generateContractNumber,
} from './document-builders';

/**
 * Phase 59-doc (2026-05-24): таб «Документы» в /counter-agents/[id]/edit.
 *
 * 5 кнопок генерации .docx:
 *  - Договор
 *  - Приложение №1 «Список автотранспорта»
 *  - Приложение №3 «Прейскурант»
 *  - Акт оказанных услуг (с выбором месяца)
 *  - + Ведомость учёта = MonthlyReportButton отдельно в header
 *
 * Два режима сохранения:
 *  - Download (стандартный, работает везде)
 *  - Save to folder (File System Access API — Chrome/Edge, авто-создание подпапок)
 */

interface Props {
  agent: CounterAgent;
  ourCompany?: OurCompany | null;
  washEvents: WashEvent[];
}

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

// ─── File System Access API helpers ──────────────────────────────────────────

const ROOT_HANDLE_KEY = 'carwash:reportsRootDirHandle';

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: any) => Promise<FileSystemDirectoryHandle>;
  }
}

function fsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Открывает IndexedDB для хранения FileSystemDirectoryHandle. */
function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('carwash-fsa', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveRootHandle(handle: FileSystemDirectoryHandle) {
  const db = await openHandleDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, ROOT_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
    // @ts-expect-error — non-standard
    const current = await handle.queryPermission?.({ mode: 'readwrite' });
    if (current === 'granted') return true;
    // @ts-expect-error
    const requested = await handle.requestPermission?.({ mode: 'readwrite' });
    return requested === 'granted';
  } catch {
    return false;
  }
}

async function getOrCreateSubdir(parent: FileSystemDirectoryHandle, name: string): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeFileTo(dir: FileSystemDirectoryHandle, filename: string, blob: Blob) {
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(blob);
  await writable.close();
}

/** Имя папки для ИП — без точек в конце (Windows их обрезает). */
function ipFolderName(oc: OurCompany | null | undefined): string {
  return (oc?.shortName?.replace(/[.,]+$/, '').trim()) || 'ИП по умолчанию';
}

function makeFilename(kind: string, agentName: string, extra?: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]/g, '_').trim();
  return `${safe(kind)} ${safe(agentName)}${extra ? ' ' + safe(extra) : ''}.docx`;
}

// ─── Save helpers ────────────────────────────────────────────────────────────

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

interface SaveContext {
  rootHandle: FileSystemDirectoryHandle | null;
  ourCompany: OurCompany | null | undefined;
  agentName: string;
  /** Подпапка для актов/ведомостей — например «2026-05 Май» */
  subfolder?: string | null;
}

async function saveDocxSmart(ctx: SaveContext, filename: string, doc: Document): Promise<{ mode: 'folder' | 'download'; path?: string }> {
  const blob = await Packer.toBlob(doc);
  if (ctx.rootHandle) {
    try {
      const ok = await ensurePermission(ctx.rootHandle);
      if (ok) {
        const ipDir = await getOrCreateSubdir(ctx.rootHandle, ipFolderName(ctx.ourCompany));
        const agentDir = await getOrCreateSubdir(ipDir, ctx.agentName);
        const targetDir = ctx.subfolder
          ? await getOrCreateSubdir(agentDir, ctx.subfolder)
          : await getOrCreateSubdir(agentDir, 'Договор и документы');
        await writeFileTo(targetDir, filename, blob);
        const path = `${ipFolderName(ctx.ourCompany)}/${ctx.agentName}/${ctx.subfolder || 'Договор и документы'}/${filename}`;
        return { mode: 'folder', path };
      }
    } catch (err) {
      console.warn('[DocumentsTab] FSA write failed, falling back to download', err);
    }
  }
  // Fallback download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { mode: 'download' };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DocumentsTab({ agent, ourCompany, washEvents }: Props) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [lastResult, setLastResult] = React.useState<{ filename: string; mode: 'folder' | 'download'; path?: string } | null>(null);
  const [rootHandle, setRootHandle] = React.useState<FileSystemDirectoryHandle | null>(null);
  const [actDialogOpen, setActDialogOpen] = React.useState(false);
  // Phase 59-doc-ux: модал-инструкция перед запуском system folder picker
  const [pickerHintOpen, setPickerHintOpen] = React.useState(false);
  const [pickerWarning, setPickerWarning] = React.useState<string | null>(null);
  const now = new Date();
  const [actYear, setActYear] = React.useState(now.getFullYear());
  const [actMonthIdx, setActMonthIdx] = React.useState(now.getMonth());

  React.useEffect(() => {
    loadRootHandle().then(h => setRootHandle(h));
  }, []);

  const ipName = ipFolderName(ourCompany);

  /**
   * Реальный вызов системного picker'а. Вызывается из модала, а не сразу —
   * чтобы пользователь сначала прочитал инструкцию какую папку выбирать.
   */
  async function doActualPick() {
    if (!fsaSupported()) {
      alert('Сохранение в папку поддерживается только в Chrome / Edge. Используй обычное скачивание.');
      return;
    }
    setPickerWarning(null);
    try {
      const handle = await window.showDirectoryPicker!({
        mode: 'readwrite',
        id: 'carwash-reports',
        startIn: 'desktop' as any, // Chrome подскажет старт в Desktop
      });
      // Валидация: имя выбранной папки. Ожидаем "контр агенты отчеты" (без точек).
      const name = (handle as any).name as string;
      const lower = name.toLowerCase();
      const looksLikeRoot = lower.includes('отчет') || lower.includes('reports');
      // Если выбрали уже подпапку контрагента ("ЭкоФуд" / "ИП Орлов" / "2026-05") — предупредим
      const looksLikeSub = ['эко', 'ип ', 'абанин', 'орлов', /^\d{4}-\d{2}/].some(m =>
        typeof m === 'string' ? lower.includes(m) : m.test(lower)
      );

      if (looksLikeSub && !looksLikeRoot) {
        setPickerWarning(
          `Похоже ты выбрал подпапку «${name}» вместо корневой. Документы будут вкладываться неправильно (двойная вложенность). ` +
          `Лучше переподключи и выбери корень — папку «контр агенты отчеты».`
        );
        // Всё равно сохраним выбор — пусть пользователь решит, оставлять или переподключать
      } else if (!looksLikeRoot) {
        setPickerWarning(
          `Выбрана папка «${name}». В её имени нет «отчёт» — убедись, что это правильный корень. ` +
          `Структура: <выбранная папка>/${ipName}/${agent.name}/...`
        );
      }
      await saveRootHandle(handle);
      setRootHandle(handle);
      setPickerHintOpen(false);
    } catch (e) {
      // user cancelled — diaolg остаётся открытым, пусть пробует снова
    }
  }

  async function disconnectRoot() {
    try {
      const db = await openHandleDb();
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete(ROOT_HANDLE_KEY);
      tx.oncomplete = () => setRootHandle(null);
    } catch {}
  }

  function makeCtx(subfolder?: string | null): SaveContext {
    return { rootHandle, ourCompany, agentName: agent.name, subfolder };
  }

  async function generate(kind: 'contract' | 'app1' | 'app3' | 'act') {
    if (!ourCompany) {
      alert('Для генерации нужно назначить ИП-исполнителя контрагенту (Профиль → Основное → «От имени какого ИП работает...»).');
      return;
    }
    setBusy(kind);
    setLastResult(null);
    try {
      let doc: Document;
      let filename: string;
      let subfolder: string | null = null;

      if (kind === 'contract') {
        doc = buildContractDocx({ agent, ourCompany });
        const num = generateContractNumber();
        filename = makeFilename(`Договор № ${num.replace(/\//g, '-')}`, agent.name);
      } else if (kind === 'app1') {
        doc = buildAppendix1Docx({ agent, ourCompany });
        filename = makeFilename('Приложение №1 Список автотранспорта', agent.name);
      } else if (kind === 'app3') {
        doc = buildAppendix3Docx({ agent, ourCompany });
        filename = makeFilename('Приложение №3 Прейскурант', agent.name);
      } else {
        // Act
        const monthWashes = washEvents.filter(w => {
          const linked = (w as any).counterAgentId ?? (w as any).sourceId;
          if (linked !== agent.id) return false;
          const d = new Date(w.timestamp);
          return d.getFullYear() === actYear && d.getMonth() === actMonthIdx;
        });
        doc = buildActDocx({
          agent, ourCompany, washes: monthWashes,
          year: actYear, monthIdx: actMonthIdx, monthName: MONTHS[actMonthIdx],
        });
        filename = makeFilename(`Акт ${MONTHS[actMonthIdx]} ${actYear}`, agent.name);
        subfolder = `${actYear}-${String(actMonthIdx + 1).padStart(2, '0')} ${MONTHS[actMonthIdx]}`;
        setActDialogOpen(false);
      }

      const res = await saveDocxSmart(makeCtx(subfolder), filename, doc);
      setLastResult({ filename, mode: res.mode, path: res.path });
    } catch (err: any) {
      console.error('[DocumentsTab] generation failed', err);
      alert('Не удалось сгенерировать документ: ' + (err.message || err));
    } finally {
      setBusy(null);
    }
  }

  const ipMissing = !ourCompany;

  return (
    <div className="space-y-3">
      {/* Header / FSA status */}
      <div className={`rounded-xl border p-3 ${rootHandle ? 'bg-emerald-50/40 border-emerald-200' : 'bg-amber-50/40 border-amber-200'}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-start gap-2">
            {rootHandle ? <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" /> : <Plug className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />}
            <div className="text-[12px]">
              {rootHandle ? (
                <>
                  <b className="text-emerald-800">Папка отчётов подключена.</b> Документы будут сохраняться в{' '}
                  <code className="bg-white px-1 rounded">{(rootHandle as any).name}\{ipName}\{agent.name}\…</code>{' '}
                  с авто-созданием подпапок.
                </>
              ) : (
                <>
                  <b className="text-amber-800">Папка отчётов не подключена.</b> Документы будут скачиваться обычным download.
                  Подключи папку → сохранение пойдёт прямо в нужную структуру.
                  <br />
                  <span className="text-amber-700 text-[11px]">Работает в Chrome / Edge (File System Access API).</span>
                </>
              )}
            </div>
          </div>
          {rootHandle ? (
            <Button type="button" variant="outline" size="sm" className="h-8" onClick={disconnectRoot}>
              <X className="w-3 h-3 mr-1" /> Отключить
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 bg-amber-600 hover:bg-amber-700"
              onClick={() => { setPickerWarning(null); setPickerHintOpen(true); }}
              disabled={!fsaSupported()}
            >
              <FolderOpen className="w-3 h-3 mr-1" /> Подключить папку
            </Button>
          )}
        </div>
      </div>

      {ipMissing && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-rose-900">
            <b>Нужно назначить ИП-исполнителя.</b> Открой Профиль → Основное → «От имени какого ИП работает…»
            и выбери ИП Абанин или ИП Орлов. Без этого реквизиты в документах будут пусты.
          </div>
        </div>
      )}

      {/* Document buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <DocButton
          icon={<FileText className="w-5 h-5 text-indigo-600" />}
          title="Договор"
          desc="Полный договор на оказание услуг по мойке. Авто-номер NN-MM/YY, срок 1 год."
          onClick={() => generate('contract')}
          busy={busy === 'contract'}
          disabled={ipMissing}
        />
        <DocButton
          icon={<FileText className="w-5 h-5 text-blue-600" />}
          title="Приложение №1 «Список автотранспорта»"
          desc={`Текущий автопарк: ${(agent.cars || []).length} машин`}
          onClick={() => generate('app1')}
          busy={busy === 'app1'}
          disabled={ipMissing}
        />
        <DocButton
          icon={<FileText className="w-5 h-5 text-emerald-600" />}
          title="Приложение №3 «Прейскурант»"
          desc={`${(agent.priceList || []).length} услуг в прайсе`}
          onClick={() => generate('app3')}
          busy={busy === 'app3'}
          disabled={ipMissing}
        />
        <DocButton
          icon={<FileText className="w-5 h-5 text-violet-600" />}
          title="Акт оказанных услуг (за месяц)"
          desc="С выбором месяца. Группировка услуг и общая сумма."
          onClick={() => setActDialogOpen(true)}
          busy={busy === 'act'}
          disabled={ipMissing}
        />
      </div>

      {/* Last result */}
      {lastResult && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-emerald-900 flex-1 min-w-0">
            <b>{lastResult.filename}</b>
            {lastResult.mode === 'folder' ? (
              <> сохранён в папку: <code className="bg-white px-1 rounded text-[11px]">{lastResult.path}</code></>
            ) : (
              <> скачан через браузер (Downloads).</>
            )}
          </div>
          <button onClick={() => setLastResult(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Phase 59-doc-ux: модал-подсказка какую папку выбрать */}
      <Dialog open={pickerHintOpen} onOpenChange={setPickerHintOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-indigo-500" />
              Подключение папки отчётов
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-[13px]">
            <p>
              Выбери <b>корневую</b> папку — приложение само создаст внутри подпапки по контрагентам и месяцам.
            </p>

            <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3">
              <div className="text-[11px] uppercase tracking-wider font-bold text-indigo-700 mb-1">
                Папка для выбора:
              </div>
              <code className="block text-[13px] font-mono text-indigo-900 break-all">
                C:\Users\S\Desktop\Данил\контр агенты отчеты
              </code>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Что произойдёт после выбора</div>
              <div className="text-[12px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg p-2.5 font-mono leading-relaxed">
                <div>контр агенты отчеты/  ← <span className="text-indigo-600 font-bold">твой выбор</span></div>
                <div>├── ИП Орлов/</div>
                <div>│   └── ЭкоФуд/</div>
                <div>│       ├── Договор и документы/</div>
                <div>│       │   └── Договор № 01-05-26 ЭкоФуд.docx  ← <span className="text-emerald-600">создастся автоматом</span></div>
                <div>│       └── 2026-05 Май/</div>
                <div>│           └── Акт Май 2026 ЭкоФуд.docx</div>
                <div>└── ИП Абанин/</div>
                <div>    └── &lt;другие КА&gt;/...</div>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900">
              <b className="block mb-1">⚠ Не выбирай:</b>
              <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                <li>Не подпапку <code className="bg-white px-1 rounded">ЭкоФуд</code></li>
                <li>Не подпапку <code className="bg-white px-1 rounded">ИП Орлов</code></li>
                <li>Не подпапку <code className="bg-white px-1 rounded">2026-05 Май</code></li>
              </ul>
              <div className="mt-1">→ Иначе будет двойная вложенность. Выбирай только <b>корневую</b> «контр агенты отчеты».</div>
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              💡 В системном picker'е сначала откроется <b>Desktop</b>. Зайди в папку <b>Данил</b>, найди <b>контр агенты отчеты</b>, <b>выдели её одним кликом</b> (не двойным!) и нажми кнопку <b>«Выбор папки»</b> снизу.
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPickerHintOpen(false)}>
              <X className="w-4 h-4 mr-1" /> Отмена
            </Button>
            <Button type="button" onClick={doActualPick} className="bg-indigo-600 hover:bg-indigo-700">
              <FolderOpen className="w-4 h-4 mr-1.5" /> Открыть выбор папки
              <ArrowRight className="w-3 h-3 ml-1.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning if picked subfolder */}
      {pickerWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-900 flex-1 min-w-0">{pickerWarning}</div>
          <button onClick={() => setPickerWarning(null)} className="text-amber-700 hover:text-amber-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Act month dialog */}
      <Dialog open={actDialogOpen} onOpenChange={setActDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Акт за период</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Месяц</label>
                <select value={actMonthIdx} onChange={e => setActMonthIdx(Number(e.target.value))} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md bg-white">
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-slate-600 mb-1">Год</label>
                <select value={actYear} onChange={e => setActYear(Number(e.target.value))} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-md bg-white">
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActDialogOpen(false)} disabled={busy === 'act'}>Отмена</Button>
            <Button onClick={() => generate('act')} disabled={busy === 'act'} className="bg-violet-600 hover:bg-violet-700">
              {busy === 'act' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
              Сформировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocButton({ icon, title, desc, onClick, busy, disabled }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void; busy?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={
        'text-left rounded-xl border p-3 transition-all ' +
        (disabled
          ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
          : busy
            ? 'bg-indigo-50 border-indigo-200 cursor-wait'
            : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm active:scale-[0.99]')
      }
    >
      <div className="flex items-start gap-2">
        {busy ? <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0 mt-0.5" /> : <span className="flex-shrink-0 mt-0.5">{icon}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900">{title}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
        </div>
        {!busy && !disabled && <Save className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />}
      </div>
    </button>
  );
}
