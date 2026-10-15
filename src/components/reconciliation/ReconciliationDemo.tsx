'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  addPaperEntry, completeShift, createDemoState, DEMO_PAPER, getSummary,
  mergeEntries, removePaperEntry, reviewEntry, saveEntry, unmergeEntry, validateDemoState,
} from '../../lib/reconciliation/demo-model';
import type { DemoEntry, DemoState, JournalFields } from '../../lib/reconciliation/demo-model';
import { DEMO_STORAGE_KEY, loadDemo, persistDemo, withDemoStorageLock } from '../../lib/reconciliation/demo-storage';

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

export default function ReconciliationDemo() {
  const [state, setState] = useState<DemoState>(() => createDemoState());
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
  const locked = !ready || storageBlocked || externalChange || saving;

  useEffect(() => {
    try {
      const saved = loadDemo(window.localStorage, validateDemoState);
      if (saved) { setState(saved); setNotice('Тестовая смена восстановлена из этого браузера.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Хранилище браузера недоступно.'); setStorageBlocked(true); }
    setReady(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === DEMO_STORAGE_KEY || event.key === null) {
        setExternalChange(true);
        setNotice('В другом окне изменена тестовая смена. Ваш ввод сохранён на экране; загрузите новую версию.');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onUnload = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [hasUnsaved]);

  function changeField(entry: DemoEntry, key: keyof JournalFields, value: JournalFields[keyof JournalFields]) {
    setDrafts(previous => ({ ...previous, [entry.id]: { ...(previous[entry.id] || entry.fields), [key]: value } }));
    setNotice('');
  }

  async function apply(command: (current: DemoState) => DemoState, message: string): Promise<boolean> {
    if (savingRef.current) return false;
    if (locked) { setError('Сначала восстановите доступ к сохранённой версии.'); return false; }
    savingRef.current = true; setSaving(true);
    try {
      const next = await withDemoStorageLock(navigator.locks, () => {
        const updated = command(state);
        persistDemo(window.localStorage, updated, state.revision, validateDemoState);
        return updated;
      });
      setState(next); setError(''); setNotice(message);
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
    if (await apply(current => saveEntry(current, entry.id, fieldsFor(entry), new Date().toISOString()), 'Поля сохранены в этом браузере. Результат сверки отмечается отдельно.')) {
      setDrafts(previous => { const next = { ...previous }; delete next[entry.id]; return next; });
      setEditingPlate(null);
    }
  }

  async function review(entry: DemoEntry, status: DemoEntry['status']) {
    if (dirty(entry)) { setError('Есть несохранённые поля. Сначала нажмите «Сохранить поля», затем отметьте результат сверки.'); return; }
    const input = reviewDrafts[entry.id] || { reason: entry.reason, note: entry.note };
    if (await apply(current => reviewEntry(current, entry.id, status, input.reason, input.note, new Date().toISOString()), `Результат: ${STATUS[status].toLowerCase()}.`)) {
      setReviewDrafts(previous => { const next = { ...previous }; delete next[entry.id]; return next; });
    }
  }

  function downloadCopy() {
    try {
      const raw = window.localStorage.getItem(DEMO_STORAGE_KEY) || JSON.stringify(state, null, 2);
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'p06-test-shift.json'; link.click();
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
        window.localStorage.setItem(DEMO_STORAGE_KEY, payload);
        if (window.localStorage.getItem(DEMO_STORAGE_KEY) !== payload) throw new Error('Не удалось подтвердить сброс.');
      });
      setState(fresh); setDrafts({}); setReviewDrafts({}); setSelected([]); setExpanded(null); setEditingPlate(null);
      setError(''); setStorageBlocked(false); setExternalChange(false); setConfirmReset(false); setFilter('all');
      setNotice('Создана новая тестовая смена. Изменён только учебный ключ этого браузера.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось записать тестовую смену.'); setConfirmReset(false); }
    finally { savingRef.current = false; setSaving(false); }
  }

  function reload() {
    try {
      const saved = loadDemo(window.localStorage, validateDemoState);
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
    <fieldset className="p06-controls" disabled={saving}>
    {collapsed ? <section className="p06-mini" aria-label="Свёрнутый виджет">
      <span className="p06-eyebrow">ТЕСТОВАЯ СМЕНА</span><h1>Ночь · 14 → 15 октября</h1>
      <p>{state.completedAt ? 'Проверка завершена' : `Не проверено: ${summary.pending} · Вопросов: ${summary.question}`}</p>
      {(error || externalChange) && <p className="p06-mini-warning">Есть проблема сохранения</p>}
      {hasUnsaved && <p className="p06-mini-warning">Есть несохранённые поля</p>}
      <button className="p06-primary" onClick={() => setCollapsed(false)}>Развернуть сверку ↗</button>
    </section> : <div className="p06-workspace">
      <header className="p06-header"><div><span className="p06-eyebrow">ZORIN / ПРОВЕРКА СМЕНЫ</span><h1>Сверка с журналом <span className="p06-demo-tag">Демо</span></h1><p>Ночь · 14 октября 20:00 — 15 октября 08:00 <span>Москва</span></p></div>
        <button className="p06-quiet" onClick={() => setCollapsed(true)}>— Свернуть</button></header>
      <div className="p06-safety"><span className="p06-safety-dot" />Учебная смена. Все машины и номера вымышлены. Сохранение — только в этом браузере.</div>
      <section className="p06-metrics" aria-label="Итог сверки">
        <div><span>Записей для разбора</span><strong>{summary.total}</strong></div>
        <div><span>Строк бумаги связано</span><strong>{summary.paperMatched}<small> / {DEMO_PAPER.length}</small></strong></div>
        <div><span>Сверено</span><strong className="p06-green">{summary.verified}</strong></div>
        <div><span>Открытых вопросов</span><strong className={summary.question ? 'p06-amber' : ''}>{summary.question}</strong></div>
        <div className="p06-metrics-note"><span>Источник</span><b>Тестовый набор</b><small>Камеры и рабочая БД не подключены</small></div>
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
          </div><button className="p06-quiet" onClick={() => setShowPaper(!showPaper)}>{showPaper ? 'Скрыть пример бумаги' : 'Показать пример бумаги'}</button></div>
          {selected.length > 0 && <div className="p06-selection"><span>Выбрано: {selected.length}</span><button disabled={selected.length < 2 || locked} onClick={async () => {
            if (selected.some(id => { const e = state.entries.find(item => item.id === id); return e && (dirty(e) || reviewDirty(e)); })) { setError('Сначала сохраните или отмените поля и ввод результата выбранных записей.'); return; }
            if (await apply(current => mergeEntries(current, selected, new Date().toISOString()), 'Фрагменты связаны только в учебной сверке. Исходники сохранены.')) {
              setExpanded(selected[0]);
              setDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !selected.includes(id))));
              setReviewDrafts(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !selected.includes(id))));
              setSelected([]);
            }
          }}>Связать фрагменты</button><button onClick={() => setSelected([])}>Снять выделение</button></div>}
          <div className="p06-table-head" aria-hidden="true"><span /><span>Время / бокс</span><span>Госномер</span><span>Бумага</span><span>Результат</span><span /></div>
          {!ready && <p className="p06-empty">Восстанавливаем учебную смену…</p>}
          {ready && visibleEntries.length === 0 && <p className="p06-empty">В этом фильтре записей нет. Остальные доступны во вкладке «Все».</p>}
          {ready && visibleEntries.map(entry => <article key={entry.id} className={`p06-entry ${expanded === entry.id ? 'p06-entry-open' : ''}`} data-entry-id={entry.id}>
            <div className="p06-row">
              <input type="checkbox" aria-label={`Выбрать запись ${entry.time} ${entry.id}`} checked={selected.includes(entry.id)} disabled={entry.source === 'paper'} onChange={e => setSelected(previous => e.target.checked ? [...previous, entry.id] : previous.filter(id => id !== entry.id))} />
              <button className="p06-time" onClick={async () => { setExpanded(expanded === entry.id ? null : entry.id); }}><strong>{entry.time || DEMO_PAPER.find(row => row.row === entry.fields.paperRow)?.time || '—'}</strong><span>{entry.source === 'paper' ? 'Из журнала' : `Бокс ${entry.box}`}</span></button>
              <div className="p06-plate-cell">{editingPlate === entry.id ? <div className="p06-inline-edit"><input autoFocus aria-label={`Госномер записи ${entry.id}`} value={fieldsFor(entry).plate} maxLength={24} placeholder="Введите номер" onChange={e => changeField(entry, 'plate', e.target.value)} onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); save(entry); }
                if (e.key === 'Escape') { changeField(entry, 'plate', entry.fields.plate); setEditingPlate(null); }
              }} /><button aria-label={`Сохранить номер ${entry.id}`} disabled={locked} onClick={() => save(entry)}>✓</button><button aria-label={`Отменить номер ${entry.id}`} onClick={async () => { changeField(entry, 'plate', entry.fields.plate); setEditingPlate(null); }}>×</button></div> : <button className="p06-plate" onClick={() => setEditingPlate(entry.id)}>{fieldsFor(entry).plate || 'Ввести номер'} <span aria-hidden="true">✎</span></button>}
                <small>{entry.evidence.length > 1 ? `${entry.evidence.length} фрагмента` : entry.source === 'paper' ? 'Камерной записи нет' : entry.evidence[0]?.label}</small>
              </div>
              <span className="p06-paper-ref">{fieldsFor(entry).paperRow ? `№ ${fieldsFor(entry).paperRow}` : '—'}</span>
              <span className={`p06-status p06-status-${dirty(entry) ? 'pending' : entry.status}`}>{dirty(entry) ? 'Не сохранено' : STATUS[entry.status]}</span>
              <button className="p06-expand" aria-expanded={expanded === entry.id} aria-label={`Подробности записи ${entry.id}`} onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>{expanded === entry.id ? '−' : '+'}</button>
            </div>
            {expanded === entry.id && <div className="p06-details">
              <div className="p06-evidence"><button className="p06-thumbnail" onClick={() => setMediaEntry(entry)} aria-label={`Посмотреть материалы ${entry.id}`}><Truck /><span>Пример</span></button>
                <div><b>{entry.source === 'camera' ? 'Наблюдение камеры' : 'Запись добавлена из бумаги'}</b><p>{entry.evidence.length ? entry.evidence.map(item => `${item.time} · OCR: ${item.ocrPlate || 'не прочитан'}`).join(' / ') : 'Отдельно отметьте отсутствие машины на камере.'}</p><small>Исходный номер остаётся в материалах при любых исправлениях.</small></div>
                {entry.mergedFrom && <button className="p06-quiet" disabled={locked} onClick={async () => {
                  if (dirty(entry) || reviewDirty(entry)) { setError('Отмените несохранённые поля и ввод результата перед разделением.'); return; }
                  setConfirmUnmerge(entry.id);
                }}>Разделить обратно</button>}
                {entry.source === 'paper' && <button className="p06-quiet" disabled={locked} onClick={() => setConfirmRemove(entry.id)}>Убрать добавленную строку</button>}
              </div>
              <div className="p06-fields p06-main-fields">{input(entry, 'plate', 'Госномер', 'Например, А123ВС77')}{input(entry, 'paperRow', 'Строка бумажного журнала', '1–4')}</div>
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
            if (await apply(current => addPaperEntry(current, id, new Date().toISOString()), 'Добавлена строка из бумаги. Впишите номер и строку журнала; сохраните поля отдельно.')) { setExpanded(id); setFilter('all'); }
          }}>+ Добавить машину из журнала</button><span>Если для неё нет камерной записи</span></div>
        </section>
        {showPaper && <aside className="p06-paper" aria-label="Пример бумажного журнала"><span className="p06-eyebrow">ПРИМЕР ДЛЯ СВЕРКИ</span><h2>Бумажный журнал</h2><p>Четыре строки учебной ночной смены. Сравните их с записями слева.</p><ol>{DEMO_PAPER.map(row => <li key={row.row}><div><span>№ {row.row} · {row.time}</span><strong>{row.plate}</strong></div><small>{row.wash} · {row.price} ₽</small></li>)}</ol><div className="p06-paper-tip"><b>Как попробовать</b><p>Начните с 21:14. Свяжите два фрагмента 23:37 и 23:40. Проверьте нечитаемый номер по бумаге, добавьте пропущенную машину и объясните лишний заезд.</p></div><p className="p06-paper-footnote">Равное количество строк не гарантирует совпадение машин.</p></aside>}
      </div>
      <footer className="p06-footer"><div><b>{state.completedAt ? 'Учебная смена сверена' : 'Сверка ещё не завершена'}</b><p>{state.completedAt ? 'Результаты и объяснения сохранены в этом браузере.' : `Не проверено: ${summary.pending} · Вопросов: ${summary.question} · Объяснено: ${summary.explained}`}</p></div><div className="p06-footer-actions"><button className="p06-quiet" onClick={() => setConfirmReset(true)}>Начать заново</button><button className="p06-primary" disabled={locked || !summary.canComplete || hasUnsaved || !!state.completedAt} onClick={() => apply(current => completeShift(current, new Date().toISOString()), 'Учебная смена сверена. Все строки бумаги учтены, открытых вопросов нет.')}>Завершить сверку</button></div></footer>
      <p className="p06-bottom-note">Это первый интерактивный этап P06. Windows-напоминание в 08:00, реальные видео и серверное сохранение ещё не подключены.</p>
    </div>}
    {mediaEntry && <Modal title="Материалы тестового заезда" onClose={() => setMediaEntry(null)}><p>Это иллюстрация учебных данных. Реальные фотографии и видео не загружаются.</p><div className="p06-media-grid">{mediaEntry.evidence.map(item => <div className="p06-media-example" key={item.id}><Truck /><b>{item.time} · Бокс {item.box}</b><p>{item.label}</p><code>OCR: {item.ocrPlate || 'не прочитан'}</code><small>Исходник: {item.id}</small></div>)}</div>{!mediaEntry.evidence.length && <p>Для записи из бумажного журнала камерные материалы отсутствуют.</p>}<button onClick={() => setMediaEntry(null)}>Вернуться к сверке</button></Modal>}
    {confirmReset && <Modal title="Начать тестовую смену заново?" onClose={() => setConfirmReset(false)}><p>Только результаты этой учебной смены в текущем браузере будут заменены исходным примером. Несохранённые поля также сбросятся.</p><div className="p06-modal-actions"><button onClick={downloadCopy}>Скачать копию</button><button onClick={() => setConfirmReset(false)}>Отмена</button><button className="p06-primary" onClick={reset}>Сбросить тестовую смену</button></div></Modal>}
    {confirmReload && <Modal title="Загрузить сохранённую версию?" onClose={() => setConfirmReload(false)}><p>Несохранённый ввод в этом окне будет заменён данными браузера. Перед загрузкой можно скопировать нужные поля.</p><div className="p06-modal-actions"><button onClick={() => setConfirmReload(false)}>Отмена</button><button className="p06-primary" onClick={reload}>Загрузить версию</button></div></Modal>}
    {confirmUnmerge && <Modal title="Восстановить отдельные фрагменты?" onClose={() => setConfirmUnmerge(null)}><p>Будут восстановлены строки в состоянии до связывания. Поля и отметки, внесённые в общую строку после связывания, будут отменены. Исходные камерные материалы сохранятся.</p><div className="p06-modal-actions"><button onClick={() => setConfirmUnmerge(null)}>Отмена</button><button className="p06-primary" onClick={async () => { if (await apply(current => unmergeEntry(current, confirmUnmerge, new Date().toISOString()), 'Восстановлены исходные строки до связывания.')) { setExpanded(null); setConfirmUnmerge(null); setDrafts(previous => { const next = { ...previous }; delete next[confirmUnmerge]; return next; }); setReviewDrafts(previous => { const next = { ...previous }; delete next[confirmUnmerge]; return next; }); setSelected([]); } }}>Восстановить фрагменты</button></div></Modal>}
    {confirmRemove && <Modal title="Убрать добавленную строку?" onClose={() => setConfirmRemove(null)}><p>Будет удалена только вручную добавленная учебная строка со всеми её полями. Камерные записи останутся.</p><div className="p06-modal-actions"><button onClick={() => setConfirmRemove(null)}>Отмена</button><button className="p06-primary" onClick={async () => { if (await apply(current => removePaperEntry(current, confirmRemove, new Date().toISOString()), 'Добавленная учебная строка убрана.')) { setExpanded(null); setConfirmRemove(null); setDrafts(previous => { const next = { ...previous }; delete next[confirmRemove]; return next; }); setReviewDrafts(previous => { const next = { ...previous }; delete next[confirmRemove]; return next; }); } }}>Убрать строку</button></div></Modal>}
    </fieldset>
  </main>;
}
