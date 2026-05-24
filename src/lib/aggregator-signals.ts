import type { Aggregator, WashEvent } from '@/types';
import type { AgentSignal } from './counter-agent-signals';

/**
 * Phase 43 / V2-#10 deferred: computeAggregatorSignals.
 * Симметрично Phase 42 для агрегаторов. Reuse тип AgentSignal.
 *
 * Отличия от counter-agent:
 *  - priceLists вместо priceList: может быть несколько прайсов, должен быть active
 *  - companies опционально (агрегаторы реже юр-лица)
 *  - debt-критичность те же, но контекст другой (агрегатор берёт комиссию, не платит)
 */

export type { AgentSignal };

const DAY = 24 * 60 * 60 * 1000;

function daysSince(iso: string | undefined | null): number {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Infinity;
  return Math.floor((Date.now() - t) / DAY);
}

function formatMoney(n: number): string {
  return n.toLocaleString('ru-RU');
}

function formatMoneyShort(n: number): string {
  if (n >= 1000) return Math.round(n / 1000) + 'к';
  return String(Math.round(n));
}

export function computeAggregatorSignals(
  aggregator: Aggregator,
  washEvents: WashEvent[] = []
): AgentSignal[] {
  const signals: AgentSignal[] = [];

  const balance = Number(aggregator.balance ?? 0);
  const cars = aggregator.cars || [];
  const priceLists = aggregator.priceLists || [];
  const activeName = aggregator.activePriceListName;

  // ─── Balance signals ───
  // Для агрегатора balance < 0 = «они нам должны» (выручка не получена)
  if (balance < -50000) {
    signals.push({
      id: 'debt-critical',
      level: 'critical',
      label: `Не получено ${formatMoneyShort(Math.abs(balance))}`,
      description: `Агрегатор не перечислил ${formatMoney(Math.abs(balance))} ₽ за прошедшие мойки — критичный остаток. Проверьте расчёт.`,
    });
  } else if (balance < -20000) {
    signals.push({
      id: 'debt-large',
      level: 'warn',
      label: `Не получено ${formatMoneyShort(Math.abs(balance))}`,
      description: `Агрегатор не перечислил ${formatMoney(Math.abs(balance))} ₽. Контролируйте сроки выплат.`,
    });
  } else if (balance > 30000) {
    signals.push({
      id: 'prepayment-high',
      level: 'info',
      label: `Переплата ${formatMoneyShort(balance)}`,
      description: `Перевели ${formatMoney(balance)} ₽ больше, чем услуг — большой запас, можно уточнить.`,
    });
  }

  // ─── Activity signals ───
  const aggWashes = washEvents.filter((e) => e.sourceId === aggregator.id && !e.refundedAt);
  const lastWashAt = aggWashes
    .map((e) => e.timestamp)
    .filter(Boolean)
    .sort((a, b) => (b || '').localeCompare(a || ''))[0];
  const daysInactive = daysSince(lastWashAt);

  if (aggWashes.length === 0) {
    signals.push({
      id: 'no-washes-ever',
      level: 'info',
      label: 'Без моек',
      description: 'У этого агрегатора ещё не было моек. Возможно, недавно добавлен.',
    });
  } else if (daysInactive > 90) {
    signals.push({
      id: 'inactive-90d',
      level: 'warn',
      label: `Неактивен ${daysInactive} дн`,
      description: `Последняя мойка ${daysInactive} дн назад. Возможно, агрегатор перестал направлять клиентов.`,
    });
  } else if (daysInactive > 60) {
    signals.push({
      id: 'inactive-60d',
      level: 'info',
      label: `Тишина ${daysInactive} дн`,
      description: `Последняя мойка ${daysInactive} дн назад. Активность снизилась.`,
    });
  }

  // ─── Pricing configuration ───
  if (priceLists.length === 0) {
    signals.push({
      id: 'no-price-lists',
      level: 'critical',
      label: 'Нет прайсов',
      description: 'У агрегатора не настроено ни одного прайс-листа. Невозможно оформить мойку — нужно создать.',
    });
  } else if (!activeName) {
    signals.push({
      id: 'no-active-price',
      level: 'warn',
      label: 'Прайс не активирован',
      description: 'Прайсы есть, но ни один не помечен активным. Workstation использует первый по списку.',
    });
  } else if (!priceLists.some((p) => p.name === activeName)) {
    signals.push({
      id: 'active-price-missing',
      level: 'critical',
      label: 'Активный прайс битый',
      description: `Поле activePriceListName="${activeName}" не соответствует ни одному прайсу в списке. Workstation может упасть.`,
    });
  }

  // ─── Data completeness ───
  if (cars.length === 0) {
    signals.push({
      id: 'no-cars',
      level: 'info',
      label: 'Нет машин',
      description: 'У агрегатора не привязаны автомобили автопарка. Камеры не смогут автоматически идентифицировать.',
    });
  }

  // ─── Sort: critical → warn → info, alpha by label ───
  const levelOrder: Record<AgentSignal['level'], number> = { critical: 0, warn: 1, info: 2 };
  signals.sort((a, b) => {
    const diff = levelOrder[a.level] - levelOrder[b.level];
    if (diff !== 0) return diff;
    return a.label.localeCompare(b.label, 'ru');
  });

  return signals;
}
