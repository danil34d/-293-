import { NextRequest, NextResponse } from 'next/server';
import { getChat, getMessages, getRecentMessages, createMessage, updateChat } from '@/lib/db/ai-database';
import { getGLMClient } from '@/lib/ai/glm-client';
import { mcpTools, executeMCPTool } from '@/lib/ai/mcp-tools';
import type { GLMMessage, GLMToolDefinition } from '@/types/ai-assistant';
import { requireAuth } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ai-assistant/chats/[id]/messages
 * Get messages for a chat
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const chatId = params.id;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const chat = getChat(chatId);
    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    const queryParams: any = {};
    if (limit) queryParams.limit = parseInt(limit);
    if (offset) queryParams.offset = parseInt(offset);

    const messages = getMessages(chatId, queryParams);

    return NextResponse.json({
      messages,
      total: messages.length,
    });
  } catch (error: any) {
    console.error('[API] Get messages error:', error);
    return NextResponse.json(
      { error: 'Failed to get messages', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-assistant/chats/[id]/messages
 * Send a message and get AI response
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const chatId = params.id;
    const body = await request.json();
    const { content, useTools = true } = body;

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      );
    }

    const chat = getChat(chatId);
    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      );
    }

    // 1. Save user message
    const userMessage = createMessage(chatId, 'user', content.trim());

    // 1.5. Auto-name chat based on first message
    const messages = getMessages(chatId);
    const userMessages = messages.filter(m => m.role === 'user');

    if (userMessages.length === 1 && chat.title === 'Новый чат') {
      // This is the first user message, generate a title
      let title = content.trim();

      // Clean up the title
      title = title.replace(/\n/g, ' ').trim();

      // Limit length
      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }

      // Update chat title
      updateChat(chatId, { title });
    }

    // 2. Get recent message history (last 20 messages for context)
    const history = getRecentMessages(chatId, 20);

    // 3. Convert to GLM format and add system prompt
    const systemPrompt: GLMMessage = {
      role: 'system',
      content: `Ты - интеллектуальный AI помощник для автомойки "АвтомойкаПро". Твоя задача - помогать с аналитикой, прогнозированием и принятием бизнес-решений.

У тебя есть доступ к следующим инструментам:

**Получение данных:**
- get_wash_events: получить события мойки (wash events) за период
- get_employees: получить список сотрудников
- calculate_revenue_stats: рассчитать статистику выручки
- get_employee_performance: получить показатели эффективности сотрудников
- get_expenses_summary: получить сводку по расходам
- get_inventory_status: получить статус склада
- compare_periods: сравнить два периода

**Генерация документов:**
- generate_word_document: создать Word документ (DOCX) с указанным содержимым
  * Параметры: title (заголовок), content (текст в Markdown), filename (опционально)
  * Поддерживает форматирование: жирный, курсив, заголовки, списки
  * Возвращает ссылку для скачивания

- generate_excel_table: создать Excel таблицу (XLSX) с данными
  * Параметры: title (заголовок), headers (массив заголовков), rows (массив массивов с данными), filename (опционально)
  * Автоматически форматирует таблицу с цветами и границами
  * Возвращает ссылку для скачивания

**Импорт расписания:**
- import_planimum_schedule: импортировать расписание из planimum.ru
  * Параметры: url (ссылка planimum.ru), wash_id (опционально, по умолчанию wash_1), clear_existing (опционально, по умолчанию true)
  * Загружает расписание, сопоставляет сотрудников по имени, создаёт смены
  * Распределяет сотрудников по боксам автоматически
  * Если пользователь вставляет ссылку planimum.ru — сразу используй этот инструмент

Когда пользователь задаёт вопрос:
1. Определи, какие инструменты нужны для ответа
2. Используй инструменты для получения данных
3. Проанализируй данные и предоставь полезные инсайты
4. Форматируй ответ красиво с использованием Markdown
5. Если пользователь просит создать документ/таблицу - используй соответствующий инструмент

Примеры запросов:
- "Какая была выручка за последний месяц?"
- "Кто из сотрудников самый эффективный?"
- "Создай Excel таблицу с топ-10 сотрудников по выручке за ноябрь"
- "Сделай Word отчёт по расходам за последнюю неделю"
- "Экспортируй эти данные в Excel"
- "https://planimum.ru/schedule/display/2026/04/xxxxx/" — импортировать расписание из planimum

Когда генерируешь документы:
- Для Word: форматируй content в Markdown (используй ##, ###, **жирный**, *курсив*, списки)
- Для Excel: структурируй данные в виде заголовков и строк
- Всегда сообщай пользователю ссылку для скачивания

Всегда будь конкретным, используй цифры и предоставляй рекомендации.`,
    };

    const glmMessages: GLMMessage[] = [
      systemPrompt,
      ...history.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    // 4. Get GLM client
    const glmClient = getGLMClient();

    // 5. Prepare tools if needed
    const tools: GLMToolDefinition[] = useTools ? mcpTools : [];

    // 6. Call GLM API
    let assistantContent: string;
    let toolResults: any[] = [];

    if (tools.length > 0) {
      // With MCP tools enabled
      const response = await glmClient.chatWithTools({
        messages: glmMessages,
        tools,
        toolExecutor: executeMCPTool,
      });
      assistantContent = response.message;
      toolResults = response.toolResults;
    } else {
      // Without tools (simple chat mode)
      const response = await glmClient.chat({
        messages: glmMessages,
        temperature: 0.7,
      });
      assistantContent = response.choices[0].message.content || 'Извините, не могу сгенерировать ответ.';
    }

    // 7. Save assistant message
    const assistantMessage = createMessage(
      chatId,
      'assistant',
      assistantContent,
      toolResults.length > 0 ? { toolResults } : undefined
    );

    return NextResponse.json({
      userMessage,
      assistantMessage,
    });
  } catch (error: any) {
    console.error('[API] Send message error:', error);
    return NextResponse.json(
      { error: 'Failed to send message', details: error.message },
      { status: 500 }
    );
  }
}
