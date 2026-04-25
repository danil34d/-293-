export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import {
  getShiftAssignmentRequestsData,
  invalidateShiftAssignmentRequestsCache
} from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';
import { resolveAssignmentRequest } from '@/services/shift-assignment-service';
import { ServiceError } from '@/services/service-error';
import { isEmployeeAdmin } from '@/lib/employee-role';
import { deleteEntity } from '@/lib/data/write-helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const requests = await getShiftAssignmentRequestsData();
    const assignmentRequest = requests.find(r => r.id === id);

    if (!assignmentRequest) {
      return NextResponse.json({ error: 'Shift assignment request not found' }, { status: 404 });
    }
    return NextResponse.json(assignmentRequest);
  } catch (error) {
    console.error('Error reading shift assignment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const body = await request.json();
    const status = body?.status;
    if (status !== 'accepted' && status !== 'rejected' && status !== 'cancelled') {
      return NextResponse.json({ error: 'Некорректный статус запроса' }, { status: 400 });
    }

    const updatedRequest = await resolveAssignmentRequest({
      requestId: id,
      status,
      actorId: auth.id,
      isAdmin: isEmployeeAdmin(auth),
    });

    return NextResponse.json({ message: 'Shift assignment request updated successfully', request: updatedRequest });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error updating shift assignment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const requests = await getShiftAssignmentRequestsData();
    const existing = requests.find(r => r.id === id);
    if (!existing) {
      return NextResponse.json({ error: 'Shift assignment request not found' }, { status: 404 });
    }

    await deleteEntity('shiftAssignmentRequest', id);
    invalidateShiftAssignmentRequestsCache();

    return NextResponse.json({ message: 'Shift assignment request deleted successfully' });
  } catch (error) {
    console.error('Error deleting shift assignment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
