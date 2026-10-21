'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReconciliationDemo, { type ReconciliationPresentation } from './ReconciliationDemo';
import type { PaperRow } from '../../lib/reconciliation/demo-model';
import type { LiveReconciliation as Document, ShiftKey } from '../../lib/reconciliation/live-types';
import type { ReconciliationCommand } from '../../lib/reconciliation/live-model';
import { previousShift } from '../../lib/reconciliation/shift';

const query = (shift: ShiftKey) => new URLSearchParams(shift).toString();
const time = (value: string | null) => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : 'ещё не загружались';
type History = { revision: number; action: string; actorId: string; createdAt: string };
const actions: Record<string, string> = { 'paper-image': 'Добавлено фото журнала', refresh: 'Обновлены камеры', save: 'Сохранены поля', review: 'Отмечен результат', 'set-paper': 'Изменён журнал', merge: 'Связаны фрагменты', unmerge: 'Разделены фрагменты', complete: 'Сверка завершена', 'finish-review': 'Просмотр закончен', 'add-paper': 'Добавлена запись без камеры', 'remove-paper': 'Удалена ручная запись' };
const columns = { row: 'Строка', time: 'Время', plate: 'Номер', wash: 'Услуга', price: 'Цена', employee1: 'Сотрудник 1', employee2: 'Сотрудник 2', note: 'Примечание' } as const;

async function readResponse(response: Response): Promise<Document> {
  if (response.status === 401) throw new Error('Войдите в кабинет владельца, затем повторите загрузку.');
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Сервер не подтвердил действие.');
  return value;
}

export default function LiveReconciliation() {
  const [shift, setShift] = useState<ShiftKey>(() => previousShift(new Date()));
  const [document, setDocument] = useState<Document | null>(null);
  const current = useRef<Document | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paperOpen, setPaperOpen] = useState(false);
  const paperOpenRef = useRef(false);
  const [rows, setRows] = useState<PaperRow[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<History[] | null>(null);
  const onDirty = useCallback((value: boolean) => { dirtyRef.current = value; setDirty(value); }, []);
  const accept = useCallback((value: Document) => { current.current = value; setDocument(value); return value; }, []);

  const load = useCallback(async () => {
    if (busyRef.current) throw new Error('Дождитесь окончания предыдущего действия.');
    busyRef.current = true; setBusy(true);
    try { const value = accept(await readResponse(await fetch(`/api/reconciliation?${query(shift)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }))); setError(''); return value; }
    finally { busyRef.current = false; setBusy(false); }
  }, [shift, accept]);

  const execute = useCallback(async (command: ReconciliationCommand | { type: 'refresh' }, revision?: number) => {
    if (busyRef.current) throw new Error('Дождитесь окончания предыдущего действия.');
    busyRef.current = true; setBusy(true);
    try {
      const value = await readResponse(await fetch('/api/reconciliation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({ ...shift, expectedRevision: revision ?? current.current?.state.revision ?? 0, command }),
      }));
      setError(''); return accept(value);
    } finally { busyRef.current = false; setBusy(false); }
  }, [shift, accept]);

  useEffect(() => {
    let active = true;
    current.current = null; setDocument(null); setHistory(null); setError(''); onDirty(false);
    busyRef.current = true; setBusy(true);
    fetch(`/api/reconciliation?${query(shift)}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then(readResponse)
      .then(value => { if (active) accept(value); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) { busyRef.current = false; setBusy(false); } });
    return () => { active = false; };
  }, [shift, accept, onDirty]);

  useEffect(() => {
    const refresh = () => {
      if (!current.current || busyRef.current || dirtyRef.current || paperOpenRef.current || window.document.hidden) return;
      void execute({ type: 'refresh' }).catch(e => setError(e.message));
    };
    // Сразу после открытия получаем живые данные, далее — раз в минуту без прерывания ввода.
    const first = window.setTimeout(refresh, 1200);
    const interval = window.setInterval(refresh, 60000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [execute]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (paperOpenRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);

  useEffect(() => {
    let lastMorning = new Date(Date.now() + 3 * 3600000 - 8 * 3600000).toISOString().slice(0, 10);
    const timer = window.setInterval(() => {
      const morning = new Date(Date.now() + 3 * 3600000 - 8 * 3600000).toISOString().slice(0, 10);
      if (morning === lastMorning || busyRef.current || dirtyRef.current || paperOpenRef.current) return;
      lastMorning = morning; setShift(previousShift(new Date()));
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  function editPaper() {
    if (!document) return;
    setRows(document.dataset.paper.map(row => ({ ...row })));
    setConfirmed(document.paperConfirmed); setPaperOpen(true); paperOpenRef.current = true;
  }
  async function savePaper() {
    try { await execute({ type: 'set-paper', rows, confirmed }); setPaperOpen(false); paperOpenRef.current = false; }
    catch (e) { setError(e instanceof Error ? e.message : 'Журнал не сохранён.'); }
  }
  async function showHistory() {
    try {
      const response = await fetch(`/api/reconciliation?${query(shift)}&history=1`, { cache: 'no-store' });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || 'История недоступна.');
      setHistory(value.history);
    } catch (e) { setError(e instanceof Error ? e.message : 'История недоступна.'); }
  }

  async function uploadPhoto(file: File) {
    if (!current.current || busyRef.current || dirtyRef.current || paperOpenRef.current) return;
    if (file.size > 6 * 1024 * 1024) { setError('Фото больше 6 МБ. Выберите уменьшенную копию.'); return; }
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/reconciliation/paper-image?${query(shift)}&revision=${current.current.state.revision}`, {
        method: 'POST', headers: { 'Content-Type': file.type }, body: file, signal: AbortSignal.timeout(30000),
      });
      accept(await readResponse(response)); setError(''); setNotice('Фото журнала сохранено. Проверьте внесённые строки и подтвердите полноту журнала заново.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Фото не сохранено.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  const presentation: ReconciliationPresentation | undefined = document ? {
    title: 'Сверка смены', subtitle: `${shift.date} · ${shift.period === 'day' ? 'День 08:00 — 20:00' : 'Ночь 20:00 — 08:00 следующего дня'}`,
    notice: 'Ручные правки и результаты сверки сохраняются на сервере. Исходные заезды, OCR и финансовый учёт не изменяются.',
    paperIntro: document.paperConfirmed ? 'Внесение журнала подтверждено. Свяжите каждую строку с записью слева.' : 'Перенесите строки бумажного журнала и подтвердите, что внесли весь журнал.',
    paperImage: document.paperImageId ? `/api/reconciliation/paper-image?${query(shift)}&image=${document.paperImageId}` : undefined,
    rowNotes: Object.fromEntries(document.state.entries.flatMap(entry => {
      const missing = entry.evidence.some(item => document.source.missingIds.includes(item.id));
      const changed = entry.evidence.some(item => document.source.changedIds.includes(item.id));
      return missing ? [[entry.id, 'Исходник пропал из ответа камеры. Сохранённые сведения оставлены; требуется разбор.']] : changed ? [[entry.id, 'Сведения камеры изменились после предыдущей проверки. Ручные поля сохранены; проверьте заезд повторно.']] : [];
    })),
    media: Object.fromEntries(document.dataset.evidence.map(e => [e.id, {
      thumbnail: `/api/reconciliation/media?${query(shift)}&id=${e.id}&kind=thumbnail`,
      plate: `/api/reconciliation/media?${query(shift)}&id=${e.id}&kind=plate`, label: `${e.time} · Бокс ${e.box}`,
      video: document.source.snapshot?.observations.find(row => row.evidence.id === e.id)?.hasVideo ? `/api/reconciliation/media?${query(shift)}&id=${e.id}&kind=video` : undefined,
    }])),
  } : undefined;

  return <div className="p06-live">
    <div className="p06-live-toolbar">
      <label>Дата начала смены<input type="date" value={shift.date} min="2020-01-01" max="2100-12-31" disabled={busy || dirty || paperOpen} onChange={e => { if (e.target.value) setShift({ ...shift, date: e.target.value }); }} /></label>
      <label>Смена<select value={shift.period} disabled={busy || dirty || paperOpen} onChange={e => setShift({ ...shift, period: e.target.value as ShiftKey['period'] })}><option value="day">День · 08–20</option><option value="night">Ночь · 20–08</option></select></label>
      <button disabled={!document || busy || dirty || paperOpen} onClick={() => void execute({ type: 'refresh' }).catch(e => setError(e.message))}>{busy ? 'Сохраняю…' : 'Обновить камеры'}</button>
      <button disabled={!document || busy || dirty || paperOpen} onClick={editPaper}>Внести журнал</button>
      <label>Фото журнала · до 6 МБ<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!document || busy || dirty || paperOpen} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadPhoto(file); e.target.value = ''; }} /><small>Новое фото требует повторной сверки</small></label>
      <button disabled={!document || busy} onClick={() => void showHistory()}>История</button>
      <a href="/login">Вход владельца</a>
    </div>
    {error && <div className="p06-error" role="alert">{error}{!document && <button disabled={busy} onClick={() => void load().catch(e => setError(e.message))}>Повторить загрузку</button>}</div>}
    {notice && <div className="p06-notice" role="status">{notice}</div>}
    {document && <div className="p06-live-source" role="status">
      <b>Камеры: {time(document.source.snapshot?.retrievedAt ?? null)} · Москва</b>
      <span>Полнота записи камер не подтверждена. Всегда сверяйте с бумажным журналом.</span>
      {document.source.error && <strong className="p06-amber">{document.source.error} Показана последняя сохранённая версия.</strong>}
      {!!document.source.missingIds.length && <strong className="p06-amber">Пропали из ответа камер: {document.source.missingIds.length}. Сохранённые записи оставлены для разбора.</strong>}
      {!!document.source.changedIds.length && <strong className="p06-amber">Изменились данные камер: {document.source.changedIds.length}. Проверьте отмеченные записи повторно.</strong>}
      {dirty && <span>Автообновление приостановлено до сохранения введённых полей.</span>}
    </div>}
    {paperOpen && <section className="p06-paper-editor" aria-label="Ввод бумажного журнала">
      <h2>Бумажный журнал</h2><p>Перенесите строки как на бумаге. Пустое поле оставляйте пустым; неизвестный номер не нужно угадывать.</p>
      <fieldset disabled={busy}><div className="p06-paper-scroll"><table><thead><tr>{['Строка', 'Время', 'Номер', 'Услуга', 'Цена', 'Сотрудник 1', 'Сотрудник 2', 'Примечание', ''].map((v, i) => <th key={i}>{v}</th>)}</tr></thead><tbody>
        {rows.map((row, index) => <tr key={index}>{(['row', 'time', 'plate', 'wash', 'price', 'employee1', 'employee2', 'note'] as const).map(key => <td key={key}><input aria-label={`${columns[key]} ${index + 1}`} value={row[key] || ''} maxLength={key === 'row' ? 8 : key === 'time' ? 5 : key === 'note' ? 1200 : key === 'wash' ? 200 : key.startsWith('employee') ? 120 : 40} onChange={e => { setRows(old => old.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v)); setConfirmed(false); }} /></td>)}<td><button onClick={() => { setRows(old => old.filter((_, i) => i !== index)); setConfirmed(false); }}>Удалить строку</button></td></tr>)}
      </tbody></table></div>
      <button disabled={rows.length >= 1000} onClick={() => { const used = new Set(rows.map(row => row.row)); let n = 1; while (used.has(String(n))) n++; setRows(old => [...old, { row: String(n), time: '', plate: '', wash: '', price: '', employee1: '', employee2: '' }]); setConfirmed(false); }}>Добавить строку</button>
      <label className="p06-paper-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Весь журнал этой смены внесён, включая строки без заезда на камере</label>
      <button className="p06-primary" onClick={() => void savePaper()}>Сохранить журнал</button>
      <button onClick={() => { setPaperOpen(false); paperOpenRef.current = false; }}>Отменить ввод журнала</button></fieldset>
    </section>}
    {history && <section className="p06-history"><h2>История сохранений</h2><button onClick={() => setHistory(null)}>Закрыть историю</button><ol>{history.map(item => <li key={item.revision}>Версия {item.revision} · {time(item.createdAt)} · {actions[item.action] || item.action} · {item.actorId}</li>)}</ol>{!history.length && <p>Сохранений пока нет.</p>}</section>}
    {document && <ReconciliationDemo dataset={document.dataset} presentation={presentation} remote={{
      state: document.state, busy: busy || paperOpen, onDirty,
      execute: async (command, revision) => (await execute(command, revision)).state,
      reload: async () => (await load()).state,
    }} />}
    {document && <div className="p06-live-end"><button disabled={busy || dirty || paperOpen} onClick={() => void execute({ type: 'finish-review' }).catch(e => setError(e.message))}>Закончить просмотр на сегодня</button>
      <span>{document.reviewFinishedAt ? `Просмотр закончен ${time(document.reviewFinishedAt)}. Открытые вопросы сохраняются.` : 'Можно закончить просмотр с открытыми вопросами. Полная сверка подтверждается отдельно.'}</span></div>}
    {!document && !error && <p className="p06-live-source">Открываю сохранённую смену…</p>}
  </div>;
}
