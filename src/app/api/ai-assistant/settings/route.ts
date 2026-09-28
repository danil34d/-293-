import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/ai-database';
import { requireAdmin } from '@/lib/server-auth';
import { encryptSecret, isEncrypted, isEncryptionAvailable } from '@/lib/crypto/secret-encryption';

/**
 * Phase 19 / finding #5 АРХ-НАХОДКИ: AI API key безопасность.
 * Phase 61 / АРХ-5: encryption-at-rest для ключа в SQLite.
 *
 * Раньше: ключ ProxyAPI хранился в SQLite (data/ai-assistant.db) plain text.
 * Утечка БД = утечка ключа = чужой счёт за GPT-4o-mini.
 *
 * Решение:
 *  - env-переменная `GLM_API_KEY` имеет ПРИОРИТЕТ над БД (см. glm-client.ts:116).
 *  - Phase 61: при записи в БД ключ шифруется AES-256-GCM (master key — AI_KEY_ENCRYPTION_SECRET).
 *    Backward compat: старые plain значения читаются как есть (decryptSecret no-op для plain).
 *
 * Этот endpoint:
 *  - Возвращает `keySource: 'env' | 'db' | 'none'` чтобы UI понимал откуда ключ
 *  - Возвращает `encryptedAtRest: boolean` — реально ли DB-значение зашифровано
 *  - Возвращает `encryptionAvailable: boolean` — задан ли master key (для UI hint'а)
 *  - При PUT с env-ключом — пишет warning в response + не сохраняет в БД (нет смысла)
 *  - getSetting НЕ возвращает сам ключ в response (только boolean — было и раньше)
 */

function getKeySource(): 'env' | 'db' | 'none' {
  if (process.env.GLM_API_KEY) return 'env';
  if (getSetting('glm_api_key')) return 'db';
  return 'none';
}

export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const aiBaseUrl = process.env.AI_BASE_URL || getSetting('ai_base_url') || 'https://openai.api.proxyapi.ru';
    const aiModel = process.env.AI_MODEL || getSetting('ai_model') || 'gpt-4o-mini';
    const keySource = getKeySource();

    // Phase 61: проверяем, зашифрован ли DB-ключ в действительности (а не только что master key задан).
    const dbKeyRaw = getSetting('glm_api_key');
    const encryptedAtRest = keySource === 'db' && isEncrypted(dbKeyRaw);
    const encryptionAvailable = isEncryptionAvailable();

    // Сообщение для UI — теперь зависит от encryptedAtRest.
    let keySourceWarning: string | null;
    if (keySource === 'env') {
      keySourceWarning = null;
    } else if (keySource === 'db') {
      if (encryptedAtRest) {
        keySourceWarning = null; // ключ в SQLite, но зашифрован — норм
      } else if (encryptionAvailable) {
        keySourceWarning = 'Ключ в SQLite в plain text. Master key задан — вызовите POST /api/admin/encrypt-secrets чтобы перешифровать.';
      } else {
        keySourceWarning = 'Ключ в SQLite в plain text. Установите env AI_KEY_ENCRYPTION_SECRET или перенесите ключ в env GLM_API_KEY (env имеет приоритет).';
      }
    } else {
      keySourceWarning = 'Ключ не настроен. Введите либо в этой форме (storage: SQLite), либо лучше через env GLM_API_KEY.';
    }

    return NextResponse.json({
      glmApiKeySet: keySource !== 'none',
      keySource, // 'env' | 'db' | 'none'
      encryptedAtRest, // Phase 61: реально ли DB-значение зашифровано
      encryptionAvailable, // Phase 61: задан ли валидный master key
      keySourceWarning,
      aiBaseUrl,
      aiModel,
      // Индикатор, откуда взяты прочие настройки (для прозрачности)
      baseUrlSource: process.env.AI_BASE_URL ? 'env' : (getSetting('ai_base_url') ? 'db' : 'default'),
      modelSource: process.env.AI_MODEL ? 'env' : (getSetting('ai_model') ? 'db' : 'default'),
    });
  } catch (error: any) {
    console.error('Failed to get AI settings:', error);
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const warnings: string[] = [];

    // API Key
    if ('glmApiKey' in body) {
      const glmApiKey = typeof body.glmApiKey === 'string' ? body.glmApiKey.trim() : '';

      // Phase 19: если env-ключ установлен — отказываем в записи в БД
      // (env имеет приоритет в glm-client.ts:116, запись бы дублировала и запутала).
      if (process.env.GLM_API_KEY) {
        warnings.push('GLM_API_KEY установлен в env — он имеет приоритет. Изменение в форме не сохранено. Чтобы сменить ключ, обновите env-переменную и рестартните сервис.');
      } else {
        if (!glmApiKey) {
          setSetting('glm_api_key', null);
        } else {
          // Phase 61: шифруем перед записью. Если master key не задан — encryptSecret вернёт plain
          // (с warning в консоль), это сохраняет backward compat для dev-окружения.
          const toStore = encryptSecret(glmApiKey);
          setSetting('glm_api_key', toStore);
          if (isEncryptionAvailable()) {
            warnings.push('Ключ зашифрован (AES-256-GCM) и сохранён в SQLite.');
          } else {
            warnings.push('Ключ сохранён в SQLite plain text (AI_KEY_ENCRYPTION_SECRET не задан). Сгенерируйте master key (openssl rand -hex 32) и перешифруйте через POST /api/admin/encrypt-secrets.');
          }
        }
      }
    }

    // Base URL
    if ('aiBaseUrl' in body) {
      const aiBaseUrl = typeof body.aiBaseUrl === 'string' ? body.aiBaseUrl.trim() : '';
      if (process.env.AI_BASE_URL) {
        warnings.push('AI_BASE_URL установлен в env — он имеет приоритет.');
      } else {
        setSetting('ai_base_url', aiBaseUrl || null);
      }
    }

    // Model
    if ('aiModel' in body) {
      const aiModel = typeof body.aiModel === 'string' ? body.aiModel.trim() : '';
      if (process.env.AI_MODEL) {
        warnings.push('AI_MODEL установлен в env — он имеет приоритет.');
      } else {
        setSetting('ai_model', aiModel || null);
      }
    }

    const keySource = getKeySource();
    const dbKeyRaw = getSetting('glm_api_key');
    const encryptedAtRest = keySource === 'db' && isEncrypted(dbKeyRaw);
    return NextResponse.json({
      ok: true,
      glmApiKeySet: keySource !== 'none',
      keySource,
      encryptedAtRest,
      encryptionAvailable: isEncryptionAvailable(),
      aiBaseUrl: process.env.AI_BASE_URL || getSetting('ai_base_url') || 'https://openai.api.proxyapi.ru',
      aiModel: process.env.AI_MODEL || getSetting('ai_model') || 'gpt-4o-mini',
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    console.error('Failed to update AI settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
