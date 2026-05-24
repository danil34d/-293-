export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { WashEvent } from '@/types';
import { getWashEventsData } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';
import { hasAdminAccess, isKiosk } from '@/lib/employee-role';
import { createWashEvent } from '@/services/wash-event-create-service';

export async function GET() {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const events = await getWashEventsData();

    // Admin и kiosk (включая legacy kiosk1 для рабочего телефона в боксе)
    // видят все мойки. Обычный сотрудник — только те, где он указан в
    // employeeIds. Игнорируем query-параметр employeeId для employee-роли
    // — фильтрация всегда по cookie identity.
    if (hasAdminAccess(auth) || isKiosk(auth) || (auth.role as string) === 'kiosk1') {
      return NextResponse.json(events);
    }

    const ownEvents = events.filter((event) =>
      Array.isArray(event.employeeIds) && event.employeeIds.includes(auth.id)
    );
    return NextResponse.json(ownEvents);
  } catch (error) {
    console.error('Error reading wash events directory:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const washEvent = (await request.json()) as WashEvent;
    if (!washEvent.id) {
      return NextResponse.json({ error: 'Wash event ID is required' }, { status: 400 });
    }

    // Phase 10 / finding #40: серверная фиксация автора создания мойки.
    // Клиент мог передать что угодно — мы перезаписываем на cookie identity.
    // Это аудит-след: видно кто фактически нажал «Сохранить», даже если
    // employeeIds содержит других сотрудников (ретроактивный кейс).
    washEvent.createdByEmployeeId = auth.id;

    const savedEvent = await createWashEvent(washEvent);
    return NextResponse.json({ message: 'Wash event created successfully', event: savedEvent }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating wash event:', error);
    const message = typeof error?.message === 'string' ? error.message : 'Internal Server Error';
    if (message === 'Wash event ID is required') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

