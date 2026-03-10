#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import dotenv from 'dotenv';
import {
  handleWashCallback,
  processWashPhotoMessage,
  processWashTextMessage,
  startWashConversation,
} from './wash-flow.mjs';

const BOT_HOME = path.join(process.cwd(), 'telegram-bot');

dotenv.config({ path: path.join(BOT_HOME, '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const BOT_ENABLED = String(process.env.TELEGRAM_BOT_ENABLED || 'false').toLowerCase() === 'true';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const INTERNAL_SECRET = process.env.TELEGRAM_BOT_SECRET || '';
const APP_BASE_URL = process.env.TELEGRAM_APP_BASE_URL || 'http://127.0.0.1:3000';
const SCAN_INTERVAL_SEC = Number(process.env.TELEGRAM_SCAN_INTERVAL_SEC || '30');
const TG_TIMEOUT_SEC = Number(process.env.TELEGRAM_API_TIMEOUT_SEC || '50');
const EMPLOYEE_MAP_RAW = process.env.TELEGRAM_EMPLOYEE_CHAT_MAP_JSON || '{}';
const ADMIN_CHAT_IDS = String(process.env.TELEGRAM_ADMIN_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const RUNTIME_DIR = path.join(process.cwd(), 'data', 'telegram-bot');
const STATE_PATH = path.join(RUNTIME_DIR, 'state.json');
const CONVERSATIONS_PATH = path.join(RUNTIME_DIR, 'conversations.json');
const LOCAL_APP_PORTS = [3000, 3001, 3002, 3003, 3004, 3005];

const DEFAULT_STATE = {
  version: 1,
  pollingOffset: 0,
  employeeCursors: {},
  lastSentEventIds: {},
  lastDailyReportDate: '',
};

let state = structuredClone(DEFAULT_STATE);
let conversations = {};
let metrics = createMetrics();
let isShuttingDown = false;
let isScanning = false;
let isReporting = false;
let employeeChatMap = new Map();
let chatToEmployeeMap = new Map();

function createMetrics() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  return {
    date,
    startedAt: now.toISOString(),
    messagesSent: 0,
    messageErrors: 0,
    notificationsSent: 0,
    notificationErrors: 0,
    commandsHandled: 0,
    callbacksHandled: 0,
    apiErrors: 0,
  };
}

function metricsPathFor(date) {
  return path.join(RUNTIME_DIR, `metrics-${date}.json`);
}

function parseDateFromYmd(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [yearRaw, monthRaw, dayRaw] = dateStr.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function normalizeDateInput(text) {
  const value = String(text || '').trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
    const [day, month, year] = value.split('.');
    return `${year}-${month}-${day}`;
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
    return value.replaceAll('/', '-');
  }
  return value;
}

function isValidDate(dateStr) {
  return parseDateFromYmd(dateStr) !== null;
}

function normalizeEmployeeMap(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('TELEGRAM_EMPLOYEE_CHAT_MAP_JSON is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('TELEGRAM_EMPLOYEE_CHAT_MAP_JSON must be object: {"employeeId":"chatId"}');
  }

  const map = new Map();
  for (const [employeeId, chatId] of Object.entries(parsed)) {
    const emp = String(employeeId).trim();
    const chat = String(chatId).trim();
    if (!emp || !chat) continue;
    map.set(emp, chat);
  }
  return map;
}

try {
  employeeChatMap = normalizeEmployeeMap(EMPLOYEE_MAP_RAW);
} catch (error) {
  console.error(`[TG-BOT] ${error.message}`);
  process.exit(1);
}
chatToEmployeeMap = new Map(Array.from(employeeChatMap.entries()).map(([employeeId, chatId]) => [chatId, employeeId]));

if (!BOT_ENABLED) {
  console.log('[TG-BOT] TELEGRAM_BOT_ENABLED is false. Worker is disabled.');
  process.exit(0);
}

if (!BOT_TOKEN) {
  console.error('[TG-BOT] TELEGRAM_BOT_TOKEN is required.');
  process.exit(1);
}

if (!INTERNAL_SECRET) {
  console.error('[TG-BOT] TELEGRAM_BOT_SECRET is required.');
  process.exit(1);
}

if (!Number.isFinite(SCAN_INTERVAL_SEC) || SCAN_INTERVAL_SEC < 5) {
  console.error('[TG-BOT] TELEGRAM_SCAN_INTERVAL_SEC must be >= 5.');
  process.exit(1);
}

if (!Number.isFinite(TG_TIMEOUT_SEC) || TG_TIMEOUT_SEC < 1 || TG_TIMEOUT_SEC > 55) {
  console.error('[TG-BOT] TELEGRAM_API_TIMEOUT_SEC must be between 1 and 55.');
  process.exit(1);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function ensureRuntimeDir() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    console.error(`[TG-BOT] Failed to parse ${filePath}:`, error);
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function loadRuntimeState() {
  await ensureRuntimeDir();
  state = await readJsonSafe(STATE_PATH, structuredClone(DEFAULT_STATE));
  conversations = await readJsonSafe(CONVERSATIONS_PATH, {});
  if (!state.version) state.version = 1;
  if (!state.employeeCursors || typeof state.employeeCursors !== 'object') state.employeeCursors = {};
  if (!state.lastSentEventIds || typeof state.lastSentEventIds !== 'object') state.lastSentEventIds = {};
  if (!state.pollingOffset || Number.isNaN(Number(state.pollingOffset))) state.pollingOffset = 0;
  if (!state.lastDailyReportDate) state.lastDailyReportDate = '';
}

async function persistRuntimeState() {
  await writeJson(STATE_PATH, state);
  await writeJson(CONVERSATIONS_PATH, conversations);
  await writeJson(metricsPathFor(metrics.date), metrics);
}

function ensureMetricsDate() {
  const today = getTodayKey();
  if (metrics.date !== today) {
    metrics = createMetrics();
  }
}

async function callTelegramApi(method, payload = {}) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || !data || data.ok !== true) {
    const description = data?.description || response.statusText || 'Telegram API error';
    throw new Error(`${method} failed: ${description}`);
  }

  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  try {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...extra,
    });
    metrics.messagesSent += 1;
  } catch (error) {
    metrics.messageErrors += 1;
    throw error;
  }
}

async function answerCallback(callbackQueryId, text = '') {
  try {
    await callTelegramApi('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text || undefined,
      show_alert: false,
    });
  } catch (error) {
    console.error('[TG-BOT] Failed to answer callback query:', error);
  }
}

function buildInternalApiBaseUrls() {
  const candidates = [];
  const pushCandidate = (value) => {
    const normalized = String(value || '').trim().replace(/\/+$/, '');
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  pushCandidate(APP_BASE_URL);

  try {
    const configuredUrl = new URL(APP_BASE_URL);
    for (const port of LOCAL_APP_PORTS) {
      pushCandidate(`${configuredUrl.protocol}//${configuredUrl.hostname}:${port}`);
    }
  } catch {
  }

  for (const port of LOCAL_APP_PORTS) {
    pushCandidate(`http://127.0.0.1:${port}`);
    pushCandidate(`http://localhost:${port}`);
  }

  return candidates;
}

async function callInternalApi(routePath, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    'x-telegram-bot-secret': INTERNAL_SECRET,
    ...(options.headers || {}),
  };

  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const errors = [];

  for (const baseUrl of buildInternalApiBaseUrls()) {
    let response;
    let payload = null;

    try {
      response = await fetch(`${baseUrl}${routePath}`, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(5000),
      });

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.ok && payload && payload.ok === true) {
        return payload.data;
      }

      const message = payload?.error || `Internal API failed ${response.status}`;
      errors.push(`${baseUrl}: ${message}`);
    } catch (error) {
      errors.push(`${baseUrl}: ${error.message}`);
    }
  }

  throw new Error(errors[0] || 'Internal API is unavailable');
}

async function fetchTelegramPhotoBase64(fileId) {
  const file = await callTelegramApi('getFile', { file_id: fileId });
  const filePath = String(file?.file_path || '').trim();
  if (!filePath) {
    throw new Error('Telegram file path is empty');
  }

  const response = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
  if (!response.ok) {
    throw new Error(`Failed to download telegram file: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString('base64');
}

function getWashFlowContext() {
  return {
    getConversation,
    setConversation,
    clearConversation,
    sendMessage,
    answerCallback,
    callInternalApi,
    buildMainMenuKeyboard,
    fetchTelegramPhotoBase64,
  };
}

function rebuildReverseMap() {
  chatToEmployeeMap = new Map(Array.from(employeeChatMap.entries()).map(([employeeId, chatId]) => [chatId, employeeId]));
}

function mergeMappingsFromWeb(links) {
  if (!Array.isArray(links)) return;
  for (const link of links) {
    const employeeId = String(link?.employeeId || '').trim();
    const chatId = String(link?.telegramChatId || '').trim();
    if (!employeeId || !chatId) continue;
    employeeChatMap.set(employeeId, chatId);
  }
  rebuildReverseMap();
}

async function refreshMappingsFromWeb() {
  try {
    const data = await callInternalApi('/api/telegram/internal/employee-links');
    mergeMappingsFromWeb(data?.links || []);
  } catch (error) {
    metrics.apiErrors += 1;
    console.error('[TG-BOT] Failed to refresh employee mappings from web:', error.message);
  }
}

function getEmployeeIdByChat(chatId) {
  return chatToEmployeeMap.get(String(chatId)) || null;
}

async function sendAccessDenied(chatId) {
  await sendMessage(
    chatId,
    [
      '🔒 Доступ закрыт',
      '',
      'Ваш Telegram-аккаунт не привязан к системе автомойки.',
      '',
      'Что делать:',
      `1. Сообщите администратору ваш Chat ID: <code>${chatId}</code>`,
      '2. Попросите привязать его в разделе «Сотрудники»',
      '3. После привязки напишите /start',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );
}

function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🚗 Оформить мойку', callback_data: 'cmd:wash' }],
      [
        { text: '🚿 Рабочая станция', callback_data: 'cmd:workstation' },
        { text: '📅 График', callback_data: 'cmd:schedule_menu' },
      ],
      [
        { text: '💰 Финансы', callback_data: 'cmd:finance_menu' },
        { text: '🔐 Логин/пароль', callback_data: 'cmd:credentials' },
      ],
      [
        { text: '🔄 Обновить', callback_data: 'cmd:menu' },
        { text: '❓ Помощь', callback_data: 'cmd:help' },
      ],
    ],
  };
}

function buildScheduleMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🗓 Сегодня', callback_data: 'cmd:today' },
        { text: '📅 Неделя', callback_data: 'cmd:week' },
        { text: '🧾 Месяц', callback_data: 'cmd:month' },
      ],
      [
        { text: '📨 Заявки', callback_data: 'cmd:requests' },
      ],
      [
        { text: '➕ Запросить смену', callback_data: 'as_new' },
        { text: '🔄 Передать смену', callback_data: 'sw_new' },
      ],
      [{ text: '◀️ Главное меню', callback_data: 'cmd:menu' }],
    ],
  };
}

function buildFinanceMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Текущий месяц', callback_data: 'cmd:finance' },
      ],
      [
        { text: '◀️ Пред. месяц', callback_data: 'fin:prev' },
        { text: 'След. месяц ▶️', callback_data: 'fin:next' },
      ],
      [{ text: '◀️ Главное меню', callback_data: 'cmd:menu' }],
    ],
  };
}

function buildDatePickerKeyboard(daysCount = 14) {
  const rows = [];
  const today = new Date();
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  let currentRow = [];
  for (let i = 0; i < daysCount; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayName = dayNames[d.getDay()];
    const label = `${d.getDate()} ${monthNames[d.getMonth()]} ${dayName}`;
    currentRow.push({ text: label, callback_data: `as_date:${ymd}` });
    if (currentRow.length === 2 || i === daysCount - 1) {
      rows.push([...currentRow]);
      currentRow = [];
    }
  }
  rows.push([{ text: '❌ Отмена', callback_data: 'cmd:schedule_menu' }]);
  return { inline_keyboard: rows };
}

function formatMoneyRub(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'н/д';
  return `${amount.toLocaleString('ru-RU')} руб.`;
}

function formatTimeRu(date = new Date()) {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatShiftType(shiftType) {
  return shiftType === 'day' ? 'день' : 'ночь';
}

function isActiveScheduleShift(shift) {
  return !shift?.isReleasedForEmployee;
}

function formatReleasedShiftCompact(shift) {
  if (shift.partnerName) {
    return `РѕС‚РїСѓС‰РµРЅС‹, РЅР° СЃРјРµРЅРµ РѕСЃС‚Р°Р»СЃСЏ ${shift.partnerName}`;
  }
  return 'РѕС‚РїСѓС‰РµРЅС‹';
}

function formatSchedulePartnerCompact(shift) {
  if (shift.isReleasedForEmployee) {
    return formatReleasedShiftCompact(shift);
  }
  if (shift.isPartnerReleased && shift.partnerName) {
    return `РѕС‚РїСѓС‰РµРЅ ${shift.partnerName}`;
  }
  if (shift.partnerName) {
    return `+ ${shift.partnerName}`;
  }
  return '(РѕРґРёРЅ)';
}

function formatSchedulePartnerDetailed(shift) {
  if (shift.isReleasedForEmployee) {
    if (shift.partnerName) {
      return `рџџЁ Р’С‹ РѕС‚РїСѓС‰РµРЅС‹, РЅР° СЃРјРµРЅРµ РѕСЃС‚Р°Р»СЃСЏ ${shift.partnerName}`;
    }
    return 'рџџЁ Р’С‹ РѕС‚РїСѓС‰РµРЅС‹ СЃ СЌС‚РѕР№ СЃРјРµРЅС‹';
  }
  if (shift.isPartnerReleased && shift.partnerName) {
    return `рџџЁ РќР°РїР°СЂРЅРёРє РѕС‚РїСѓС‰РµРЅ: ${shift.partnerName}`;
  }
  if (shift.partnerName) {
    return `рџ‘Ґ РќР°РїР°СЂРЅРёРє: ${shift.partnerName}`;
  }
  return 'рџ‘¤ Р Р°Р±РѕС‚Р°РµС‚Рµ РѕРґРёРЅ';
}

function buildReleasedSuffix(count) {
  return count > 0 ? ` В· РѕС‚РїСѓС‰РµРЅРѕ: ${count}` : '';
}

function formatScheduleText(data) {
  if (!data.shifts || data.shifts.length === 0) {
    return '📅 Смены не найдены для выбранного периода.';
  }

  const rangeLabels = {
    today: 'на сегодня',
    week: 'на неделю',
    month: 'на месяц',
  };
  const rangeLabel = rangeLabels[data.range] || data.range;
  const monthNamesShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayNamesShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  const activeShifts = data.shifts.filter(isActiveScheduleShift);
  const releasedShifts = data.shifts.filter((shift) => shift.isReleasedForEmployee);
  const totalShifts = activeShifts.length;
  const dayShifts = activeShifts.filter((s) => s.shiftType === 'day').length;
  const nightShifts = activeShifts.filter((s) => s.shiftType === 'night').length;

  const employeeName = data.employeeName || '';

  const lines = [];

  // Header with employee name
  if (employeeName) {
    lines.push(`👤 ${employeeName}`);
  }
  lines.push(`📅 График ${rangeLabel} · ${totalShifts} ${pluralSmena(totalShifts)} (☀️${dayShifts} 🌙${nightShifts})`);
  lines.push('');

  // Group shifts by week for month, otherwise flat list
  const useWeekGroups = data.range === 'month' && data.shifts.length > 5;

  if (useWeekGroups) {
    const weeks = groupShiftsByWeek(data.shifts);
    for (const week of weeks) {
      lines.push(`▸ ${week.label}`);
      for (const shift of week.shifts) {
        lines.push(formatShiftLine(shift, dayNamesShort, monthNamesShort));
      }
      lines.push('');
    }
  } else {
    for (const shift of data.shifts) {
      lines.push(formatShiftLineDetailed(shift, dayNamesShort, monthNamesShort));
    }
  }

  return lines.join('\n').trimEnd();
}

function formatShiftLine(shift, dayNamesShort, monthNamesShort) {
  const parts = parseDateFromYmd(shift.date);
  let dateLabel = shift.date;
  if (parts) {
    const d = new Date(parts.year, parts.month - 1, parts.day);
    const dayName = dayNamesShort[d.getDay()];
    dateLabel = `${dayName} ${String(parts.day).padStart(2, ' ')}`;
  }

  const typeIcon = shift.shiftType === 'day' ? '☀' : '🌙';
  const partner = shift.partnerName ? `+ ${shift.partnerName}` : '(один)';

  return `  ${typeIcon} ${dateLabel} │ б${shift.boxNumber} ${shift.startTime}-${shift.endTime} │ ${partner}`;
}

function formatShiftLineDetailed(shift, dayNamesShort, monthNamesShort) {
  const parts = parseDateFromYmd(shift.date);
  let dateLabel = shift.date;
  if (parts) {
    const d = new Date(parts.year, parts.month - 1, parts.day);
    const dayName = dayNamesShort[d.getDay()];
    const monthName = monthNamesShort[d.getMonth()];
    dateLabel = `${dayName}, ${parts.day} ${monthName}`;
  }

  const typeIcon = shift.shiftType === 'day' ? '☀️' : '🌙';
  const typeName = shift.shiftType === 'day' ? 'день' : 'ночь';
  const partner = shift.partnerName
    ? `👥 Напарник: ${shift.partnerName}`
    : '👤 Работаете один';

  return [
    `${typeIcon} ${dateLabel} · ${typeName}`,
    `   Бокс ${shift.boxNumber} · ${shift.startTime}–${shift.endTime}`,
    `   ${partner}`,
    '',
  ].join('\n');
}

function groupShiftsByWeek(shifts) {
  const weeks = [];
  const dayNamesShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthNamesShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  let currentWeek = null;

  for (const shift of shifts) {
    const parts = parseDateFromYmd(shift.date);
    if (!parts) continue;
    const d = new Date(parts.year, parts.month - 1, parts.day);
    const dayOfWeek = d.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(d);
    monday.setDate(monday.getDate() + mondayOffset);
    const mondayKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

    if (!currentWeek || currentWeek.key !== mondayKey) {
      const sunday = new Date(monday);
      sunday.setDate(sunday.getDate() + 6);
      const monMonth = monthNamesShort[monday.getMonth()];
      const sunMonth = monthNamesShort[sunday.getMonth()];
      const label = monMonth === sunMonth
        ? `${monday.getDate()}–${sunday.getDate()} ${monMonth}`
        : `${monday.getDate()} ${monMonth} – ${sunday.getDate()} ${sunMonth}`;
      currentWeek = { key: mondayKey, label, shifts: [] };
      weeks.push(currentWeek);
    }
    currentWeek.shifts.push(shift);
  }

  return weeks;
}

function formatDayOfWeek(dateStr) {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const parts = parseDateFromYmd(dateStr);
  if (!parts) return '';
  const d = new Date(parts.year, parts.month - 1, parts.day);
  return days[d.getDay()] || '';
}

function formatFinanceText(data) {
  const t = data.totals;
  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const [yearStr, monthStr] = String(data.month).split('-');
  const monthIdx = Number(monthStr) - 1;
  const monthLabel = (monthIdx >= 0 && monthIdx < 12)
    ? `${monthNames[monthIdx]} ${yearStr}`
    : data.month;

  const earned = Number(t.totalEarned);
  const payments = Number(t.payments);
  const bonuses = Number(t.bonuses);
  const loans = Number(t.loansAndPurchases);
  const writeOffs = Number(t.debtWriteOffs);
  const balance = Number(t.balance);

  return [
    `💰 Финансы: ${monthLabel}`,
    `━━━━━━━━━━━━━━━━━━`,
    '',
    `📈 Доходы`,
    `   Начислено за мойки: ${earned.toLocaleString('ru-RU')} руб.`,
    `   Премии: ${bonuses.toLocaleString('ru-RU')} руб.`,
    '',
    `📉 Расходы и удержания`,
    `   Выплачено: ${payments.toLocaleString('ru-RU')} руб.`,
    `   Долги/покупки: ${loans.toLocaleString('ru-RU')} руб.`,
    `   Списание долгов: ${writeOffs.toLocaleString('ru-RU')} руб.`,
    '',
    `━━━━━━━━━━━━━━━━━━`,
    `💵 К выплате: ${balance.toLocaleString('ru-RU')} руб.`,
    '',
    `📊 Статистика`,
    `   Моек: ${data.washesCount}`,
    `   Транзакций: ${data.transactionsCount}`,
  ].join('\n');
}

function getMonthOffset(baseMonth, offset) {
  const [yearStr, monthStr] = baseMonth.split('-');
  let year = Number(yearStr);
  let month = Number(monthStr) + offset;
  while (month < 1) { month += 12; year -= 1; }
  while (month > 12) { month -= 12; year += 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function formatDateTimeRu(isoString) {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return isoString;
  return parsed.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

async function loadMainMenuSummary(employeeId) {
  const month = getCurrentMonthKey();
  const [todayScheduleResult, requestsResult, financeResult] = await Promise.allSettled([
    callInternalApi(`/api/telegram/internal/schedule?employeeId=${encodeURIComponent(employeeId)}&range=today`),
    callInternalApi(`/api/telegram/internal/requests?employeeId=${encodeURIComponent(employeeId)}`),
    callInternalApi(`/api/telegram/internal/finance-summary?employeeId=${encodeURIComponent(employeeId)}&month=${month}`),
  ]);

  const todayShifts = todayScheduleResult.status === 'fulfilled' && Array.isArray(todayScheduleResult.value?.shifts)
    ? todayScheduleResult.value.shifts.length
    : null;

  const requestsData = requestsResult.status === 'fulfilled' ? requestsResult.value : null;
  const incomingRequests = Array.isArray(requestsData?.incomingSwapRequests) ? requestsData.incomingSwapRequests.length : null;
  const outgoingRequests = Array.isArray(requestsData?.outgoingSwapRequests) ? requestsData.outgoingSwapRequests.length : null;
  const assignmentRequests = Array.isArray(requestsData?.assignmentRequests) ? requestsData.assignmentRequests.length : null;

  const financeData = financeResult.status === 'fulfilled' ? financeResult.value : null;
  const monthBalance = Number.isFinite(Number(financeData?.totals?.balance)) ? Number(financeData.totals.balance) : null;

  return {
    month,
    todayShifts,
    incomingRequests,
    outgoingRequests,
    assignmentRequests,
    monthBalance,
  };
}

function buildMainMenuText(employeeId, summary) {
  const shifts = summary.todayShifts ?? '—';
  const totalRequests = (summary.incomingRequests || 0) + (summary.outgoingRequests || 0) + (summary.assignmentRequests || 0);
  const balanceText = summary.monthBalance === null ? '—' : formatMoneyRub(summary.monthBalance);

  const incomingBadge = (summary.incomingRequests && summary.incomingRequests > 0)
    ? `  🔔 ${summary.incomingRequests} входящих заявок!`
    : '';

  const lines = [
    `🏠 Главное меню`,
    `━━━━━━━━━━━━━━━━━━`,
    `🗓 Сегодня: ${shifts} ${typeof shifts === 'number' ? pluralSmena(shifts) : ''}`,
    `📨 Заявки: ${totalRequests}${incomingBadge}`,
    `💵 Баланс: ${balanceText}`,
    '',
    `🕐 ${formatTimeRu()}`,
  ];

  return lines.join('\n');
}

function buildRequestsKeyboard(data) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: '➕ Запросить смену', callback_data: 'as_new' },
        { text: '🔄 Передать смену', callback_data: 'sw_new' },
      ],
    ],
  };

  if (Array.isArray(data.incomingSwapRequests)) {
    for (const req of data.incomingSwapRequests.slice(0, 6)) {
      keyboard.inline_keyboard.push([
        { text: `Принять #${req.id.slice(-4)}`, callback_data: `sw_yes:${req.id}` },
        { text: 'Отклонить', callback_data: `sw_no:${req.id}` },
      ]);
    }
  }

  if (Array.isArray(data.assignmentRequests)) {
    for (const req of data.assignmentRequests.filter((r) => r.status === 'pending').slice(0, 6)) {
      const dayOfWeek = formatDayOfWeek(req.date);
      keyboard.inline_keyboard.push([{ text: `❌ Отменить ${req.date} (${dayOfWeek})`, callback_data: `as_cancel:${req.id}` }]);
    }
  }

  keyboard.inline_keyboard.push([{ text: '◀️ График', callback_data: 'cmd:schedule_menu' }]);

  return keyboard;
}

function formatRequestsText(data) {
  const incoming = data.incomingSwapRequests || [];
  const outgoing = data.outgoingSwapRequests || [];
  const assignments = data.assignmentRequests || [];

  const statusIcons = {
    pending: '🟡',
    accepted: '🟢',
    rejected: '🔴',
    cancelled: '⚪',
  };

  const lines = [
    '📨 Ваши заявки',
    '━━━━━━━━━━━━━━━━━━',
  ];

  if (incoming.length > 0) {
    lines.push('');
    lines.push(`🔔 Входящие (${incoming.length}):`);
    for (const req of incoming.slice(0, 5)) {
      const icon = statusIcons[req.status] || '⚪';
      lines.push(`   ${icon} от ${req.requesterName || req.requesterId}`);
    }
  }

  if (outgoing.length > 0) {
    lines.push('');
    lines.push(`📤 Исходящие (${outgoing.length}):`);
    for (const req of outgoing.slice(0, 5)) {
      const icon = statusIcons[req.status] || '⚪';
      lines.push(`   ${icon} ${req.status} → ${req.targetName || req.targetEmployeeId || '-'}`);
    }
  }

  if (assignments.length > 0) {
    lines.push('');
    lines.push(`📋 Запросы на смену (${assignments.length}):`);
    for (const req of assignments.slice(0, 5)) {
      const icon = statusIcons[req.status] || '⚪';
      const dayOfWeek = formatDayOfWeek(req.date);
      lines.push(`   ${icon} ${req.date} (${dayOfWeek}) | бокс ${req.boxNumber} | ${formatShiftType(req.shiftType)}`);
    }
  }

  if (incoming.length === 0 && outgoing.length === 0 && assignments.length === 0) {
    lines.push('');
    lines.push('Нет активных заявок.');
  }

  return lines.join('\n');
}

function getConversation(chatId) {
  return conversations[String(chatId)] || null;
}

function setConversation(chatId, data) {
  conversations[String(chatId)] = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
}

function clearConversation(chatId) {
  delete conversations[String(chatId)];
}

async function handleStartOrMenu(chatId, employeeId) {
  let summary;
  try {
    summary = await loadMainMenuSummary(employeeId);
  } catch (error) {
    metrics.apiErrors += 1;
    console.error('[TG-BOT] Failed to load main menu summary:', error.message);
    summary = {
      month: getCurrentMonthKey(),
      todayShifts: null,
      incomingRequests: null,
      outgoingRequests: null,
      assignmentRequests: null,
      monthBalance: null,
    };
  }

  await sendMessage(chatId, buildMainMenuText(employeeId, summary), {
    reply_markup: buildMainMenuKeyboard(),
  });
}

async function sendScheduleMenu(chatId, employeeId) {
  let todayData, weekData, monthData;
  try {
    [todayData, weekData, monthData] = await Promise.all([
      callInternalApi(`/api/telegram/internal/schedule?employeeId=${encodeURIComponent(employeeId)}&range=today`),
      callInternalApi(`/api/telegram/internal/schedule?employeeId=${encodeURIComponent(employeeId)}&range=week`),
      callInternalApi(`/api/telegram/internal/schedule?employeeId=${encodeURIComponent(employeeId)}&range=month`),
    ]);
  } catch (error) {
    metrics.apiErrors += 1;
    await sendMessage(chatId, 'Не удалось загрузить данные графика. Попробуйте позже.', {
      reply_markup: buildScheduleMenuKeyboard(),
    });
    return;
  }

  const todayShifts = todayData?.shifts?.length || 0;
  const weekShifts = weekData?.shifts?.length || 0;
  const monthShifts = monthData?.shifts?.length || 0;
  const employeeName = todayData?.employeeName || weekData?.employeeName || monthData?.employeeName || '';

  const lines = [];
  if (employeeName) {
    lines.push(`👤 ${employeeName}`);
  }
  lines.push('📅 Ваш график работы');
  lines.push('━━━━━━━━━━━━━━━━━━');

  // Today detail
  if (todayShifts > 0) {
    lines.push('');
    lines.push(`🟢 Сегодня — ${todayShifts} ${pluralSmena(todayShifts)}:`);
    for (const shift of todayData.shifts) {
      const typeIcon = shift.shiftType === 'day' ? '☀️' : '🌙';
      const partner = shift.partnerName
        ? `+ ${shift.partnerName}`
        : '(один)';
      lines.push(`   ${typeIcon} Бокс ${shift.boxNumber} · ${shift.startTime}–${shift.endTime} · ${partner}`);
    }
  } else {
    lines.push('');
    lines.push('⚪ Сегодня — выходной');
  }

  lines.push('');
  lines.push(`📅 На неделе: ${weekShifts} ${pluralSmena(weekShifts)}`);
  lines.push(`🧾 В месяце: ${monthShifts} ${pluralSmena(monthShifts)}`);

  await sendMessage(chatId, lines.join('\n'), { reply_markup: buildScheduleMenuKeyboard() });
}

function pluralSmena(n) {
  const abs = Math.abs(n) % 100;
  const lastDigit = abs % 10;
  if (abs >= 11 && abs <= 19) return 'смен';
  if (lastDigit === 1) return 'смена';
  if (lastDigit >= 2 && lastDigit <= 4) return 'смены';
  return 'смен';
}

async function sendSchedule(chatId, employeeId, range) {
  const data = await callInternalApi(`/api/telegram/internal/schedule?employeeId=${encodeURIComponent(employeeId)}&range=${range}`);
  await sendMessage(chatId, formatScheduleText(data), { reply_markup: buildScheduleMenuKeyboard() });
}

async function sendFinance(chatId, employeeId, month) {
  if (!month) month = getCurrentMonthKey();
  const data = await callInternalApi(
    `/api/telegram/internal/finance-summary?employeeId=${encodeURIComponent(employeeId)}&month=${month}`
  );
  const prevMonth = getMonthOffset(month, -1);
  const nextMonth = getMonthOffset(month, 1);
  const keyboard = {
    inline_keyboard: [
      [
        { text: '◀️ Пред. месяц', callback_data: `fin:${prevMonth}` },
        { text: 'След. месяц ▶️', callback_data: `fin:${nextMonth}` },
      ],
      [{ text: '◀️ Главное меню', callback_data: 'cmd:menu' }],
    ],
  };
  await sendMessage(chatId, formatFinanceText(data), { reply_markup: keyboard });
}

async function sendFinanceMenu(chatId, employeeId) {
  const month = getCurrentMonthKey();
  await sendFinance(chatId, employeeId, month);
}

async function sendCredentials(chatId, employeeId) {
  const data = await callInternalApi(
    `/api/telegram/internal/employee-credentials?employeeId=${encodeURIComponent(employeeId)}&chatId=${encodeURIComponent(String(chatId))}`
  );
  await sendMessage(
    chatId,
    [
      `Данные входа сотрудника ${data.fullName}:`,
      `Логин: ${data.username}`,
      `Пароль: ${data.password}`,
      '',
      'Рекомендуется хранить эти данные в безопасном месте.',
    ].join('\n'),
    { reply_markup: buildMainMenuKeyboard() }
  );
}

async function sendRequests(chatId, employeeId) {
  const data = await callInternalApi(`/api/telegram/internal/requests?employeeId=${encodeURIComponent(employeeId)}`);
  await sendMessage(chatId, formatRequestsText(data), { reply_markup: buildRequestsKeyboard(data) });
}

async function sendWorkstationLink(chatId, employeeId) {
  const data = await callInternalApi('/api/telegram/internal/webapp-session/create', {
    method: 'POST',
    body: {
      employeeId,
      chatId: String(chatId),
    },
  });

  const expiresAtText = formatDateTimeRu(data.expiresAt);
  const workstationUrl = String(data.url || '').trim();
  const isHttps = /^https:\/\//i.test(workstationUrl);
  let isLocalHttp = false;
  try {
    const parsedUrl = new URL(workstationUrl);
    const host = parsedUrl.hostname.toLowerCase();
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    isLocalHttp = parsedUrl.protocol === 'http:' && isLoopback;
  } catch {
    isLocalHttp = false;
  }

  const keyboardRows = [];
  let openHint;
  if (isHttps) {
    keyboardRows.push([{ text: '🚿 Открыть рабочую станцию', web_app: { url: workstationUrl } }]);
    openHint = 'Откройте кнопку внутри Telegram.';
  } else if (isLocalHttp) {
    // Telegram отклоняет URL-кнопки с localhost/127.0.0.1, поэтому даем ссылку текстом.
    openHint = `Локальный режим: откройте ссылку в браузере на этом ПК:\n${workstationUrl}`;
  } else {
    keyboardRows.push([{ text: '🚿 Открыть рабочую станцию', url: workstationUrl }]);
    openHint = 'Откройте ссылку кнопкой ниже.';
  }
  keyboardRows.push([{ text: '♻️ Обновить ссылку', callback_data: 'cmd:workstation' }]);

  await sendMessage(
    chatId,
    [
      'Рабочая станция готова к запуску.',
      `Ссылка одноразовая и действует до: ${expiresAtText}.`,
      openHint,
      'Если ссылка не открылась или устарела, вызовите /workstation еще раз.',
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: keyboardRows,
      },
    }
  );
}

async function sendHelp(chatId) {
  await sendMessage(
    chatId,
    [
      '❓ <b>Справка по боту автомойки</b>',
      '━━━━━━━━━━━━━━━━━━',
      '',
      '<b>🚗 Оформить мойку</b>',
      '   Регистрация мойки прямо в Telegram — шаг за шагом:',
      '   номер → оплата → услуги → подтверждение',
      '',
      '<b>🚿 Рабочая станция</b>',
      '   Открывает веб-интерфейс — всё функции системы в браузере',
      '   Ссылка действует 2 минуты (одноразовая)',
      '',
      '<b>📅 График</b>',
      '   • Сегодня / неделя / месяц',
      '   • Ваши заявки на смены',
      '   • Запросить новую смену',
      '   • Передать смену коллеге',
      '',
      '<b>💰 Финансы</b>',
      '   Начисления, выплаты, баланс',
      '   Можно листать по месяцам',
      '',
      '<b>🔐 Логин/пароль</b>',
      '   Данные для входа в веб-приложение',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '<b>Команды:</b>',
      '/menu — главное меню',
      '/wash — оформить мойку',
      '/today — смены сегодня',
      '/week — смены на неделю',
      '/finance — мои финансы',
      '/cancel — отменить текущий диалог',
      '/help — эта справка',
    ].join('\n'),
    { reply_markup: buildMainMenuKeyboard(), parse_mode: 'HTML' }
  );
}

async function handleCommand(chatId, employeeId, text) {
  const cmd = text.split(/\s+/)[0].trim().toLowerCase();
  metrics.commandsHandled += 1;

  if (cmd === '/cancel') {
    const had = getConversation(chatId);
    clearConversation(chatId);
    const msg = had ? '✅ Диалог отменён. Возвращаю в главное меню.' : 'Нет активного диалога.';
    await sendMessage(chatId, msg, { reply_markup: buildMainMenuKeyboard() });
    return;
  }

  switch (cmd) {
    case '/start':
    case '/menu':
      await handleStartOrMenu(chatId, employeeId);
      return;
    case '/today':
      await sendSchedule(chatId, employeeId, 'today');
      return;
    case '/week':
      await sendSchedule(chatId, employeeId, 'week');
      return;
    case '/month':
      await sendSchedule(chatId, employeeId, 'month');
      return;
    case '/requests':
      await sendRequests(chatId, employeeId);
      return;
    case '/finance':
      await sendFinance(chatId, employeeId);
      return;
    case '/credentials':
      await sendCredentials(chatId, employeeId);
      return;
    case '/wash':
      await startWashConversation(chatId, employeeId, getWashFlowContext());
      return;
    case '/workstation':
      await sendWorkstationLink(chatId, employeeId);
      return;
    case '/help':
      await sendHelp(chatId);
      return;
    default:
      await sendMessage(chatId, `Неизвестная команда «${cmd}».\nНажмите кнопку в меню или введите /help.`, {
        reply_markup: buildMainMenuKeyboard(),
      });
  }
}

async function processAssignmentConversation(chatId, employeeId, text) {
  const current = getConversation(chatId);
  if (!current || current.flow !== 'assignment_create') return false;

  if (current.step === 'date') {
    // Date step now uses calendar buttons (as_date: callback),
    // but still accept text input as fallback
    const normalizedDate = normalizeDateInput(text);
    if (!isValidDate(normalizedDate)) {
      await sendMessage(chatId, 'Выберите дату кнопками выше или введите в формате ДД.ММ.ГГГГ:', {
        reply_markup: buildDatePickerKeyboard(14),
      });
      return true;
    }

    const parts = parseDateFromYmd(normalizedDate);
    if (!parts) {
      await sendMessage(chatId, 'Выберите дату кнопками:', {
        reply_markup: buildDatePickerKeyboard(14),
      });
      return true;
    }

    const dateValue = new Date(parts.year, parts.month - 1, parts.day);
    const today = new Date(new Date().toDateString());
    if (dateValue < today) {
      await sendMessage(chatId, 'Нельзя выбрать прошедшую дату. Выберите из списка:', {
        reply_markup: buildDatePickerKeyboard(14),
      });
      return true;
    }

    setConversation(chatId, {
      flow: 'assignment_create',
      step: 'shift_type',
      payload: { date: normalizedDate },
    });
    await sendMessage(chatId, `Дата: ${normalizedDate}\nВыберите тип смены:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '☀️ День', callback_data: 'as_shift:day' },
            { text: '🌙 Ночь', callback_data: 'as_shift:night' },
          ],
          [{ text: '❌ Отмена', callback_data: 'cmd:schedule_menu' }],
        ],
      },
    });
    return true;
  }

  if (current.step === 'comment') {
    const comment = text.trim() === '-' ? '' : text.trim();
    const payload = current.payload || {};
    try {
      await callInternalApi('/api/telegram/internal/shift-assignment/create', {
        method: 'POST',
        body: {
          employeeId,
          date: payload.date,
          shiftType: payload.shiftType,
          boxNumber: payload.boxNumber,
          comment: comment || undefined,
        },
      });
      clearConversation(chatId);
      await sendMessage(chatId, '✅ Запрос на смену создан.', { reply_markup: buildScheduleMenuKeyboard() });
    } catch (error) {
      clearConversation(chatId);
      await sendMessage(chatId, `Не удалось создать запрос: ${error.message}`, {
        reply_markup: buildScheduleMenuKeyboard(),
      });
    }
    return true;
  }

  return false;
}

async function processSwapConversation(chatId, text) {
  const current = getConversation(chatId);
  if (!current || current.flow !== 'swap_create') return false;

  if (current.step === 'select_shift' || current.step === 'select_target') {
    await sendMessage(chatId, 'Выберите значение кнопками под сообщением.');
    return true;
  }

  return false;
}

async function handleCallback(chatId, employeeId, callbackQueryId, callbackData) {
  metrics.callbacksHandled += 1;

  if (callbackData.startsWith('w:')) {
    await handleWashCallback(chatId, employeeId, callbackQueryId, callbackData, getWashFlowContext());
    return;
  }

  if (callbackData.startsWith('fin:')) {
    const month = callbackData.slice(4);
    if (/^\d{4}-\d{2}$/.test(month)) {
      await sendFinance(chatId, employeeId, month);
    } else {
      await sendFinance(chatId, employeeId, getCurrentMonthKey());
    }
    await answerCallback(callbackQueryId);
    return;
  }

  if (callbackData.startsWith('as_date:')) {
    const dateStr = callbackData.slice(8);
    if (!isValidDate(dateStr)) {
      await answerCallback(callbackQueryId, 'Некорректная дата');
      return;
    }
    setConversation(chatId, {
      flow: 'assignment_create',
      step: 'shift_type',
      payload: { date: dateStr },
    });
    await sendMessage(chatId, `Дата: ${dateStr}\nВыберите тип смены:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '☀️ День', callback_data: 'as_shift:day' },
            { text: '🌙 Ночь', callback_data: 'as_shift:night' },
          ],
          [{ text: '❌ Отмена', callback_data: 'cmd:schedule_menu' }],
        ],
      },
    });
    await answerCallback(callbackQueryId, 'Дата выбрана');
    return;
  }

  if (callbackData.startsWith('cmd:')) {
    const cmd = callbackData.slice(4);
    if (cmd === 'wash') {
      await startWashConversation(chatId, employeeId, getWashFlowContext());
    } else if (cmd === 'workstation') {
      await sendWorkstationLink(chatId, employeeId);
    } else if (cmd === 'menu') {
      clearConversation(chatId);
      await handleStartOrMenu(chatId, employeeId);
    } else if (cmd === 'help') {
      await sendHelp(chatId);
    } else if (cmd === 'schedule_menu') {
      clearConversation(chatId);
      await sendScheduleMenu(chatId, employeeId);
    } else if (cmd === 'today' || cmd === 'week' || cmd === 'month') {
      await sendSchedule(chatId, employeeId, cmd);
    } else if (cmd === 'requests') {
      await sendRequests(chatId, employeeId);
    } else if (cmd === 'finance' || cmd === 'finance_menu') {
      await sendFinanceMenu(chatId, employeeId);
    } else if (cmd === 'credentials') {
      await sendCredentials(chatId, employeeId);
    } else {
      await handleStartOrMenu(chatId, employeeId);
    }
    await answerCallback(callbackQueryId);
    return;
  }

  if (callbackData === 'as_new') {
    await sendMessage(chatId, '📅 Выберите дату смены:', {
      reply_markup: buildDatePickerKeyboard(14),
    });
    await answerCallback(callbackQueryId, 'Выберите дату');
    return;
  }

  if (callbackData === 'sw_new') {
    try {
      const reqData = await callInternalApi(`/api/telegram/internal/requests?employeeId=${encodeURIComponent(employeeId)}`);
      const ownShifts = Array.isArray(reqData.ownUpcomingShifts) ? reqData.ownUpcomingShifts : [];
      const availableEmployees = Array.isArray(reqData.availableEmployees) ? reqData.availableEmployees : [];

      if (ownShifts.length === 0) {
        await answerCallback(callbackQueryId, 'Нет доступных смен');
        await sendMessage(chatId, 'Нет доступных смен для передачи.');
        return;
      }

      if (availableEmployees.length === 0) {
        await answerCallback(callbackQueryId, 'Нет сотрудников');
        await sendMessage(chatId, 'Нет сотрудников для передачи смены.');
        return;
      }

      setConversation(chatId, {
        flow: 'swap_create',
        step: 'select_shift',
        payload: {
          availableShifts: ownShifts.map((s) => ({
            id: s.id,
            date: s.date,
            boxNumber: s.boxNumber,
            shiftType: s.shiftType,
          })),
          availableEmployees,
        },
      });

      const shiftButtons = ownShifts.slice(0, 10).map((s) => ([
        {
          text: `${s.date} | бокс ${s.boxNumber} | ${formatShiftType(s.shiftType)}`,
          callback_data: `sw_pick_shift:${s.id}`,
        },
      ]));

      await sendMessage(chatId, 'Выберите смену, которую хотите передать:', {
        reply_markup: { inline_keyboard: shiftButtons },
      });
      await answerCallback(callbackQueryId, 'Выберите смену');
      return;
    } catch (error) {
      await answerCallback(callbackQueryId, 'Ошибка');
      await sendMessage(chatId, `Не удалось загрузить данные для передачи смены: ${error.message}`);
      return;
    }
  }

  if (callbackData.startsWith('sw_pick_shift:')) {
    const shiftId = callbackData.split(':')[1];
    const stepData = getConversation(chatId);
    if (!stepData || stepData.flow !== 'swap_create' || stepData.step !== 'select_shift') {
      await answerCallback(callbackQueryId, 'Диалог не активен');
      return;
    }

    const shiftExists = (stepData.payload.availableShifts || []).some((s) => s.id === shiftId);
    if (!shiftExists) {
      await answerCallback(callbackQueryId, 'Смена не найдена');
      return;
    }

    setConversation(chatId, {
      flow: 'swap_create',
      step: 'select_target',
      payload: {
        ...stepData.payload,
        requesterShiftId: shiftId,
      },
    });

    const employeeButtons = (stepData.payload.availableEmployees || []).slice(0, 10).map((emp) => ([
      { text: emp.fullName, callback_data: `sw_pick_target:${emp.id}` },
    ]));

    await sendMessage(chatId, 'Выберите сотрудника, которому передать смену:', {
      reply_markup: { inline_keyboard: employeeButtons },
    });
    await answerCallback(callbackQueryId, 'Выберите сотрудника');
    return;
  }

  if (callbackData.startsWith('sw_pick_target:')) {
    const targetEmployeeId = callbackData.split(':')[1];
    const stepData = getConversation(chatId);
    if (!stepData || stepData.flow !== 'swap_create' || stepData.step !== 'select_target') {
      await answerCallback(callbackQueryId, 'Диалог не активен');
      return;
    }

    const employeeExists = (stepData.payload.availableEmployees || []).some((emp) => emp.id === targetEmployeeId);
    if (!employeeExists) {
      await answerCallback(callbackQueryId, 'Сотрудник не найден');
      return;
    }

    try {
      await callInternalApi('/api/telegram/internal/shift-swap/create', {
        method: 'POST',
        body: {
          employeeId,
          requesterShiftId: stepData.payload.requesterShiftId,
          type: 'giveaway',
          targetEmployeeId,
        },
      });
      clearConversation(chatId);
      await answerCallback(callbackQueryId, 'Заявка отправлена');
      await sendMessage(chatId, 'Заявка на передачу смены отправлена.', {
        reply_markup: buildMainMenuKeyboard(),
      });
    } catch (error) {
      clearConversation(chatId);
      await answerCallback(callbackQueryId, 'Ошибка');
      await sendMessage(chatId, `Не удалось отправить заявку: ${error.message}`, {
        reply_markup: buildMainMenuKeyboard(),
      });
    }
    return;
  }

  if (callbackData.startsWith('as_shift:')) {
    const stepData = getConversation(chatId);
    if (!stepData || stepData.flow !== 'assignment_create' || stepData.step !== 'shift_type') {
      await answerCallback(callbackQueryId, 'Диалог не активен');
      return;
    }
    const shiftType = callbackData.split(':')[1];
    if (shiftType !== 'day' && shiftType !== 'night') {
      await answerCallback(callbackQueryId, 'Некорректный тип смены');
      return;
    }

    setConversation(chatId, {
      flow: 'assignment_create',
      step: 'box_number',
      payload: { ...stepData.payload, shiftType },
    });
    const shiftLabel = shiftType === 'day' ? '☀️ День' : '🌙 Ночь';
    await sendMessage(chatId, `Тип смены: ${shiftLabel}\nВыберите бокс:`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '1️⃣ Бокс 1', callback_data: 'as_box:1' },
            { text: '2️⃣ Бокс 2', callback_data: 'as_box:2' },
          ],
          [{ text: '❌ Отмена', callback_data: 'cmd:schedule_menu' }],
        ],
      },
    });
    await answerCallback(callbackQueryId, 'Тип смены выбран');
    return;
  }

  if (callbackData.startsWith('as_box:')) {
    const stepData = getConversation(chatId);
    if (!stepData || stepData.flow !== 'assignment_create' || stepData.step !== 'box_number') {
      await answerCallback(callbackQueryId, 'Диалог не активен');
      return;
    }
    const boxRaw = callbackData.split(':')[1];
    if (boxRaw !== '1' && boxRaw !== '2') {
      await answerCallback(callbackQueryId, 'Некорректный бокс');
      return;
    }

    setConversation(chatId, {
      flow: 'assignment_create',
      step: 'comment',
      payload: { ...stepData.payload, boxNumber: Number(boxRaw) },
    });
    await sendMessage(chatId, 'Введите комментарий или нажмите «Пропустить»:', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⏭ Пропустить', callback_data: 'as_skip_comment' }],
          [{ text: '❌ Отмена', callback_data: 'cmd:schedule_menu' }],
        ],
      },
    });
    await answerCallback(callbackQueryId, 'Бокс выбран');
    return;
  }

  if (callbackData === 'as_skip_comment') {
    const stepData = getConversation(chatId);
    if (!stepData || stepData.flow !== 'assignment_create' || stepData.step !== 'comment') {
      await answerCallback(callbackQueryId, 'Диалог не активен');
      return;
    }
    const payload = stepData.payload || {};
    try {
      await callInternalApi('/api/telegram/internal/shift-assignment/create', {
        method: 'POST',
        body: {
          employeeId,
          date: payload.date,
          shiftType: payload.shiftType,
          boxNumber: payload.boxNumber,
        },
      });
      clearConversation(chatId);
      await answerCallback(callbackQueryId, 'Запрос создан');
      await sendMessage(chatId, '✅ Запрос на смену создан.', { reply_markup: buildScheduleMenuKeyboard() });
    } catch (error) {
      clearConversation(chatId);
      await answerCallback(callbackQueryId, 'Ошибка');
      await sendMessage(chatId, `Не удалось создать запрос: ${error.message}`, {
        reply_markup: buildScheduleMenuKeyboard(),
      });
    }
    return;
  }

  if (callbackData.startsWith('sw_yes:') || callbackData.startsWith('sw_no:')) {
    const [action, requestId] = callbackData.split(':');
    const decision = action === 'sw_yes' ? 'accepted' : 'rejected';
    try {
      await callInternalApi('/api/telegram/internal/shift-swap/respond', {
        method: 'POST',
        body: {
          employeeId,
          requestId,
          decision,
        },
      });
      const confirmText = decision === 'accepted'
        ? '✅ Заявка на передачу смены принята.\nСмена добавлена в ваш график.'
        : '❌ Заявка на передачу смены отклонена.';
      await answerCallback(callbackQueryId, decision === 'accepted' ? 'Принято ✅' : 'Отклонено ❌');
      await sendMessage(chatId, confirmText, { reply_markup: buildScheduleMenuKeyboard() });
    } catch (error) {
      await answerCallback(callbackQueryId, 'Ошибка обработки');
      await sendMessage(
        chatId,
        `⚠️ Не удалось обработать заявку.\nПричина: ${error.message}\n\nПопробуйте снова или используйте /menu.`,
        { reply_markup: buildMainMenuKeyboard() }
      );
    }
    return;
  }

  if (callbackData.startsWith('as_cancel:')) {
    const requestId = callbackData.split(':')[1];
    try {
      await callInternalApi('/api/telegram/internal/shift-assignment/cancel', {
        method: 'POST',
        body: { employeeId, requestId },
      });
      await answerCallback(callbackQueryId, 'Запрос отменён ✅');
      await sendMessage(chatId, '✅ Запрос на смену отменён.', { reply_markup: buildScheduleMenuKeyboard() });
    } catch (error) {
      await answerCallback(callbackQueryId, 'Ошибка');
      await sendMessage(
        chatId,
        `⚠️ Не удалось отменить запрос.\nПричина: ${error.message}`,
        { reply_markup: buildScheduleMenuKeyboard() }
      );
    }
    return;
  }

  await answerCallback(callbackQueryId, 'Неизвестное действие');
}

function makeSeenList(employeeId) {
  if (!Array.isArray(state.lastSentEventIds[employeeId])) {
    state.lastSentEventIds[employeeId] = [];
  }
  return state.lastSentEventIds[employeeId];
}

function isEventSeen(employeeId, eventId) {
  return makeSeenList(employeeId).includes(eventId);
}

function markEventSeen(employeeId, eventId) {
  const list = makeSeenList(employeeId);
  list.push(eventId);
  if (list.length > 400) {
    list.splice(0, list.length - 400);
  }
}

function eventToNotification(event) {
  // Title already contains the icon from notification-diff-service
  const lines = [event.title];
  if (event.message) {
    lines.push('');
    lines.push(event.message);
  }
  return lines.join('\n');
}

function eventKeyboard(event) {
  if (event.type === 'incoming_swap_request' && event.meta?.requestId) {
    const requestId = String(event.meta.requestId);
    return {
      inline_keyboard: [[
        { text: 'Принять', callback_data: `sw_yes:${requestId}` },
        { text: 'Отклонить', callback_data: `sw_no:${requestId}` },
      ]],
    };
  }
  return undefined;
}

async function sendCriticalAlert(message) {
  if (ADMIN_CHAT_IDS.length === 0) return;
  for (const chatId of ADMIN_CHAT_IDS) {
    try {
      await sendMessage(chatId, `⚠️ TG BOT ALERT\n${message}`);
    } catch (error) {
      console.error('[TG-BOT] Failed to deliver admin alert:', error);
    }
  }
}

async function scanSnapshotsAndNotify() {
  if (isScanning || isShuttingDown) return;
  isScanning = true;
  ensureMetricsDate();

  try {
    await refreshMappingsFromWeb();

    if (employeeChatMap.size === 0) {
      console.warn('[TG-BOT] No employee mappings configured (env or web).');
      return;
    }

    for (const [employeeId, chatId] of employeeChatMap.entries()) {
      const cursor = String(state.employeeCursors[employeeId] || '');
      let data;
      try {
        data = await callInternalApi(
          `/api/telegram/internal/snapshot?employeeId=${encodeURIComponent(employeeId)}&cursor=${encodeURIComponent(cursor)}`
        );
      } catch (error) {
        metrics.notificationErrors += 1;
        metrics.apiErrors += 1;
        await sendCriticalAlert(`Snapshot error for employee ${employeeId}: ${error.message}`);
        continue;
      }

      state.employeeCursors[employeeId] = data.cursor;
      const events = Array.isArray(data.events) ? data.events : [];
      for (const event of events) {
        if (!event?.id || isEventSeen(employeeId, event.id)) {
          continue;
        }

        try {
          await sendMessage(chatId, eventToNotification(event), {
            reply_markup: eventKeyboard(event),
          });
          metrics.notificationsSent += 1;
          markEventSeen(employeeId, event.id);
        } catch (error) {
          metrics.notificationErrors += 1;
          await sendCriticalAlert(`Notify error for employee ${employeeId} (${chatId}): ${error.message}`);
        }
      }
    }

    await persistRuntimeState();
  } finally {
    isScanning = false;
  }
}

async function maybeSendDailyReport() {
  if (isReporting || isShuttingDown || ADMIN_CHAT_IDS.length === 0) return;
  isReporting = true;

  try {
    ensureMetricsDate();
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const today = getTodayKey();

    if (hour !== 9 || minute > 10) return;
    if (state.lastDailyReportDate === today) return;

    const text = [
      `📊 TG BOT DAILY REPORT (${today})`,
      `Messages sent: ${metrics.messagesSent}`,
      `Message errors: ${metrics.messageErrors}`,
      `Notifications sent: ${metrics.notificationsSent}`,
      `Notification errors: ${metrics.notificationErrors}`,
      `Commands handled: ${metrics.commandsHandled}`,
      `Callbacks handled: ${metrics.callbacksHandled}`,
      `Internal API errors: ${metrics.apiErrors}`,
    ].join('\n');

    for (const chatId of ADMIN_CHAT_IDS) {
      try {
        await sendMessage(chatId, text);
      } catch (error) {
        console.error('[TG-BOT] Failed to send daily report:', error);
      }
    }

    state.lastDailyReportDate = today;
    await persistRuntimeState();
  } finally {
    isReporting = false;
  }
}

async function processUpdate(update) {
  const message = update.message;
  const callbackQuery = update.callback_query;

  if (message?.chat?.id) {
    const chatId = String(message.chat.id);
    let employeeId = getEmployeeIdByChat(chatId);
    if (!employeeId) {
      await refreshMappingsFromWeb();
      employeeId = getEmployeeIdByChat(chatId);
    }
    if (!employeeId) {
      await sendAccessDenied(chatId);
      return;
    }

    if (typeof message.text === 'string' && message.text.trim().length > 0) {
      const text = message.text.trim();
      try {
        if (text.startsWith('/')) {
          await handleCommand(chatId, employeeId, text);
        } else {
          const consumed = (await processWashTextMessage(chatId, employeeId, text, getWashFlowContext())) ||
            (await processAssignmentConversation(chatId, employeeId, text)) ||
            (await processSwapConversation(chatId, text));
          if (!consumed) {
            await sendMessage(chatId, 'Нажмите кнопку в меню ниже или введите /help для справки.', {
              reply_markup: buildMainMenuKeyboard(),
            });
          }
        }
      } catch (error) {
        metrics.apiErrors += 1;
        console.error('[TG-BOT] Failed to process message action:', error);
        await sendMessage(
          chatId,
          '⚠️ Сервис временно недоступен.\nПодождите 10–20 секунд и попробуйте снова.\nЕсли ошибка повторяется — сообщите администратору.',
          { reply_markup: buildMainMenuKeyboard() }
        );
      }
      await persistRuntimeState();
    }

    if (Array.isArray(message.photo) && message.photo.length > 0) {
      try {
        const consumed = await processWashPhotoMessage(chatId, employeeId, message.photo, getWashFlowContext());
        if (!consumed) {
          await sendMessage(chatId, '📸 Фото получено. Для регистрации мойки нажмите «🚗 Оформить мойку» или /wash.', {
            reply_markup: buildMainMenuKeyboard(),
          });
        }
      } catch (error) {
        metrics.apiErrors += 1;
        console.error('[TG-BOT] Failed to process photo action:', error);
        await sendMessage(
          chatId,
          '❌ Не удалось обработать фото.\nПопробуйте ещё раз или введите номер вручную текстом.',
          { reply_markup: buildMainMenuKeyboard() }
        );
      }
      await persistRuntimeState();
    }
    return;
  }

  if (callbackQuery?.id && callbackQuery?.from?.id) {
    const chatId = String(callbackQuery.from.id);
    let employeeId = getEmployeeIdByChat(chatId);
    if (!employeeId) {
      await refreshMappingsFromWeb();
      employeeId = getEmployeeIdByChat(chatId);
    }
    if (!employeeId) {
      await answerCallback(callbackQuery.id, 'Нет доступа');
      return;
    }

    try {
      await handleCallback(chatId, employeeId, callbackQuery.id, callbackQuery.data || '');
    } catch (error) {
      metrics.apiErrors += 1;
      console.error('[TG-BOT] Failed to process callback action:', error);
      try {
        await answerCallback(callbackQuery.id, 'Сервис временно недоступен');
      } catch {
        // ignore secondary callback delivery error
      }
      await sendMessage(chatId, 'Не удалось выполнить действие. Повторите позже или используйте /menu.');
    }
    await persistRuntimeState();
  }
}

async function updatesLoop() {
  while (!isShuttingDown) {
    ensureMetricsDate();
    try {
      const updates = await callTelegramApi('getUpdates', {
        timeout: TG_TIMEOUT_SEC,
        offset: state.pollingOffset,
        allowed_updates: ['message', 'callback_query'],
      });

      for (const update of updates) {
        const nextOffset = Number(update.update_id) + 1;
        if (Number.isFinite(nextOffset)) {
          state.pollingOffset = Math.max(Number(state.pollingOffset || 0), nextOffset);
        }
        try {
          await processUpdate(update);
        } catch (error) {
          metrics.apiErrors += 1;
          console.error('[TG-BOT] Failed to process update:', error);
        }
      }

      await persistRuntimeState();
    } catch (error) {
      metrics.apiErrors += 1;
      console.error('[TG-BOT] updatesLoop error:', error);
      await sendCriticalAlert(`Polling error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[TG-BOT] Received ${signal}, shutting down...`);
  try {
    await persistRuntimeState();
  } catch (error) {
    console.error('[TG-BOT] Failed to persist state on shutdown:', error);
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function bootstrap() {
  await loadRuntimeState();
  ensureMetricsDate();
  await refreshMappingsFromWeb();
  await persistRuntimeState();

  console.log(`[TG-BOT] Worker started. Employees mapped: ${employeeChatMap.size}`);
  console.log(`[TG-BOT] Bot home: ${BOT_HOME}`);
  console.log(`[TG-BOT] Base URL: ${APP_BASE_URL}`);
  console.log(`[TG-BOT] Scan interval: ${SCAN_INTERVAL_SEC}s`);

  setInterval(scanSnapshotsAndNotify, SCAN_INTERVAL_SEC * 1000);
  setInterval(maybeSendDailyReport, 60 * 1000);

  await scanSnapshotsAndNotify();
  await updatesLoop();
}

bootstrap().catch(async (error) => {
  console.error('[TG-BOT] Fatal bootstrap error:', error);
  await sendCriticalAlert(`Fatal bootstrap error: ${error.message}`);
  process.exit(1);
});
