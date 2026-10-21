import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoState, saveEntry, validateDemoState } from '../src/lib/reconciliation/demo-model.ts';
import { DEMO_STORAGE_KEY, loadDemo, persistDemo, withDemoStorageLock } from '../src/lib/reconciliation/demo-storage.ts';

const now = '2026-10-15T05:00:00.000Z';
function memory() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function saved(state = createDemoState()) {
  return saveEntry(state, 'normal', { ...state.entries[0].fields, paperRow: '1' }, now);
}

test('Сохранение и восстановление всех полей использует только отдельный учебный ключ', () => {
  const store = memory(); store.setItem('employee_auth', 'untouched');
  assert.equal(loadDemo(store, validateDemoState), null);
  const next = saved(); persistDemo(store, next, 0, validateDemoState);
  assert.deepEqual(loadDemo(store, validateDemoState), next);
  assert.equal(store.getItem('employee_auth'), 'untouched');
});
test('Устаревшая вкладка не перезаписывает более новую ревизию', () => {
  const store = memory(); const first = saved(); persistDemo(store, first, 0, validateDemoState);
  const second = saved(first); persistDemo(store, second, 1, validateDemoState);
  assert.throws(() => persistDemo(store, first, 0, validateDemoState), /другом окне/);
  assert.equal(loadDemo(store, validateDemoState).revision, 2);
});
test('Повреждённый JSON сохраняется для восстановления, обычная запись его не затирает', () => {
  const store = memory(); store.setItem(DEMO_STORAGE_KEY, '{broken');
  assert.throws(() => loadDemo(store, validateDemoState), /повреждена/);
  assert.throws(() => persistDemo(store, saved(), 0, validateDemoState), /повреждена/);
  assert.equal(store.getItem(DEMO_STORAGE_KEY), '{broken');
});
test('Неизвестная версия не превращается в пустую успешную смену', () => {
  const store = memory(); store.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...createDemoState(), schemaVersion: 2 }));
  assert.throws(() => loadDemo(store, validateDemoState), /другую версию/);
});
test('Ошибка квоты пробрасывается; старые результаты остаются доступными', () => {
  const store = memory(); persistDemo(store, saved(), 0, validateDemoState);
  const before = store.getItem(DEMO_STORAGE_KEY);
  store.setItem = () => { throw new DOMException('No space', 'QuotaExceededError'); };
  assert.throws(() => persistDemo(store, saved(saved()), 1, validateDemoState), { name: 'QuotaExceededError' });
  assert.equal(store.getItem(DEMO_STORAGE_KEY), before);
});
test('Хранилище, которое не записало значение, не сообщает об успехе', () => {
  const store = { getItem: () => null, setItem: () => {} };
  assert.throws(() => persistDemo(store, saved(), 0, validateDemoState), /подтвердить сохранение/);
});

test('Параллельные вкладки сериализуют запись; устаревшая отклоняется без потери правок первой', async () => {
  const store = memory();
  store.setItem(DEMO_STORAGE_KEY, JSON.stringify(createDemoState()));
  // Обе вкладки загрузили одну версию до начала сохранения.
  const firstSnapshot = loadDemo(store, validateDemoState);
  const secondSnapshot = loadDemo(store, validateDemoState);
  assert.equal(firstSnapshot.revision, 0);
  assert.equal(secondSnapshot.revision, 0);
  const firstNext = saveEntry(firstSnapshot, 'normal', { ...firstSnapshot.entries[0].fields, company: 'Первая вкладка', price: '2500' }, now);
  const secondNext = saveEntry(secondSnapshot, 'normal', { ...secondSnapshot.entries[0].fields, company: 'Вторая вкладка', price: '100' }, now);
  const queues = new Map();
  const requestedNames = [];
  const locks = {
    request(name, callback) {
      requestedNames.push(name);
      const result = (queues.get(name) ?? Promise.resolve()).then(callback);
      queues.set(name, result.catch(() => {}));
      return result;
    },
  };
  const events = [];
  let enterFirst;
  const firstEntered = new Promise(resolve => { enterFirst = resolve; });
  let releaseFirst;
  const firstMaySave = new Promise(resolve => { releaseFirst = resolve; });
  const first = withDemoStorageLock(locks, async () => {
    events.push('first-enter');
    enterFirst();
    await firstMaySave;
    persistDemo(store, firstNext, firstSnapshot.revision, validateDemoState);
    events.push('first-save');
    return 'сохранено';
  });
  await firstEntered;
  const second = withDemoStorageLock(locks, () => {
    events.push('second-enter');
    persistDemo(store, secondNext, secondSnapshot.revision, validateDemoState);
    events.push('second-save');
  });
  const finished = Promise.allSettled([first, second]);
  await Promise.resolve();
  assert.deepEqual(events, ['first-enter']);
  assert.deepEqual(requestedNames, [DEMO_STORAGE_KEY, DEMO_STORAGE_KEY]);
  releaseFirst();
  const [firstResult, secondResult] = await finished;
  assert.deepEqual(firstResult, { status: 'fulfilled', value: 'сохранено' });
  assert.equal(secondResult.status, 'rejected');
  assert.match(secondResult.reason.message, /другом окне/);
  assert.deepEqual(events, ['first-enter', 'first-save', 'second-enter']);
  assert.deepEqual(loadDemo(store, validateDemoState), firstNext);
  assert.equal(loadDemo(store, validateDemoState).revision, 1);
  assert.equal(loadDemo(store, validateDemoState).entries[0].fields.company, 'Первая вкладка');
  assert.equal(loadDemo(store, validateDemoState).entries[0].fields.price, '2500');
});

test('Отсутствие безопасной блокировки запрещает запись вместо небезопасного обходного пути', async () => {
  let actionCalled = false;
  for (const locks of [undefined, null, {}]) {
    await assert.rejects(withDemoStorageLock(locks, () => { actionCalled = true; }), /не поддерживает безопасную блокировку/);
  }
  assert.equal(actionCalled, false);
});
