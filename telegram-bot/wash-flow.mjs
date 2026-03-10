const PAYMENT_BUTTONS = [
  { code: 'c', method: 'cash', label: 'Наличные' },
  { code: 'd', method: 'card', label: 'Карта' },
  { code: 't', method: 'transfer', label: 'Перевод' },
  { code: 'a', method: 'aggregator', label: 'Агрегатор' },
  { code: 'k', method: 'counterAgentContract', label: 'По договору' },
];

function paymentMethodToLabel(method) {
  if (method === 'cash') return 'Наличные';
  if (method === 'card') return 'Карта';
  if (method === 'transfer') return 'Перевод';
  if (method === 'aggregator') return 'Агрегатор';
  if (method === 'counterAgentContract') return 'По договору';
  return method || '-';
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0 руб.';
  return `${amount.toLocaleString('ru-RU')} руб.`;
}

function createDraftId() {
  return `tgdraft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConversation(chatId, ctx) {
  return ctx.getConversation(chatId);
}

function setConversation(chatId, data, ctx) {
  ctx.setConversation(chatId, data);
}

function clearConversation(chatId, ctx) {
  ctx.clearConversation(chatId);
}

function isWashFlow(conversation) {
  return conversation?.flow === 'wash_create';
}

function getSelectedTeamNames(payload) {
  const selected = new Set(payload.teamEmployeeIds || []);
  const teamOptions = Array.isArray(payload.teamOptions) ? payload.teamOptions : [];
  return teamOptions.filter((item) => selected.has(item.id)).map((item) => item.fullName);
}

async function sendBlockedByShiftMessage(chatId, employeeId, reason, ctx) {
  await ctx.sendMessage(
    chatId,
    [
      '🚫 /wash сейчас недоступен.',
      reason || 'Сотрудник не назначен в смену на сегодня.',
      '',
      'Что можно сделать:',
      '1) Проверить график на сегодня',
      '2) Открыть заявки',
      '3) Отправить запрос на смену',
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🗓 Сегодня', callback_data: 'cmd:today' },
            { text: '📨 Заявки', callback_data: 'cmd:requests' },
          ],
          [{ text: '➕ Запрос смены', callback_data: 'as_new' }],
          [{ text: '🔄 В меню', callback_data: 'cmd:menu' }],
        ],
      },
    }
  );
}

async function renderTeamStep(chatId, employeeId, ctx, hint) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return;
  const payload = conversation.payload || {};
  const teamOptions = Array.isArray(payload.teamOptions) ? payload.teamOptions : [];
  const selectedIds = new Set(payload.teamEmployeeIds || []);

  const lines = [];
  lines.push('🚗 Оформление мойки');
  lines.push('Шаг 1/6: команда исполнителей');
  lines.push('');
  const selectedNames = getSelectedTeamNames(payload);
  lines.push(`Выбрано: ${selectedNames.length ? selectedNames.join(', ') : 'никого'}`);
  lines.push('Инициатор не может убрать себя.');
  if (hint) {
    lines.push('');
    lines.push(hint);
  }

  const keyboard = [];
  teamOptions.forEach((employee, index) => {
    const active = selectedIds.has(employee.id) ? '✅' : '⬜️';
    keyboard.push([{ text: `${active} ${employee.fullName}`, callback_data: `w:t:${index}` }]);
  });
  keyboard.push([
    { text: '↺ Только я', callback_data: 'w:tr' },
    { text: '➡️ Далее', callback_data: 'w:tn' },
  ]);
  keyboard.push([{ text: '❌ Отмена', callback_data: 'w:cx' }]);

  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

async function renderVehicleStep(chatId, ctx, hint) {
  const lines = [
    '🚘 Шаг 2/6: номер машины',
    'Введите номер текстом или отправьте фото номера для OCR.',
    'Формат примера: А123ВС777 или A123BC777.',
  ];
  if (hint) {
    lines.push('');
    lines.push(hint);
  }
  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⬅️ К команде', callback_data: 'w:bt' }],
        [{ text: '❌ Отмена', callback_data: 'w:cx' }],
      ],
    },
  });
}

async function renderPaymentStep(chatId, ctx) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return;
  const payload = conversation.payload || {};

  const lines = [];
  lines.push(`🚙 Номер: ${payload.normalizedVehicleNumber || payload.vehicleInput || '-'}`);
  lines.push('Шаг 3/6: способ оплаты');
  if (payload.recommendedPaymentMethod) {
    lines.push(`Рекомендация: ${paymentMethodToLabel(payload.recommendedPaymentMethod)}.`);
  }
  if (payload.detectedCounterAgentName) {
    lines.push(`Контрагент по номеру: ${payload.detectedCounterAgentName}.`);
  } else if ((payload.detectedAggregators || []).length > 0) {
    lines.push(`Найдено агрегаторов по номеру: ${(payload.detectedAggregators || []).length}.`);
  }
  if (payload.lastWashServices?.length) {
    lines.push(`Повторный визит: ${payload.lastWashServices.length} услуг из прошлой мойки.`);
  }

  const keyboard = [];
  keyboard.push(PAYMENT_BUTTONS.slice(0, 2).map((item) => ({ text: item.label, callback_data: `w:p:${item.code}` })));
  keyboard.push(PAYMENT_BUTTONS.slice(2, 4).map((item) => ({ text: item.label, callback_data: `w:p:${item.code}` })));
  keyboard.push([{ text: PAYMENT_BUTTONS[4].label, callback_data: `w:p:${PAYMENT_BUTTONS[4].code}` }]);
  keyboard.push([
    { text: '⬅️ Назад', callback_data: 'w:bv' },
    { text: '❌ Отмена', callback_data: 'w:cx' },
  ]);

  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
}

function paginate(items, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + pageSize),
    start,
  };
}

function sortDetectedFirst(items) {
  return items
    .slice()
    .sort((a, b) => {
      const aDetected = Boolean(a.isDetected);
      const bDetected = Boolean(b.isDetected);
      if (aDetected !== bDetected) return aDetected ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ru');
    });
}

async function renderAggregatorStep(chatId, ctx) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return;
  const payload = conversation.payload || {};
  const raw = Array.isArray(payload.availableAggregators) ? payload.availableAggregators : [];
  const all = sortDetectedFirst(raw);
  const page = Number(payload.aggregatorPage || 1);
  const pageData = paginate(all, page, 8);
  const selectedAggregatorId = payload.selectedAggregatorId;

  const lines = [];
  lines.push('🏢 Шаг 4/6: выберите агрегатора');
  lines.push(`Страница ${pageData.page}/${pageData.totalPages}`);
  if (all.some((item) => item.isDetected)) {
    lines.push('Сначала показаны агрегаторы, где номер найден автоматически.');
  }

  const keyboard = [];
  pageData.items.forEach((item, index) => {
    const absoluteIndex = pageData.start + index;
    const mark = item.id === selectedAggregatorId ? '✅ ' : '';
    keyboard.push([{ text: `${mark}${item.name}`, callback_data: `w:ag:${absoluteIndex}` }]);
  });

  const navRow = [];
  if (pageData.page > 1) navRow.push({ text: '⬅️', callback_data: `w:agp:${pageData.page - 1}` });
  if (pageData.page < pageData.totalPages) navRow.push({ text: '➡️', callback_data: `w:agp:${pageData.page + 1}` });
  if (navRow.length > 0) keyboard.push(navRow);

  keyboard.push([
    { text: '⬅️ Назад', callback_data: 'w:bp' },
    { text: '❌ Отмена', callback_data: 'w:cx' },
  ]);

  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function renderCounterAgentStep(chatId, ctx, hint) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return;
  const payload = conversation.payload || {};
  const raw = Array.isArray(payload.availableCounterAgents) ? payload.availableCounterAgents : [];
  const all = sortDetectedFirst(raw);
  const page = Number(payload.counterAgentPage || 1);
  const pageData = paginate(all, page, 8);
  const selectedCounterAgentId = payload.selectedCounterAgentId;

  const lines = [];
  lines.push('📑 Шаг 4/6: выберите контрагента');
  lines.push(`Страница ${pageData.page}/${pageData.totalPages}`);
  if (payload.detectedCounterAgentName) {
    lines.push(`По номеру найден: ${payload.detectedCounterAgentName}.`);
  }
  if (hint) {
    lines.push(hint);
  }

  const keyboard = [];
  if (payload.detectedCounterAgentId) {
    keyboard.push([{ text: '⚡ Использовать найденного', callback_data: 'w:caa' }]);
  }

  pageData.items.forEach((item, index) => {
    const absoluteIndex = pageData.start + index;
    const mark = item.id === selectedCounterAgentId ? '✅ ' : '';
    keyboard.push([{ text: `${mark}${item.name}`, callback_data: `w:ca:${absoluteIndex}` }]);
  });

  const navRow = [];
  if (pageData.page > 1) navRow.push({ text: '⬅️', callback_data: `w:cap:${pageData.page - 1}` });
  if (pageData.page < pageData.totalPages) navRow.push({ text: '➡️', callback_data: `w:cap:${pageData.page + 1}` });
  if (navRow.length > 0) keyboard.push(navRow);

  keyboard.push([
    { text: '⬅️ Назад', callback_data: 'w:bp' },
    { text: '❌ Отмена', callback_data: 'w:cx' },
  ]);

  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: { inline_keyboard: keyboard },
  });
}

function sumSelectedServices(selectedServices) {
  return (selectedServices || []).reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function mergeServiceTokenMap(existingMap, items) {
  const result = { ...(existingMap || {}) };
  for (const item of items || []) {
    if (!item?.token) continue;
    result[item.token] = {
      serviceName: item.serviceName,
      price: Number(item.price || 0),
      chemicalConsumption: item.chemicalConsumption,
      isCustom: Boolean(item.isCustom),
      isFromLastWash: Boolean(item.isFromLastWash),
      token: item.token,
    };
  }
  return result;
}

function toggleService(selectedServices, service) {
  const normalized = {
    serviceName: String(service.serviceName || '').trim(),
    price: Number(service.price || 0),
    chemicalConsumption: service.chemicalConsumption === undefined ? undefined : Number(service.chemicalConsumption),
    isCustom: Boolean(service.isCustom),
  };

  if (!normalized.serviceName) return selectedServices || [];
  const current = Array.isArray(selectedServices) ? [...selectedServices] : [];
  const index = current.findIndex((item) => item.serviceName === normalized.serviceName);
  if (index >= 0) {
    current.splice(index, 1);
  } else {
    current.push(normalized);
  }
  return current;
}

function isServiceSelected(selectedServices, serviceName) {
  return (selectedServices || []).some((item) => item.serviceName === serviceName);
}

async function renderServicesStep(chatId, employeeId, ctx, hint) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return;
  const payload = conversation.payload || {};
  const selectedPaymentMethod = payload.selectedPaymentMethod;
  const normalizedVehicleNumber = payload.normalizedVehicleNumber;
  if (!selectedPaymentMethod || !normalizedVehicleNumber) {
    await ctx.sendMessage(chatId, 'Нет данных для выбора услуг. Начните /wash заново.', {
      reply_markup: ctx.buildMainMenuKeyboard(),
    });
    clearConversation(chatId, ctx);
    return;
  }

  const page = Number(payload.servicePage || 1);
  const query = String(payload.serviceSearchQuery || '').trim();
  const sourceId =
    selectedPaymentMethod === 'aggregator'
      ? payload.selectedAggregatorId
      : selectedPaymentMethod === 'counterAgentContract'
        ? payload.selectedCounterAgentId
        : undefined;

  const params = new URLSearchParams({
    employeeId,
    vehicleNumber: normalizedVehicleNumber,
    paymentMethod: selectedPaymentMethod,
    page: String(page),
    pageSize: '8',
  });
  if (sourceId) params.set('sourceId', sourceId);
  if (query) params.set('query', query);

  const servicesData = await ctx.callInternalApi(`/api/telegram/internal/wash/services?${params.toString()}`);
  const items = Array.isArray(servicesData.items) ? servicesData.items : [];
  const selectedServices = Array.isArray(payload.selectedServices) ? payload.selectedServices : [];
  const totalAmount = sumSelectedServices(selectedServices);
  const serviceTokenMap = mergeServiceTokenMap(payload.serviceTokenMap, items);
  const servicePageTokens = items.map((item) => item.token).filter(Boolean);

  setConversation(
    chatId,
    {
      ...conversation,
      step: 'service_browse',
      payload: {
        ...payload,
        servicePage: servicesData.page,
        serviceSearchQuery: query,
        allowCustomServices: Boolean(servicesData.allowCustomServices),
        priceListName: servicesData.priceListName,
        serviceTokenMap,
        servicePageTokens,
      },
    },
    ctx
  );

  const lines = [];
  lines.push('🧽 Шаг 5/6: выберите услуги');
  lines.push(`Оплата: ${paymentMethodToLabel(selectedPaymentMethod)}`);
  if (payload.priceListName || servicesData.priceListName) {
    lines.push(`Прайс: ${servicesData.priceListName || payload.priceListName}`);
  }
  lines.push(`Выбрано: ${selectedServices.length} | Сумма: ${formatMoney(totalAmount)}`);
  if (query) {
    lines.push(`Поиск: "${query}"`);
  }
  if (hint) {
    lines.push(hint);
  }

  const keyboard = [];
  for (const item of items) {
    const selectedMark = isServiceSelected(selectedServices, item.serviceName) ? '✅' : '⬜️';
    const fromLastMark = item.isFromLastWash ? '🔁 ' : '';
    const priceText = Number(item.price || 0).toLocaleString('ru-RU');
    keyboard.push([
      {
        text: `${selectedMark} ${fromLastMark}${item.serviceName} (${priceText})`,
        callback_data: `w:st:${item.token}`,
      },
    ]);
  }

  const navRow = [];
  if (servicesData.page > 1) navRow.push({ text: '⬅️', callback_data: `w:sp:${servicesData.page - 1}` });
  if (servicesData.page < servicesData.totalPages) navRow.push({ text: '➡️', callback_data: `w:sp:${servicesData.page + 1}` });
  if (navRow.length > 0) keyboard.push(navRow);

  const toolsRow = [{ text: '🔎 Поиск', callback_data: 'w:ss' }];
  if (query) toolsRow.push({ text: '🧹 Сброс', callback_data: 'w:sc' });
  if ((payload.lastWashServices || []).length > 0) toolsRow.push({ text: '🔁 Повторить прошлую', callback_data: 'w:sr' });
  keyboard.push(toolsRow);

  const actionRow = [];
  if (servicesData.allowCustomServices) actionRow.push({ text: '➕ Своя услуга', callback_data: 'w:su' });
  actionRow.push({ text: '✅ Далее', callback_data: 'w:sd' });
  keyboard.push(actionRow);
  keyboard.push([
    { text: '⬅️ Назад', callback_data: 'w:bp' },
    { text: '❌ Отмена', callback_data: 'w:cx' },
  ]);

  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function renderCommentStep(chatId, ctx, hint) {
  const lines = ['💬 Шаг 6/6: комментарий', 'Введите комментарий к мойке или "-" чтобы пропустить.'];
  if (hint) lines.push(hint);
  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Пропустить', callback_data: 'w:cm' }],
        [{ text: '⬅️ К услугам', callback_data: 'w:bs' }],
        [{ text: '❌ Отмена', callback_data: 'w:cx' }],
      ],
    },
  });
}

async function renderConfirmStep(chatId, ctx) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return;
  const payload = conversation.payload || {};

  const selectedServices = Array.isArray(payload.selectedServices) ? payload.selectedServices : [];
  const totalAmount = sumSelectedServices(selectedServices);
  const teamNames = getSelectedTeamNames(payload);
  const sourceName =
    payload.selectedPaymentMethod === 'aggregator'
      ? (payload.availableAggregators || []).find((item) => item.id === payload.selectedAggregatorId)?.name
      : payload.selectedPaymentMethod === 'counterAgentContract'
        ? (payload.availableCounterAgents || []).find((item) => item.id === payload.selectedCounterAgentId)?.name
        : '';

  const lines = [];
  lines.push('📋 Подтверждение мойки');
  lines.push(`Номер: ${payload.normalizedVehicleNumber || '-'}`);
  lines.push(`Оплата: ${paymentMethodToLabel(payload.selectedPaymentMethod)}`);
  if (sourceName) lines.push(`Клиент: ${sourceName}`);
  lines.push(`Команда: ${teamNames.join(', ') || '-'}`);
  lines.push(`Услуги: ${selectedServices.length}`);
  lines.push(`Итого: ${formatMoney(totalAmount)}`);
  if (payload.comment) {
    lines.push(`Комментарий: ${payload.comment}`);
  }
  lines.push('');
  lines.push('Подтвердить регистрацию мойки?');

  await ctx.sendMessage(chatId, lines.join('\n'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Зарегистрировать', callback_data: 'w:cf' }],
        [{ text: '✏️ Изменить услуги', callback_data: 'w:bs' }],
        [{ text: '❌ Отмена', callback_data: 'w:cx' }],
      ],
    },
  });
}

function cloneConversationPayload(payload) {
  return JSON.parse(JSON.stringify(payload || {}));
}

function clearOcrPayload(payload) {
  payload.ocrPendingCorrection = undefined;
  payload.ocrPlateNumber = undefined;
  payload.ocrImageBase64 = undefined;
  payload.ocrFailedFilename = undefined;
}

async function savePendingOcrCorrection(ctx, payload, employeeId, correctedOcr) {
  if (!payload?.ocrPendingCorrection) return;

  const body = {
    originalOcr: payload.ocrPlateNumber || 'not_recognized',
    correctedOcr,
    employeeId,
    source: 'telegram',
  };

  if (payload.ocrFailedFilename) {
    body.filename = payload.ocrFailedFilename;
  } else if (payload.ocrImageBase64) {
    body.imageBase64 = payload.ocrImageBase64;
  } else {
    console.warn('[TG-BOT] savePendingOcrCorrection: нет ни filename, ни base64 — пропускаем сохранение');
    return;
  }

  await ctx.callInternalApi('/api/telegram/internal/save-ocr-corrected', {
    method: 'POST',
    body,
  });
}

async function saveTelegramFailedOcrSample(ctx, employeeId, imageBase64, reason) {
  const result = await ctx.callInternalApi('/api/telegram/internal/save-ocr-failed', {
    method: 'POST',
    body: {
      employeeId,
      imageBase64,
      source: 'telegram',
      reason,
    },
  });

  return result?.filename || null;
}

async function handleDetectedVehicle(chatId, employeeId, vehicleInput, ctx) {
  const detectData = await ctx.callInternalApi('/api/telegram/internal/wash/detect-vehicle', {
    method: 'POST',
    body: { employeeId, vehicleNumber: vehicleInput },
  });

  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return true;
  const payload = cloneConversationPayload(conversation.payload);
  payload.vehicleInput = String(vehicleInput || '').trim();
  payload.normalizedVehicleNumber = detectData.normalizedVehicleNumber;
  payload.recommendedPaymentMethod = detectData.recommendedPaymentMethod;
  payload.detectedCounterAgentId = detectData.detectedCounterAgent?.id;
  payload.detectedCounterAgentName = detectData.detectedCounterAgent?.name;
  payload.detectedAggregators = detectData.detectedAggregators || [];
  payload.availableAggregators = detectData.availableAggregators || [];
  payload.availableCounterAgents = detectData.availableCounterAgents || [];
  payload.lastWashServices = detectData.lastWash?.services || [];
  payload.lastWashComment = detectData.lastWash?.comment || '';
  payload.selectedPaymentMethod = undefined;
  payload.selectedAggregatorId = undefined;
  payload.selectedCounterAgentId = undefined;
  payload.selectedServices = [];
  payload.serviceSearchQuery = '';
  payload.servicePage = 1;
  payload.serviceTokenMap = {};
  payload.servicePageTokens = [];
  payload.comment = '';

  setConversation(
    chatId,
    {
      ...conversation,
      step: 'payment_select',
      payload,
    },
    ctx
  );

  await renderPaymentStep(chatId, ctx);
  return true;
}

async function loadPhotoAsBase64(photo, ctx) {
  if (!Array.isArray(photo) || photo.length === 0) return null;
  const largest = photo[photo.length - 1];
  if (!largest?.file_id) return null;
  return ctx.fetchTelegramPhotoBase64(largest.file_id);
}

export async function startWashConversation(chatId, employeeId, ctx) {
  const bootstrap = await ctx.callInternalApi(
    `/api/telegram/internal/wash/bootstrap?employeeId=${encodeURIComponent(employeeId)}`
  );

  if (!bootstrap?.isAllowed) {
    await sendBlockedByShiftMessage(chatId, employeeId, bootstrap?.blockReason, ctx);
    return true;
  }

  setConversation(
    chatId,
    {
      flow: 'wash_create',
      step: 'team',
      payload: {
        draftId: createDraftId(),
        teamOptions: bootstrap.teamEmployees || [],
        teamEmployeeIds: [employeeId],
        activeShift: bootstrap.activeShift,
        today: bootstrap.today,
        selectedServices: [],
        serviceSearchQuery: '',
        servicePage: 1,
      },
    },
    ctx
  );

  await renderTeamStep(chatId, employeeId, ctx);
  return true;
}

export async function processWashTextMessage(chatId, employeeId, text, ctx) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return false;
  const payload = cloneConversationPayload(conversation.payload);

  if (conversation.step === 'vehicle_input') {
    const vehicleInput = String(text || '').trim();
    if (!vehicleInput) {
      await renderVehicleStep(chatId, ctx, 'Введите номер машины или отправьте фото.');
      return true;
    }

    // Если есть незавершённый OCR-сэмпл, сохраняем ручную правку в тот же набор failed-фото.
    if (payload.ocrPendingCorrection) {
      try {
        await savePendingOcrCorrection(ctx, payload, employeeId, vehicleInput);
      } catch (error) {
        console.error('[TG-BOT] Failed to save OCR correction:', error);
      }
      // Очищаем OCR-данные независимо от успеха сохранения — номер уже введён вручную
      clearOcrPayload(payload);
      setConversation(chatId, { ...conversation, payload }, ctx);
    }

    await handleDetectedVehicle(chatId, employeeId, vehicleInput, ctx);
    return true;
  }

  if (conversation.step === 'service_search') {
    payload.serviceSearchQuery = String(text || '').trim();
    payload.servicePage = 1;
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (conversation.step === 'custom_service_name') {
    const name = String(text || '').trim();
    if (!name) {
      await ctx.sendMessage(chatId, 'Название услуги не должно быть пустым. Введите снова.');
      return true;
    }
    payload.customServiceName = name;
    setConversation(chatId, { ...conversation, step: 'custom_service_price', payload }, ctx);
    await ctx.sendMessage(chatId, 'Введите цену услуги (например 1200).');
    return true;
  }

  if (conversation.step === 'custom_service_price') {
    const normalizedPrice = String(text || '').trim().replace(',', '.');
    const price = Number(normalizedPrice);
    if (!Number.isFinite(price) || price < 0) {
      await ctx.sendMessage(chatId, 'Цена должна быть числом >= 0. Введите снова.');
      return true;
    }
    const serviceName = String(payload.customServiceName || '').trim();
    if (!serviceName) {
      setConversation(chatId, { ...conversation, step: 'custom_service_name', payload }, ctx);
      await ctx.sendMessage(chatId, 'Название услуги потеряно, введите его снова.');
      return true;
    }

    const selectedServices = Array.isArray(payload.selectedServices) ? payload.selectedServices : [];
    const withoutSame = selectedServices.filter((item) => item.serviceName !== serviceName);
    withoutSame.push({
      serviceName,
      price,
      isCustom: true,
      chemicalConsumption: 0,
    });

    payload.selectedServices = withoutSame;
    payload.customServiceName = '';
    payload.servicePage = 1;
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await renderServicesStep(chatId, employeeId, ctx, 'Произвольная услуга добавлена.');
    return true;
  }

  if (conversation.step === 'comment') {
    payload.comment = String(text || '').trim() === '-' ? '' : String(text || '').trim();
    setConversation(chatId, { ...conversation, step: 'confirm', payload }, ctx);
    await renderConfirmStep(chatId, ctx);
    return true;
  }

  await ctx.sendMessage(chatId, 'На этом шаге используйте кнопки под сообщением.');
  return true;
}

export async function processWashPhotoMessage(chatId, employeeId, photo, ctx) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation) || conversation.step !== 'vehicle_input') {
    return false;
  }
  const payload = cloneConversationPayload(conversation.payload);
  // Сохраняем предыдущие OCR-данные на случай если новое фото не удастся обработать
  const previousOcr = {
    ocrImageBase64: payload.ocrImageBase64,
    ocrFailedFilename: payload.ocrFailedFilename,
    ocrPlateNumber: payload.ocrPlateNumber,
    ocrPendingCorrection: payload.ocrPendingCorrection,
  };
  clearOcrPayload(payload);

  await ctx.sendMessage(chatId, 'Распознаю номер по фото, подождите 3-10 секунд...');
  const base64 = await loadPhotoAsBase64(photo, ctx);
  if (!base64) {
    await ctx.sendMessage(chatId, 'Не удалось получить фото. Отправьте другое фото или введите номер вручную.');
    return true;
  }

  try {
    const ocr = await ctx.callInternalApi('/api/telegram/internal/recognize-plate', {
      method: 'POST',
      body: { employeeId, imageBase64: base64 },
    });
    if (!ocr?.success || !ocr?.plateNumber) {
      payload.ocrPendingCorrection = true;
      payload.ocrPlateNumber = ocr?.plateNumber || '';
      payload.ocrFailedFilename = ocr?.failedFilename || undefined;
      payload.ocrImageBase64 = payload.ocrFailedFilename ? undefined : base64;
      setConversation(chatId, { ...conversation, payload }, ctx);
      await ctx.sendMessage(chatId, ocr?.error || 'Не удалось распознать номер. Введите его вручную.');
      return true;
    }

    payload.ocrPlateNumber = ocr.plateNumber;
    payload.ocrImageBase64 = base64; // сохраняем фото на случай если пользователь нажмёт "Исправить"
    setConversation(chatId, { ...conversation, step: 'ocr_confirm', payload }, ctx);
    await ctx.sendMessage(
      chatId,
      `Распознан номер: ${ocr.plateNumber}\nВсё верно?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Верно', callback_data: 'w:oc:confirm' },
              { text: '✏️ Исправить', callback_data: 'w:oc:edit' },
            ],
          ],
        },
      }
    );
    return true;
  } catch (error) {
    let failedFilename = null;
    try {
      failedFilename = await saveTelegramFailedOcrSample(
        ctx,
        employeeId,
        base64,
        error?.message || 'recognize_plate_request_failed'
      );
    } catch {
      failedFilename = null;
    }

    payload.ocrPendingCorrection = true;
    payload.ocrPlateNumber = '';
    payload.ocrFailedFilename = failedFilename || undefined;
    payload.ocrImageBase64 = failedFilename ? undefined : base64;
    setConversation(chatId, { ...conversation, payload }, ctx);
    await ctx.sendMessage(chatId, 'Ошибка OCR. Введите номер вручную.');
    return true;
  }
}

async function submitWash(chatId, employeeId, ctx) {
  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) return false;
  const payload = cloneConversationPayload(conversation.payload);

  const selectedServices = Array.isArray(payload.selectedServices) ? payload.selectedServices : [];
  if (selectedServices.length === 0) {
    await renderServicesStep(chatId, employeeId, ctx, 'Нужно выбрать минимум одну услугу.');
    return true;
  }

  if (payload.ocrPendingCorrection) {
    try {
      await savePendingOcrCorrection(
        ctx,
        payload,
        employeeId,
        payload.normalizedVehicleNumber || payload.vehicleInput || ''
      );
      clearOcrPayload(payload);
    } catch (error) {
      console.error('[TG-BOT] Failed to save OCR correction before wash submit:', error);
    }
  }

  const sourceId =
    payload.selectedPaymentMethod === 'aggregator'
      ? payload.selectedAggregatorId
      : payload.selectedPaymentMethod === 'counterAgentContract'
        ? payload.selectedCounterAgentId
        : undefined;

  const response = await ctx.callInternalApi('/api/telegram/internal/wash/submit', {
    method: 'POST',
    body: {
      employeeId,
      chatId: String(chatId),
      draftId: payload.draftId,
      teamEmployeeIds: payload.teamEmployeeIds || [employeeId],
      vehicleNumber: payload.normalizedVehicleNumber || payload.vehicleInput,
      paymentMethod: payload.selectedPaymentMethod,
      sourceId,
      selectedServices,
      comment: payload.comment || undefined,
    },
  });

  clearConversation(chatId, ctx);

  const createdTime = (() => {
    try {
      const d = new Date(response.createdAt);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return ''; }
  })();

  await ctx.sendMessage(
    chatId,
    [
      '✅ Мойка оформлена!',
      '',
      `🚗 Авто: ${payload.normalizedVehicleNumber || payload.vehicleInput || '—'}`,
      `💵 Сумма: ${formatMoney(response.totalAmount)}`,
      `💳 Оплата: ${paymentMethodToLabel(response.paymentMethod)}`,
      response.sourceName ? `👤 Клиент: ${response.sourceName}` : '',
      createdTime ? `🕐 Время: ${createdTime}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    { reply_markup: ctx.buildMainMenuKeyboard() }
  );
  return true;
}

export async function handleWashCallback(chatId, employeeId, callbackQueryId, callbackData, ctx) {
  if (!callbackData.startsWith('w:')) return false;

  const conversation = getConversation(chatId, ctx);
  if (!isWashFlow(conversation)) {
    await ctx.answerCallback(callbackQueryId, 'Диалог /wash не активен');
    return true;
  }

  const payload = cloneConversationPayload(conversation.payload);
  const sendAck = async (text = '') => {
    await ctx.answerCallback(callbackQueryId, text);
  };

  if (callbackData === 'w:cx') {
    clearConversation(chatId, ctx);
    await sendAck('Отменено');
    await ctx.sendMessage(chatId, 'Оформление мойки отменено.', {
      reply_markup: ctx.buildMainMenuKeyboard(),
    });
    return true;
  }

  if (callbackData === 'w:bt') {
    setConversation(chatId, { ...conversation, step: 'team', payload }, ctx);
    await sendAck();
    await renderTeamStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData === 'w:bv') {
    setConversation(chatId, { ...conversation, step: 'vehicle_input', payload }, ctx);
    await sendAck();
    await renderVehicleStep(chatId, ctx);
    return true;
  }

  if (callbackData === 'w:bp') {
    setConversation(chatId, { ...conversation, step: 'payment_select', payload }, ctx);
    await sendAck();
    await renderPaymentStep(chatId, ctx);
    return true;
  }

  if (callbackData === 'w:bs') {
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck();
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData === 'w:tr') {
    payload.teamEmployeeIds = [employeeId];
    setConversation(chatId, { ...conversation, step: 'team', payload }, ctx);
    await sendAck('Сброшено');
    await renderTeamStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData === 'w:tn') {
    const teamEmployeeIds = Array.isArray(payload.teamEmployeeIds) ? payload.teamEmployeeIds : [];
    if (!teamEmployeeIds.includes(employeeId)) {
      payload.teamEmployeeIds = [employeeId, ...teamEmployeeIds];
    }
    setConversation(chatId, { ...conversation, step: 'vehicle_input', payload }, ctx);
    await sendAck('Команда сохранена');
    await renderVehicleStep(chatId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:t:')) {
    const index = Number(callbackData.split(':')[2]);
    const teamOptions = Array.isArray(payload.teamOptions) ? payload.teamOptions : [];
    const employee = teamOptions[index];
    if (!employee) {
      await sendAck('Сотрудник не найден');
      return true;
    }
    const selectedIds = new Set(Array.isArray(payload.teamEmployeeIds) ? payload.teamEmployeeIds : [employeeId]);
    if (employee.id === employeeId && selectedIds.has(employeeId)) {
      await sendAck('Нельзя убрать себя');
      await renderTeamStep(chatId, employeeId, ctx, 'Инициатор не может убрать себя из команды.');
      return true;
    }
    if (selectedIds.has(employee.id)) selectedIds.delete(employee.id);
    else selectedIds.add(employee.id);
    payload.teamEmployeeIds = Array.from(selectedIds);
    setConversation(chatId, { ...conversation, step: 'team', payload }, ctx);
    await sendAck();
    await renderTeamStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:p:')) {
    const code = callbackData.split(':')[2];
    const button = PAYMENT_BUTTONS.find((item) => item.code === code);
    if (!button) {
      await sendAck('Метод не найден');
      return true;
    }
    payload.selectedPaymentMethod = button.method;
    payload.selectedServices = [];
    payload.serviceSearchQuery = '';
    payload.servicePage = 1;
    payload.serviceTokenMap = {};
    payload.servicePageTokens = [];

    if (button.method === 'aggregator') {
      payload.aggregatorPage = 1;
      setConversation(chatId, { ...conversation, step: 'aggregator_select', payload }, ctx);
      await sendAck();
      await renderAggregatorStep(chatId, ctx);
      return true;
    }

    if (button.method === 'counterAgentContract') {
      payload.counterAgentPage = 1;
      setConversation(chatId, { ...conversation, step: 'counter_agent_select', payload }, ctx);
      await sendAck();
      await renderCounterAgentStep(chatId, ctx);
      return true;
    }

    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck();
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:agp:')) {
    const page = Number(callbackData.split(':')[2]);
    payload.aggregatorPage = Number.isFinite(page) ? page : 1;
    setConversation(chatId, { ...conversation, step: 'aggregator_select', payload }, ctx);
    await sendAck();
    await renderAggregatorStep(chatId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:ag:')) {
    const absoluteIndex = Number(callbackData.split(':')[2]);
    const all = sortDetectedFirst(Array.isArray(payload.availableAggregators) ? payload.availableAggregators : []);
    const selected = all[absoluteIndex];
    if (!selected) {
      await sendAck('Агрегатор не найден');
      return true;
    }
    payload.selectedAggregatorId = selected.id;
    payload.servicePage = 1;
    payload.serviceSearchQuery = '';
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck('Агрегатор выбран');
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:cap:')) {
    const page = Number(callbackData.split(':')[2]);
    payload.counterAgentPage = Number.isFinite(page) ? page : 1;
    setConversation(chatId, { ...conversation, step: 'counter_agent_select', payload }, ctx);
    await sendAck();
    await renderCounterAgentStep(chatId, ctx);
    return true;
  }

  if (callbackData === 'w:caa') {
    if (!payload.detectedCounterAgentId) {
      await sendAck('Контрагент не найден');
      return true;
    }
    payload.selectedCounterAgentId = payload.detectedCounterAgentId;
    payload.servicePage = 1;
    payload.serviceSearchQuery = '';
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck('Выбран найденный контрагент');
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:ca:')) {
    const absoluteIndex = Number(callbackData.split(':')[2]);
    const all = sortDetectedFirst(Array.isArray(payload.availableCounterAgents) ? payload.availableCounterAgents : []);
    const selected = all[absoluteIndex];
    if (!selected) {
      await sendAck('Контрагент не найден');
      return true;
    }
    payload.selectedCounterAgentId = selected.id;
    payload.servicePage = 1;
    payload.serviceSearchQuery = '';
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck('Контрагент выбран');
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:sp:')) {
    const page = Number(callbackData.split(':')[2]);
    payload.servicePage = Number.isFinite(page) ? page : 1;
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck();
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData.startsWith('w:st:')) {
    const token = callbackData.split(':')[2];
    const service = payload.serviceTokenMap?.[token];
    if (!service) {
      await sendAck('Список устарел');
      await renderServicesStep(chatId, employeeId, ctx, 'Список обновлен, выберите услугу снова.');
      return true;
    }
    payload.selectedServices = toggleService(payload.selectedServices, service);
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck();
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData === 'w:ss') {
    setConversation(chatId, { ...conversation, step: 'service_search', payload }, ctx);
    await sendAck('Введите текст');
    await ctx.sendMessage(chatId, 'Введите строку поиска (название или цену). Чтобы вернуть полный список, отправьте "-"');
    return true;
  }

  if (callbackData === 'w:sc') {
    payload.serviceSearchQuery = '';
    payload.servicePage = 1;
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck('Поиск очищен');
    await renderServicesStep(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData === 'w:sr') {
    const lastWashServices = Array.isArray(payload.lastWashServices) ? payload.lastWashServices : [];
    let selectedServices = Array.isArray(payload.selectedServices) ? payload.selectedServices : [];
    for (const service of lastWashServices) {
      if (!selectedServices.some((item) => item.serviceName === service.serviceName)) {
        selectedServices.push({
          serviceName: service.serviceName,
          price: Number(service.price || 0),
          chemicalConsumption: service.chemicalConsumption,
          isCustom: Boolean(service.isCustom),
        });
      }
    }
    payload.selectedServices = selectedServices;
    setConversation(chatId, { ...conversation, step: 'service_browse', payload }, ctx);
    await sendAck('Добавлено');
    await renderServicesStep(chatId, employeeId, ctx, 'Услуги из прошлой мойки добавлены.');
    return true;
  }

  if (callbackData === 'w:su') {
    if (!payload.allowCustomServices) {
      await sendAck('Недоступно');
      return true;
    }
    setConversation(chatId, { ...conversation, step: 'custom_service_name', payload }, ctx);
    await sendAck('Введите название');
    await ctx.sendMessage(chatId, 'Введите название произвольной услуги.');
    return true;
  }

  if (callbackData === 'w:sd') {
    const selectedServices = Array.isArray(payload.selectedServices) ? payload.selectedServices : [];
    if (selectedServices.length === 0) {
      await sendAck('Нужно выбрать услугу');
      await renderServicesStep(chatId, employeeId, ctx, 'Сначала выберите хотя бы одну услугу.');
      return true;
    }
    setConversation(chatId, { ...conversation, step: 'comment', payload }, ctx);
    await sendAck();
    await renderCommentStep(chatId, ctx);
    return true;
  }

  if (callbackData === 'w:cm') {
    payload.comment = '';
    setConversation(chatId, { ...conversation, step: 'confirm', payload }, ctx);
    await sendAck();
    await renderConfirmStep(chatId, ctx);
    return true;
  }

  if (callbackData === 'w:cf') {
    await sendAck('Сохраняю');
    await submitWash(chatId, employeeId, ctx);
    return true;
  }

  if (callbackData === 'w:oc:confirm') {
    const ocrPlate = payload.ocrPlateNumber;
    if (!ocrPlate) {
      await sendAck('Номер не найден');
      await renderVehicleStep(chatId, ctx, 'Не удалось найти распознанный номер. Введите вручную.');
      return true;
    }
    // Сохраняем успешный OCR-сэмпл для обучения (фото + подтверждённый номер)
    if (payload.ocrImageBase64) {
      try {
        await savePendingOcrCorrection(ctx, { ...payload, ocrPendingCorrection: true }, employeeId, ocrPlate);
      } catch (e) {
        console.error('[TG-BOT] Failed to save confirmed OCR sample:', e);
      }
    }
    clearOcrPayload(payload);
    setConversation(chatId, { ...conversation, payload }, ctx);
    await sendAck('Принято');
    await handleDetectedVehicle(chatId, employeeId, ocrPlate, ctx);
    return true;
  }

  if (callbackData === 'w:oc:edit') {
    // НЕ сохраняем фото сейчас — ждём пока пользователь введёт правильный номер
    // Оставляем ocrImageBase64 и ocrPlateNumber в payload чтобы потом сохранить с correctedOcr
    payload.ocrPendingCorrection = true; // флаг: ожидаем исправленный номер
    setConversation(chatId, { ...conversation, step: 'vehicle_input', payload }, ctx);
    await sendAck('Введите номер вручную');
    await renderVehicleStep(chatId, ctx, 'Введите правильный номер вручную или отправьте новое фото.');
    return true;
  }

  await sendAck('Неизвестное действие');
  return true;
}
