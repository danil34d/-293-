import { createReconciliationModel } from './demo-model';
import type { DemoEntry, JournalFields, PaperRow } from './demo-model';
import type { CameraSnapshot, LiveReconciliation, ShiftKey } from './live-types';
import { shiftId, validateShift } from './shift';

// PostgreSQL jsonb переставляет ключи объектов. Порядок ключей не означает изменение заезда.
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]));
}

export function validateLiveReconciliation(input: unknown): LiveReconciliation {
  if (!input || typeof input !== 'object') throw new Error('Повреждена сохранённая сверка.');
  const doc = input as LiveReconciliation;
  if (doc.schemaVersion !== 1 || !doc.dataset || !doc.state || !doc.source ||
      doc.dataset.shiftId !== shiftId(doc.shift) || typeof doc.paperConfirmed !== 'boolean' ||
      (doc.reviewFinishedAt !== null && !Number.isFinite(Date.parse(doc.reviewFinishedAt)))) {
    throw new Error('Неизвестный формат сохранённой сверки.');
  }
  const state = createReconciliationModel(doc.dataset).validateDemoState(doc.state);
  if (doc.paperImageId !== undefined && !/^[0-9a-f-]{36}$/.test(doc.paperImageId)) throw new Error('Повреждена ссылка на фото журнала.');
  for (const ids of [doc.source.missingIds, doc.source.changedIds]) {
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !doc.dataset.evidence.some(item => item.id === id))) {
      throw new Error('Повреждены ссылки на исходники сверки.');
    }
  }
  if (doc.source.snapshot && (!Array.isArray(doc.source.snapshot.observations) || doc.source.snapshot.completeness !== 'unknown')) {
    throw new Error('Повреждены сведения об источнике.');
  }
  // Данные после чтения БД не разделяют изменяемые ссылки с вызывающим кодом.
  return JSON.parse(JSON.stringify({ ...doc, state })) as LiveReconciliation;
}

export function createLiveReconciliation(shift: ShiftKey): LiveReconciliation {
  const checked = validateShift(shift);
  const dataset = { shiftId: shiftId(checked), paper: [], evidence: [], dayStartHour: checked.period === 'day' ? 8 : 20 };
  return {
    schemaVersion: 1, shift: checked, dataset, state: createReconciliationModel(dataset).createDemoState(),
    source: { snapshot: null, error: null, attemptedAt: null, missingIds: [], changedIds: [] },
    paperConfirmed: false, reviewFinishedAt: null,
  };
}

function resetReview(entry: DemoEntry): DemoEntry {
  return { ...entry, status: 'pending', reason: '', note: '', reviewedAt: null };
}

export function attachPaperImage(document: LiveReconciliation, imageId: string): LiveReconciliation {
  if (!/^[0-9a-f-]{36}$/.test(imageId)) throw new Error('Некорректная ссылка на фото журнала.');
  const reset = (entry: DemoEntry): DemoEntry => ({ ...resetReview(entry), ...(entry.mergedFrom ? { mergedFrom: entry.mergedFrom.map(reset) } : {}) });
  return validateLiveReconciliation({ ...document, paperImageId: imageId, paperConfirmed: false, reviewFinishedAt: null,
    state: { ...document.state, revision: document.state.revision + 1, completedAt: null, entries: document.state.entries.map(reset) } });
}

/** Обновление наблюдений сохраняет ручные поля, группы и отсутствующие в новом ответе исходники. */
export function receiveCameraSnapshot(document: LiveReconciliation, snapshot: CameraSnapshot): LiveReconciliation {
  const oldModel = createReconciliationModel(document.dataset);
  oldModel.validateDemoState(document.state);
  if (!Number.isFinite(Date.parse(snapshot.retrievedAt))) throw new Error('Некорректное время загрузки камер.');
  const fresh = new Map(snapshot.observations.map(item => [item.evidence.id, item]));
  if (fresh.size !== snapshot.observations.length) throw new Error('Повторяются камерные исходники.');
  const previous = new Map(document.source.snapshot?.observations.map(item => [item.evidence.id, item]) ?? []);
  const evidence = new Map(document.dataset.evidence.map(item => [item.id, item]));
  const changed = new Set(document.source.changedIds);
  const changedNow = new Set<string>();
  for (const [id, item] of fresh) {
    if (evidence.has(id) && (!previous.has(id) || !sameValue(previous.get(id), item))) {
      changedNow.add(id); changed.add(id);
    }
    evidence.set(id, item.evidence);
  }
  const missing = [...evidence.keys()].filter(id => !fresh.has(id));
  for (const id of missing) {
    if (!document.source.missingIds.includes(id)) { changedNow.add(id); changed.add(id); }
  }
  const dataset = { ...document.dataset, evidence: [...evidence.values()] };
  delete dataset.initialState;
  const model = createReconciliationModel(dataset);
  const newEntries = model.createDemoState().entries.filter(entry => !document.dataset.evidence.some(item => item.id === entry.id));
  const updateEntry = (entry: DemoEntry): DemoEntry => {
    let result = { ...entry, evidence: entry.evidence.map(item => evidence.get(item.id)!) };
    if (entry.mergedFrom) result = { ...result, mergedFrom: entry.mergedFrom.map(updateEntry) };
    if (entry.evidence.some(item => changedNow.has(item.id))) result = resetReview(result);
    return result;
  };
  const entries = [...document.state.entries.map(updateEntry), ...newEntries];
  const contentChanged = changedNow.size > 0 || newEntries.length > 0;
  const state = model.validateDemoState({
    ...document.state, entries, revision: document.state.revision + 1,
    completedAt: contentChanged ? null : document.state.completedAt,
  });
  return {
    ...document, dataset, state,
    reviewFinishedAt: contentChanged ? null : document.reviewFinishedAt,
    source: { snapshot, attemptedAt: snapshot.retrievedAt, error: null, missingIds: missing, changedIds: [...changed] },
  };
}

export function recordCameraFailure(document: LiveReconciliation, message: string, now: string): LiveReconciliation {
  if (!Number.isFinite(Date.parse(now))) throw new Error('Некорректное время.');
  return { ...document, state: { ...document.state, revision: document.state.revision + 1 },
    source: { ...document.source, attemptedAt: now, error: message.slice(0, 1000) } };
}

export type ReconciliationCommand =
  | { type: 'save'; id: string; fields: JournalFields }
  | { type: 'review'; id: string; status: DemoEntry['status']; reason: string; note: string }
  | { type: 'add-paper'; id: string }
  | { type: 'remove-paper'; id: string }
  | { type: 'merge'; ids: string[] }
  | { type: 'unmerge'; id: string }
  | { type: 'set-paper'; rows: PaperRow[]; confirmed: boolean }
  | { type: 'finish-review' }
  | { type: 'complete' };

export function applyReconciliationCommand(document: LiveReconciliation, command: ReconciliationCommand, now: string): LiveReconciliation {
  if (!Number.isFinite(Date.parse(now))) throw new Error('Некорректное время.');
  const model = createReconciliationModel(document.dataset);
  const state = model.validateDemoState(document.state);
  let next = state;
  const changedIds = new Set(document.source.changedIds);
  switch (command.type) {
    case 'save': next = model.saveEntry(state, command.id, command.fields, now); break;
    case 'review':
      next = model.reviewEntry(state, command.id, command.status, command.reason, command.note, now);
      if (command.status !== 'pending') next.entries.find(entry => entry.id === command.id)?.evidence.forEach(item => changedIds.delete(item.id));
      break;
    case 'add-paper': next = model.addPaperEntry(state, command.id, now); break;
    case 'remove-paper': next = model.removePaperEntry(state, command.id, now); break;
    case 'merge': next = model.mergeEntries(state, command.ids, now); break;
    case 'unmerge': next = model.unmergeEntry(state, command.id, now); break;
    case 'set-paper': {
      if (typeof command.confirmed !== 'boolean') throw new Error('Укажите, внесён ли весь журнал.');
      const dataset = { ...document.dataset, paper: command.rows };
      delete dataset.initialState;
      const updatedModel = createReconciliationModel(dataset);
      const rows = new Map(command.rows.map(row => [row.row, row]));
      const priorRows = new Map(document.dataset.paper.map(row => [row.row, row]));
      const patchEntry = (entry: DemoEntry): DemoEntry => {
        let result = entry.mergedFrom ? { ...entry, mergedFrom: entry.mergedFrom.map(patchEntry) } : { ...entry };
        const ref = entry.fields.paperRow;
        if (ref && !sameValue(rows.get(ref), priorRows.get(ref))) {
          result = resetReview(result);
          if (!rows.has(ref)) result.fields = { ...entry.fields, paperRow: '' };
        }
        return result;
      };
      return { ...document, dataset, paperConfirmed: command.confirmed, reviewFinishedAt: null,
        state: updatedModel.validateDemoState({ ...state, entries: state.entries.map(patchEntry), revision: state.revision + 1, completedAt: null }) };
    }
    case 'finish-review': return { ...document, reviewFinishedAt: now, state: { ...state, revision: state.revision + 1 } };
    case 'complete':
      if (!document.paperConfirmed) throw new Error('Сначала подтвердите, что все строки бумажного журнала внесены.');
      if (!document.source.snapshot || document.source.error || document.source.missingIds.length) {
        throw new Error('Сведения камер недоступны или часть исходников пропала. Можно закончить сегодняшний разбор с открытыми вопросами.');
      }
      next = model.completeShift(state, now); break;
    default: throw new Error('Неизвестное действие сверки.');
  }
  return { ...document, state: next, reviewFinishedAt: command.type === 'complete' ? now : null,
    source: { ...document.source, changedIds: [...changedIds] } };
}
