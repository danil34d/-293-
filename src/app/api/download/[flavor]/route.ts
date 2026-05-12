/**
 * GET /api/download/[flavor]
 *
 * Стримит APK для скачивания. Используется:
 * - UpdateChecker.java через apkUrl из /api/app-version
 * - Прямая ссылка для раздачи (QR-код, Telegram-бот)
 *
 * APK файлы лежат на сервере в:
 *   ${APK_DOWNLOAD_ROOT}/{flavor}/{flavor}-latest.apk
 *   default APK_DOWNLOAD_ROOT = /srv/carwash/apk
 *
 * Endpoint открытый — не требует auth. APK подписаны keystore, на этом и
 * держится безопасность (никто не может подменить APK без приватного ключа).
 */
import { NextRequest } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const APK_ROOT = process.env.APK_DOWNLOAD_ROOT || '/srv/carwash/apk';
const ALLOWED_FLAVORS = new Set(['kiosk', 'personal']);

export async function GET(
  request: NextRequest,
  { params }: { params: { flavor: string } },
) {
  const flavor = params.flavor;
  if (!ALLOWED_FLAVORS.has(flavor)) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const apkPath = path.join(APK_ROOT, flavor, `${flavor}-latest.apk`);
    const buf = await fs.readFile(apkPath);
    const filename = `carwash-${flavor}.apk`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (e) {
    console.error(`[download/${flavor}] file not found:`, e);
    return new Response('APK not available yet', { status: 404 });
  }
}
