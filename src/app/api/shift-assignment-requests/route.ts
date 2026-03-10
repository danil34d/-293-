export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getShiftAssignmentRequestsData } from '@/lib/data-loader';
import { requireAuth } from '@/lib/server-auth';
import { createAssignmentRequest } from '@/services/shift-assignment-service';
import { ServiceError } from '@/services/service-error';
import { isEmployeeAdmin } from '@/lib/employee-role';
import { isWashId } from '@/lib/wash';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // pending, accepted, rejected, cancelled
    const employeeId = searchParams.get('employeeId');
    const washId = searchParams.get('washId');

    let requests = await getShiftAssignmentRequestsData();

    if (status) {
      requests = requests.filter(r => r.status === status);
    }

    if (employeeId) {
      requests = requests.filter(r => r.employeeId === employeeId);
    }

    if (washId) {
      if (!isWashId(washId)) {
        return NextResponse.json({ error: 'Invalid washId. Allowed: wash_1, wash_2' }, { status: 400 });
      }
      requests = requests.filter(r => r.washId === washId);
    }

    return NextResponse.json(requests);
  } catch (error) {
    console.error('Error reading shift assignment requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const created = await createAssignmentRequest(
      {
        employeeId: body.employeeId,
        date: body.date,
        shiftType: body.shiftType,
        boxNumber: body.boxNumber,
        washId: body.washId,
        comment: body.comment,
      },
      { actorId: auth.id, isAdmin: isEmployeeAdmin(auth) }
    );

    return NextResponse.json({ message: 'Shift assignment request created successfully', request: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error creating shift assignment request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
