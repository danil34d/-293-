'use strict';
const form = document.querySelector('#settings');
const error = document.querySelector('#error');
window.widgetSettings.read().then(value => { document.querySelector('#url').value = value.url; document.querySelector('#auto').checked = value.autoStart; }).catch(() => { error.textContent = 'Не удалось прочитать настройки.'; });
form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button'); button.disabled = true; error.textContent = ''; try { await window.widgetSettings.save({ url: document.querySelector('#url').value, autoStart: document.querySelector('#auto').checked }); window.close(); } catch (e) { error.textContent = e.message; } finally { button.disabled = false; } });
