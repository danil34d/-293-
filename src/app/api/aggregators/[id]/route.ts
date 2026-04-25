export const dynamic = "force-dynamic";


import { NextResponse } from 'next/server';
import type { Aggregator } from '@/types';
import { invalidateAggregatorsCache } from '@/lib/data';
import { requireAdmin } from '@/lib/server-auth';
import { saveEntity, deleteEntity, readEntity } from '@/lib/data/write-helpers';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Aggregator ID is required' }, { status: 400 });
  }

  try {
    const data = await readEntity<Aggregator>('aggregator', id);
    if (!data) {
      return NextResponse.json({ error: 'Aggregator not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error: any) {
    console.error(`Error reading aggregator data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Aggregator ID is required for PUT' }, { status: 400 });
  }

  try {
    const updatedData: Aggregator = await request.json();

    if (!updatedData.id || updatedData.id !== id) {
        updatedData.id = id;
    }

    await saveEntity('aggregator', updatedData);
    invalidateAggregatorsCache();
    return NextResponse.json({ message: 'Data updated successfully', aggregator: updatedData });
  } catch (error) {
    console.error(`Error writing aggregator data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Aggregator ID is required for DELETE' }, { status: 400 });
  }

  try {
    const existing = await readEntity('aggregator', id);
    if (!existing) {
      return NextResponse.json({ error: 'Aggregator not found' }, { status: 404 });
    }
    await deleteEntity('aggregator', id);
    invalidateAggregatorsCache();
    return NextResponse.json({ message: 'Aggregator deleted successfully' });
  } catch (error: any) {
    console.error(`Error deleting aggregator data for ID ${id}:`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
