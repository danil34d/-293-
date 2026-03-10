import { NextResponse } from 'next/server';
import crypto from 'crypto';

export function requireTelegramInternalAuth(request: Request): true | NextResponse {
  const expectedSecret = process.env.TELEGRAM_BOT_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json({ error: 'Telegram bot secret is not configured' }, { status: 503 });
  }

  const providedSecret = request.headers.get('x-telegram-bot-secret')?.trim();
  if (!providedSecret) {
    return NextResponse.json({ error: 'Unauthorized bot request' }, { status: 401 });
  }

  // Use timing-safe comparison to prevent timing attacks
  const expected = Buffer.from(expectedSecret, 'utf-8');
  const provided = Buffer.from(providedSecret, 'utf-8');
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: 'Unauthorized bot request' }, { status: 401 });
  }

  return true;
}
