export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { getEmployeesData } from '@/lib/data-loader';
import { normalizeLicensePlate } from '@/lib/utils';
import { createWashEvent } from '@/services/wash-event-create-service';
import type { WashEvent } from '@/types';

interface DismissCameraPendingPayload {
  dirName: string;
  boxNumber: 1 | 2;
  plateNumber?: string | null;
  vehicleClass?: string | null;
  start?: string | null;
  end?: string | null;
  employeeId: string;
  source: 'operations' | 'kiosk-order';
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json()) as DismissCameraPendingPayload;
    const dirName = String(payload.dirName || '').trim();
    const employeeId = String(payload.employeeId || '').trim();

    if (!dirName) {
      return NextResponse.json({ error: 'Camera session dirName is required' }, { status: 400 });
    }

    if (!employeeId) {
      return NextResponse.json({ error: 'Employee is required' }, { status: 400 });
    }

    const employees = await getEmployeesData();
    const employee = employees.find((item) => item.id === employeeId && item.role !== 'kiosk');
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const normalizedPlate = normalizeLicensePlate(String(payload.plateNumber || '').trim());
    const washEvent: WashEvent = {
      id: `we_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toISOString(),
      vehicleNumber: normalizedPlate || 'БЕЗ НОМЕРА',
      employeeIds: [employee.id],
      paymentMethod: 'cash',
      sourceName: 'Не мылась',
      totalAmount: 0,
      services: {
        main: {
          serviceName: 'Не мылась (заехала, постояла и уехала)',
          price: 0,
          chemicalConsumption: 0,
          isCustom: true,
        },
        additional: [],
      },
      boxNumber: payload.boxNumber === 2 ? 2 : 1,
      cameraSession: {
        dirName,
        boxNumber: payload.boxNumber === 2 ? 2 : 1,
        originalPlate: payload.plateNumber || null,
        correctedPlate: normalizedPlate || null,
        vehicleClass: payload.vehicleClass || null,
        start: payload.start || null,
        end: payload.end || null,
        source: 'operations-camera',
      },
      status: 'dismissed',
      dismissal: {
        reason: 'drive_out_without_wash',
        dismissedAt: new Date().toISOString(),
        dismissedByEmployeeId: employee.id,
        dismissedByEmployeeName: employee.fullName,
        source: payload.source === 'kiosk-order' ? 'kiosk-order' : 'operations',
      },
    };

    const savedEvent = await createWashEvent(washEvent);
    return NextResponse.json({ message: 'Camera session dismissed', event: savedEvent }, { status: 201 });
  } catch (error) {
    console.error('Error dismissing camera session:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
