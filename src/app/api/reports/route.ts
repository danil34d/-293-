export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getReportsData, createReport } from '@/lib/data';
import { generateReportTitle } from '@/lib/utils/report-title';
import { generatePerformanceReport } from '@/ai/flows/generate-performance-report';
import { checkAndIncrementAIQuota } from '@/lib/ai/rate-limit';

/**
 * GET /api/reports?status=&periodFrom=&periodTo=
 *
 * Phase 23: список сохранённых AI-отчётов с фильтрами. requireAdmin.
 */
export async function GET(request: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const filters = {
      status: searchParams.get('status') ?? undefined,
      periodFrom: searchParams.get('periodFrom') ?? undefined,
      periodTo: searchParams.get('periodTo') ?? undefined,
    };
    const reports = await getReportsData(filters);
    return NextResponse.json(reports);
  } catch (error: any) {
    console.error('Error fetching reports:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/reports
 *
 * Phase 23: генерация AI-отчёта + сохранение.
 * Body: { periodStart, periodEnd, question?, title?, preview? }
 *
 * Workflow:
 *  1. AI flow generatePerformanceReport(period, question) → markdown
 *  2. Если preview=true — вернуть markdown без сохранения
 *  3. Иначе — сохранить в БД через createReport + auto-title по периоду
 *
 * Дефолтный prompt: "Сгенерируй аналитический отчёт по производительности за указанный период."
 */
export async function POST(request: NextRequest) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { periodStart, periodEnd, question, title, preview } = body;

    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'periodStart, periodEnd обязательны' },
        { status: 400 }
      );
    }

    const startDate = new Date(periodStart);
    const endDate = new Date(periodEnd);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return NextResponse.json({ error: 'Неверный формат дат' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: 'periodStart должен быть ≤ periodEnd' }, { status: 400 });
    }

    const prompt = (question && String(question).trim()) ||
      'Сгенерируй аналитический отчёт по производительности за указанный период.';

    // Phase 24c / V2-#13 / finding #5 АРХ: AI quota check ПЕРЕД вызовом Gemini.
    // Защищает от cost spike (Gemini Flash ~$0.002/call, 1000 вызовов = $2,
    // но если кто-то запустит loop — может вылететь в $50+).
    const quotaCheck = checkAndIncrementAIQuota(auth.id);
    if (!quotaCheck.allowed) {
      return NextResponse.json({
        error: `AI квота исчерпана (${quotaCheck.reason === 'global-daily' ? 'дневной лимит мойки' : 'часовой лимит на пользователя'}). Повторите через ${Math.ceil((quotaCheck.retryAfter ?? 0) / 60)} мин.`,
        retryAfter: quotaCheck.retryAfter,
        remainingHour: quotaCheck.remainingHour,
        remainingDay: quotaCheck.remainingDay,
      }, {
        status: 429,
        headers: { 'Retry-After': String(quotaCheck.retryAfter ?? 60) },
      });
    }

    // Step 1: generate via AI flow
    const aiResult = await generatePerformanceReport({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      question: prompt,
    });

    if (!aiResult?.reportMarkdown) {
      return NextResponse.json({ error: 'AI вернул пустой отчёт' }, { status: 502 });
    }

    // Preview mode — без сохранения
    if (preview === true) {
      return NextResponse.json({
        preview: {
          title: title?.trim() || generateReportTitle(startDate, endDate),
          periodStart: startDate.toISOString(),
          periodEnd: endDate.toISOString(),
          reportMarkdown: aiResult.reportMarkdown,
          prompt,
        },
      });
    }

    // Step 2: save
    const report = await createReport({
      title: title?.trim() || undefined,
      periodStart: startDate,
      periodEnd: endDate,
      reportMarkdown: aiResult.reportMarkdown,
      prompt,
      usage: { model: 'gemini-1.5-flash-latest' },
      createdByEmployeeId: auth.id,
    });

    return NextResponse.json({ message: 'Report created', report }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating report:', error);
    return NextResponse.json({ error: error.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
