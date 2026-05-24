export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';

const REQUIRED_CONFIRM_PHRASE = 'УДАЛИТЬ ВСЁ';

/**
 * POST /api/system/db-wipe
 *
 * Phase 30a / V2-#17 «Полный сброс БД» (critical-level, phrase 'УДАЛИТЬ ВСЁ').
 *
 * ⚠ ЭТО ENDPOINT-STUB ⚠
 *
 * Полное удаление БД (включая Employee, CounterAgent, Aggregator, SalaryScheme,
 * AppConfig) — слишком разрушительная операция чтобы выполняться по HTTP.
 * Возвращает 501 Not Implemented + инструкцию владельцу — делать вручную:
 *
 *   ssh carwash
 *   pg_dump > backup.sql   # backup ОБЯЗАТЕЛЬНО
 *   psql -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
 *   cd /srv/carwash/app && DATA_SOURCE=postgres npx prisma db push
 *   sudo systemctl restart carwash-web
 *
 * Phrase + body validation сохранены чтобы UI вёл себя одинаково — но реальное
 * удаление не происходит. Аудит в journalctl.
 */
export async function POST(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: any = {};
  try { body = await request.json(); } catch { /* empty body */ }
  if (!body?.confirmPhrase || String(body.confirmPhrase).trim() !== REQUIRED_CONFIRM_PHRASE) {
    console.warn(`[system/db-wipe] Phrase validation failed. Admin: ${auth.id}, got: "${body?.confirmPhrase}"`);
    return NextResponse.json({
      error: `Защита: body должен содержать confirmPhrase="${REQUIRED_CONFIRM_PHRASE}".`,
    }, { status: 400 });
  }

  // Если phrase ОК — всё равно не удаляем. Логируем + отвечаем 501.
  console.warn(`[system/db-wipe] Attempt with valid phrase by admin ${auth.id} (${auth.fullName}) at ${new Date().toISOString()} — STUB, not executed`);

  return NextResponse.json({
    error: 'Полный сброс БД не выполняется через HTTP — это слишком опасно. Сделайте вручную:',
    instructions: [
      'ssh carwash',
      'pg_dump $DATABASE_URL > /tmp/carwash_backup_$(date +%Y%m%d_%H%M%S).sql',
      'psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"',
      'cd /srv/carwash/app && DATA_SOURCE=postgres npx prisma db push',
      'sudo systemctl restart carwash-web',
    ],
    hint: 'После выполнения БД станет как при первом запуске. Этот endpoint умышленно не выполняет операцию — только подсказывает что делать.',
  }, { status: 501 });
}
