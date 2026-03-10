import { NextRequest, NextResponse } from 'next/server';
import { getBackgroundAnalyses } from '@/lib/db/ai-database';
import { triggerAnalysis } from '@/lib/ai/cron-scheduler';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-assistant/background-analyses
 * Get background analyses
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as 'pending' | 'processing' | 'completed' | 'failed' | null;
    const isNotified = searchParams.get('is_notified');
    const limit = searchParams.get('limit');

    const params: any = {};
    if (status) params.status = status;
    if (isNotified !== null) params.isNotified = isNotified === 'true';
    if (limit) params.limit = parseInt(limit);

    const analyses = getBackgroundAnalyses(params);

    return NextResponse.json({
      success: true,
      data: analyses,
      total: analyses.length,
    });
  } catch (error: any) {
    console.error('[API] Error getting background analyses:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-assistant/background-analyses
 * Manually trigger a background analysis
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { type } = body;

    if (!type || !['daily_summary', 'employee_performance', 'anomaly_detection'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'Invalid analysis type' },
        { status: 400 }
      );
    }

    // Trigger analysis in background (don't wait for completion)
    triggerAnalysis(type).catch(error => {
      console.error(`[API] Background analysis ${type} failed:`, error);
    });

    return NextResponse.json({
      success: true,
      message: `Analysis ${type} triggered successfully`,
    });
  } catch (error: any) {
    console.error('[API] Error triggering background analysis:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
