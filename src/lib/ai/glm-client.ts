import type { GLMMessage, GLMResponse, GLMChatParams, GLMToolDefinition } from '@/types/ai-assistant';
import { getSetting, setSetting } from '@/lib/db/ai-database';
import { decryptSecret } from '@/lib/crypto/secret-encryption';
import { executeToolCalling } from './glm-client-tools';

/**
 * AI Client — работает через OpenAI-совместимый эндпоинт ProxyAPI.ru
 * URL: https://openai.api.proxyapi.ru/v1/chat/completions
 * Auth: Authorization: Bearer {key}
 */

export class GLMClient {
  private apiKey: string;
  private baseURL: string;
  private model: string;

  constructor(apiKey: string, baseURL?: string, model?: string) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    this.apiKey = apiKey;
    this.baseURL = baseURL || process.env.AI_BASE_URL || 'https://openai.api.proxyapi.ru';
    this.model = model || process.env.AI_MODEL || 'gpt-4o-mini';
  }

  /**
   * Basic chat completion (OpenAI format)
   */
  async chat(params: GLMChatParams): Promise<GLMResponse> {
    const requestBody: any = {
      model: params.model || this.model,
      messages: params.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: params.max_tokens || 4096,
      temperature: params.temperature ?? 0.7,
    };

    if (params.top_p !== undefined) {
      requestBody.top_p = params.top_p;
    }

    const url = `${this.baseURL}/v1/chat/completions`;

    console.log('[AI] Request:', {
      url,
      model: requestBody.model,
      messagesCount: requestBody.messages.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[AI] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const error = await response.text();
      console.error('[AI] Error response:', error);
      throw new Error(`AI API error (${response.status}): ${error}`);
    }

    const data: GLMResponse = await response.json();

    console.log('[AI] Response received:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      messageLength: data.choices?.[0]?.message?.content?.length,
    });

    return data;
  }

  /**
   * Chat with tool calling support (iterative, OpenAI format)
   */
  async chatWithTools(params: {
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
    return executeToolCalling({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      messages: params.messages,
      tools: params.tools,
      toolExecutor: params.toolExecutor,
      model: params.model || this.model,
      maxIterations: params.maxIterations || 5,
    });
  }

  /**
   * Stream chat (for future implementation)
   */
  async *chatStream(params: GLMChatParams): AsyncGenerator<string> {
    throw new Error('Streaming not implemented yet');
  }
}

/**
 * Get AI client instance
 *
 * Phase 61: ключ из БД может быть зашифрован (enc:v1:...) — расшифровываем перед использованием.
 * Backward compat: если значение plain (старый формат) — decryptSecret вернёт as-is.
 * Если значение зашифровано, но master key не задан → decryptSecret бросит явный Error
 * (это критическая ошибка конфигурации, лучше упасть чем тихо использовать base64-мусор как ключ).
 */
export function getGLMClient(): GLMClient {
  const apiKeyRaw = process.env.GLM_API_KEY || getSetting('glm_api_key');
  // ENV ключ всегда plain (decryptSecret no-op для plain); DB ключ может быть зашифрован.
  const apiKey = decryptSecret(apiKeyRaw);

  if (!apiKey) {
    throw new Error('API ключ не настроен. Введите ключ ProxyAPI в настройках AI-ассистента.');
  }

  let baseURL = process.env.AI_BASE_URL || getSetting('ai_base_url') || undefined;
  let model = process.env.AI_MODEL || getSetting('ai_model') || undefined;

  // Миграция: если в базе остался старый Anthropic-эндпоинт, заменяем на OpenAI
  if (baseURL && baseURL.includes('api.proxyapi.ru/anthropic')) {
    baseURL = 'https://openai.api.proxyapi.ru';
    setSetting('ai_base_url', baseURL);
  }
  // Миграция: если модель claude-*, заменяем на gpt-4o-mini
  if (model && model.startsWith('claude-')) {
    model = 'gpt-4o-mini';
    setSetting('ai_model', model);
  }

  return new GLMClient(apiKey, baseURL, model);
}
