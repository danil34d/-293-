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

  const kind: 'plate' | 'plate_crop' | 'thumbnail' =
    kindParam === 'plate_crop' ? 'plate_crop' : kindParam === 'plate' ? 'plate' : 'thumbnail';

  try {
    const response = await fetch(getCameraSessionAssetUrl(box, dirName, kind), {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `camera asset not found: ${kind}` },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=30',
      },
    });
  } catch (error: any) {
    console.error('GET /api/camera-session-media error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load camera asset' },
      { status: 500 },
    );
  }
}
