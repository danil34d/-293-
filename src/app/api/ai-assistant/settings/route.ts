import { NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db/ai-database';
import { requireAdmin } from '@/lib/server-auth';

export async function GET() {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const glmApiKey = getSetting('glm_api_key');
    const aiBaseUrl = getSetting('ai_base_url') || 'https://openai.api.proxyapi.ru';
    const aiModel = getSetting('ai_model') || 'gpt-4o-mini';
    return NextResponse.json({
      glmApiKeySet: !!glmApiKey,
      aiBaseUrl,
      aiModel,
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

    // API Key
    if ('glmApiKey' in body) {
      const glmApiKey = typeof body.glmApiKey === 'string' ? body.glmApiKey.trim() : '';
      if (!glmApiKey) {
        setSetting('glm_api_key', null);
      } else {
        setSetting('glm_api_key', glmApiKey);
      }
    }

    // Base URL
    if ('aiBaseUrl' in body) {
      const aiBaseUrl = typeof body.aiBaseUrl === 'string' ? body.aiBaseUrl.trim() : '';
      setSetting('ai_base_url', aiBaseUrl || null);
    }

    // Model
    if ('aiModel' in body) {
      const aiModel = typeof body.aiModel === 'string' ? body.aiModel.trim() : '';
      setSetting('ai_model', aiModel || null);
    }

    const glmApiKey = getSetting('glm_api_key');
    return NextResponse.json({
      ok: true,
      glmApiKeySet: !!glmApiKey,
      aiBaseUrl: getSetting('ai_base_url') || 'https://openai.api.proxyapi.ru',
      aiModel: getSetting('ai_model') || 'gpt-4o-mini',
    });
  } catch (error: any) {
    console.error('Failed to update AI settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
