import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dateKey } from './runtime-io.mjs';

test('worker commands and saved counters work with isolated data and mocked network', async (t) => {
  const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'carwash-worker-test-'));
  const importedFile = path.join(sourceDirectory, '.worker-test-import.mjs');
  const previousCwd = process.cwd();
  const previousFetch = globalThis.fetch;
  t.after(async () => {
    process.chdir(previousCwd);
    globalThis.fetch = previousFetch;
    await fs.unlink(importedFile);
    assert.equal(path.dirname(path.resolve(fixture)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixture).startsWith('carwash-worker-test-'));
    await fs.rm(fixture, { recursive: true, force: true });
  });
  Object.assign(process.env, {
    TELEGRAM_BOT_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_BOT_SECRET: 'test-secret',
    TELEGRAM_APP_BASE_URL: 'http://127.0.0.1:3000', TELEGRAM_TIMEZONE: 'Europe/Moscow',
    TELEGRAM_EMPLOYEE_CHAT_MAP_JSON: '{"employee-test":"1001"}', TELEGRAM_ADMIN_CHAT_IDS: '',
  });
  process.chdir(fixture);
  const runtime = path.join(fixture, 'data/telegram-bot');
  await fs.mkdir(runtime, { recursive: true });
  await fs.writeFile(path.join(runtime, `metrics-${dateKey('Europe/Moscow')}.json`), JSON.stringify({
    date: dateKey('Europe/Moscow'), apiErrors: 110, commandsHandled: 7,
  }));
  const source = await fs.readFile(path.join(sourceDirectory, 'worker.mjs'), 'utf8');
  const marker = '\nbootstrap().catch('; const index = source.lastIndexOf(marker);
  assert.ok(index > 0);
  await fs.writeFile(importedFile, source.slice(0, index) +
    '\nexport { handleCommand, callTelegramApi, loadRuntimeState, persistRuntimeState, metrics };\n');
  const messages = [];
  const telegramCalls = [];
  const internalMethods = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    assert.ok(options.signal, 'network requests must have a deadline');
    if (url.hostname === 'api.telegram.org') {
      assert.ok(url.pathname.startsWith('/bottest-token/'));
      const method = url.pathname.split('/').at(-1);
      const payload = JSON.parse(options.body);
      telegramCalls.push(method);
      if (method === 'sendMessage') messages.push(payload);
      return new Response(JSON.stringify({ ok: true, result: method === 'getUpdates' ? [] : { message_id: 1 } }));
    }
    assert.equal(url.origin, 'http://127.0.0.1:3000');
    assert.equal(options.headers['x-telegram-bot-secret'], 'test-secret');
    assert.equal(options.method, 'GET', 'command test must not create business records');
    internalMethods.push(url.pathname);
    let data;
    if (url.pathname.endsWith('/schedule')) data = { shifts: [], range: url.searchParams.get('range') };
    else if (url.pathname.endsWith('/requests')) data = { incomingSwapRequests: [], outgoingSwapRequests: [], assignmentRequests: [] };
    else if (url.pathname.endsWith('/finance-summary')) data = { month: '2026-11', washesCount: 0, transactionsCount: 0,
      totals: { totalEarned: 0, payments: 0, bonuses: 0, loansAndPurchases: 0, debtWriteOffs: 0, balance: 0 } };
    else if (url.pathname.endsWith('/wash/bootstrap')) data = { isAllowed: false, blockReason: 'Сотрудник не назначен в смену на сегодня' };
    else throw new Error('Unexpected internal route');
    return new Response(JSON.stringify({ ok: true, data }));
  };
  const worker = await import(pathToFileURL(importedFile));
  await worker.loadRuntimeState();
  assert.equal(worker.metrics.apiErrors, 110, 'restart must preserve the existing daily error counter');
  assert.equal(worker.metrics.commandsHandled, 7);
  for (const command of ['/start', '/menu', '/today', '/week', '/month', '/requests', '/finance', '/wash', '/help', '/cancel']) {
    const count = messages.length;
    await worker.handleCommand('1001', 'employee-test', command);
    assert.ok(messages.length > count, `${command} must reply`);
  }
  assert.ok(messages.every((m) => m.chat_id === '1001' && m.text && !/NaN|undefined/.test(m.text)));
  assert.ok(messages.some((m) => m.text.includes('Сотрудник не назначен')));
  assert.deepEqual(await worker.callTelegramApi('getUpdates', { timeout: 50 }), []);
  await worker.persistRuntimeState();
  const persisted = JSON.parse(await fs.readFile(path.join(runtime, `metrics-${dateKey('Europe/Moscow')}.json`), 'utf8'));
  assert.equal(persisted.commandsHandled, 17);
  assert.equal(persisted.apiErrors, 110);
  assert.ok(persisted.lastInternalApiSuccessAt);
  assert.ok(telegramCalls.includes('getUpdates'));
  assert.ok(internalMethods.length > 0);
});
