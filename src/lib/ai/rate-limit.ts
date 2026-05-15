/**
 * Phase 18 / finding #22: AI rate-limit + cost-cap.
 *
 * In-memory sliding window rate-limiter для AI endpoints. Single-instance
 * Next.js (carwash так и работает) — Map хранится в process memory.
 *
 * Лимиты управляются через env:
 *  - AI_RATE_LIMIT_PER_HOUR (default 100) — глобальный лимит на 1 employeeId
 *  - AI_RATE_LIMIT_DAILY_TOTAL (default 1000) — глобальный лимит для всех
 *
 * При превышении возвращается 429 Too Many Requests с Retry-After header.
 *
 * Для cost-cap (рублёвый лимит): нужна интеграция с GLM/OpenAI
 * usage-tracking → fed in incrementCallCost(employeeId, rub). Пока
 * не реализовано — финансовый контроль через rate-limit (приближение).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const PER_HOUR_LIMIT = Number(process.env.AI_RATE_LIMIT_PER_HOUR) || 100;
const DAILY_TOTAL_LIMIT = Number(process.env.AI_RATE_LIMIT_DAILY_TOTAL) || 1000;

// employeeId → timestamps (ms)
const callsByEmployee = new Map<string, number[]>();
// глобальный счётчик для daily total
const allCalls: number[] = [];

function pruneOlder(arr: number[], cutoff: number): number[] {
  // эффективный sweep слева
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  return i > 0 ? arr.slice(i) : arr;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingHour: number;
  remainingDay: number;
  /** Seconds to wait before next allowed call (если allowed=false). */
  retryAfter?: number;
  reason?: 'per-employee-hour' | 'global-daily';
}

/**
 * Проверяет rate-limit и инкрементирует счётчик если allowed=true.
 * Best-effort — при exception возвращает allowed=true (fail-open для устойчивости).
 */
export function checkAndIncrementAIQuota(employeeId: string): RateLimitResult {
  try {
    const now = Date.now();
    const hourCutoff = now - HOUR_MS;
    const dayCutoff = now - DAY_MS;

    // Prune
    const empCalls = pruneOlder(callsByEmployee.get(employeeId) ?? [], hourCutoff);
    callsByEmployee.set(employeeId, empCalls);

    // Prune global (in-place ok-ish, но slice для safety)
    let i = 0;
    while (i < allCalls.length && allCalls[i] < dayCutoff) i++;
    if (i > 0) allCalls.splice(0, i);

    // Check per-employee hour
    if (empCalls.length >= PER_HOUR_LIMIT) {
      const oldestRelevant = empCalls[0];
      const retryAfter = Math.ceil((oldestRelevant + HOUR_MS - now) / 1000);
      return {
        allowed: false,
        remainingHour: 0,
        remainingDay: Math.max(0, DAILY_TOTAL_LIMIT - allCalls.length),
        retryAfter,
        reason: 'per-employee-hour',
      };
    }

    // Check global daily
    if (allCalls.length >= DAILY_TOTAL_LIMIT) {
      const oldestRelevant = allCalls[0];
      const retryAfter = Math.ceil((oldestRelevant + DAY_MS - now) / 1000);
      return {
        allowed: false,
        remainingHour: Math.max(0, PER_HOUR_LIMIT - empCalls.length),
        remainingDay: 0,
        retryAfter,
        reason: 'global-daily',
      };
    }

    // Allow + increment
    empCalls.push(now);
    allCalls.push(now);

    return {
      allowed: true,
      remainingHour: PER_HOUR_LIMIT - empCalls.length,
      remainingDay: DAILY_TOTAL_LIMIT - allCalls.length,
    };
  } catch (err) {
    // Fail-open
    console.error('[ai-rate-limit] check failed:', err);
    return { allowed: true, remainingHour: -1, remainingDay: -1 };
  }
}

/** Snapshot для UI / monitoring. */
export function getAIQuotaStats(): {
  perEmployeeLimit: number;
  dailyTotalLimit: number;
  activeEmployees: number;
  callsLastHour: number;
  callsLastDay: number;
} {
  const now = Date.now();
  const hourCutoff = now - HOUR_MS;
  const callsLastHour = allCalls.filter(t => t >= hourCutoff).length;
  return {
    perEmployeeLimit: PER_HOUR_LIMIT,
    dailyTotalLimit: DAILY_TOTAL_LIMIT,
    activeEmployees: callsByEmployee.size,
    callsLastHour,
    callsLastDay: allCalls.length,
  };
}
