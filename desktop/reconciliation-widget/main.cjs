'use strict';
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, powerMonitor } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { validateConfig, morningDue, permittedNavigation } = require('./policy.cjs');
const defaultConfig = { url: 'http://192.168.1.150:3000/reconciliation', autoStart: true, lastMorning: '' };
let config = defaultConfig, mainWindow, settingsWindow, tray, quitting = false;
const settingsPath = path.join(__dirname, 'settings.html');
const settingsUrl = pathToFileURL(settingsPath).href;
app.setName('ZorinReconciliation');
app.setAppUserModelId('ru.zorin.reconciliation');
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => showWindow());
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => {});
  app.whenReady().then(start).catch(error => { console.error(error.stack); dialog.showErrorBox('Не удалось открыть сверку', error.message); app.quit(); });
}
function configPath() { return path.join(app.getPath('userData'), 'settings.json'); }
function persistConfig(next) {
  const temp = configPath() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(temp, configPath()); config = next;
}
function applyAutoStart() {
  // Упакованное приложение имеет постоянный путь; dev-запуск не добавляется в автозапуск.
  if (process.platform === 'win32' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: config.autoStart, path: process.execPath, args: ['--background'] });
}
function showWindow() {
  if (!mainWindow) return;
  if (!fs.existsSync(configPath())) { openSettings(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
}
function checkMorning() {
  if (!fs.existsSync(configPath())) return;
  const day = morningDue(new Date(), config.lastMorning);
  if (!day) return;
  showWindow();
  try { persistConfig({ ...config, lastMorning: day }); } catch { /* При ошибке записи повторим показ; результат сверки хранится на сервере. */ }
}
function openSettings() {
  if (settingsWindow) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({ width: 610, height: 430, resizable: false, title: 'Настройки сверки', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'settings-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', (event, target) => { if (target !== settingsUrl) event.preventDefault(); });
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.once('ready-to-show', () => { settingsWindow?.show(); settingsWindow?.focus(); });
  void settingsWindow.loadFile(settingsPath);
}
async function start() {
  console.info('ZORIN: запуск окна');
  let configured = false;
  try { config = validateConfig(JSON.parse(fs.readFileSync(configPath(), 'utf8'))); configured = true; } catch { config = defaultConfig; }
  mainWindow = new BrowserWindow({ width: 1180, height: 820, minWidth: 560, minHeight: 460, show: false, title: 'ZORIN · Сверка смены', backgroundColor: '#f1f5fa', autoHideMenuBar: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, partition: 'persist:zorin-reconciliation' } });
  console.info('ZORIN: окно создано');
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const name of ['will-navigate', 'will-redirect']) mainWindow.webContents.on(name, (event, target) => { if (!permittedNavigation(target, config.url)) event.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  const returnToWidget = (_event, target) => {
    try { const url = new URL(target); if (permittedNavigation(target, config.url) && (url.pathname === '/' || url.pathname === '/dashboard')) void mainWindow.loadURL(config.url).catch(() => {}); } catch { /* Ошибку загрузки покажет обработчик ниже. */ }
  };
  mainWindow.webContents.on('did-navigate', returnToWidget);
  mainWindow.webContents.on('did-navigate-in-page', returnToWidget);
  mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  mainWindow.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(mainWindow, { type: 'warning', title: 'Несохранённые поля', message: 'На экране есть несохранённый ввод.', buttons: ['Остаться и сохранить', 'Продолжить без сохранения'], defaultId: 0, cancelId: 0 });
    // Electron требует синхронного решения: preventDefault разрешает исходный переход или выход.
    if (response === 1) event.preventDefault();
    else { quitting = false; showWindow(); }
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) { showWindow(); void dialog.showMessageBox(mainWindow, { type: 'warning', message: 'Сервер автомойки недоступен. Проверьте сеть и адрес в настройках.', buttons: ['Повторить', 'Настройки', 'Позже'] }).then(result => { if (result.response === 0) void mainWindow.loadURL(config.url).catch(() => {}); if (result.response === 1) openSettings(); }); }
  });
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const i = (y * 32 + x) * 4; const z = (y >= 8 && y <= 11 && x >= 7 && x <= 24) || (y >= 21 && y <= 24 && x >= 7 && x <= 24) || (y > 11 && y < 21 && Math.abs(x + y - 31) <= 2); pixels[i] = z ? 255 : 235; pixels[i + 1] = z ? 255 : 99; pixels[i + 2] = z ? 255 : 37; pixels[i + 3] = 255; }
  tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }));
  console.info('ZORIN: значок создан');
  tray.setToolTip('ZORIN · Сверка смены · 08:00 Москва');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Открыть сверку', click: showWindow }, { label: 'Настройки', click: openSettings }, { type: 'separator' }, { label: 'Выйти', click: () => app.quit() }]));
  tray.on('click', showWindow);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Сверка', submenu: [{ label: 'Открыть', click: showWindow }, { label: 'Настройки', click: openSettings }, { role: 'quit', label: 'Выйти' }] }, { label: 'Правка', submenu: [{ role: 'undo', label: 'Отменить' }, { role: 'redo', label: 'Повторить' }, { type: 'separator' }, { role: 'cut', label: 'Вырезать' }, { role: 'copy', label: 'Копировать' }, { role: 'paste', label: 'Вставить' }, { role: 'selectAll', label: 'Выделить всё' }] }]));
  function checkSender(event) { if (!settingsWindow || event.sender !== settingsWindow.webContents || event.senderFrame?.url !== settingsUrl) throw new Error('Настройки доступны только в окне настроек.'); }
  ipcMain.handle('settings:read', event => { checkSender(event); return config; });
  ipcMain.handle('settings:save', async (event, input) => { checkSender(event); const next = validateConfig({ ...input, lastMorning: config.lastMorning }); persistConfig(next); applyAutoStart(); await mainWindow.loadURL(config.url).catch(() => {}); showWindow(); return { ok: true }; });
  if (configured) { applyAutoStart(); void mainWindow.loadURL(config.url).catch(() => {}); }
  else openSettings();
  console.info('ZORIN: интерфейс открыт');
  if (!process.argv.includes('--background') && configured) showWindow();
  if (configured) checkMorning();
  setInterval(() => { if (fs.existsSync(configPath())) checkMorning(); }, 30000);
  powerMonitor.on('resume', checkMorning);
}
