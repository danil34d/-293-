import { serialize } from 'cookie';
import crypto from 'crypto';

const EMPLOYEE_AUTH_COOKIE_NAME = 'employee_auth_sim';
const EMPLOYEE_AUTH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

// HMAC секрет — берём из .env или используем дефолт для разработки
function getHmacSecret(): string {
  return process.env.COOKIE_SECRET || 'zorin-carwash-dev-secret-change-in-production';
}

/**
 * Подписывает значение cookie через HMAC-SHA256.
 * Формат: base64(payload).signature
 */
export function signCookieValue(payload: string): string {
  const encoded = Buffer.from(payload, 'utf-8').toString('base64');
  const signature = crypto
    .createHmac('sha256', getHmacSecret())
    .update(encoded)
    .digest('hex');
  return `${encoded}.${signature}`;
}

/**
 * Проверяет подпись и возвращает оригинальный payload или null.
 */
export function verifyCookieValue(signedValue: string): string | null {
  const dotIndex = signedValue.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const encoded = signedValue.substring(0, dotIndex);
  const signature = signedValue.substring(dotIndex + 1);

  const expectedSignature = crypto
    .createHmac('sha256', getHmacSecret())
    .update(encoded)
    .digest('hex');

  // Timing-safe сравнение для защиты от timing-атак
  if (signature.length !== expectedSignature.length) return null;
  const sigBuf = Buffer.from(signature, 'hex');
  const expectedBuf = Buffer.from(expectedSignature, 'hex');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function getSecureCookieOverride(): boolean | null {
  const raw = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export function shouldUseSecureEmployeeAuthCookie(request: Request): boolean {
  const override = getSecureCookieOverride();
  if (override !== null) {
    return override;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === 'https';
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function serializeEmployeeAuthCookie(request: Request, value: string): string {
  const signed = signCookieValue(value);
  return serialize(EMPLOYEE_AUTH_COOKIE_NAME, signed, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureEmployeeAuthCookie(request),
    maxAge: EMPLOYEE_AUTH_COOKIE_MAX_AGE_SEC,
  });
}

export function serializeClearedEmployeeAuthCookie(request: Request): string {
  return serialize(EMPLOYEE_AUTH_COOKIE_NAME, '', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureEmployeeAuthCookie(request),
    expires: new Date(0),
  });
}
