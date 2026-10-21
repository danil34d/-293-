require('./reconciliation-test-loader.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { currentShift, previousShift, shiftBounds, validateShift } = require('../src/lib/reconciliation/shift.ts');
const { parseCameraSnapshot, fetchReconciliationCameraSnapshot } = require('../src/lib/reconciliation/camera-source.ts');
const { createLiveReconciliation, receiveCameraSnapshot, recordCameraFailure, applyReconciliationCommand } = require('../src/lib/reconciliation/live-model.ts');
const SHIFT = { date: '2026-10-21', period: 'day' };
const NOW = '2026-10-21T10:00:00Z';
const raw = (box = 1, minute = '12-20', plate = 'А123ВС77') => ({
  box, dir_name: `2026-10-21_${minute}_track00_бокс${box}`, plate_number: plate, end: '21.10.2026 13:00:00', has_thumbnail: true,
});
const snapshot = rows => parseCameraSnapshot(rows, SHIFT, NOW);
const command = (doc, cmd) => applyReconciliationCommand(doc, cmd, NOW);
const paper = [{ row: '1', time: '12:20', plate: 'А123ВС77', wash: '', price: '', employee1: '', employee2: '' }];

test('Московские смены: полночь, границы 08:00/20:00, переход месяца и года', () => {
  assert.deepEqual(currentShift(new Date('2026-10-21T04:59:59Z')), { date: '2026-10-20', period: 'night' });
  assert.deepEqual(currentShift(new Date('2026-10-21T05:00:00Z')), SHIFT);
  assert.deepEqual(currentShift(new Date('2026-10-21T17:00:00Z')), { date: '2026-10-21', period: 'night' });
  assert.deepEqual(previousShift(new Date('2027-01-01T05:00:00Z')), { date: '2026-12-31', period: 'night' });
  assert.equal(shiftBounds(SHIFT).end - shiftBounds(SHIFT).start, 43200000);
  assert.throws(() => validateShift({ date: '2026-02-30', period: 'day' }));
});
test('API-фрагменты различаются по боксу, ночь включает утро следующей даты', () => {
  const a = raw(); const b = { ...a, box: 2 };
  assert.notEqual(snapshot([a, b]).observations[0].evidence.id, snapshot([a, b]).observations[1].evidence.id);
  const night = parseCameraSnapshot([raw(1, '07-59'), raw(1, '08-00'), { ...raw(), dir_name: '2026-10-20_20-00_track00_бокс1' }], { date: '2026-10-20', period: 'night' }, NOW);
  assert.equal(night.observations.length, 2);
  assert.equal(night.completeness, 'unknown');
});
test('Невалидный API не превращается в пустую смену, повторы отклоняются', () => {
  for (const payload of [{ error: 'bad' }, [raw(), raw()], [{ ...raw(), dir_name: '../secret' }], [{ ...raw(), box: 3 }]]) {
    assert.throws(() => snapshot(payload));
  }
  assert.equal(snapshot([]).observations.length, 0);
});
test('Живое чтение использует GET и grouped=0; ошибки и повреждённый JSON явные', async () => {
  let requested;
  await fetchReconciliationCameraSnapshot('http://localhost:8050', SHIFT, async (url, opts) => {
    requested = url; assert.equal(opts.method, undefined); return new Response(JSON.stringify([raw()]));
  });
  assert.equal(requested.searchParams.get('grouped'), '0');
  assert.equal(requested.searchParams.get('to_date'), SHIFT.date);
  await assert.rejects(fetchReconciliationCameraSnapshot('http://localhost:8050', SHIFT, async () => new Response('', { status: 503 })), /503/);
  await assert.rejects(fetchReconciliationCameraSnapshot('http://localhost:8050', SHIFT, async () => new Response('broken')), /повреждённый/);
  await assert.rejects(fetchReconciliationCameraSnapshot('http://localhost:8050', SHIFT, async () => { throw Error('timeout'); }), /недоступны/);
});
test('Поздний заезд сохраняет ручной номер и отметку старой строки, открывает смену', () => {
  let doc = receiveCameraSnapshot(createLiveReconciliation(SHIFT), snapshot([raw()]));
  doc = command(doc, { type: 'set-paper', rows: paper, confirmed: true });
  const entry = doc.state.entries[0];
  doc = command(doc, { type: 'save', id: entry.id, fields: { ...entry.fields, plate: 'РУЧНОЙ', paperRow: '1' } });
  doc = command(doc, { type: 'review', id: entry.id, status: 'verified', reason: '', note: '' });
  doc = command(doc, { type: 'complete' });
  const before = JSON.stringify(doc);
  const next = receiveCameraSnapshot(doc, snapshot([raw(), raw(2, '13-30')]));
  assert.equal(JSON.stringify(doc), before);
  assert.equal(next.state.entries.length, 2);
  assert.equal(next.state.entries[0].fields.plate, 'РУЧНОЙ');
  assert.equal(next.state.entries[0].status, 'verified');
  assert.equal(next.state.entries[1].status, 'pending');
  assert.equal(next.state.completedAt, null);
});
test('Изменённый OCR требует новой проверки, не меняя ручное исправление', () => {
  let doc = receiveCameraSnapshot(createLiveReconciliation(SHIFT), snapshot([raw()]));
  const entry = doc.state.entries[0];
  doc = command(doc, { type: 'save', id: entry.id, fields: { ...entry.fields, plate: 'РУЧНОЙ' } });
  doc = command(doc, { type: 'review', id: entry.id, status: 'explained', reason: 'no_wash', note: '' });
  const next = receiveCameraSnapshot(doc, snapshot([raw(1, '12-20', 'ДРУГОЙ OCR')]));
  assert.equal(next.state.entries[0].status, 'pending');
  assert.equal(next.state.entries[0].fields.plate, 'РУЧНОЙ');
  assert.equal(next.state.entries[0].evidence[0].ocrPlate, 'ДРУГОЙ OCR');
  assert.deepEqual(next.source.changedIds, [entry.id]);
});

test('Перестановка JSON-ключей после PostgreSQL не отменяет проверку неизменённого заезда', () => {
  let doc = receiveCameraSnapshot(createLiveReconciliation(SHIFT), snapshot([raw()]));
  doc = command(doc, { type: 'set-paper', rows: paper, confirmed: true });
  const entry = doc.state.entries[0];
  doc = command(doc, { type: 'save', id: entry.id, fields: { ...entry.fields, paperRow: '1' } });
  doc = command(doc, { type: 'review', id: entry.id, status: 'verified', reason: '', note: '' });
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  doc = reorder(doc);
  doc = receiveCameraSnapshot(doc, snapshot([raw()]));
  assert.equal(doc.state.entries[0].status, 'verified');
  assert.deepEqual(doc.source.changedIds, []);
  doc = command(doc, { type: 'set-paper', rows: paper, confirmed: true });
  assert.equal(doc.state.entries[0].status, 'verified');
});
test('Пропавшие наблюдения и сбой API не удаляют сохранённые сведения', () => {
  let doc = receiveCameraSnapshot(createLiveReconciliation(SHIFT), snapshot([raw()]));
  doc = receiveCameraSnapshot(doc, snapshot([]));
  assert.equal(doc.state.entries.length, 1);
  assert.equal(doc.source.missingIds.length, 1);
  const failed = recordCameraFailure(doc, 'Сеть недоступна', NOW);
  assert.deepEqual(failed.state.entries, doc.state.entries);
  assert.equal(failed.source.error, 'Сеть недоступна');
});
test('Бумажный журнал обновляется отдельно; изменение исходной строки отменяет сверку', () => {
  let doc = receiveCameraSnapshot(createLiveReconciliation(SHIFT), snapshot([raw()]));
  doc = command(doc, { type: 'set-paper', rows: paper, confirmed: true });
  const entry = doc.state.entries[0];
  doc = command(doc, { type: 'save', id: entry.id, fields: { ...entry.fields, paperRow: '1' } });
  doc = command(doc, { type: 'review', id: entry.id, status: 'verified', reason: '', note: '' });
  const next = command(doc, { type: 'set-paper', rows: [{ ...paper[0], price: '2300' }], confirmed: true });
  assert.equal(next.state.entries[0].status, 'pending');
  const removed = command(doc, { type: 'set-paper', rows: [], confirmed: true });
  assert.equal(removed.state.entries[0].fields.paperRow, '');
});
test('Разбор можно закончить с вопросом; полную сверку нельзя объявить без источников', () => {
  const doc = createLiveReconciliation(SHIFT);
  const finished = command(doc, { type: 'finish-review' });
  assert.equal(finished.reviewFinishedAt, NOW);
  assert.equal(finished.state.completedAt, null);
  assert.throws(() => command(doc, { type: 'complete' }), /журнала/);
  assert.throws(() => command(command(doc, { type: 'set-paper', rows: [], confirmed: true }), { type: 'complete' }), /недоступны/);
});
