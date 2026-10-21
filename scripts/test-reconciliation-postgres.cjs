require('./reconciliation-test-loader.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createPostgresReconciliationStore, ReconciliationConflict } = require('../src/lib/reconciliation/postgres-store.ts');
const { createLiveReconciliation, recordCameraFailure, applyReconciliationCommand, attachPaperImage } = require('../src/lib/reconciliation/live-model.ts');
const connectionString = process.env.P06_TEST_DATABASE_URL;

test('PostgreSQL: конкурирующие окна, история, откат транзакции и повторное подключение', { skip: !connectionString }, async () => {
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/p06_widget_test', 'Тест разрешён только на локальной p06_widget_test');
  const { Pool } = require(process.env.P06_PG_DRIVER || '../.tmp/reconciliation-tools/node_modules/pg');
  const schema = `p06_${process.pid}_${Date.now()}`;
  const admin = new Pool({ connectionString });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  let pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  function storeFor(clientPool) {
    return createPostgresReconciliationStore({
      query: async (sql, values) => (await clientPool.query(sql, values)).rows,
      transaction: async work => {
        const client = await clientPool.connect();
        try { await client.query('BEGIN'); const value = await work({ query: async (sql, values) => (await client.query(sql, values)).rows }); await client.query('COMMIT'); return value; }
        catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
      },
    });
  }
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, 'migrations/reconciliation/001-reconciliation.sql'), 'utf8'));
    let store = storeFor(pool);
    const fresh = createLiveReconciliation({ date: '2026-10-21', period: 'day' });
    const first = recordCameraFailure(fresh, 'Тестовая недоступность камер', new Date().toISOString());
    const race = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => store.write(first, 0, `owner-${i}`, 'refresh')));
    assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
    for (const failure of race.filter(x => x.status === 'rejected')) assert.ok(failure.reason instanceof ReconciliationConflict);
    assert.deepEqual(await store.read(first.state.shiftId), first);
    assert.equal((await store.history(first.state.shiftId)).length, 1);
    assert.ok(Math.abs(Date.now() - (await store.history(first.state.shiftId))[0].createdAt.getTime()) < 5000, 'История сохраняет момент времени независимо от часового пояса БД');
    const second = applyReconciliationCommand(first, { type: 'set-paper', rows: [{ row: '1', time: '08:30', plate: 'РУЧНОЙ', wash: 'Кузов', price: '1800', employee1: 'Иван', employee2: '' }], confirmed: true }, new Date().toISOString());
    const updateRace = await Promise.allSettled([store.write(second, 1, 'owner-a', 'set-paper'), store.write(second, 1, 'owner-b', 'set-paper')]);
    assert.equal(updateRace.filter(x => x.status === 'fulfilled').length, 1);
    assert.equal((await store.history(first.state.shiftId)).length, 2);
    // История и текущее состояние обязаны откатываться вместе при ошибке второй записи.
    await pool.query('ALTER TABLE "ReconciliationRevision" ADD CONSTRAINT test_history_failure CHECK ("action" <> \'force-failure\')');
    const third = applyReconciliationCommand(second, { type: 'finish-review' }, new Date().toISOString());
    await assert.rejects(store.write(third, 2, 'owner', 'force-failure'));
    assert.deepEqual(await store.read(second.state.shiftId), second);
    assert.equal((await store.history(second.state.shiftId)).length, 2);
    await pool.query('ALTER TABLE "ReconciliationRevision" DROP CONSTRAINT test_history_failure');
    await store.write(third, 2, 'owner', 'finish-review');
    const imageId = require('node:crypto').randomUUID();
    const fourth = attachPaperImage(third, imageId);
    const image = Buffer.from('test image bytes');
    await store.writePaperImage(fourth, 3, 'owner', 'image/png', image);
    assert.deepEqual(Buffer.from((await store.readPaperImage(fourth.state.shiftId, imageId)).bytes), image);
    assert.equal(await store.readPaperImage('other-shift', imageId), null);
    const duplicate = attachPaperImage(fourth, imageId);
    await assert.rejects(store.writePaperImage(duplicate, 4, 'owner', 'image/png', image));
    assert.deepEqual(await store.read(fourth.state.shiftId), fourth, 'Ошибка записи фото откатывает состояние и историю вместе');
    await pool.end();
    pool = new Pool({ connectionString, options: `-c search_path=${schema}` }); store = storeFor(pool);
    assert.deepEqual(await store.read(fourth.state.shiftId), fourth);
    assert.equal((await store.list()).length, 1);
    assert.equal((await store.history(fourth.state.shiftId)).length, 4);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
