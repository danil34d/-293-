export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { CounterAgent } from '@/types';
import { invalidateCounterAgentsCache, getCounterAgentImpact } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, deleteEntity, readEntity } from '@/lib/data/write-helpers';

// GET request handler for a specific counter agent
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
  }

  try {
    const data = await readEntity<CounterAgent>('counterAgent', id);
    if (!data) {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Error reading counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// PUT request handler (for updating or creating data)
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required for PUT' }, { status: 400 });
  }

  try {
    const updatedData: CounterAgent = await request.json();
    const existingData = await readEntity<CounterAgent>('counterAgent', id);

    // Ensure the ID in the body matches the ID in the path, or set it if not present
    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }

    if (existingData) {
      if (updatedData.archived === undefined) {
        updatedData.archived = existingData.archived;
      }

      if (updatedData.archivedAt === undefined) {
        updatedData.archivedAt = existingData.archivedAt;
      }

      // Phase 25a / V2-#7 README: server-side audit enforcement.
      // Balance НЕ должен меняться через PUT — только через
      // POST /api/client-transactions/[counterAgentId] (создаёт ClientTransaction
      // с audit-меткой). Сохраняем существующий balance, игнорируем входящий.
      // Это закрывает «обход audit» — старый UI мог отправить balance в Edit-форме.
      const incomingBalance = (updatedData as any).balance;
      const existingBalance = (existingData as any).balance ?? 0;
      if (incomingBalance !== undefined && Number(incomingBalance) !== Number(existingBalance)) {
        console.warn(
          `[counter-agents PUT] Попытка изменить balance ${existingBalance} → ${incomingBalance} ` +
          `для ${id} (admin: ${auth.id}). Игнорирую — используйте POST /api/client-transactions/${id} для платежа.`
        );
      }
      (updatedData as any).balance = existingBalance;
    }

    await saveEntity('counterAgent', updatedData);
    invalidateCounterAgentsCache();
    return NextResponse.json({ message: 'Data updated successfully', agent: updatedData });
  } catch (error) {
    console.error(`Error writing counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required for PATCH' }, { status: 400 });
  }

  try {
    const existingData = await readEntity<CounterAgent>('counterAgent', id);
    if (!existingData) {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }

    const patch = await request.json();
    if (typeof patch.archived !== 'boolean') {
      return NextResponse.json({ error: 'Field "archived" must be boolean' }, { status: 400 });
    }

    const updatedData: CounterAgent = {
      ...existingData,
      archived: patch.archived,
      archivedAt: patch.archived ? (existingData.archivedAt || new Date().toISOString()) : undefined,
    };

    await saveEntity('counterAgent', updatedData);
    invalidateCounterAgentsCache();

    return NextResponse.json({
      message: patch.archived ? 'Counter agent archived successfully' : 'Counter agent restored successfully',
      agent: updatedData,
    });
  } catch (error) {
    console.error(`Error patching counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE request handler
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Agent ID is required for DELETE' }, { status: 400 });
  }

  try {
    const existingData = await readEntity<CounterAgent>('counterAgent', id);
    if (!existingData) {
      return NextResponse.json({ error: 'Counter agent not found' }, { status: 404 });
    }

    if (!existingData.archived) {
      return NextResponse.json(
        { error: 'Сначала перенесите контрагента в архив, затем удаляйте окончательно.' },
        { status: 409 }
      );
    }

    // Phase 7 / Finding #25: pre-check на каскадные связи + rateSource.
    // Без этого DELETE молча обнулит counterAgentId в WashEvent (SetNull),
    // удалит ClientTransaction каскадом и сломает ZP по схемам с этим rateSource.
    const impact = await getCounterAgentImpact(id);
    const hasHistory =
      impact.washEvents > 0 ||
      impact.clientTransactions > 0 ||
      impact.schemesUsingAsRateSource.length > 0;

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';

    if (hasHistory && !force) {
      return NextResponse.json({
        error: 'У контрагента есть история. Удаление каскадно затронет связанные записи.',
        impact,
        cascadeWarning: impact.clientTransactions > 0
          ? `ClientTransaction × ${impact.clientTransactions} будет УДАЛЕНО каскадно`
          : null,
        suggestForce: true,
      }, { status: 409 });
    }

    await deleteEntity('counterAgent', id);
    invalidateCounterAgentsCache();
    return NextResponse.json({ message: 'Counter agent deleted successfully', impact });
  } catch (error: any) {
    console.error(`Error deleting counter agent data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
