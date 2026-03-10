/**
 * OpenAI-compatible Tool Calling via ProxyAPI.ru
 */

import type { GLMMessage, GLMToolDefinition, GLMToolCall } from '@/types/ai-assistant';

/**
 * Execute tool calling loop (OpenAI format)
 */
export async function executeToolCalling(params: {
  apiKey: string;
  baseURL: string;
  messages: GLMMessage[];
  tools: GLMToolDefinition[];
  toolExecutor: (toolName: string, parameters: any) => Promise<any>;
  model?: string;
  maxIterations?: number;
}): Promise<{
  message: string;
  toolResults: Array<{ toolName: string; result: any }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> {
  const { apiKey, baseURL, messages, tools, toolExecutor, model = 'gpt-4o-mini', maxIterations = 5 } = params;

  // Build conversation history (OpenAI format — system, user, assistant messages)
  const chatMessages: any[] = messages.map(msg => ({
    role: msg.role,
    content: msg.content || '',
  }));

  const toolResults: Array<{ toolName: string; result: any }> = [];
  let totalUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };

  // Tool calling loop
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`[AI Tools] Iteration ${iteration + 1}/${maxIterations}`);

    // Build request (OpenAI chat completions format)
    const requestBody: any = {
      model,
      messages: chatMessages,
      max_tokens: 4096,
    };

    // Only include tools if available
    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    const url = `${baseURL}/v1/chat/completions`;

    // Call API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AI API error (${response.status}): ${error}`);
    }

    const data = await response.json();

    // Accumulate usage
    if (data.usage) {
      totalUsage.prompt_tokens += data.usage.prompt_tokens || 0;
      totalUsage.completion_tokens += data.usage.completion_tokens || 0;
      totalUsage.total_tokens = totalUsage.prompt_tokens + totalUsage.completion_tokens;
    }

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('AI API returned no choices');
    }

    const assistantMessage = choice.message;
    const toolCalls: GLMToolCall[] | undefined = assistantMessage.tool_calls;

    // If no tool calls or finish_reason is 'stop', we're done
    if (!toolCalls || toolCalls.length === 0 || choice.finish_reason === 'stop') {
      return {
        message: assistantMessage.content || '',
        toolResults,
        usage: totalUsage,
      };
    }

    // Add assistant message with tool_calls to conversation
    chatMessages.push({
      role: 'assistant',
      content: assistantMessage.content || null,
      tool_calls: toolCalls,
    });

    // Execute each tool and add results
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      let toolArgs: any = {};

      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        toolArgs = {};
      }

      console.log(`[AI Tools] Executing tool: ${toolName}`, toolArgs);

      try {
        const result = await toolExecutor(toolName, toolArgs);

        toolResults.push({
          toolName,
          result,
        });

        // Add tool result message (OpenAI format)
        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        console.error(`[AI Tools] Tool execution error (${toolName}):`, error);

        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error.message }),
        });
      }
    }
  }

  // Max iterations reached
  throw new Error('Max tool calling iterations reached');
}
