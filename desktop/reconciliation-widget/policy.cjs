'use strict';
function validateConfig(value) {
  if (!value || typeof value !== 'object' || typeof value.url !== 'string' || typeof value.autoStart !== 'boolean') throw new Error('Укажите адрес приложения и автозапуск.');
  const url = new URL(value.url);
  const local = /^(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(url.hostname);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) throw new Error('Нужен HTTPS или адрес приложения в локальной сети.');
  if (url.pathname !== '/' && url.pathname !== '/reconciliation') throw new Error('Укажите основной адрес приложения, без других разделов.');
  // Next.js приводит loopback-адрес в перенаправлениях к localhost; единый host сохраняет cookie входа.
  if (url.hostname === '127.0.0.1') url.hostname = 'localhost';
  return { url: `${url.origin}/reconciliation`, autoStart: value.autoStart, lastMorning: typeof value.lastMorning === 'string' ? value.lastMorning : '' };
}
function morningDue(now, lastMorning) {
  const moscow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const day = moscow.toISOString().slice(0, 10);
  return moscow.getUTCHours() >= 8 && day !== lastMorning ? day : null;
}
function permittedNavigation(target, configured) {
  try { return new URL(target).origin === new URL(configured).origin; } catch { return false; }
}
module.exports = { validateConfig, morningDue, permittedNavigation };
