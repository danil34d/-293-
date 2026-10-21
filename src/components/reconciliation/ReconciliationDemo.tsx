'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import * as demoModel from '../../lib/reconciliation/demo-model';
import type { DemoEntry, DemoState, JournalFields, ReconciliationDataset } from '../../lib/reconciliation/demo-model';
import { DEMO_STORAGE_KEY, loadDemo, persistDemo, withDemoStorageLock } from '../../lib/reconciliation/demo-storage';
import type { ReconciliationCommand } from '../../lib/reconciliation/live-model';

const STATUS: Record<DemoEntry['status'], string> = {
  pending: 'Не проверено', verified: 'Сверено', question: 'Требует уточнения', explained: 'Объяснено',
};
const REASONS = [
  ['plate_unreadable', 'Номер не читается'], ['missing_camera', 'Машины нет на камере'],
  ['no_wash', 'Заезд без мойки'], ['other', 'Другая причина'],
] as const;

function Truck() {
  return <svg aria-hidden="true" viewBox="0 0 56 32" fill="none"><path d="M3 4h31v21H3zM34 12h10l8 8v5H34" fill="currentColor" opacity=".16"/><path d="M3 4h31v21H3zM34 12h10l8 8v5H34" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="26" r="4" fill="currentColor"/><circle cx="42" cy="26" r="4" fill="currentColor"/></svg>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="p06-modal" aria-label={title} onCancel={onClose}>
    <div className="p06-modal-head"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Закрыть окно">×</button></div>
    {children}
  </dialog>;
}

export type ReconciliationPresentation = {
  title: string;
  subtitle: string;
  notice: string;
  paperIntro: string;
  paperImage?: string;
  media?: Record<string, { thumbnail?: string; plate?: string; video?: string; label?: string }>;
  rowNotes?: Record<string, string>;
};

type ReconciliationProps = { dataset?: ReconciliationDataset; presentation?: ReconciliationPresentation; remote?: {
  state: DemoState;
  execute: (command: ReconciliationCommand, revision: number) => Promise<DemoState>;
  reload: () => Promise<DemoState>;
  onDirty: (dirty: boolean) => void;
  busy?: boolean;
} };

export default function ReconciliationDemo(props: ReconciliationProps) {
  // Смена набора не должна переносить черновики и открытые окна предыдущей смены.
  return <ReconciliationWorkspace key={props.dataset?.shiftId || 'demo'} {...props} />;
}

function ReconciliationWorkspace({ dataset, presentation, remote }: ReconciliationProps) {
  const model = useMemo(() => dataset ? demoModel.createReconciliationModel(dataset) : demoModel, [dataset]);
  const { addPaperEntry, completeShift, createDemoState, getSummary, mergeEntries,
    removePaperEntry, reviewEntry, saveEntry, unmergeEntry, validateDemoState } = model;
  const paper = dataset?.paper || demoModel.DEMO_PAPER;
  const isSnapshot = !!dataset;
  const storageKey = dataset ? `zorin:p06:reconciliation:${dataset.shiftId}:v1` : DEMO_STORAGE_KEY;
  const [state, setState] = useState<DemoState>(() => remote?.state ?? createDemoState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [externalChange, setExternalChange] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, JournalFields>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { reason: string; note: string }>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingPlate, setEditingPlate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'question'>('all');
  const [collapsed, setCollapsed] = useState(false);
  const [showPaper, setShowPaper] = useState(true);
  const [mediaEntry, setMediaEntry] = useState<DemoEntry | null>(null);
  const [paperImageOpen, setPaperImageOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [confirmUnmerge, setConfirmUnmerge] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const summary = getSummary(state);
  const fieldsFor = (entry: DemoEntry) => drafts[entry.id] || entry.fields;
  const dirty = (entry: DemoEntry) => JSON.stringify(fieldsFor(entry)) !== JSON.stringify(entry.fields);
  const reviewDirty = (entry: DemoEntry) => !!reviewDrafts[entry.id] && (reviewDrafts[entry.id].reason !== entry.reason || reviewDrafts[entry.id].note !== entry.note);
  const hasUnsaved = state.entries.some(entry => dirty(entry) || reviewDirty(entry));
  const locked = !ready || storageBlocked || externalChange || saving || !!remote?.busy;

  useEffect(() => {
    if (remote) { setReady(true); return; }
    try {
      const saved = loadDemo(window.localStorage, validateDemoState, storageKey);
      if (saved) { setState(saved); setNotice(isSnapshot ? 'Сверка восстановлена из этого браузера.' : 'Тестовая смена восстановлена из этого браузера.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Хранилище браузера недоступно.'); setStorageBlocked(true); }
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) {
        setExternalChange(true);
        setNotice(isSnapshot ? 'В другом окне изменена эта сверка. Ваш ввод сохранён на экране; загрузите новую версию.' : 'В другом окне изменена тестовая смена. Ваш ввод сохранён на экране; загрузите новую версию.');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey, validateDemoState, isSnapshot, !!remote]);

  useEffect(() => { if (remote?.state) setState(remote.state); }, [remote?.state]);
  useEffect(() => { remote?.onDirty(hasUnsaved || saving); }, [hasUnsaved, saving, remote?.onDirty]);

  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [hasUnsaved]);

  function changeField(entry: DemoEntry, key: keyof JournalFields, value: JournalFields[keyof JournalFields]) {
    remote?.onDirty(true);
    setDrafts(previous => ({ ...previous, [entry.id]: { ...(previous[entry.id] || entry.fields), [key]: value } }));
    setNotice('');
  }

  async function apply(command: (current: DemoState) => DemoState, message: string, action?: ReconciliationCommand): Promise<boolean> {
    if (savingRef.current) return false;
    if (locked) { setError('Сначала восстановите доступ к сохранённой версии.'); return false; }
    savingRef.current = true; setSaving(true);
    try {
      if (remote && !action) throw new Error('Не указано действие сохранения.');
      const next = remote ? await remote.execute(action!, state.revision) : await withDemoStorageLock(navigator.locks, () => {
        const updated = command(state);
        persistDemo(window.localStorage, updated, state.revision, validateDemoState, storageKey);
        return updated;
      }, storageKey);
      setState(next); setError(''); setNotice(remote ? message.replace('в этом браузере', 'на сервере') : message);
      return true;
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'SecurityError');
      setError(quota ? 'Браузер не разрешил сохранение. Поля остаются на экране; «Сверено» не установлено.' : e instanceof Error ? e.message : 'Не удалось сохранить. Поля остаются на экране.');
      return false;
    } finally {
      savingRef.current = false; setSaving(false);
    }
  }

  async function save(entry: DemoEntry) {
    if (await apply(current => saveEntry(current, entry.id, fieldsFor(entry), new Date().toISOString()), 'Поля сохранены в этом браузере. Результат сверки отмечается отдельно.', { type: 'save', id: entry.id, fields: fieldsFor(entry) })) {
      setDrafts(previous => { const next = { ...previous }; delete next[entry.id]; return next; });
      setEditingPlate(null);
    }
  }

  async function review(entry: DemoEntry, status: DemoEntry['status']) {
    if (dirty(entry)) { setError('Есть несохранённые поля. Сначала нажмите «Сохранить поля», затем отметьте результат сверки.'); return; }
    const input = reviewDrafts[entry.id] || { reason: entry.reason, note: entry.note };
    if (await apply(current => reviewEntry(current, entry.id, status, input.reason, input.note, new Date().toISOString()), `Результат: ${STATUS[status].toLowerCase()}.`, { type: 'review', id: entry.id, status, ...input })) {
      setReviewDrafts(previous => { const next = { ...previous }; delete next[entry.id]; return next; });
    }
  }

  function downloadCopy() {
    try {
      const raw = remote ? JSON.stringify(state, null, 2) : window.localStorage.getItem(storageKey) || JSON.stringify(state, null, 2);
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url;
      link.download = dataset ? `p06-sverka-${dataset.shiftId}.json` : 'p06-test-shift.json'; link.click();
      if (hasUnsaved) setNotice('Скачана сохранённая версия. Несохранённые поля остаются на экране и в копию не вошли.');
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Браузер не разрешил прочитать сохранённую копию. Ввод остаётся на экране.'); }
  }

  async function reset() {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try {
      const fresh = createDemoState();
      await withDemoStorageLock(navigator.locks, () => {
        const payload = JSON.stringify(fresh);
        window.localStorage.setItem(storageKey, payload);
        if (window.localStorage.getItem(storageKey) !== payload) throw new Error('Не удалось подтвердить сброс.');
      }, storageKey);
      setState(fresh); setDrafts({}); setReviewDrafts({}); setSelected([]); setExpanded(null); setEditingPlate(null);
      setError(''); setStorageBlocked(false); setExternalChange(false); setConfirmReset(false); setFilter('all');
      setNotice(isSnapshot ? 'Восстановлен исходный срез этой сверки. Сброшены только её правки в этом браузере.' : 'Создана новая тестовая смена. Изменён только учебный ключ этого браузера.');
    } catch (e) { setError(e instanceof Error ? e.message : isSnapshot ? 'Не удалось записать смену.' : 'Не удалось записать тестовую смену.'); setConfirmReset(false); }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function reload() {
    try {
      const saved = remote ? await remote.reload() : loadDemo(window.localStorage, validateDemoState, storageKey);
      setState(saved || createDemoState()); setDrafts({}); setReviewDrafts({}); setSelected([]); setEditingPlate(null);
      setExternalChange(false); setStorageBlocked(false); setError(''); setConfirmReload(false); setNotice('Загружена последняя сохранённая версия.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить смену.'); setConfirmReload(false); }
  }

  const visibleEntries = state.entries.filter(entry => filter === 'all' || entry.status === filter);
  const reviewInputs = (entry: DemoEntry) => reviewDrafts[entry.id] || { reason: entry.reason, note: entry.note };
  const input = (entry: DemoEntry, key: Exclude<keyof JournalFields, 'additional'>, label: string, placeholder = '') => (
    <label className="p06-field">{label}<input value={fieldsFor(entry)[key]} placeholder={placeholder} maxLength={key === 'plate' ? 24 : key === 'price' ? 40 : key === 'paperRow' ? 8 : key === 'payment' ? 80 : key === 'washType' ? 100 : 120}
      inputMode={key === 'price' ? 'decimal' : key === 'paperRow' ? 'numeric' : undefined}
      disabled={saving} onChange={event => changeField(entry, key, event.target.value)} /></label>
  );

  return <main className={`p06-root ${collapsed ? 'p06-collapsed' : ''}`}>
    <fieldset className="p06-controls" disabled={saving || remote?.busy}>
    {collapsed ? <section className="p06-mini" aria-label="Свёрнутый виджет">
      <span className="p06-eyebrow">{isSnapshot ? 'СВЕРКА ПО ЖУРНАЛУ' : 'ТЕСТОВАЯ СМЕНА'}</span><h1>{isSnapshot ? presentation?.title || 'Сверка с журналом' : 'Ночь · 14 → 15 октября'}</h1>
      <p>{state.completedAt ? 'Проверка завершена' : `Не проверено: ${summary.pending} · Вопросов: ${summary.question}`}</p>
      {(error || externalChange) && <p className="p06-mini-warning">Есть проблема сохранения</p>}
      {hasUnsaved && <p className="p06-mini-warning">Есть несохранённые поля</p>}
      <button className="p06-primary" onClick={() => setCollapsed(false)}>Развернуть сверку ↗</button>
    </section> : <div className="p06-workspace">
      <header className="p06-header"><div><span className="p06-eyebrow">ZORIN / ПРОВЕРКА СМЕНЫ</span><h1>{isSnapshot ? presentation?.title || 'Сверка с журналом' : 'Сверка с журналом'} <span className="p06-demo-tag">{remote ? 'Рабочая сверка' : isSnapshot ? 'Срез данных' : 'Демо'}</span></h1><p>{isSnapshot ? presentation?.subtitle || dataset.shiftId : 'Ночь · 14 октября 20:00 — 15 октября 08:00'} <span>Москва</span></p></div>
        <div className="p06-header-actions">{isSnapshot && <button onClick={downloadCopy}>Скачать сохранённую копию</button>}<button className="p06-quiet" onClick={() => setCollapsed(true)}>— Свернуть</button></div></header>
      <div className="p06-safety"><span className="p06-safety-dot" />{isSnapshot ? presentation?.notice || 'Правки сверки сохраняются в этом браузере. Записи камер и исходные номера OCR не изменяются.' : 'Учебная смена. Все машины и номера вымышлены. Сохранение — только в этом браузере.'}</div>
      <section className="p06-metrics" aria-label="Итог сверки">
        <div><span>Записей для разбора</span><strong>{summary.total}</strong></div>
        <div><span>Строк бумаги связано</span><strong>{summary.paperMatched}<small> / {paper.length}</small></strong></div>
        <div><span>Сверено</span><strong className="p06-green">{summary.verified}</strong></div>
        <div><span>Открытых вопросов</span><strong className={summary.question ? 'p06-amber' : ''}>{summary.question}</strong></div>
        <div className="p06-metrics-note"><span>Источник</span><b>{isSnapshot ? 'Журнал и кадры камер' : 'Тестовый набор'}</b><small>{remote ? 'Результаты сохраняются на сервере' : isSnapshot ? 'Сохранённый срез для проверки' : 'Камеры и рабочая БД не подключены'}</small></div>
      </section>
      <div className="p06-message-area" aria-live="polite">
        {error && <div role="alert" className="p06-error">{error}</div>}
        {notice && <div role="status" className="p06-notice">{notice}</div>}
        {(externalChange || storageBlocked) && <div className="p06-recovery"><button onClick={() => setConfirmReload(true)}>Загрузить сохранённую версию</button><button onClick={downloadCopy}>Скачать копию</button></div>}
      </div>
      <div className={`p06-columns ${showPaper ? '' : 'p06-no-paper'}`}>
        <section className="p06-list" aria-label="Записи смены">
          <div className="p06-toolbar"><div className="p06-tabs" role="group" aria-label="Фильтр записей">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Все <span>{summary.total}</span></button>
            <button aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>Не проверено <span>{summary.pending}</span></button>
            <button aria-pressed={filter === 'question'} onClick={() => setFilter('question')}>Вопросы <span>{summary.question}</span></button>
          </div><button className="p06-quiet" onClick={() => setShowPaper(!showPaper)}>{isSnapshot ? showPaper ? 'Скрыть журнал' : 'Показать журнал' : showPaper ? 'Скрыть пример бумаги' : 'Показать пример бумаги'}</button></div>
          {selected.length > 0 && <div className="p06-selection"><span>Выбрано: {selected.length}</span><button disabled={selected.length < 2 || locked} onClick={async () => {
            if (selected.some(id => { const e = state.entries.find(item => item.id === id); return e && (dirty(e) || reviewDirty(e)); })) { setError('Сначала сохраните или отмените поля и ввод результата выбранных записей.'); return; }
            if (await apply(current => mergeEntries(current, selected, new Date().toISOString()), isSnapshot ? 'Фрагменты связаны в этой сверке. Исходные записи камер сохранены.' : 'Фрагменты связаны в сверке. Исходники сохранены.', { type: 'merge', ids: selected })) {
              setExpanded(selected[0]);
              setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !selected.includes(id))));
              setReviewDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !selected.includes(id))));
              setSelected([]);
            }
          }}>Связать фрагменты</button><button onClick={() => setSelected([])}>Снять выделение</button></div>}
          <div className="p06-table-head" aria-hidden="true"><span /><span>Время / бокс</span><span>Госномер</span><span>Бумага</span><span>Результат</span><span /></div>
          {!ready && <p className="p06-empty">{isSnapshot ? 'Восстанавливаем сверку…' : 'Восстанавливаем учебную смену…'}</p>}
          {ready && visibleEntries.length === 0 && <p className="p06-empty">В этом фильтре записей нет. Остальные доступны во вкладке «Все».</p>}
          {ready && visibleEntries.map(entry => <article key={entry.id} className={`p06-entry ${expanded === entry.id ? 'p06-entry-open' : ''}`} data-entry-id={entry.id}>
            <div className="p06-row">
              <input type="checkbox" aria-label={`Выбрать запись ${entry.time} ${entry.id}`} checked={selected.includes(entry.id)} disabled={entry.source === 'paper'} onChange={e => setSelected(previous => e.target.checked ? [...previous, entry.id] : previous.filter(id => id !== entry.id))} />
              <button className="p06-time" onClick={async () => { setExpanded(expanded === entry.id ? null : entry.id); }}><strong>{entry.time || paper.find(row => row.row === entry.fields.paperRow)?.time || '—'}</strong><span>{entry.source === 'paper' ? 'Из журнала' : `Бокс ${entry.box}`}</span></button>
              <div className="p06-plate-cell">{editingPlate === entry.id ? <div className="p06-inline-edit"><input autoFocus aria-label={`Госномер записи ${entry.id}`} value={fieldsFor(entry).plate} maxLength={24} placeholder="Введите номер" onChange={e => changeField(entry, 'plate', e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); save(entry); }
                if (e.key === 'Escape') { changeField(entry, 'plate', entry.fields.plate); setEditingPlate(null); }
              }} /><button aria-label={`Сохранить номер ${entry.id}`} disabled={locked} onClick={() => save(entry)}>✓</button><button aria-label={`Отменить номер ${entry.id}`} onClick={async () => { changeField(entry, 'plate', entry.fields.plate); setEditingPlate(null); }}>×</button></div> : <button className="p06-plate" onClick={() => setEditingPlate(entry.id)}>{fieldsFor(entry).plate || 'Ввести номер'} <span aria-hidden="true">✎</span></button>}
                <small>{entry.evidence.length > 1 ? isSnapshot ? `Фрагментов: ${entry.evidence.length}` : `${entry.evidence.length} фрагмента` : entry.source === 'paper' ? isSnapshot ? 'Камерная запись не найдена в срезе' : 'Камерной записи нет' : entry.evidence[0]?.label}</small>
              </div>
              <span className="p06-paper-ref">{fieldsFor(entry).paperRow ? `№ ${fieldsFor(entry).paperRow}` : '—'}</span>
              <span className={`p06-status p06-status-${dirty(entry) ? 'pending' : entry.status}`}>{dirty(entry) ? 'Не сохранено' : STATUS[entry.status]}</span>
              <button className="p06-expand" aria-expanded={expanded === entry.id} aria-label={`Подробности записи ${entry.id}`} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>{expanded === entry.id ? '−' : '+'}</button>
            </div>
            {presentation?.rowNotes?.[entry.id] && <p className="p06-source-note"><span>По исходной сверке:</span> {presentation.rowNotes[entry.id]}</p>}
            {expanded === entry.id && <div className="p06-details">
              <div className="p06-evidence"><button className="p06-thumbnail" onClick={() => setMediaEntry(entry)} aria-label={`Посмотреть материалы ${entry.id}`}>{entry.evidence[0] && presentation?.media?.[entry.evidence[0].id]?.thumbnail ? <img src={presentation.media[entry.evidence[0].id].thumbnail} alt={`Кадр заезда ${entry.time}`} /> : <Truck />}<span>{isSnapshot ? 'Материалы' : 'Пример'}</span></button>
                <div><b>{entry.source === 'camera' ? 'Наблюдение камеры' : 'Запись добавлена из бумаги'}</b><p>{entry.evidence.length ? entry.evidence.map(item => `${item.time} · OCR: ${item.ocrPlate || 'не прочитан'}`).join(' / ') : 'Отдельно отметьте отсутствие машины на камере.'}</p><small>Исходный номер остаётся в материалах при любых исправлениях.</small></div>
                {entry.mergedFrom && <button className="p06-quiet" disabled={locked} onClick={async () => {
                  if (dirty(entry) || reviewDirty(entry)) { setError('Отмените несохранённые поля и ввод результата перед разделением.'); return; }
                  setConfirmUnmerge(entry.id);
                }}>Разделить обратно</button>}
                {entry.source === 'paper' && <button className="p06-quiet" disabled={locked} onClick={() => setConfirmRemove(entry.id)}>Убрать добавленную строку</button>}
              </div>
              <div className="p06-fields p06-main-fields">{input(entry, 'plate', 'Госномер', 'Например, А123ВС77')}{input(entry, 'paperRow', 'Строка бумажного журнала', `1–${paper.length}`)}</div>
              <details className="p06-paper-fields"><summary>Поля бумажного журнала <span>Компания, услуги, цены и сотрудники</span></summary>
                <div className="p06-fields">{input(entry, 'company', 'Компания')}{input(entry, 'payment', 'Оплата', 'Как записано в бумаге')}{input(entry, 'washType', 'Тип мойки', 'Снаружи')}{input(entry, 'wash', 'Мойка / услуга')}{input(entry, 'price', 'Цена мойки, ₽')}{input(entry, 'employee1', 'Сотрудник')}{input(entry, 'employee2', 'Сотрудник2')}</div>
                <p className="p06-help">Два поля сотрудников сохраняются отдельно. Цены — из журнала, расчёта тарифа и зарплаты здесь нет.</p>
                {fieldsFor(entry).additional.map((service, i) => <div className="p06-additional" key={i}><label>Доп. услуга {i + 1}<input value={service.name} maxLength={120} onChange={e => changeField(entry, 'additional', fieldsFor(entry).additional.map((item, index) => index === i ? { ...item, name: e.target.value } : item))} /></label><label>Цена, ₽<input inputMode="decimal" value={service.price} maxLength={20} onChange={e => changeField(entry, 'additional', fieldsFor(entry).additional.map((item, index) => index === i ? { ...item, price: e.target.value } : item))} /></label><button aria-label={`Убрать дополнительную услугу ${i + 1}`} onClick={() => changeField(entry, 'additional', fieldsFor(entry).additional.filter((_, index) => index !== i))}>×</button></div>)}
                <button className="p06-quiet" disabled={fieldsFor(entry).additional.length >= 10} onClick={() => changeField(entry, 'additional', [...fieldsFor(entry).additional, { name: '', price: '' }])}>+ Добавить услугу</button>
              </details>
              <div className="p06-save-row"><button className="p06-primary" disabled={locked} onClick={() => save(entry)}>Сохранить поля</button><button disabled={!dirty(entry)} onClick={async () => { setDrafts(previous => { const next = { ...previous }; delete next[entry.id]; return next; }); setEditingPlate(null); }}>Отменить правки</button><small>{dirty(entry) ? 'Изменения ещё не сохранены' : entry.savedAt ? 'Поля сохранены · результат сверки отдельно' : 'Сначала сохраните поля строки'}</small></div>
              <div className="p06-review"><div className="p06-review-title"><b>Результат проверки</b><small>Сверяйте конкретный заезд с бумагой</small></div>
                <div className="p06-fields"><label className="p06-field">Причина для вопроса или объяснения<select value={reviewInputs(entry).reason} onChange={e => setReviewDrafts(previous => ({ ...previous, [entry.id]: { ...reviewInputs(entry), reason: e.target.value } }))}><option value="">Выберите причину</option>{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="p06-field">Комментарий<input value={reviewInputs(entry).note} maxLength={500} placeholder="Что выяснить или чем объясняется расхождение" onChange={e => setReviewDrafts(previous => ({ ...previous, [entry.id]: { ...reviewInputs(entry), note: e.target.value } }))} /></label></div>
                <div className="p06-review-actions"><button className="p06-success" disabled={locked} onClick={() => review(entry, 'verified')}>✓ Сверено с журналом</button><button disabled={locked} onClick={() => review(entry, 'question')}>Требует уточнения</button><button disabled={locked} onClick={() => review(entry, 'explained')}>Расхождение объяснено</button>{entry.status !== 'pending' && <button className="p06-quiet" disabled={locked} onClick={() => review(entry, 'pending')}>Снять отметку</button>}{reviewDirty(entry) && <button className="p06-quiet" onClick={() => setReviewDrafts(previous => { const next = { ...previous }; delete next[entry.id]; return next; })}>Отменить ввод результата</button>}</div>
              </div>
            </div>}
          </article>)}
          <div className="p06-add-row"><button disabled={locked} onClick={async () => {
            const id = `paper-${crypto.randomUUID()}`;
            if (await apply(current => addPaperEntry(current, id, new Date().toISOString()), 'Добавлена строка из бумаги. Впишите номер и строку журнала; сохраните поля отдельно.', { type: 'add-paper', id })) { setExpanded(id); setFilter('all'); }
          }}>+ Добавить машину из журнала</button><span>Если для неё нет камерной записи</span></div>
        </section>
        {showPaper && <aside className="p06-paper" aria-label={isSnapshot ? 'Исходный бумажный журнал' : 'Пример бумажного журнала'}>
          <span className="p06-eyebrow">{isSnapshot ? 'ИСХОДНИК ДЛЯ СВЕРКИ' : 'ПРИМЕР ДЛЯ СВЕРКИ'}</span><h2>Бумажный журнал</h2>
          <p>{isSnapshot ? presentation?.paperIntro || `Строк на бумаге: ${paper.length}. Исправляйте поля в карточках; исходник сохраняется.` : 'Четыре строки учебной ночной смены. Сравните их с записями слева.'}</p>
          {presentation?.paperImage && <button className="p06-paper-photo" onClick={() => setPaperImageOpen(true)}><img src={presentation.paperImage} alt="Фото журнала для сверки номеров" /><span>Открыть фото журнала</span></button>}
          <ol>{paper.map(row => <li key={row.row}><div><span>№ {row.row}{row.time ? ` · ${row.time}` : ''}</span><strong>{row.plate || 'Номер не разобран'}</strong></div>{(row.wash || row.price) && <small>{[row.wash, row.price ? `${row.price} ₽` : ''].filter(Boolean).join(' · ')}</small>}{'note' in row && row.note && <p className="p06-paper-row-note">{row.note}</p>}</li>)}</ol>
          <div className="p06-paper-tip"><b>{isSnapshot ? 'Как сверять' : 'Как попробовать'}</b><p>{isSnapshot ? 'Нажмите на номер слева, исправьте его и сохраните поля. Для фото, комментария и результата проверки раскройте карточку. Отметку «Сверено» поставьте после проверки всего заезда.' : 'Начните с 21:14. Свяжите два фрагмента 23:37 и 23:40. Проверьте нечитаемый номер по бумаге, добавьте пропущенную машину и объясните лишний заезд.'}</p></div><p className="p06-paper-footnote">Равное количество строк не гарантирует совпадение машин.</p>
        </aside>}
      </div>
      <footer className="p06-footer"><div><b>{state.completedAt ? isSnapshot ? 'Сверка завершена' : 'Учебная смена сверена' : 'Сверка ещё не завершена'}</b><p>{state.completedAt ? (remote ? 'Результаты и объяснения сохранены на сервере.' : 'Результаты и объяснения сохранены в этом браузере.') : `Не проверено: ${summary.pending} · Вопросов: ${summary.question} · Объяснено: ${summary.explained}`}</p></div><div className="p06-footer-actions"><button className="p06-quiet" onClick={() => remote ? setConfirmReload(true) : setConfirmReset(true)}>{remote ? 'Загрузить с сервера' : 'Начать заново'}</button><button className="p06-primary" disabled={locked || !summary.canComplete || hasUnsaved || !!state.completedAt} onClick={() => apply(current => completeShift(current, new Date().toISOString()), isSnapshot ? 'Сверка завершена. Все строки бумаги учтены, открытых вопросов нет.' : 'Учебная смена сверена. Все строки бумаги учтены, открытых вопросов нет.', { type: 'complete' })}>Завершить сверку</button></div></footer>
      <p className="p06-bottom-note">{remote ? 'Сверка сохраняется на сервере. Исходники камер и финансовый учёт не изменяются. Отметка подтверждает проверку известных заездов; полнота камерной записи не доказана.' : isSnapshot ? 'Исправления и отметки хранятся в этом браузере отдельно от баз камер и учёта. Кнопка «Скачать сохранённую копию» сохраняет результат в JSON. Новые заезды после времени среза сюда автоматически не добавляются.' : 'Это первый интерактивный этап P06. Windows-напоминание в 08:00, реальные видео и серверное сохранение ещё не подключены.'}</p>
    </div>}
    {mediaEntry && <Modal title={isSnapshot ? 'Материалы заезда' : 'Материалы тестового заезда'} onClose={() => setMediaEntry(null)}>
      <p>{isSnapshot ? 'Кадры исходного заезда. OCR ниже показан в исходном виде, даже если номер в карточке уже исправлен.' : 'Это иллюстрация учебных данных. Реальные фотографии и видео не загружаются.'}</p>
      <div className={`p06-media-grid ${isSnapshot ? 'p06-media-real' : ''}`}>{mediaEntry.evidence.map(item => <div className="p06-media-example" key={item.id}>
        {presentation?.media?.[item.id]?.thumbnail ? <img src={presentation.media[item.id].thumbnail} alt={`Кадр заезда ${item.time}`} /> : <Truck />}
        <b>{item.time} · Бокс {item.box}</b><p>{item.label}</p>
        {presentation?.media?.[item.id]?.plate && <img className="p06-plate-image" src={presentation.media[item.id].plate} alt={`Номер крупным планом, заезд ${item.time}`} />}
        {presentation?.media?.[item.id]?.video && <video controls preload="none" src={presentation.media[item.id].video} aria-label={`Видео заезда ${item.time}`} />}
        {presentation?.media?.[item.id]?.label && <p>{presentation.media[item.id].label}</p>}
        <code>{isSnapshot ? 'Исходный OCR' : 'OCR'}: {item.ocrPlate || 'не прочитан'}</code><small>Исходник: {item.id}</small>
      </div>)}</div>{!mediaEntry.evidence.length && <p>{isSnapshot ? 'Для этой строки камерная запись в срезе не найдена.' : 'Для записи из бумажного журнала камерные материалы отсутствуют.'}</p>}<button onClick={() => setMediaEntry(null)}>Вернуться к сверке</button>
    </Modal>}
    {paperImageOpen && presentation?.paperImage && <Modal title="Фото бумажного журнала" onClose={() => setPaperImageOpen(false)}><img className="p06-paper-full" src={presentation.paperImage} alt="Исходное фото бумажного журнала" /><button onClick={() => setPaperImageOpen(false)}>Вернуться к сверке</button></Modal>}
    {confirmReset && <Modal title={isSnapshot ? 'Начать эту сверку заново?' : 'Начать тестовую смену заново?'} onClose={() => setConfirmReset(false)}><p>{isSnapshot ? 'Правки и отметки этой сверки в текущем браузере будут заменены исходным срезом. Несохранённые поля также сбросятся. Перед сбросом можно скачать сохранённую копию.' : 'Только результаты этой учебной смены в текущем браузере будут заменены исходным примером. Несохранённые поля также сбросятся.'}</p><div className="p06-modal-actions"><button onClick={downloadCopy}>Скачать копию</button><button onClick={() => setConfirmReset(false)}>Отмена</button><button className="p06-primary" onClick={reset}>{isSnapshot ? 'Сбросить правки сверки' : 'Сбросить тестовую смену'}</button></div></Modal>}
    {confirmReload && <Modal title="Загрузить сохранённую версию?" onClose={() => setConfirmReload(false)}><p>Несохранённый ввод в этом окне будет заменён данными браузера. Перед загрузкой можно скопировать нужные поля.</p><div className="p06-modal-actions"><button onClick={() => setConfirmReload(false)}>Отмена</button><button className="p06-primary" onClick={reload}>Загрузить версию</button></div></Modal>}
    {confirmUnmerge && <Modal title="Восстановить отдельные фрагменты?" onClose={() => setConfirmUnmerge(null)}><p>Будут восстановлены строки в состоянии до связывания. Поля и отметки, внесённые в общую строку после связывания, будут отменены. Исходные камерные материалы сохранятся.</p><div className="p06-modal-actions"><button onClick={() => setConfirmUnmerge(null)}>Отмена</button><button className="p06-primary" onClick={async () => { if (await apply(current => unmergeEntry(current, confirmUnmerge, new Date().toISOString()), 'Восстановлены исходные строки до связывания.', { type: 'unmerge', id: confirmUnmerge })) { setExpanded(null); setConfirmUnmerge(null); setDrafts(previous => { const next = { ...previous }; delete next[confirmUnmerge]; return next; }); setReviewDrafts(previous => { const next = { ...previous }; delete next[confirmUnmerge]; return next; }); setSelected([]); } }}>Восстановить фрагменты</button></div></Modal>}
    {confirmRemove && <Modal title="Убрать добавленную строку?" onClose={() => setConfirmRemove(null)}><p>{isSnapshot ? 'Будет убрана строка этой сверки со всеми её правками. Исходное фото и список бумажного журнала сохранятся.' : 'Будет удалена только вручную добавленная учебная строка со всеми её полями. Камерные записи останутся.'}</p><div className="p06-modal-actions"><button onClick={() => setConfirmRemove(null)}>Отмена</button><button className="p06-primary" onClick={async () => { if (await apply(current => removePaperEntry(current, confirmRemove, new Date().toISOString()), isSnapshot ? 'Строка убрана из сверки. Исходный бумажный журнал сохранён.' : 'Добавленная учебная строка убрана.', { type: 'remove-paper', id: confirmRemove })) { setExpanded(null); setConfirmRemove(null); setDrafts(previous => { const next = { ...previous }; delete next[confirmRemove]; return next; }); setReviewDrafts(previous => { const next = { ...previous }; delete next[confirmRemove]; return next; }); } }}>Убрать строку</button></div></Modal>}
    </fieldset>
  </main>;
}
