export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getSetting, setSetting } from '@/lib/db/ai-database';
import { encryptSecret, isEncrypted, isEncryptionAvailable } from '@/lib/crypto/secret-encryption';

/**
 * Phase 61 / АРХ-5: Migration endpoint — перешифровывает существующие plain секреты
 * в SQLite (data/ai-assistant.db) в формат enc:v1:... (AES-256-GCM).
 *
 * Условия:
 *   - admin-сессия (requireAdmin)
 *   - AI_KEY_ENCRYPTION_SECRET должен быть задан (иначе 400)
 *
 * Поведение:
 *   - Перебирает «секретные» ключи из SECRET_KEYS
 *   - Если значение пустое — skip
 *   - Если уже зашифровано (isEncrypted) — skip
 *   - Иначе encryptSecret + setSetting
 *
 * Idempotent — безопасно вызывать многократно.
 *
 * Использование:
 *   curl -X POST http://192.168.1.150:3000/api/admin/encrypt-secrets \
 *     -H 'Cookie: employee_auth_sim=...'
 */

const SECRET_KEYS = [
  'glm_api_key',
  // future: добавлять сюда другие секретные ключи (openai_api_key, telegram_bot_token, ...)
];

export async function POST() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!isEncryptionAvailable()) {
    return NextResponse.json({
      error: 'AI_KEY_ENCRYPTION_SECRET не задан или невалидный формат.',
      hint: 'Сгенерируйте: openssl rand -hex 32. Задайте env-переменную и рестартните сервис.',
    }, { status: 400 });
  }

  const result = {
    encrypted: 0,
    skipped: 0,
    empty: 0,
    errors: [] as Array<{ key: string; error: string }>,
    keys: {} as Record<string, 'encrypted' | 'already-encrypted' | 'empty' | 'error'>,
  };

  for (const key of SECRET_KEYS) {
    try {
      const value = getSetting(key);
      if (value === null || value === undefined || value === '') {
        result.empty += 1;
        result.keys[key] = 'empty';
        continue;
      }
      if (typeof value !== 'string') {
        result.errors.push({ key, error: `Ожидался string, получен ${typeof value}` });
        result.keys[key] = 'error';
        continue;
      }
      if (isEncrypted(value)) {
        result.skipped += 1;
        result.keys[key] = 'already-encrypted';
        continue;
      }
      const ciphertext = encryptSecret(value);
      setSetting(key, ciphertext);
      result.encrypted += 1;
      result.keys[key] = 'encrypted';
    } catch (err: any) {
      result.errors.push({ key, error: err?.message || String(err) });
      result.keys[key] = 'error';
    }
  }

  return NextResponse.json({
    ok: result.errors.length === 0,
    ...result,
  });
}
