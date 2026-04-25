export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getShiftSwapRequestsData } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';
import { createSwapRequest } from '@/services/shift-swap-service';
import { ServiceError } from '@/services/service-error';
import { isEmployeeAdmin } from '@/lib/employee-role';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, accepted, rejected
    const requesterId = searchParams.get('requesterId');
    const targetEmployeeId = searchParams.get('targetEmployeeId');

    let requests = await getShiftSwapRequestsData();

    if (status) {
      requests = requests.filter(r => r.status === status);
    }

    if (requesterId) {
      requests = requests.filter(r => r.requesterId === requesterId);
    }

    if (targetEmployeeId) {
      requests = requests.filter(r => r.targetEmployeeId === targetEmployeeId);
    }

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error reading shift swap requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const created = await createSwapRequest(
      {
        requesterId: body.requesterId,
        requesterShiftId: body.requesterShiftId,
        type: body.type,
        targetEmployeeId: body.targetEmployeeId,
        targetShiftId: body.targetShiftId,
      },
      { actorId: auth.id, isAdmin: isEmployeeAdmin(auth) }
    );

    return NextResponse.json({ message: 'Shift swap request created successfully', request: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating shift swap request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
