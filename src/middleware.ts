import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'employee_auth_sim';
const DEFAULT_SECRET = 'zorin-carwash-dev-secret-change-in-production';

const PUBLIC_PATHS = [
  '/login',
  '/wallboard',
];

const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/wallboard',
  '/api/device-heartbeat',
];

function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/static/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.(png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot|css|js|map)$/i.test(pathname)
  );
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p + '/'))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  return false;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}

async function verifyCookieSignature(signedValue: string, secret: string): Promise<boolean> {
  const dotIndex = signedValue.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const encoded = signedValue.substring(0, dotIndex);
  const signatureHex = signedValue.substring(dotIndex + 1);

  const sigBytes = hexToBytes(signatureHex);
  if (!sigBytes) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, enc.encode(encoded));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname) || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.COOKIE_SECRET || DEFAULT_SECRET;

  let authorized = false;
  if (cookie) {
    try {
      authorized = await verifyCookieSignature(cookie, secret);
    } catch {
      authorized = false;
    }
  }

  if (authorized) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/' && pathname !== '/login') {
    loginUrl.searchParams.set('next', pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
