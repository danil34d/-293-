export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getAggregatorById, getAggregatorImpact } from '@/lib/data';

/**
 * GET /api/aggregators/[id]/impact
 *
 * Pre-check для UI перед DELETE / Archive aggregator. Возвращает счётчики
 * каскадных связей + список SalaryScheme.rateSource ссылающихся на этот agg
 * (закрытие finding #25).
 *
 * UI должен показать:
 *  - Сколько WashEvent потеряет связь (SetNull)
 *  - Сколько ClientTransaction будет удалено каскадно (Cascade!)
 *  - Какие SalaryScheme сломаются (rateSource на этого agg)
 *
 * Auth: requireAdmin.
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Aggregator ID is required' }, { status: 400 });
  }

  try {
    const aggregator = await getAggregatorById(id);
    if (!aggregator) {
      return NextResponse.json({ error: 'Aggregator not found' }, { status: 404 });
    }
    const impact = await getAggregatorImpact(id);
    const hasHistory =
      impact.washEvents > 0 ||
      impact.clientTransactions > 0 ||
      impact.schemesUsingAsRateSource.length > 0;

    return NextResponse.json({
      aggregatorId: id,
      name: aggregator.name,
      archived: aggregator.archived ?? false,
      impact,
      hasHistory,
      cascadeWarning: impact.clientTransactions > 0
        ? `ClientTransaction × ${impact.clientTransactions} будет удалено КАСКАДОМ (потеряется история платежей)`
        : null,
    });
  } catch (error: any) {
    console.error(`Error fetching aggregator impact ${id}:`, error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}
