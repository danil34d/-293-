import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/ai-database';
import { requireAdmin } from '@/lib/server-auth';

/**
 * Phase 19 / finding #5 АРХ-НАХОДКИ: AI API key безопасность.
 *
 * Раньше: ключ ProxyAPI хранился в SQLite (data/ai-assistant.db) plain text.
 * Утечка БД = утечка ключа = чужой счёт за GPT-4o-mini.
 *
 * Решение: env-переменная `GLM_API_KEY` имеет ПРИОРИТЕТ над БД (см. glm-client.ts:116).
 * Этот endpoint теперь:
 *  - Возвращает `keySource: 'env' | 'db' | 'none'` чтобы UI понимал откуда ключ
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

    return NextResponse.json({
      glmApiKeySet: keySource !== 'none',
      keySource, // 'env' | 'db' | 'none'
      keySourceWarning: keySource === 'db'
        ? 'Ключ хранится в SQLite plain text. Рекомендуется перенести в env-переменную GLM_API_KEY (она имеет приоритет).'
        : keySource === 'env'
          ? null
          : 'Ключ не настроен. Введите либо в этой форме (storage: SQLite), либо лучше через env GLM_API_KEY.',
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
          setSetting('glm_api_key', glmApiKey);
          warnings.push('Ключ сохранён в SQLite plain text. Для бо́льшей безопасности — перенесите в env GLM_API_KEY и удалите из формы.');
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
    return NextResponse.json({
      ok: true,
      glmApiKeySet: keySource !== 'none',
      keySource,
      aiBaseUrl: process.env.AI_BASE_URL || getSetting('ai_base_url') || 'https://openai.api.proxyapi.ru',
      aiModel: process.env.AI_MODEL || getSetting('ai_model') || 'gpt-4o-mini',
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    console.error('Failed to update AI settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
