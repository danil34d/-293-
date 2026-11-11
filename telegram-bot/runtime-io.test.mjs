import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJsonPersister, dateKey, telegramTimeoutMs, writeJsonAtomic } from './runtime-io.mjs';

test('Moscow midnight changes the date before UTC midnight', () => {
  assert.equal(dateKey('Europe/Moscow', new Date('2026-11-11T20:59:59Z')), '2026-11-11');
  assert.equal(dateKey('Europe/Moscow', new Date('2026-11-11T21:00:00Z')), '2026-11-12');
});

test('polling deadline allows Telegram long polling to complete', () => {
  assert.equal(telegramTimeoutMs('getUpdates', 50), 65000);
  assert.equal(telegramTimeoutMs('getUpdates', 55), 70000);
  assert.equal(telegramTimeoutMs('sendMessage', 50), 15000);
});

test('overlapping saves preserve request order and capture values immediately', async () => {
  const writes = [];
  const save = createJsonPersister(async (file, value) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    writes.push([file, JSON.parse(value)]);
  });
  const state = { offset: 10 };
  const first = save([['state', state], ['conversation', { step: 1 }]]);
  state.offset = 11;
  const second = save([['state', state], ['conversation', { step: 2 }]]);
  await Promise.all([first, second]);
  assert.deepEqual(writes, [['state', { offset: 10 }], ['conversation', { step: 1 }],
    ['state', { offset: 11 }], ['conversation', { step: 2 }]]);
});

test('failed save is reported and does not poison later saves', async () => {
  let calls = 0;
  const save = createJsonPersister(async () => { if (++calls === 1) throw new Error('disk unavailable'); });
  await assert.rejects(save([['state', { offset: 10 }]]), /disk unavailable/);
  await save([['state', { offset: 11 }]]);
  assert.equal(calls, 2);
});

test('failed replacement leaves original JSON intact and cleans its temporary file', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'carwash-bot-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('carwash-bot-test-'));
    return fs.rm(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'state.json');
  await fs.writeFile(file, JSON.stringify({ offset: 10 }));
  await assert.rejects(writeJsonAtomic(file, JSON.stringify({ offset: 11 }), {
    ...fs, rename: async () => { throw new Error('rename failed'); },
  }), /rename failed/);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { offset: 10 });
  assert.deepEqual(await fs.readdir(directory), ['state.json']);
  await writeJsonAtomic(file, JSON.stringify({ offset: 12 }));
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { offset: 12 });
});
