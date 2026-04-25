export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import type { WashEvent } from '@/types';
import { getWashEventsData } from '@/lib/data';
import { requireAuth } from '@/lib/server-auth';
import { createWashEvent } from '@/services/wash-event-create-service';

export async function GET() {
  try {
    const events = await getWashEventsData();
    return NextResponse.json(events);
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

