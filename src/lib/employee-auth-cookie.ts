import { serialize } from 'cookie';

const EMPLOYEE_AUTH_COOKIE_NAME = 'employee_auth_sim';
const EMPLOYEE_AUTH_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 7;

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
  return serialize(EMPLOYEE_AUTH_COOKIE_NAME, value, {
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
