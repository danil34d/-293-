const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, morningDue, permittedNavigation } = require('./policy.cjs');
test('адрес ограничен HTTPS или локальной сетью, без пароля и другого пути', () => {
  assert.equal(validateConfig({ url: 'http://192.168.1.150:3000', autoStart: true }).url, 'http://192.168.1.150:3000/reconciliation');
  assert.equal(validateConfig({ url: 'http://127.0.0.1:3217', autoStart: false }).url, 'http://localhost:3217/reconciliation');
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'http://example.com', 'https://user:password@example.com', 'https://example.com/admin']) assert.throws(() => validateConfig({ url, autoStart: true }));
});
test('08:00 Москва, повторный запуск, сон и смена года', () => {
  assert.equal(morningDue(new Date('2026-10-21T04:59:59Z'), ''), null);
  assert.equal(morningDue(new Date('2026-10-21T05:00:00Z'), ''), '2026-10-21');
  assert.equal(morningDue(new Date('2026-10-21T15:00:00Z'), '2026-10-21'), null);
  assert.equal(morningDue(new Date('2027-01-01T08:00:00Z'), '2026-12-31'), '2027-01-01');
});
test('переходы и перенаправления остаются на адресе приложения', () => {
  assert.equal(permittedNavigation('http://localhost:3000/login', 'http://localhost:3000/reconciliation'), true);
  for (const url of ['file:///tmp/x', 'http://localhost:4000', 'https://evil.example', 'http://localhost:3000.evil.example']) assert.equal(permittedNavigation(url, 'http://localhost:3000/reconciliation'), false);
});
