import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';

const CAMERA_DASHBOARD_BASE_URL =
  process.env.CAMERA_DASHBOARD_BASE_URL?.trim() || 'http://192.168.1.59:8050';

function getCameraSessionAssetUrl(box: number, dirName: string, kind: 'plate' | 'plate_crop' | 'thumbnail') {
  const filename = kind === 'plate_crop' ? 'plate_crop.jpg' : kind === 'plate' ? 'plate.jpg' : 'thumbnail.jpg';
  return `${CAMERA_DASHBOARD_BASE_URL}/media/box${box}/${encodeURIComponent(dirName)}/${filename}`;
}

export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const boxParam = String(searchParams.get('box') || '').trim();
  const dirName = String(searchParams.get('dirName') || '').trim();
  const kindParam = String(searchParams.get('kind') || 'thumbnail').trim().toLowerCase();

  if (!dirName) {
    return NextResponse.json({ error: 'dirName is required' }, { status: 400 });
  }

  const box = boxParam === '2' ? 2 : boxParam === '1' ? 1 : 0;
  if (!box) {
    return NextResponse.json({ error: 'box must be 1 or 2' }, { status: 400 });
  }

  const requested: 'plate' | 'plate_crop' | 'thumbnail' =
    kindParam === 'plate_crop' ? 'plate_crop' : kindParam === 'plate' ? 'plate' : 'thumbnail';

  // Fallback chain: если запрошенный asset не найден (часто бывает что
  // OCR не успел/не смог сделать plate.jpg, но thumbnail.jpg всегда есть)
  // — пробуем альтернативы, чтобы UI не падал в 404 на /workstation.
  const fallbackChain: Record<typeof requested, Array<typeof requested>> = {
    plate: ['plate', 'plate_crop', 'thumbnail'],
    plate_crop: ['plate_crop', 'plate', 'thumbnail'],
    thumbnail: ['thumbnail', 'plate_crop', 'plate'],
  };

  const chain = fallbackChain[requested];
  let lastStatus = 404;
  let lastError: string | null = null;

  for (const kind of chain) {
    try {
      const response = await fetch(getCameraSessionAssetUrl(box, dirName, kind), {
        cache: 'no-store',
      });

      if (!response.ok) {
        lastStatus = response.status;
        lastError = `camera asset not found: ${kind} (${response.status})`;
        // 404 → пробуем следующий kind. Любой другой статус (5xx, 502)
        // — тоже пробуем дальше: вдруг хоть thumbnail отдадут.
        continue;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await response.arrayBuffer();

      return new NextResponse(arrayBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=30',
          // Сообщаем клиенту, какой kind реально отдали (для отладки UI).
          'X-Asset-Kind': kind,
          'X-Asset-Requested': requested,
        },
      });
    } catch (error: any) {
      lastError = error?.message || 'Failed to load camera asset';
      lastStatus = 500;
      // network error — тоже пробуем следующий kind
      continue;
    }
  }

  // Все варианты исчерпаны — отдаём ошибку.
  console.error(
    `GET /api/camera-session-media: all fallbacks failed for box=${box} dir=${dirName} requested=${requested}: ${lastError}`,
  );
  return NextResponse.json(
    { error: lastError || `camera asset not found: ${requested}`, requested },
    { status: lastStatus === 502 ? 502 : 404 },
  );
}
