import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CAMERA_STREAM_BASE_URL =
  process.env.CAMERA_STREAM_BASE_URL?.trim() || 'http://192.168.1.59:8050';

const BOX_CAMERA_MAP: Record<number, string | undefined> = {
  1: 'front',
};

const FORWARDED_QUERY_PARAMS = [
  'stream',
  'width',
  'quality',
  'fps',
  'crop',
  'cy1',
  'cy2',
  'cx1',
  'cx2',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: { box: string } }
) {
  const box = Number(params.box);
  if (!Number.isInteger(box) || ![1, 2].includes(box)) {
    return NextResponse.json({ error: 'Unknown box' }, { status: 400 });
  }

  const cameraName = BOX_CAMERA_MAP[box];
  if (!cameraName) {
    return NextResponse.json(
      { error: `Camera sub stream is not configured for box ${box}` },
      { status: 404 }
    );
  }

  const upstreamUrl = new URL(`/stream/${cameraName}`, CAMERA_STREAM_BASE_URL);

  for (const key of FORWARDED_QUERY_PARAMS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) {
      upstreamUrl.searchParams.set(key, value);
    }
  }

  if (!upstreamUrl.searchParams.has('stream')) {
    upstreamUrl.searchParams.set('stream', 'sub');
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      cache: 'no-store',
    });

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const details = await upstreamResponse.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Camera stream upstream failed',
          status: upstreamResponse.status,
          details,
        },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set(
      'Content-Type',
      upstreamResponse.headers.get('content-type') ||
        'multipart/x-mixed-replace; boundary=frame'
    );
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    headers.set('Connection', 'keep-alive');

    return new Response(upstreamResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Camera stream is unavailable',
        details: error instanceof Error ? error.message : 'unknown_error',
      },
      { status: 502 }
    );
  }
}
