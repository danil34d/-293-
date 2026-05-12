/**
 * GET /api/app-version
 *
 * Используется UpdateChecker.java в APK для проверки наличия обновлений.
 *
 * Определение flavor (kiosk / personal):
 *   1. ?flavor= query параметр (для тестов через curl)
 *   2. User-Agent: WebView Android содержит applicationId
 *      - kiosk APK   → "com.carwash.local.kiosk"
 *      - personal APK → "com.carwash.local" (без .kiosk)
 *   3. Fallback: kiosk (исторически первый)
 *
 * Ответ:
 *   {
 *     "versionCode": 12,
 *     "versionName": "1.6.1",
 *     "apkUrl": "/api/download/kiosk",     // ⚠ ВАЖНО: apkUrl, не downloadUrl (читается UpdateChecker.java:120)
 *     "releaseNotes": "...",
 *     "forceUpdate": false                  // если true, диалог "позже" не предлагается
 *   }
 *
 * 404 если AppConfig['appVersion'] пуст или нет варианта для запрошенного flavor.
 * Endpoint открытый (UpdateChecker может вызывать без auth).
 */
import { NextRequest } from 'next/server';
import { getAppVersion } from '@/lib/data';

export const dynamic = 'force-dynamic';

type Flavor = 'kiosk' | 'personal';

interface FlavorVersion {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releaseNotes?: string;
  forceUpdate?: boolean;
}

function detectFlavor(req: NextRequest): Flavor {
  // 1. Explicit query parameter
  const q = req.nextUrl.searchParams.get('flavor');
  if (q === 'kiosk' || q === 'personal') return q;

  // 2. User-Agent (Android WebView включает applicationId)
  //    Пример: "Mozilla/5.0 (Linux; Android 13; ...) ... com.carwash.local.kiosk/1.0"
  //            или "... com.carwash.local/1.0"
  const ua = req.headers.get('user-agent') || '';
  if (ua.includes('com.carwash.local.kiosk')) return 'kiosk';
  if (ua.includes('com.carwash.local')) return 'personal';

  // 3. Fallback
  return 'kiosk';
}

export async function GET(request: NextRequest) {
  try {
    const flavor = detectFlavor(request);
    const config = (await getAppVersion()) as Record<Flavor, FlavorVersion> | null;
    if (!config) {
      return Response.json(
        { error: 'No app version configured (AppConfig.appVersion is empty)', flavor },
        { status: 404 },
      );
    }
    const version = config[flavor];
    if (!version) {
      return Response.json(
        { error: `No version configured for flavor '${flavor}'`, flavor },
        { status: 404 },
      );
    }
    return Response.json(version);
  } catch (e) {
    console.error('[app-version] error', e);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
