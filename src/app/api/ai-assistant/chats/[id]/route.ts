import { NextRequest, NextResponse } from 'next/server';
import { getChat, updateChat, deleteChat, getMessages } from '@/lib/db/ai-database';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-assistant/chats/[id]
 * Get a specific chat with its messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const chatId = params.id;
    const chat = getChat(chatId);

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    const messages = getMessages(chatId);

    return NextResponse.json({ chat, messages });
  } catch (error: any) {
    console.error('[API] Get chat error:', error);
    return NextResponse.json(
      { error: 'Failed to get chat', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ai-assistant/chats/[id]
 * Update a chat (title or archive status)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const chatId = params.id;
    const body = await request.json();
    const { title, is_archived } = body;

    const chat = getChat(chatId);
    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    const updates: any = {};
    if (title !== undefined) {
      updates.title = String(title).trim();
    }
    if (is_archived !== undefined) {
      updates.is_archived = is_archived ? 1 : 0;
    }

    updateChat(chatId, updates);

    const updatedChat = getChat(chatId);
    return NextResponse.json({ chat: updatedChat });
  } catch (error: any) {
    console.error('[API] Update chat error:', error);
    return NextResponse.json(
      { error: 'Failed to update chat', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-assistant/chats/[id]
 * Delete a chat (cascade deletes messages)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const chatId = params.id;
    const chat = getChat(chatId);

    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    deleteChat(chatId);

    return NextResponse.json({ message: 'Chat deleted successfully' });
  } catch (error: any) {
    console.error('[API] Delete chat error:', error);
    return NextResponse.json(
      { error: 'Failed to delete chat', details: error.message },
      { status: 500 }
    );
  }
}
