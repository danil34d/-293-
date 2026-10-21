require('./reconciliation-test-loader.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSameOrigin, readReconciliationBody, reconciliationRequestSchema } = require('../src/lib/reconciliation/request.ts');
const { readPaperImage } = require('../src/lib/reconciliation/paper-image.ts');
const { attachPaperImage, createLiveReconciliation } = require('../src/lib/reconciliation/live-model.ts');
test('Проверка Origin учитывает реальный Host и не доверяет постороннему адресу', () => {
  assert.equal(isSameOrigin('http://127.0.0.1:3217', '127.0.0.1:3217', 'http:'), true);
  for (const origin of [null, 'null', 'http://other:3217', 'https://127.0.0.1:3217', 'http://127.0.0.1:3217/path', 'http://127.0.0.1:3218']) assert.equal(isSameOrigin(origin, '127.0.0.1:3217', 'http:'), false);
});
test('Тело команды ограничено размером, форматом и известными полями', async () => {
  const request = body => new Request('http://localhost', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(readReconciliationBody(request('x'.repeat(1024 * 1024 + 1))), /большого размера/);
  await assert.rejects(readReconciliationBody(request('not json')), /JSON/);
  assert.throws(() => reconciliationRequestSchema.parse({ date: '2026-10-21', period: 'day', expectedRevision: 0, command: { type: 'refresh', admin: true } }));
});
test('Фото принимает только ограниченный растровый файл и отвергает HTML/SVG', async () => {
  const upload = (bytes, mime) => new Request('http://localhost', { method: 'POST', body: bytes, headers: { 'Content-Type': mime } });
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  assert.equal((await readPaperImage(upload(png, 'image/png'))).mime, 'image/png');
  await assert.rejects(readPaperImage(upload('<svg onload="alert(1)"></svg>', 'image/svg+xml')), /JPG/);
  await assert.rejects(readPaperImage(upload('<html>fake image</html>', 'image/png')), /формату/);
  await assert.rejects(readPaperImage(upload(Buffer.alloc(6 * 1024 * 1024 + 1), 'image/jpeg')), /6 МБ/);
});
test('Новое фото снимает подтверждение полноты и завершения, не меняет ручные поля', () => {
  const doc = createLiveReconciliation({ date: '2026-10-21', period: 'day' });
  doc.paperConfirmed = true;
  const next = attachPaperImage(doc, require('node:crypto').randomUUID());
  assert.equal(next.paperConfirmed, false);
  assert.equal(next.state.revision, 1);
  assert.equal(doc.paperImageId, undefined);
});
