import { NextRequest, NextResponse } from 'next/server';
import { getChats, createChat } from '@/lib/db/ai-database';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-assistant/chats
 * Get all chats
 */
export async function GET(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const isArchived = searchParams.get('archived');

    const params: any = {};
    if (isArchived !== null) {
      params.isArchived = isArchived === '1' || isArchived === 'true';
    }

    const chats = getChats(params);

    return NextResponse.json({ chats });
  } catch (error: any) {
    console.error('[API] Get chats error:', error);
    return NextResponse.json(
      { error: 'Failed to get chats', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-assistant/chats
 * Create a new chat
 */
export async function POST(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { title } = body;

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Title is required and must be a string' },
        { status: 400 }
      );
    }

    const chat = createChat(title.trim());

    return NextResponse.json({ chat }, { status: 201 });
  } catch (error: any) {
    console.error('[API] Create chat error:', error);
    return NextResponse.json(
      { error: 'Failed to create chat', details: error.message },
      { status: 500 }
    );
  }
}
