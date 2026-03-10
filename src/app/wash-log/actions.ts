'use server';

import type { WashComment } from '@/types';

export async function handleCommentUpdate(eventId: string, newComments: WashComment[]): Promise<void> {
  const url = new URL(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/api/wash-events/${eventId}`);

  try {
    const fetchRes = await fetch(url, { cache: 'no-store' });
    if (!fetchRes.ok) throw new Error("Failed to fetch event data before update.");
    const eventToUpdate = await fetchRes.json();

    const updatedEvent = { ...eventToUpdate, driverComments: newComments };

    const updateRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedEvent),
    });

    if (!updateRes.ok) throw new Error("Failed to save comment.");

  } catch(e) {
    console.error("Server Action Error (handleCommentUpdate):", e);
    throw e;
  }
}