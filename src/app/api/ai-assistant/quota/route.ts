export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getAIQuotaStats } from '@/lib/ai/rate-limit';

/**
 * GET /api/ai-assistant/quota
 *
 * Phase 18 / finding #22: snapshot AI quota stats для UI бейджа.
 * Возвращает лимиты + использование за час/день.
 *
 * Auth: requireAuth (любой залогиненный).
 */
export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(getAIQuotaStats());
}
