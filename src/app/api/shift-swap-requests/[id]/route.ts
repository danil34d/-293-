export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  getShiftSwapRequestById,
  invalidateShiftSwapRequestsCache
} from '@/lib/data-loader';
import { requireAuth } from '@/lib/server-auth';
import { respondSwapRequest } from '@/services/shift-swap-service';
import { ServiceError } from '@/services/service-error';
import { isEmployeeAdmin } from '@/lib/employee-role';

const dataDir = path.join(process.cwd(), 'data', 'shift-swap-requests');

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const swapRequest = await getShiftSwapRequestById(id);
    if (!swapRequest) {
      return NextResponse.json({ error: 'Shift swap request not found' }, { status: 404 });
    }
    return NextResponse.json(swapRequest);
  } catch (error) {
    console.error('Error reading shift swap request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    if (body?.status !== 'accepted' && body?.status !== 'rejected') {
      return NextResponse.json({ error: 'Некорректный статус заявки' }, { status: 400 });
    }

    const updated = await respondSwapRequest({
      requestId: id,
      decision: body.status,
      actorId: auth.id,
      isAdmin: isEmployeeAdmin(auth),
    });

    return NextResponse.json({ message: 'Shift swap request updated successfully', request: updated });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating shift swap request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const filePath = path.join(dataDir, `${id}.json`);

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: 'Shift swap request not found' }, { status: 404 });
    }

    await fs.unlink(filePath);
    invalidateShiftSwapRequestsCache();

    return NextResponse.json({ message: 'Shift swap request deleted successfully' });
  } catch (error) {
    console.error('Error deleting shift swap request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
