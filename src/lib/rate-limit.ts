/**
 * Простой in-memory rate-limiter с фиксированным окном.
 *
 * Используется для защиты login-эндпоинта от брутфорса. После N неудач
 * за окно W миллисекунд клиент получает блок до конца окна.
 *
 * Особенности:
 * - Хранение в памяти процесса (не выживает рестарт). Для одного инстанса
 *   carwash-web достаточно. При шардировании — заменить на Redis.
 * - Ключ — произвольная строка (обычно `${ip}::${username}` для login).
 *
 * Контракт:
 * - check(key) → проверить статус БЕЗ инкремента (использовать перед verify)
 * - consumeFailure(key) → увеличить счётчик после неудачной попытки
 * - clear(key) → сбросить счётчик после успеха
 */

export interface RateLimitConfig {
  windowMs: number;
  maxFailures: number;
}

export interface RateLimitResult {
  blocked: boolean;
  retryAfterSec: number;
}

interface RateEntry {
  count: number;
  firstAt: number;
}

export class RateLimiter {
  private map = new Map<string, RateEntry>();

  constructor(private config: RateLimitConfig) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry) return { blocked: false, retryAfterSec: 0 };
    if (now - entry.firstAt >= this.config.windowMs) {
      this.map.delete(key);
      return { blocked: false, retryAfterSec: 0 };
    }
    if (entry.count > this.config.maxFailures) {
      return {
        blocked: true,
        retryAfterSec: Math.max(1, Math.ceil((entry.firstAt + this.config.windowMs - now) / 1000)),
      };
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  consumeFailure(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.map.get(key);
    if (!entry || now - entry.firstAt >= this.config.windowMs) {
      this.map.set(key, { count: 1, firstAt: now });
      return { blocked: false, retryAfterSec: 0 };
    }
    entry.count += 1;
    if (entry.count > this.config.maxFailures) {
      return {
        blocked: true,
        retryAfterSec: Math.max(1, Math.ceil((entry.firstAt + this.config.windowMs - now) / 1000)),
      };
    }
    return { blocked: false, retryAfterSec: 0 };
  }

  clear(key: string): void {
    this.map.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}
