import type { CounterAgent, WashEvent } from '@/types';

/**
 * Phase 42 / V2-#7 deferred: computeAgentSignals.
 *
 * Анализирует CounterAgent + связанные WashEvent и возвращает массив
 * derived "сигналов" для UI: цветные бэйджи рядом с именем агента + полный
 * список в expand-карточке. Сигналы — read-only, без write-эффектов.
 *
 * Принцип: только сигналы, имеющие смысл в business-разговоре с админом.
 * Не «debug» уровни типа «id длинный».
 */

export type SignalLevel = 'critical' | 'warn' | 'info';

export interface AgentSignal {
  /** Стабильный id сигнала (для key= в React) */
  id: string;
  level: SignalLevel;
  /** Короткая надпись для бэйджа (макс 24 символа) */
  label: string;
  /** Расшифровка для tooltip / expanded view */
  description: string;
}

const DAY = 24 * 60 * 60 * 1000;

function daysSince(iso: string | undefined | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / DAY);
}

/**
 * Вычисляет сигналы для одного агента.
 *
 * @param agent — counter-agent (со всеми его cars / companies / balance)
 * @param washEvents — все WashEvent (отфильтруем сами по `sourceId === agent.id`)
 * @returns массив сигналов отсортированных от critical → warn → info, потом по label
 */
export function computeAgentSignals(
  agent: CounterAgent,
  washEvents: WashEvent[] = []
): AgentSignal[] {
  const signals: AgentSignal[] = [];

  const balance = Number(agent.balance ?? 0);
  const cars = agent.cars || [];
  const companies = agent.companies || [];
  const priceList = agent.priceList || [];

  // ─── Balance signals ───
  if (balance < -50000) {
    signals.push({
      id: 'debt-critical',
      level: 'critical',
      label: `Долг ${formatMoneyShort(Math.abs(balance))}`,
      description: `Контрагент должен ${formatMoney(Math.abs(balance))} ₽ — критичный долг. Стоит выставить счёт или позвонить.`,
    });
  } else if (balance < -20000) {
    signals.push({
      id: 'debt-large',
      level: 'warn',
      label: `Долг ${formatMoneyShort(Math.abs(balance))}`,
      description: `Контрагент должен ${formatMoney(Math.abs(balance))} ₽. Не критично, но стоит контролировать.`,
    });
  } else if (balance > 30000) {
    signals.push({
      id: 'prepayment-high',
      level: 'info',
      label: `Предоплата ${formatMoneyShort(balance)}`,
      description: `У контрагента предоплата ${formatMoney(balance)} ₽ — большой запас. Можно обсудить мойки или возврат.`,
    });
  }

  // ─── Activity signals (по WashEvent) ───
  const agentWashes = washEvents.filter((e) => e.sourceId === agent.id && !e.refundedAt);
  const lastWashAt = agentWashes
    .map((e) => e.timestamp)
    .filter(Boolean)
    .sort((a, b) => (b || '').localeCompare(a || ''))[0];
  const daysInactive = daysSince(lastWashAt);

  if (agentWashes.length === 0) {
    signals.push({
      id: 'no-washes-ever',
      level: 'info',
      label: 'Без моек',
      description: 'У этого контрагента ещё не было моек. Возможно, новый клиент.',
    });
  } else if (daysInactive > 90) {
    signals.push({
      id: 'inactive-90d',
      level: 'warn',
      label: `Неактивен ${daysInactive} дн`,
      description: `Последняя мойка ${daysInactive} дн назад. Возможно, клиент ушёл — стоит написать.`,
    });
  } else if (daysInactive > 60) {
    signals.push({
      id: 'inactive-60d',
      level: 'info',
      label: `Тишина ${daysInactive} дн`,
      description: `Последняя мойка ${daysInactive} дн назад. Активность снизилась.`,
    });
  }

  // ─── Data completeness signals ───
  if (cars.length === 0) {
    signals.push({
      id: 'no-cars',
      level: 'info',
      label: 'Нет машин',
      description: 'У контрагента не привязаны автомобили. Камеры не смогут автоматически идентифицировать его машины.',
    });
  }

  if (priceList.length === 0) {
    signals.push({
      id: 'no-pricing',
      level: 'info',
      label: 'Прайс не настроен',
      description: 'У контрагента нет специального прайса. Будет использован розничный.',
    });
  }

  if (companies.length === 0) {
    signals.push({
      id: 'no-companies',
      level: 'warn',
      label: 'Нет реквизитов',
      description: 'У контрагента не заполнены ИНН/КПП/адрес — без них нельзя выставить счёт.',
    });
  }

  // ─── Sort: critical → warn → info, then alpha by label ───
  const levelOrder: Record<SignalLevel, number> = { critical: 0, warn: 1, info: 2 };
  signals.sort((a, b) => {
    const diff = levelOrder[a.level] - levelOrder[b.level];
    if (diff !== 0) return diff;
    return a.label.localeCompare(b.label, 'ru');
  });

  return signals;
}

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU');
}

function formatMoneyShort(n: number): string {
  if (n >= 1000) return Math.round(n / 1000) + 'к';
  return String(Math.round(n));
}

// ─── UI helpers ───

export const SIGNAL_COLORS: Record<SignalLevel, { bg: string; text: string; border: string }> = {
  critical: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  warn:     { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  info:     { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
};
