import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  createReconciliationModel, createDemoState, validateDemoState,
  saveEntry as saveDemoEntry, DEMO_PAPER,
} from '../src/lib/reconciliation/demo-model.ts';
import { DEMO_STORAGE_KEY, loadDemo, persistDemo, withDemoStorageLock } from '../src/lib/reconciliation/demo-storage.ts';

const NOW = '2026-10-18T19:44:00+03:00';
const LATER = '2026-10-18T19:45:00+03:00';
const SNAPSHOT_KEY = 'zorin:p06:reconciliation-snapshot:2026-10-18:v1';
const clone = value => JSON.parse(JSON.stringify(value));
const row = (state, id) => state.entries.find(item => item.id === id);

// Синтетический набор воспроизводит структуру среза: 20 строк бумаги,
// 18 наблюдений, 13 камерных карточек (одна из 6 частей) и 7 строк без камеры.
function fixture() {
  const paper = Array.from({ length: 20 }, (_, index) => ({
    row: String(index + 1), time: '', plate: `А${100 + index}ВС77`,
    wash: '', price: '', employee1: '', employee2: '', note: index === 0 ? 'Проверить неясную букву' : '',
  }));
  const evidence = Array.from({ length: 18 }, (_, index) => ({
    id: `camera-${String(index + 1).padStart(2, '0')}`,
    time: index < 12 ? `${String(13 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '45' : '05'}` : `19:${String(index).padStart(2, '0')}`,
    box: 1, ocrPlate: index < 12 ? paper[index + 7].plate : 'А119ВС7', label: `Исходный фрагмент ${index + 1}`,
  }));
  const dataset = { shiftId: 'snapshot-2026-10-18-day', paper, evidence, dayStartHour: 8 };
  const base = createReconciliationModel(dataset);
  let initialState = base.createDemoState();
  initialState = base.mergeEntries(initialState, evidence.slice(12).map(item => item.id), NOW);
  for (let index = 0; index < 7; index += 1) {
    initialState = base.addPaperEntry(initialState, `paper-${index + 1}`, NOW);
    const entry = row(initialState, `paper-${index + 1}`);
    entry.fields = { ...entry.fields, plate: paper[index].plate, paperRow: paper[index].row };
  }
  initialState.entries.filter(item => item.source === 'camera').forEach((entry, index) => {
    entry.fields = { ...entry.fields, paperRow: paper[index + 7].row };
  });
  initialState.revision = 0;
  dataset.initialState = initialState;
  return dataset;
}

function memory() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('Новый набор открывает 20 строк и не меняет прежний учебный пример', () => {
  const dataset = fixture();
  const model = createReconciliationModel(dataset);
  const state = model.createDemoState();
  assert.equal(state.entries.length, 20);
  assert.equal(state.entries.filter(item => item.source === 'camera').length, 13);
  assert.equal(state.entries.filter(item => item.source === 'paper').length, 7);
  assert.equal(state.entries.flatMap(item => item.evidence).length, 18);
  assert.equal(row(state, 'camera-13').mergedFrom.length, 6);
  assert.deepEqual(model.getSummary(state), { total: 20, pending: 20, verified: 0, question: 0, explained: 0, paperMatched: 0, canComplete: false });
  assert.deepEqual(model.validateDemoState(clone(state)), state);
  assert.equal(createDemoState().entries.length, 5);
  assert.equal(DEMO_PAPER.length, 4);
  assert.equal(createDemoState().shiftId, 'demo-2026-10-14-night');
});

test('Другая смена и подмена начального состояния отклоняются до работы', () => {
  const dataset = fixture();
  const model = createReconciliationModel(dataset);
  const state = model.createDemoState();
  assert.throws(() => validateDemoState(state), /другой смене/);
  assert.throws(() => model.validateDemoState(createDemoState()), /другой смене/);
  assert.throws(() => model.validateDemoState({ ...state, shiftId: 'another-shift' }), /другой смене/);
  assert.throws(() => createReconciliationModel({ ...dataset, initialState: createDemoState() }), /другой смене/);
});

test('Снимок исходников и начальная группа не зависят от последующей мутации входного объекта', () => {
  const dataset = fixture();
  const model = createReconciliationModel(dataset);
  const before = model.createDemoState();
  dataset.evidence[0].ocrPlate = 'ПОДМЕНА';
  dataset.paper[0].row = '999';
  dataset.initialState.entries[0].fields.plate = 'ДРУГОЙ';
  dataset.initialState.entries.find(item => item.mergedFrom).mergedFrom[0].evidence[0].label = 'ПОДМЕНА';
  assert.deepEqual(model.createDemoState(), before);
  const returned = model.createDemoState();
  returned.entries[0].fields.additional.push({ name: 'Новая услуга', price: '100' });
  returned.entries.find(item => item.mergedFrom).mergedFrom[0].fields.plate = 'ДРУГОЙ';
  assert.deepEqual(model.createDemoState(), before);
  assert.doesNotThrow(() => model.saveEntry(before, 'paper-1', row(before, 'paper-1').fields, NOW));
});

test('Подмена, потеря и дублирование исходных фрагментов запрещены в обычных и объединённых строках', () => {
  const model = createReconciliationModel(fixture());
  for (const mutation of [
    state => { state.entries[0].evidence[0].ocrPlate = 'ПОДМЕНА'; },
    state => { state.entries[0].evidence[0].time = '20:00'; },
    state => { state.entries[0].evidence[0].box = 2; },
    state => { state.entries[0].evidence[0].id = 'unknown'; },
    state => { state.entries.splice(0, 1); },
    state => { state.entries.push(clone(state.entries[0])); },
    state => { row(state, 'camera-13').evidence.pop(); },
    state => { row(state, 'camera-13').mergedFrom.pop(); },
    state => { row(state, 'camera-13').mergedFrom[0].evidence[0].label = 'ПОДМЕНА'; },
    state => { row(state, 'camera-13').evidence.push(clone(row(state, 'camera-13').evidence[0])); },
  ]) {
    const changed = model.createDemoState();
    mutation(changed);
    assert.throws(() => model.validateDemoState(changed));
  }
});

test('У исходного набора обязательны уникальные строки, уникальные фрагменты и допустимый час смены', () => {
  for (const mutation of [
    dataset => { dataset.paper[1].row = dataset.paper[0].row; },
    dataset => { dataset.evidence[1].id = dataset.evidence[0].id; },
    dataset => { dataset.paper[0].row = ''; },
    dataset => { dataset.evidence[0].box = 3; },
    dataset => { dataset.evidence[0].time = '25:00'; },
    dataset => { dataset.dayStartHour = 24; },
    dataset => { dataset.initialState.entries[0].note = 'Нельзя ставить пояснение непроверенной строке'; },
  ]) {
    const dataset = fixture();
    mutation(dataset);
    assert.throws(() => createReconciliationModel(dataset));
  }
});

test('Сохранение и отметка сверки разделены; исправление и снятие отметки сохраняют сырой OCR', () => {
  const model = createReconciliationModel(fixture());
  let state = model.createDemoState();
  const id = 'camera-13';
  assert.throws(() => model.reviewEntry(state, id, 'verified', '', '', NOW), /Сначала сохраните/);
  state = model.saveEntry(state, id, { ...row(state, id).fields, plate: 'А119ВС77' }, NOW);
  assert.equal(row(state, id).status, 'pending');
  state = model.reviewEntry(state, id, 'verified', '', '', NOW);
  assert.equal(model.getSummary(state).verified, 1);
  const unchanged = model.saveEntry(state, id, row(state, id).fields, LATER);
  assert.equal(row(unchanged, id).status, 'verified');
  const unmarked = model.reviewEntry(state, id, 'pending', 'ignored', 'ignored', LATER);
  assert.equal(row(unmarked, id).status, 'pending');
  assert.equal(row(unmarked, id).reviewedAt, null);
  assert.equal(row(unmarked, id).reason, '');
  assert.equal(row(unmarked, id).note, '');
  assert.equal(row(unmarked, id).fields.plate, 'А119ВС77');
  assert.equal(row(unmarked, id).evidence[0].ocrPlate, 'А119ВС7');
  const edited = model.saveEntry(state, id, { ...row(state, id).fields, company: 'Исправлено' }, LATER);
  assert.equal(row(edited, id).status, 'pending');
  assert.equal(row(edited, id).reviewedAt, null);
  assert.deepEqual(row(edited, id).evidence, row(state, id).evidence);
});

test('Шесть связанных частей можно восстановить и снова связать без потери наблюдений', () => {
  const model = createReconciliationModel(fixture());
  const state = model.createDemoState();
  const originals = row(state, 'camera-13').mergedFrom;
  const restored = model.unmergeEntry(state, 'camera-13', NOW);
  assert.equal(restored.entries.length, 25);
  assert.equal(restored.entries.filter(item => item.source === 'camera').length, 18);
  originals.forEach(original => assert.deepEqual(row(restored, original.id), original));
  const regrouped = model.mergeEntries(restored, originals.map(item => item.id), LATER);
  assert.equal(regrouped.entries.length, 20);
  assert.deepEqual(row(regrouped, 'camera-13').evidence, row(state, 'camera-13').evidence);
});

test('Завершение учитывает все 20 строк бумаги и не принимает несуществующую строку', () => {
  const model = createReconciliationModel(fixture());
  let state = model.createDemoState();
  assert.throws(() => model.saveEntry(state, 'camera-01', { ...row(state, 'camera-01').fields, paperRow: '21' }, NOW), /существующую строку/);
  assert.throws(() => model.completeShift(state, NOW), /непроверенные/);
  for (const entry of state.entries) {
    state = model.saveEntry(state, entry.id, entry.fields, NOW);
    state = model.reviewEntry(state, entry.id, entry.source === 'camera' ? 'verified' : 'explained', entry.source === 'camera' ? '' : 'missing_camera', '', NOW);
  }
  assert.equal(model.getSummary(state).paperMatched, 20);
  assert.equal(model.getSummary(state).canComplete, true);
  state = model.completeShift(state, NOW);
  assert.equal(state.completedAt, NOW);
  assert.deepEqual(model.validateDemoState(clone(state)), state);
  const reopened = model.reviewEntry(state, 'camera-01', 'pending', '', '', LATER);
  assert.equal(reopened.completedAt, null);
  assert.equal(model.getSummary(reopened).canComplete, false);
});

test('Начало дня параметризует порядок фрагментов, учебная сортировка не изменяется', () => {
  const dataset = { shiftId: 'day-start-test', paper: [], dayStartHour: 0, evidence: [
    { id: 'late', time: '22:00', box: 1, ocrPlate: 'А100ВС77', label: '' },
    { id: 'early', time: '01:00', box: 1, ocrPlate: 'А100ВС77', label: '' },
  ] };
  const civilDay = createReconciliationModel(dataset);
  const nightShift = createReconciliationModel({ ...dataset, dayStartHour: 8 });
  assert.equal(row(civilDay.mergeEntries(civilDay.createDemoState(), ['late', 'early'], NOW), 'late').time, '01:00');
  assert.equal(row(nightShift.mergeEntries(nightShift.createDemoState(), ['late', 'early'], NOW), 'late').time, '22:00');
});

test('Разные наборы имеют отдельные ключи, ревизии и блокировки, учебное сохранение остаётся прежним', async () => {
  const store = memory();
  const demo = createDemoState();
  const savedDemo = saveDemoEntry(demo, 'normal', { ...demo.entries[0].fields, company: 'Учебная компания' }, NOW);
  persistDemo(store, savedDemo, 0, validateDemoState);
  const beforeDemo = store.getItem(DEMO_STORAGE_KEY);
  const model = createReconciliationModel(fixture());
  const state = model.createDemoState();
  const next = model.saveEntry(state, 'camera-01', { ...row(state, 'camera-01').fields, plate: 'ИСПРАВЛЕНО' }, NOW);
  const names = [];
  const locks = { request(name, action) { names.push(name); return Promise.resolve().then(action); } };
  await withDemoStorageLock(locks, () => persistDemo(store, next, 0, model.validateDemoState, SNAPSHOT_KEY), SNAPSHOT_KEY);
  await withDemoStorageLock(locks, () => {}, undefined);
  assert.deepEqual(names, [SNAPSHOT_KEY, DEMO_STORAGE_KEY]);
  assert.deepEqual(loadDemo(store, model.validateDemoState, SNAPSHOT_KEY), next);
  assert.equal(store.getItem(DEMO_STORAGE_KEY), beforeDemo);
  assert.deepEqual(loadDemo(store, validateDemoState), savedDemo);
  assert.throws(() => loadDemo(store, model.validateDemoState, DEMO_STORAGE_KEY), /повреждена/);
  assert.throws(() => persistDemo(store, next, 0, model.validateDemoState, SNAPSHOT_KEY), /другом окне/);
  assert.equal(store.getItem(DEMO_STORAGE_KEY), beforeDemo);
  assert.equal(loadDemo(store, model.validateDemoState, SNAPSHOT_KEY).revision, 1);
});

test('Блокировка выбранного набора сериализует вкладки, но не блокирует другой набор', async () => {
  const queues = new Map();
  const locks = { request(name, action) {
    const promise = (queues.get(name) ?? Promise.resolve()).then(action);
    queues.set(name, promise.catch(() => {}));
    return promise;
  } };
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const events = [];
  const first = withDemoStorageLock(locks, async () => { events.push('snapshot-first'); await gate; events.push('snapshot-save'); }, SNAPSHOT_KEY);
  const second = withDemoStorageLock(locks, () => { events.push('snapshot-second'); }, SNAPSHOT_KEY);
  await withDemoStorageLock(locks, () => { events.push('demo'); });
  assert.deepEqual(events, ['snapshot-first', 'demo']);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['snapshot-first', 'demo', 'snapshot-save', 'snapshot-second']);
});

test('Реальный локальный seed проходит полный цикл правки, сохранения и восстановления без изменения исходника', {
  skip: !process.env.P06_TEST_SNAPSHOT,
}, () => {
  const raw = readFileSync(process.env.P06_TEST_SNAPSHOT, 'utf8');
  const payload = JSON.parse(raw);
  const model = createReconciliationModel(payload.dataset);
  const initial = model.createDemoState();
  assert.equal(payload.dataset.paper.length, 20);
  assert.equal(initial.entries.length, 20);
  assert.equal(initial.entries.filter(item => item.source === 'camera').length, 13);
  assert.equal(initial.entries.filter(item => item.source === 'paper').length, 7);
  assert.equal(initial.entries.flatMap(item => item.evidence).length, 18);
  assert.equal(initial.entries.find(item => item.mergedFrom).mergedFrom.length, 6);
  assert.equal(model.getSummary(initial).pending, 20);
  assert.ok(initial.entries.every(item => !item.reason && !item.note && item.savedAt === null && item.reviewedAt === null));
  const confirmed = initial.entries.find(item => item.fields.paperRow === '15');
  assert.ok(confirmed);
  assert.equal(confirmed.fields.plate, 'Н469ХМ33');
  const saved = model.saveEntry(initial, confirmed.id, { ...confirmed.fields, company: 'Проверка сохранения' }, NOW);
  const verified = model.reviewEntry(saved, confirmed.id, 'verified', '', '', NOW);
  const store = memory();
  persistDemo(store, verified, 0, model.validateDemoState, SNAPSHOT_KEY);
  const restored = loadDemo(store, model.validateDemoState, SNAPSHOT_KEY);
  assert.deepEqual(restored, verified);
  const unmarked = model.reviewEntry(restored, confirmed.id, 'pending', '', '', LATER);
  persistDemo(store, unmarked, restored.revision, model.validateDemoState, SNAPSHOT_KEY);
  assert.equal(model.getSummary(loadDemo(store, model.validateDemoState, SNAPSHOT_KEY)).verified, 0);
  assert.deepEqual(model.createDemoState(), initial);
  assert.equal(readFileSync(process.env.P06_TEST_SNAPSHOT, 'utf8'), raw);
});
