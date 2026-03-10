import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundAnalysis, updateBackgroundAnalysis } from '@/lib/db/ai-database';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-assistant/background-analyses/[id]
 * Get a specific background analysis
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const analysis = getBackgroundAnalysis(id);

    if (!analysis) {
      return NextResponse.json(
        { success: false, error: 'Analysis not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error: any) {
    console.error('[API] Error getting background analysis:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ai-assistant/background-analyses/[id]
 * Update a background analysis (e.g., mark as read)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const { is_notified } = body;

    const analysis = getBackgroundAnalysis(id);
    if (!analysis) {
      return NextResponse.json(
        { success: false, error: 'Analysis not found' },
        { status: 404 }
      );
    }

    updateBackgroundAnalysis(id, {
      is_notified: is_notified !== undefined ? is_notified : undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Analysis updated successfully',
    });
  } catch (error: any) {
    console.error('[API] Error updating background analysis:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
