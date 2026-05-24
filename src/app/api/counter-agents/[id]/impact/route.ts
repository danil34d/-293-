export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-auth';
import { getCounterAgentById, getCounterAgentImpact } from '@/lib/data';

/**
 * GET /api/counter-agents/[id]/impact
 *
 * Pre-check для UI перед DELETE / Archive counter-agent. Возвращает счётчики
 * каскадных связей + список SalaryScheme.rateSource ссылающихся на этого
 * контрагента (закрытие finding #25).
 *
 * См. также `/api/aggregators/[id]/impact` — симметричный endpoint.
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
    return NextResponse.json({ error: 'Counter-agent ID is required' }, { status: 400 });
  }

  try {
    const agent = await getCounterAgentById(id);
    if (!agent) {
      return NextResponse.json({ error: 'Counter-agent not found' }, { status: 404 });
    }
    const impact = await getCounterAgentImpact(id);
    const hasHistory =
      impact.washEvents > 0 ||
      impact.clientTransactions > 0 ||
      impact.schemesUsingAsRateSource.length > 0;

    return NextResponse.json({
      counterAgentId: id,
      name: agent.name,
      archived: agent.archived ?? false,
      impact,
      hasHistory,
      cascadeWarning: impact.clientTransactions > 0
        ? `ClientTransaction × ${impact.clientTransactions} будет удалено КАСКАДОМ (потеряется история платежей)`
        : null,
    });
  } catch (error: any) {
    console.error(`Error fetching counter-agent impact ${id}:`, error);
    return NextResponse.json(
      { error: error.message ?? 'Internal Server Error' },
      { status: 500 }
    );
  }
}
