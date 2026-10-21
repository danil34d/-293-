// Запуск: node --experimental-strip-types scripts/test-reconciliation-demo.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_PAPER, createDemoState, validateDemoState, saveEntry, reviewEntry,
  addPaperEntry, removePaperEntry, mergeEntries, unmergeEntry, getSummary, completeShift,
} from '../src/lib/reconciliation/demo-model.ts';

const NOW = '2026-10-15T08:05:00+03:00';
const LATER = '2026-10-15T08:06:00+03:00';
const entry = (state, id) => state.entries.find((item) => item.id === id);
const fieldsFor = (state, id, row) => {
  const paper = DEMO_PAPER.find((item) => item.row === row);
  return { ...entry(state, id).fields, paperRow: row, plate: paper.plate, wash: paper.wash, price: paper.price,
    employee1: paper.employee1, employee2: paper.employee2 };
};
const match = (state, id, row) => reviewEntry(saveEntry(state, id, fieldsFor(state, id, row), NOW), id, 'verified', '', '', NOW);

function reconciled() {
  let state = match(createDemoState(), 'normal', '1');
  state = mergeEntries(state, ['fragment-1', 'fragment-2'], NOW);
  state = match(state, 'fragment-1', '2');
  state = match(state, 'unreadable', '3');
  state = addPaperEntry(state, 'paper-missing', NOW);
  state = saveEntry(state, 'paper-missing', fieldsFor(state, 'paper-missing', '4'), NOW);
  state = reviewEntry(state, 'paper-missing', 'explained', 'missing_camera', 'В журнале есть, в учебной камере нет.', NOW);
  return reviewEntry(state, 'transit', 'explained', 'no_wash', 'Заезд без оказания услуги.', NOW);
}

test('Учебная смена содержит все наблюдения и четыре строки бумаги; совпадения не назначены', () => {
  const state = createDemoState();
  assert.equal(state.entries.length, 5);
  assert.equal(DEMO_PAPER.length, 4);
  assert.deepEqual(getSummary(state), { total: 5, pending: 5, verified: 0, question: 0, explained: 0, paperMatched: 0, canComplete: false });
  assert.ok(state.entries.every((item) => item.savedAt === null && item.fields.paperRow === ''));
  assert.deepEqual(validateDemoState(JSON.parse(JSON.stringify(state))), state);
});

test('Сохранение не является сверкой и не изменяет исходное состояние', () => {
  const state = createDemoState();
  const before = JSON.stringify(state);
  const saved = saveEntry(state, 'normal', fieldsFor(state, 'normal', '1'), NOW);
  assert.equal(JSON.stringify(state), before);
  assert.equal(entry(saved, 'normal').savedAt, NOW);
  assert.equal(entry(saved, 'normal').status, 'pending');
  assert.equal(getSummary(saved).paperMatched, 0);
  assert.throws(() => reviewEntry(state, 'normal', 'verified', '', '', NOW), /Сначала сохраните/);
  assert.equal(entry(reviewEntry(saved, 'normal', 'verified', '', '', NOW), 'normal').status, 'verified');
});

test('Правка номера и полей сбрасывает подтверждение, сырой OCR остаётся неизменным', () => {
  const state = match(createDemoState(), 'normal', '1');
  const updated = saveEntry(state, 'normal', { ...entry(state, 'normal').fields, plate: ' ab-1234 ' }, LATER);
  assert.equal(entry(updated, 'normal').fields.plate, 'AB-1234');
  assert.equal(entry(updated, 'normal').evidence[0].ocrPlate, 'A123BC77');
  assert.equal(entry(updated, 'normal').status, 'pending');
  assert.equal(entry(updated, 'normal').reviewedAt, null);
  // Иностранный формат допустим: сверку подтверждает человек.
  assert.equal(entry(reviewEntry(updated, 'normal', 'verified', '', '', LATER), 'normal').status, 'verified');
});

test('Две колонки сотрудников и дополнительные услуги сохраняются отдельно', () => {
  const state = createDemoState();
  const saved = saveEntry(state, 'normal', { ...fieldsFor(state, 'normal', '1'), employee1: 'Иван', employee2: 'Иван',
    additional: [{ name: 'Полировка', price: '1000' }, { name: 'Коврики', price: '100' }] }, NOW);
  assert.equal(entry(saved, 'normal').fields.employee1, 'Иван');
  assert.equal(entry(saved, 'normal').fields.employee2, 'Иван');
  assert.equal(entry(saved, 'normal').fields.additional.length, 2);
});

test('Сверка требует номер и строку бумаги, одинаковый номер не связывает заезды автоматически', () => {
  const state = createDemoState();
  const saved = saveEntry(state, 'unreadable', entry(state, 'unreadable').fields, NOW);
  assert.throws(() => reviewEntry(saved, 'unreadable', 'verified', '', '', NOW), /госномер и строка/);
  const first = match(state, 'fragment-1', '2');
  assert.equal(entry(first, 'fragment-2').status, 'pending');
  const duplicate = saveEntry(first, 'fragment-2', fieldsFor(first, 'fragment-2', '2'), NOW);
  assert.throws(() => reviewEntry(duplicate, 'fragment-2', 'verified', '', '', NOW), /уже связана/);
});

test('Объединение и отмена сохраняют все фрагменты, исходные поля и OCR', () => {
  const original = createDemoState();
  const merged = mergeEntries(original, ['fragment-1', 'fragment-2'], NOW);
  assert.equal(merged.entries.length, 4);
  assert.equal(entry(merged, 'fragment-1').evidence.length, 2);
  assert.equal(entry(merged, 'fragment-1').savedAt, null);
  assert.equal(entry(merged, 'fragment-1').status, 'pending');
  assert.deepEqual(entry(merged, 'fragment-1').mergedFrom, [entry(original, 'fragment-1'), entry(original, 'fragment-2')]);
  const restored = unmergeEntry(merged, 'fragment-1', LATER);
  assert.deepEqual(restored.entries, original.entries);
  assert.equal(original.entries.length, 5);
});

test('Объединение сохраняет одну заполненную строку и требует нового сохранения', () => {
  const original = createDemoState();
  const saved = saveEntry(original, 'fragment-2', fieldsFor(original, 'fragment-2', '2'), NOW);
  const merged = mergeEntries(saved, ['fragment-1', 'fragment-2'], NOW);
  assert.deepEqual(entry(merged, 'fragment-1').fields, entry(saved, 'fragment-2').fields);
  assert.equal(entry(merged, 'fragment-1').savedAt, null);
  assert.throws(() => reviewEntry(merged, 'fragment-1', 'verified', '', '', NOW), /Сначала сохраните/);
  assert.deepEqual(unmergeEntry(merged, 'fragment-1', NOW).entries, saved.entries);
});

test('Два фрагмента с одинаковыми сохранёнными полями объединяются и полностью восстанавливаются', () => {
  let state = createDemoState();
  const fields = { ...fieldsFor(state, 'fragment-1', '2'), additional: [{ name: 'Коврики', price: '100' }] };
  state = saveEntry(state, 'fragment-1', fields, NOW);
  state = saveEntry(state, 'fragment-2', { ...fields, plate: ' b456kt197 ', additional: [{ name: ' Коврики ', price: '100' }] }, LATER);
  const before = JSON.stringify(state);
  const merged = mergeEntries(state, ['fragment-1', 'fragment-2'], LATER);
  const group = entry(merged, 'fragment-1');
  assert.equal(group.evidence.length, 2);
  assert.equal(group.savedAt, null);
  assert.equal(group.status, 'pending');
  assert.deepEqual(group.fields, entry(state, 'fragment-1').fields);
  assert.deepEqual(group.mergedFrom, [entry(state, 'fragment-1'), entry(state, 'fragment-2')]);
  assert.deepEqual(unmergeEntry(merged, 'fragment-1', LATER).entries, state.entries);
  assert.equal(JSON.stringify(state), before);
});

test('Конфликт заполненных полей нельзя молча объединить', () => {
  let state = createDemoState();
  state = saveEntry(state, 'fragment-1', fieldsFor(state, 'fragment-1', '2'), NOW);
  state = saveEntry(state, 'fragment-2', { ...entry(state, 'fragment-2').fields, company: 'Другая компания' }, NOW);
  assert.throws(() => mergeEntries(state, ['fragment-1', 'fragment-2'], NOW), /различающиеся сохранённые поля; согласуйте поля/);
  assert.throws(() => mergeEntries(state, ['normal', 'fragment-2'], NOW), /разных боксов/);
  assert.throws(() => mergeEntries(state, ['normal', 'normal'], NOW), /два разных/);
});

test('Неясный номер сохраняется как открытый вопрос и мешает завершению', () => {
  const state = reviewEntry(createDemoState(), 'unreadable', 'question', 'unreadable_plate', 'Уточнить по бумаге.', NOW);
  assert.equal(getSummary(state).question, 1);
  assert.throws(() => completeShift(state, NOW), /непроверенные/);
  assert.throws(() => reviewEntry(state, 'normal', 'question', '', '', NOW), /что требуется уточнить/);
  const undone = reviewEntry(state, 'unreadable', 'pending', '', '', NOW);
  assert.equal(entry(undone, 'unreadable').note, '');
  assert.equal(entry(undone, 'unreadable').reviewedAt, null);
});

test('Объяснение заезда без мойки не может закрывать строку бумаги', () => {
  const initial = createDemoState();
  assert.throws(() => reviewEntry(initial, 'transit', 'explained', '', '', NOW), /причину/);
  const assigned = saveEntry(initial, 'transit', fieldsFor(initial, 'transit', '4'), NOW);
  assert.throws(() => reviewEntry(assigned, 'transit', 'explained', 'no_wash', '', NOW), /должна быть пустой/);
  assert.throws(() => reviewEntry(initial, 'transit', 'explained', 'other', '', NOW), /пояснение/);
});

test('Пропуск камеры требует добавленной и сохранённой строки бумаги', () => {
  const state = createDemoState();
  assert.throws(() => reviewEntry(state, 'normal', 'explained', 'missing_camera', '', NOW), /добавленной строки/);
  const paper = addPaperEntry(state, 'paper-missing', NOW);
  assert.throws(() => reviewEntry(paper, 'paper-missing', 'explained', 'missing_camera', '', NOW), /Сначала сохраните/);
  assert.throws(() => addPaperEntry(state, 'normal', NOW), /идентификаторы/);
});

test('Случайную строку бумаги можно удалить, камерное наблюдение удалить нельзя', () => {
  const initial = createDemoState();
  const added = addPaperEntry(initial, 'paper-accidental', NOW);
  const removed = removePaperEntry(added, 'paper-accidental', LATER);
  assert.deepEqual(removed.entries, initial.entries);
  assert.equal(removed.revision, added.revision + 1);
  assert.equal(added.entries.length, initial.entries.length + 1);
  assert.throws(() => removePaperEntry(initial, 'normal', NOW), /только вручную добавленную/);
  assert.throws(() => removePaperEntry(initial, 'unknown', NOW), /не найдена/);
  const completed = completeShift(reconciled(), NOW);
  const reopened = removePaperEntry(completed, 'paper-missing', LATER);
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.revision, completed.revision + 1);
  assert.equal(getSummary(reopened).paperMatched, 3);
  assert.equal(getSummary(reopened).canComplete, false);
});

test('Все наблюдения объяснены, но пропущенная строка бумаги не позволяет завершить смену', () => {
  let state = match(createDemoState(), 'normal', '1');
  state = mergeEntries(state, ['fragment-1', 'fragment-2'], NOW);
  state = match(state, 'fragment-1', '2');
  state = match(state, 'unreadable', '3');
  state = reviewEntry(state, 'transit', 'explained', 'no_wash', '', NOW);
  assert.equal(getSummary(state).pending, 0);
  assert.equal(getSummary(state).paperMatched, 3);
  assert.equal(getSummary(state).canComplete, false);
  assert.throws(() => completeShift(state, NOW), /несопоставленные строки/);
});

test('Полная сверка четырёх строк, фрагментов и проезда завершается и восстанавливается', () => {
  const state = reconciled();
  assert.deepEqual(getSummary(state), { total: 5, pending: 0, verified: 3, question: 0, explained: 2, paperMatched: 4, canComplete: true });
  const complete = completeShift(state, NOW);
  assert.equal(complete.completedAt, NOW);
  assert.equal(complete.revision, state.revision + 1);
  assert.deepEqual(validateDemoState(JSON.parse(JSON.stringify(complete))), complete);
  const edited = saveEntry(complete, 'normal', { ...entry(complete, 'normal').fields, price: '1900' }, LATER);
  assert.equal(edited.completedAt, null);
  assert.equal(getSummary(edited).canComplete, false);
  const unchanged = saveEntry(complete, 'normal', entry(complete, 'normal').fields, LATER);
  assert.equal(unchanged.completedAt, NOW);
  assert.equal(entry(unchanged, 'normal').status, 'verified');
});

test('Повреждённые и слишком большие сохранения отклоняются', () => {
  for (const mutation of [
    (state) => { state.schemaVersion = 2; },
    (state) => { state.shiftId = 'another-shift'; },
    (state) => { state.revision = -1; },
    (state) => { state.revision = Number.MAX_SAFE_INTEGER; },
    (state) => { state.entries[0].fields.plate = 'x'.repeat(41); },
    (state) => { state.entries[0].fields.additional = Array.from({ length: 13 }, () => ({ name: '', price: '' })); },
    (state) => { state.entries[0].fields.paperRow = '5'; },
    (state) => { state.entries[0].status = 'unknown'; },
    (state) => { state.entries[0].savedAt = 'вчера'; },
    (state) => { state.entries[0].evidence[0].ocrPlate = 'CHANGED'; },
    (state) => { state.entries.pop(); },
    (state) => { state.entries.push(structuredClone(state.entries[0])); },
    (state) => { state.entries[0].fields = null; },
    (state) => { state.completedAt = NOW; },
    (state) => { state.entries[0].reviewedAt = NOW; },
    (state) => { state.unknownPayload = 'неизвестное поле'; },
  ]) {
    const state = createDemoState();
    mutation(state);
    assert.throws(() => validateDemoState(state));
  }
  assert.throws(() => validateDemoState(null));
  const merged = mergeEntries(createDemoState(), ['fragment-1', 'fragment-2'], NOW);
  merged.entries.find((item) => item.id === 'fragment-1').mergedFrom.pop();
  assert.throws(() => validateDemoState(merged), /объединение/);
});

test('Загруженные данные не ссылаются на исходный объект и команды не мутируют вложения', () => {
  const state = createDemoState();
  const loaded = validateDemoState(state);
  loaded.entries[0].evidence[0].ocrPlate = 'TEMP';
  loaded.entries[0].fields.plate = 'TEMP';
  assert.equal(state.entries[0].evidence[0].ocrPlate, 'A123BC77');
  assert.equal(state.entries[0].fields.plate, 'A123BC77');
  const before = JSON.stringify(state);
  mergeEntries(state, ['fragment-1', 'fragment-2'], NOW);
  addPaperEntry(state, 'new-paper', NOW);
  reviewEntry(state, 'transit', 'explained', 'no_wash', '', NOW);
  assert.equal(JSON.stringify(state), before);
});
