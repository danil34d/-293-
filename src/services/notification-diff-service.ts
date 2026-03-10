import type {
  TelegramEmployeeSnapshot,
  TelegramNotificationEvent,
  TelegramShiftSnapshotItem,
  TelegramSwapRequestSnapshotItem,
  TelegramAssignmentRequestSnapshotItem,
  TelegramTransactionSnapshotItem,
  TelegramWashSnapshotItem,
} from '@/types/telegram-bot';

function buildEventId(type: TelegramNotificationEvent['type'], entityId: string, version: string): string {
  return `${type}:${entityId}:${version}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function mapById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function hasShiftChanged(prev: TelegramShiftSnapshotItem, curr: TelegramShiftSnapshotItem): boolean {
  return prev.signature !== curr.signature;
}

function hasSwapChanged(prev: TelegramSwapRequestSnapshotItem, curr: TelegramSwapRequestSnapshotItem): boolean {
  return prev.status !== curr.status || prev.resolvedAt !== curr.resolvedAt;
}

function hasAssignmentChanged(prev: TelegramAssignmentRequestSnapshotItem, curr: TelegramAssignmentRequestSnapshotItem): boolean {
  return prev.status !== curr.status || prev.resolvedAt !== curr.resolvedAt;
}

function sortEvents(events: TelegramNotificationEvent[]): TelegramNotificationEvent[] {
  return events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

function statusToRu(status: string): string {
  const map: Record<string, string> = {
    accepted: 'одобрена',
    rejected: 'отклонена',
    cancelled: 'отменена',
    pending: 'на рассмотрении',
  };
  return map[status] || status;
}

function statusToIcon(status: string): string {
  const map: Record<string, string> = {
    accepted: '✅',
    rejected: '❌',
    cancelled: '⚪',
    pending: '🟡',
  };
  return map[status] || '📨';
}

function shiftTypeToRu(shiftType: string): string {
  return shiftType === 'day' ? 'дневная' : 'ночная';
}

function paymentToRu(method: string): string {
  const map: Record<string, string> = {
    cash: 'наличные',
    card: 'карта',
    transfer: 'перевод',
    aggregator: 'агрегатор',
    counterAgentContract: 'контрагент',
  };
  return map[method] || method;
}

function transactionTypeToRu(type: string): string {
  const map: Record<string, string> = {
    payment: 'Выплата',
    bonus: 'Премия',
    loan: 'Долг',
    purchase: 'Покупка',
    debt_write_off: 'Списание долга',
    earning: 'Начисление',
  };
  return map[type] || type;
}

function formatDateShort(dateStr: string): string {
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${months[d.getMonth()]} (${days[d.getDay()]})`;
}

export function buildEmployeeEvents(previousState: TelegramEmployeeSnapshot, currentState: TelegramEmployeeSnapshot): TelegramNotificationEvent[] {
  const events: TelegramNotificationEvent[] = [];
  const employeeId = currentState.employeeId;

  // --- Shifts ---
  const prevShifts = mapById(previousState.shifts);
  const currShifts = mapById(currentState.shifts);
  for (const shift of currentState.shifts) {
    const prev = prevShifts.get(shift.id);
    const dateLabel = formatDateShort(shift.date);
    const typeLabel = shiftTypeToRu(shift.shiftType);
    if (!prev) {
      const version = shift.signature;
      events.push({
        id: buildEventId('shift_assigned', shift.id, version),
        type: 'shift_assigned',
        employeeId,
        occurredAt: currentState.generatedAt,
        title: '📅 Вам назначена смена',
        message: `${dateLabel}, бокс ${shift.boxNumber}, ${typeLabel}`,
        entityId: shift.id,
        meta: { date: shift.date, boxNumber: shift.boxNumber, shiftType: shift.shiftType },
      });
      continue;
    }

    if (hasShiftChanged(prev, shift)) {
      const version = shift.signature;
      events.push({
        id: buildEventId('shift_updated', shift.id, version),
        type: 'shift_updated',
        employeeId,
        occurredAt: currentState.generatedAt,
        title: '🛠 Смена изменена',
        message: `${dateLabel}, бокс ${shift.boxNumber}, ${typeLabel}`,
        entityId: shift.id,
        meta: { date: shift.date, boxNumber: shift.boxNumber, shiftType: shift.shiftType },
      });
    }
  }

  for (const prevShift of previousState.shifts) {
    if (!currShifts.has(prevShift.id)) {
      const version = prevShift.signature;
      const dateLabel = formatDateShort(prevShift.date);
      events.push({
        id: buildEventId('shift_removed', prevShift.id, version),
        type: 'shift_removed',
        employeeId,
        occurredAt: currentState.generatedAt,
        title: '❌ Смена снята',
        message: `Ваша смена ${dateLabel}, бокс ${prevShift.boxNumber} была снята`,
        entityId: prevShift.id,
        meta: { date: prevShift.date, boxNumber: prevShift.boxNumber, shiftType: prevShift.shiftType },
      });
    }
  }

  // --- Swap requests ---
  const prevSwapRequests = mapById(previousState.swapRequests);
  for (const request of currentState.swapRequests) {
    const prev = prevSwapRequests.get(request.id);
    const actionLabel = request.type === 'swap' ? 'обмен' : 'передачу';
    if (!prev && request.status === 'pending' && request.targetEmployeeId === employeeId) {
      events.push({
        id: buildEventId('incoming_swap_request', request.id, request.createdAt),
        type: 'incoming_swap_request',
        employeeId,
        occurredAt: request.createdAt || currentState.generatedAt,
        title: '🔔 Новая заявка — нужен ваш ответ',
        message: `Коллега предлагает ${actionLabel} смены.\nОтветьте кнопками ниже.`,
        entityId: request.id,
        meta: {
          requestId: request.id,
          requestType: request.type,
          requesterId: request.requesterId,
        },
      });
    } else if (prev && hasSwapChanged(prev, request) && request.requesterId === employeeId) {
      const version = `${request.status}:${request.resolvedAt || request.createdAt}`;
      const icon = statusToIcon(request.status);
      const statusLabel = statusToRu(request.status);
      events.push({
        id: buildEventId('request_status_changed', request.id, version),
        type: 'request_status_changed',
        employeeId,
        occurredAt: request.resolvedAt || currentState.generatedAt,
        title: `${icon} Заявка на ${actionLabel} смены — ${statusLabel}`,
        message: request.status === 'accepted'
          ? 'Ваша заявка одобрена, смена передана.'
          : request.status === 'rejected'
            ? 'Коллега отклонил вашу заявку.'
            : `Статус заявки: ${statusLabel}.`,
        entityId: request.id,
        meta: { requestId: request.id, requestType: request.type, status: request.status },
      });
    }
  }

  // --- Assignment requests ---
  const prevAssignmentRequests = mapById(previousState.assignmentRequests);
  for (const request of currentState.assignmentRequests) {
    const prev = prevAssignmentRequests.get(request.id);
    if (prev && hasAssignmentChanged(prev, request)) {
      const version = `${request.status}:${request.resolvedAt || request.createdAt}`;
      const dateLabel = formatDateShort(request.date);
      const typeLabel = shiftTypeToRu(request.shiftType);
      const icon = statusToIcon(request.status);
      const statusLabel = statusToRu(request.status);
      events.push({
        id: buildEventId('request_status_changed', request.id, version),
        type: 'request_status_changed',
        employeeId,
        occurredAt: request.resolvedAt || currentState.generatedAt,
        title: `${icon} Запрос на смену — ${statusLabel}`,
        message: request.status === 'accepted'
          ? `Вам назначена смена: ${dateLabel}, бокс ${request.boxNumber}, ${typeLabel}`
          : request.status === 'rejected'
            ? `Запрос на ${dateLabel}, бокс ${request.boxNumber} отклонён`
            : `Запрос на ${dateLabel}, бокс ${request.boxNumber}: ${statusLabel}`,
        entityId: request.id,
        meta: {
          requestId: request.id,
          requestType: 'assignment',
          status: request.status,
          date: request.date,
          shiftType: request.shiftType,
          boxNumber: request.boxNumber,
        },
      });
    }
  }

  // --- Finance transactions ---
  const prevTransactions = mapById(previousState.transactions);
  for (const transaction of currentState.transactions) {
    if (!prevTransactions.has(transaction.id)) {
      const typeLabel = transactionTypeToRu(transaction.type);
      const amountFormatted = transaction.amount.toLocaleString('ru-RU');
      const description = transaction.description ? `\n${transaction.description}` : '';
      events.push({
        id: buildEventId('finance_transaction', transaction.id, transaction.date || isoNow()),
        type: 'finance_transaction',
        employeeId,
        occurredAt: transaction.date || currentState.generatedAt,
        title: `💰 ${typeLabel}: ${amountFormatted} руб.`,
        message: description ? description.trim() : `${typeLabel} на сумму ${amountFormatted} руб.`,
        entityId: transaction.id,
        meta: { transactionType: transaction.type, amount: transaction.amount },
      });
    }
  }

  // --- Wash events ---
  const prevWashes = mapById(previousState.washEvents);
  for (const washEvent of currentState.washEvents) {
    if (!prevWashes.has(washEvent.id)) {
      const amountFormatted = washEvent.totalAmount.toLocaleString('ru-RU');
      const payLabel = paymentToRu(washEvent.paymentMethod);
      events.push({
        id: buildEventId('wash_event', washEvent.id, washEvent.timestamp),
        type: 'wash_event',
        employeeId,
        occurredAt: washEvent.timestamp || currentState.generatedAt,
        title: '🚗 Мойка записана',
        message: `Авто: ${washEvent.vehicleNumber}\nСумма: ${amountFormatted} руб.\nОплата: ${payLabel}`,
        entityId: washEvent.id,
        meta: {
          vehicleNumber: washEvent.vehicleNumber,
          totalAmount: washEvent.totalAmount,
          paymentMethod: washEvent.paymentMethod,
        },
      });
    }
  }

  return sortEvents(events);
}

