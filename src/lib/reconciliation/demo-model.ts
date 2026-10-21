/** Локальная сверка набора. Модель не читает и не изменяет рабочий учёт или камеры. */
export type JournalFields = {
  plate: string;
  paperRow: string;
  company: string;
  payment: string;
  washType: string;
  wash: string;
  price: string;
  additional: Array<{ name: string; price: string }>;
  employee1: string;
  employee2: string;
};

export type Evidence = {
  id: string;
  time: string;
  box: 1 | 2;
  ocrPlate: string;
  label: string;
};

export type DemoEntry = {
  id: string;
  time: string;
  box: 1 | 2 | null;
  source: 'camera' | 'paper';
  evidence: Evidence[];
  fields: JournalFields;
  status: 'pending' | 'verified' | 'question' | 'explained';
  reason: string;
  note: string;
  savedAt: string | null;
  reviewedAt: string | null;
  mergedFrom?: DemoEntry[];
};

export type DemoState = {
  schemaVersion: 1;
  revision: number;
  shiftId: string;
  entries: DemoEntry[];
  completedAt: string | null;
};

export type PaperRow = {
  row: string;
  time: string;
  plate: string;
  wash: string;
  price: string;
  employee1: string;
  employee2: string;
  note?: string;
};

export type ReconciliationDataset = {
  shiftId: string;
  paper: readonly PaperRow[];
  evidence: readonly Evidence[];
  initialState?: DemoState;
  dayStartHour?: number;
};

export const DEMO_PAPER = [
  { row: '1', time: '21:14', plate: 'A123BC77', wash: 'Кузов', price: '1800', employee1: 'Иван', employee2: 'Пётр' },
  { row: '2', time: '23:37', plate: 'B456KT197', wash: 'Кузов и коврики', price: '2200', employee1: 'Иван', employee2: 'Пётр' },
  { row: '3', time: '01:08', plate: 'E789MH77', wash: 'Кузов', price: '1800', employee1: 'Пётр', employee2: '' },
  { row: '4', time: '04:20', plate: 'M222OP77', wash: 'Кузов', price: '1800', employee1: 'Иван', employee2: '' },
] as const;

const SHIFT_ID = 'demo-2026-10-14-night';
const MAX_ENTRIES = 1000;
const CAMERA_FIXTURES: readonly Evidence[] = [
  { id: 'normal', time: '21:14', box: 1, ocrPlate: 'A123BC77', label: 'Обычный заезд' },
  { id: 'fragment-1', time: '23:37', box: 2, ocrPlate: 'B456KT197', label: 'Первый фрагмент одного заезда' },
  { id: 'fragment-2', time: '23:40', box: 2, ocrPlate: 'B456KT197', label: 'Второй фрагмент того же заезда' },
  { id: 'unreadable', time: '01:08', box: 1, ocrPlate: '', label: 'Номер не прочитан камерой' },
  { id: 'transit', time: '05:12', box: 2, ocrPlate: 'C345TT77', label: 'Проезд без мойки' },
];

const FIELD_LIMITS = {
  plate: 40, paperRow: 8, company: 160, payment: 80, washType: 100,
  wash: 200, price: 40, employee1: 120, employee2: 120,
} as const;
const STATUSES: DemoEntry['status'][] = ['pending', 'verified', 'question', 'explained'];

function fail(message: string): never {
  throw new Error(message);
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Повреждённые данные: ожидался объект.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) fail('Повреждённые данные: неизвестное поле.');
  return result;
}

function string(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) fail('Повреждённые данные: неверный текст или превышен размер поля.');
  return value;
}

function timestamp(value: unknown, nullable = true): string | null {
  if (value === null && nullable) return null;
  const result = string(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) {
    fail('Некорректное время сохранения.');
  }
  return result;
}

function idValue(value: unknown): string {
  const result = string(value, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) fail('Некорректный идентификатор строки.');
  return result;
}

function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) fail('Повреждённые данные: неверный список или слишком много строк.');
  return value;
}

/** Каждый набор получает собственные проверенные копии исходников и начального состояния. */
export function createReconciliationModel(dataset: ReconciliationDataset) {
  const source = record(dataset, ['shiftId', 'paper', 'evidence', 'initialState', 'dayStartHour']);
  const SHIFT_ID = idValue(source.shiftId);
  const inputDayStartHour = source.dayStartHour ?? 8;
  if (typeof inputDayStartHour !== 'number' || !Number.isInteger(inputDayStartHour) || inputDayStartHour < 0 || inputDayStartHour > 23) {
    fail('Некорректный час начала смены.');
  }
  const dayStartHour: number = inputDayStartHour;
  const paper = array(source.paper, MAX_ENTRIES).map((item): PaperRow => {
    const row = record(item, ['row', 'time', 'plate', 'wash', 'price', 'employee1', 'employee2', 'note']);
    const time = string(row.time, 5);
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Некорректное время в бумажном журнале.');
    const rowId = string(row.row, FIELD_LIMITS.paperRow);
    if (!rowId.trim()) fail('У строки бумажного журнала должен быть номер.');
    return {
      row: rowId, time, plate: string(row.plate, FIELD_LIMITS.plate),
      wash: string(row.wash, FIELD_LIMITS.wash), price: string(row.price, FIELD_LIMITS.price),
      employee1: string(row.employee1, FIELD_LIMITS.employee1), employee2: string(row.employee2, FIELD_LIMITS.employee2),
      ...(row.note === undefined ? {} : { note: string(row.note, 1200) }),
    };
  });
  if (new Set(paper.map((row) => row.row)).size !== paper.length) fail('Повторяются номера строк бумажного журнала.');
  const CAMERA_FIXTURES = array(source.evidence, MAX_ENTRIES).map((item): Evidence => {
    const evidence = record(item, ['id', 'time', 'box', 'ocrPlate', 'label']);
    const time = string(evidence.time, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Некорректное время исходного фрагмента.');
    if (evidence.box !== 1 && evidence.box !== 2) fail('Некорректный бокс исходного фрагмента.');
    return {
      id: idValue(evidence.id), time, box: evidence.box,
      ocrPlate: string(evidence.ocrPlate, FIELD_LIMITS.plate), label: string(evidence.label, 500),
    };
  });
  if (new Set(CAMERA_FIXTURES.map((item) => item.id)).size !== CAMERA_FIXTURES.length) fail('Повторяются идентификаторы исходных фрагментов.');

  function readFields(input: unknown, normalize = false): JournalFields {
    const value = record(input, [...Object.keys(FIELD_LIMITS), 'additional']);
    const result = {} as JournalFields;
    for (const key of Object.keys(FIELD_LIMITS) as Array<keyof typeof FIELD_LIMITS>) {
      const text = string(value[key], FIELD_LIMITS[key]);
      result[key] = normalize ? text.trim() : text;
    }
    if (normalize) result.plate = result.plate.toUpperCase();
    if (result.paperRow && !paper.some((row) => row.row === result.paperRow)) {
      fail('Укажите существующую строку бумажного журнала.');
    }
    result.additional = array(value.additional, 12).map((item) => {
      const extra = record(item, ['name', 'price']);
      const name = string(extra.name, 160);
      const price = string(extra.price, 40);
      return { name: normalize ? name.trim() : name, price: normalize ? price.trim() : price };
    });
    return result;
  }

  function blankFields(plate = ''): JournalFields {
    return { plate, paperRow: '', company: '', payment: '', washType: '', wash: '', price: '', additional: [], employee1: '', employee2: '' };
  }

  function createDemoState(): DemoState {
    if (initialSnapshot) return validateDemoState(initialSnapshot);
    return {
      schemaVersion: 1, revision: 0, shiftId: SHIFT_ID, completedAt: null,
      entries: CAMERA_FIXTURES.map((evidence) => ({
        id: evidence.id, time: evidence.time, box: evidence.box, source: 'camera',
        evidence: [{ ...evidence }], fields: blankFields(evidence.ocrPlate),
        status: 'pending', reason: '', note: '', savedAt: null, reviewedAt: null,
      })),
    };
  }

  function readEntry(input: unknown, nested = false): DemoEntry {
    const value = record(input, ['id', 'time', 'box', 'source', 'evidence', 'fields', 'status', 'reason', 'note', 'savedAt', 'reviewedAt', 'mergedFrom']);
    const id = idValue(value.id);
    const time = string(value.time, 5);
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Некорректное время заезда.');
    if (value.box !== null && value.box !== 1 && value.box !== 2) fail('Некорректный бокс.');
    if (value.source !== 'camera' && value.source !== 'paper') fail('Неизвестный источник строки.');
    if (!STATUSES.includes(value.status as DemoEntry['status'])) fail('Неизвестный результат сверки.');
    const evidence = array(value.evidence, CAMERA_FIXTURES.length).map((item): Evidence => {
      const raw = record(item, ['id', 'time', 'box', 'ocrPlate', 'label']);
      const expected = CAMERA_FIXTURES.find((fixture) => fixture.id === raw.id);
      if (!expected || Object.keys(expected).some((key) => raw[key] !== expected[key as keyof Evidence])) {
        fail('Исходные сведения камеры изменены или повреждены.');
      }
      return { ...expected };
    });
    const entry: DemoEntry = {
      id, time, box: value.box, source: value.source, evidence,
      fields: readFields(value.fields), status: value.status as DemoEntry['status'],
      reason: string(value.reason, 120), note: string(value.note, 1200),
      savedAt: timestamp(value.savedAt), reviewedAt: timestamp(value.reviewedAt),
    };
    if (entry.source === 'camera' && (!time || !evidence.length || evidence.some((item) => item.box !== entry.box))) {
      fail('Камерной строке нужны время, бокс и исходные фрагменты.');
    }
    if (entry.source === 'paper' && (evidence.length || entry.box !== null || value.mergedFrom !== undefined)) {
      fail('Строка из бумаги не может содержать камерные фрагменты.');
    }
    if (value.mergedFrom !== undefined) {
      if (nested) fail('Повторное вложенное объединение не поддерживается: сначала разделите группу.');
      entry.mergedFrom = array(value.mergedFrom, CAMERA_FIXTURES.length).map((item) => readEntry(item, true));
      if (entry.mergedFrom.length < 2 || entry.mergedFrom[0].id !== id) fail('Повреждено объединение фрагментов.');
      const originalEvidence = entry.mergedFrom.flatMap((item) => item.evidence.map((part) => part.id));
      if (entry.mergedFrom.some((item) => item.source !== 'camera') || new Set(originalEvidence).size !== originalEvidence.length ||
          originalEvidence.length !== evidence.length || evidence.some((item) => !originalEvidence.includes(item.id))) {
        fail('Объединение не соответствует исходным фрагментам.');
      }
    } else if (entry.source === 'camera' && (evidence.length !== 1 || id !== evidence[0].id || time !== evidence[0].time)) {
      fail('Утеряна исходная камерная строка.');
    }
    assertReview(entry);
    return entry;
  }

  function assertReview(entry: DemoEntry): void {
    if (entry.status === 'pending') {
      if (entry.reviewedAt !== null || entry.reason || entry.note) fail('Непроверенная строка не должна содержать прежнее решение.');
      return;
    }
    if (!entry.reviewedAt) fail('Не указано время проверки.');
    if (entry.status === 'question') {
      if (!entry.reason.trim() && !entry.note.trim()) fail('Укажите, что требуется уточнить.');
      return;
    }
    if (entry.status === 'verified') {
      if (!entry.savedAt) fail('Сначала сохраните поля строки, затем отметьте её как сверенную.');
      if (!entry.fields.plate.trim() || !entry.fields.paperRow) fail('Для сверки нужны госномер и строка бумажного журнала.');
      return;
    }
    if (!entry.reason.trim()) fail('Укажите причину расхождения.');
    if (entry.reason === 'missing_camera') {
      if (entry.source !== 'paper') fail('Пропуск камеры отмечается у добавленной строки из бумажного журнала.');
      if (!entry.savedAt || !entry.fields.plate.trim() || !entry.fields.paperRow) fail('Сначала сохраните номер и строку бумаги для пропущенной машины.');
    } else {
      if (entry.fields.paperRow) fail('Для этой причины строка бумаги должна быть пустой. Для совпадения используйте «Сверено».');
      if (entry.reason !== 'no_wash' && !entry.note.trim()) fail('Добавьте пояснение к причине расхождения.');
    }
  }

  function validateDemoState(input: unknown): DemoState {
    const value = record(input, ['schemaVersion', 'revision', 'shiftId', 'entries', 'completedAt']);
    if (value.schemaVersion !== 1 || value.shiftId !== SHIFT_ID) fail('Этот файл относится к другой версии или другой смене.');
    if (typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER) {
      fail('Повреждён номер версии сохранения.');
    }
    const entries = array(value.entries, MAX_ENTRIES).map((entry) => readEntry(entry));
    const ids = entries.flatMap((entry) => entry.mergedFrom ? entry.mergedFrom.map((original) => original.id) : [entry.id]);
    if (new Set(ids).size !== ids.length) fail('Повторяются идентификаторы строк.');
    const evidenceIds = entries.flatMap((entry) => entry.evidence.map((evidence) => evidence.id));
    if (new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.length !== CAMERA_FIXTURES.length) {
      fail('Камерные фрагменты потеряны или продублированы.');
    }
    const claimedRows = entries.filter(isMatched).map((entry) => entry.fields.paperRow);
    if (new Set(claimedRows).size !== claimedRows.length) fail('Одна строка бумаги уже связана с другой проверенной записью.');
    const result: DemoState = {
      schemaVersion: 1, revision: value.revision, shiftId: SHIFT_ID,
      entries, completedAt: timestamp(value.completedAt),
    };
    if (result.completedAt && !getSummary(result).canComplete) fail('Нельзя восстановить завершённую сверку с неразрешёнными вопросами.');
    return result;
  }

  function isMatched(entry: DemoEntry): boolean {
    return entry.status === 'verified' || (entry.status === 'explained' && entry.reason === 'missing_camera');
  }

  function changed(state: DemoState, entries: DemoEntry[]): DemoState {
    return validateDemoState({ ...state, entries, revision: state.revision + 1, completedAt: null });
  }

  function findEntry(state: DemoState, id: string): DemoEntry {
    return state.entries.find((entry) => entry.id === id) ?? fail('Строка не найдена. Обновите список.');
  }

  function saveEntry(state: DemoState, id: string, fields: JournalFields, now: string): DemoState {
    const current = validateDemoState(state);
    const entry = findEntry(current, id);
    const normalized = readFields(fields, true);
    const savedAt = timestamp(now, false);
    const hasChanges = JSON.stringify(entry.fields) !== JSON.stringify(normalized);
    const replacement: DemoEntry = {
      ...entry, fields: normalized, savedAt,
      ...(hasChanges ? { status: 'pending' as const, reason: '', note: '', reviewedAt: null } : {}),
    };
    const next = changed(current, current.entries.map((item) => item.id === id ? replacement : item));
    return hasChanges ? next : { ...next, completedAt: current.completedAt };
  }

  function reviewEntry(state: DemoState, id: string, status: DemoEntry['status'], reason: string, note: string, now: string): DemoState {
    const current = validateDemoState(state);
    const entry = findEntry(current, id);
    timestamp(now, false);
    const replacement: DemoEntry = {
      ...entry, status, reason: status === 'pending' ? '' : reason.trim(), note: status === 'pending' ? '' : note.trim(),
      reviewedAt: status === 'pending' ? null : now,
    };
    return changed(current, current.entries.map((item) => item.id === id ? replacement : item));
  }

  function addPaperEntry(state: DemoState, id: string, now: string): DemoState {
    const current = validateDemoState(state);
    timestamp(now, false);
    const entry: DemoEntry = {
      id: idValue(id), time: '', box: null, source: 'paper', evidence: [], fields: blankFields(),
      status: 'pending', reason: '', note: '', savedAt: null, reviewedAt: null,
    };
    return changed(current, [...current.entries, entry]);
  }

  function removePaperEntry(state: DemoState, id: string, now: string): DemoState {
    const current = validateDemoState(state);
    const entry = findEntry(current, id);
    timestamp(now, false);
    if (entry.source !== 'paper') fail('Удалить можно только вручную добавленную строку бумаги. Камерные наблюдения сохраняются.');
    return changed(current, current.entries.filter((item) => item.id !== id));
  }

  function hasJournalEdits(entry: DemoEntry): boolean {
    const initial = readFields(blankFields(entry.evidence[0]?.ocrPlate ?? ''));
    return !!entry.savedAt || JSON.stringify(entry.fields) !== JSON.stringify(initial);
  }

  function mergeEntries(state: DemoState, ids: string[], now: string): DemoState {
    const current = validateDemoState(state);
    timestamp(now, false);
    if (ids.length < 2 || new Set(ids).size !== ids.length) fail('Выберите минимум два разных камерных фрагмента.');
    const selected = ids.map((id) => findEntry(current, id));
    if (selected.some((entry) => entry.source !== 'camera' || entry.mergedFrom)) fail('Выберите отдельные камерные строки. Уже собранную группу сначала разделите.');
    if (selected.some((entry) => entry.box !== selected[0].box)) fail('Фрагменты разных боксов нельзя объединить.');
    const edited = selected.filter(hasJournalEdits);
    if (edited.length > 1 && edited.some((entry) => JSON.stringify(entry.fields) !== JSON.stringify(edited[0].fields))) {
      fail('Несколько строк содержат различающиеся сохранённые поля; согласуйте поля перед объединением, чтобы не потерять правки.');
    }
    const evidence = selected.flatMap((entry) => entry.evidence).sort((a, b) => shiftMinute(a.time) - shiftMinute(b.time));
    const merged: DemoEntry = {
      ...selected[0], time: evidence[0].time, evidence,
      fields: edited[0]?.fields ?? selected[0].fields,
      status: 'pending', reason: '', note: '', savedAt: null, reviewedAt: null, mergedFrom: selected,
    };
    return changed(current, current.entries.flatMap((entry) => entry.id === ids[0] ? [merged] : ids.includes(entry.id) ? [] : [entry]));
  }

  function shiftMinute(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours < dayStartHour ? hours + 24 : hours) * 60 + minutes;
  }

  function unmergeEntry(state: DemoState, id: string, now: string): DemoState {
    const current = validateDemoState(state);
    const entry = findEntry(current, id);
    timestamp(now, false);
    if (!entry.mergedFrom) fail('Эта строка не является объединением фрагментов.');
    return changed(current, current.entries.flatMap((item) => item.id === id ? entry.mergedFrom! : [item]));
  }

  function getSummary(state: DemoState): {
    total: number; pending: number; verified: number; question: number; explained: number; paperMatched: number; canComplete: boolean;
  } {
    const counts = { pending: 0, verified: 0, question: 0, explained: 0 };
    state.entries.forEach((entry) => { counts[entry.status] += 1; });
    const rows = state.entries.filter(isMatched).map((entry) => entry.fields.paperRow);
    const paperMatched = new Set(rows).size;
    return {
      total: state.entries.length, ...counts, paperMatched,
      canComplete: counts.pending === 0 && counts.question === 0 && rows.length === paper.length &&
        paper.every((item) => rows.filter((row) => row === item.row).length === 1),
    };
  }

  function completeShift(state: DemoState, now: string): DemoState {
    const current = validateDemoState(state);
    if (!getSummary(current).canComplete) fail('Остались непроверенные записи, вопросы или несопоставленные строки бумажного журнала.');
    return validateDemoState({ ...current, revision: current.revision + 1, completedAt: timestamp(now, false) });
  }

  const initialSnapshot = source.initialState === undefined ? null : validateDemoState(source.initialState);
  return {
    createDemoState, validateDemoState, saveEntry, reviewEntry, addPaperEntry, removePaperEntry,
    mergeEntries, unmergeEntry, getSummary, completeShift,
  };
}

const demoModel = createReconciliationModel({ shiftId: SHIFT_ID, paper: DEMO_PAPER, evidence: CAMERA_FIXTURES });

// Прежний API продолжает работать только с неизменённым учебным примером.
export const {
  createDemoState, validateDemoState, saveEntry, reviewEntry, addPaperEntry, removePaperEntry,
  mergeEntries, unmergeEntry, getSummary, completeShift,
} = demoModel;
