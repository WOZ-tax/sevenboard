import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

export interface LlmResponse {
  text: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmToolResult {
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface ToolUseHandler {
  (call: LlmToolCall): Promise<LlmToolResult>;
}

export interface LlmToolRunOptions {
  maxTokens?: number;
  maxIterations?: number;
  system?: string;
}

export interface LlmToolRunResult {
  text: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: { ok: boolean; content: string };
  }>;
}

export interface LlmProvider {
  generate(prompt: string, options?: { maxTokens?: number; json?: boolean }): Promise<LlmResponse>;
  /**
   * tools を渡して会話ループを回す。tool_use → handler → tool_result を end_turn まで繰り返す。
   * tools をサポートしないプロバイダーは null を返す。
   */
  runWithTools?(
    prompt: string,
    tools: LlmToolDefinition[],
    handler: ToolUseHandler,
    options?: LlmToolRunOptions,
  ): Promise<LlmToolRunResult>;
}

/**
 * Claude (Anthropic) provider
 */
export class ClaudeProvider implements LlmProvider {
  private logger = new Logger('ClaudeProvider');

  constructor(
    private httpService: HttpService,
    private apiKey: string,
  ) {}

  async generate(prompt: string, options?: { maxTokens?: number; json?: boolean }): Promise<LlmResponse> {
    const res: AxiosResponse = await lastValueFrom(
      this.httpService.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: options?.maxTokens || 2048,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      ) as any,
    );

    const text = res.data?.content?.[0]?.text || '';
    return { text };
  }

  async runWithTools(
    prompt: string,
    tools: LlmToolDefinition[],
    handler: ToolUseHandler,
    options?: LlmToolRunOptions,
  ): Promise<LlmToolRunResult> {
    const maxIterations = options?.maxIterations ?? 4;
    const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      { role: 'user', content: prompt },
    ];
    const toolCalls: LlmToolRunResult['toolCalls'] = [];
    let finalText = '';

    for (let iter = 0; iter < maxIterations; iter++) {
      const body: Record<string, unknown> = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: options?.maxTokens || 2048,
        messages,
        tools,
      };
      if (options?.system) body.system = options.system;

      const res: AxiosResponse = await lastValueFrom(
        this.httpService.post('https://api.anthropic.com/v1/messages', body, {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }) as any,
      );

      const content: Array<Record<string, unknown>> = res.data?.content ?? [];
      const stopReason: string | undefined = res.data?.stop_reason;

      messages.push({ role: 'assistant', content });

      const textParts = content
        .filter((b) => b.type === 'text')
        .map((b) => (typeof b.text === 'string' ? b.text : ''))
        .filter(Boolean);
      if (textParts.length > 0) finalText = textParts.join('\n');

      const toolUses = content.filter((b) => b.type === 'tool_use') as Array<{
        type: 'tool_use';
        id: string;
        name: string;
        input: Record<string, unknown>;
      }>;

      if (stopReason !== 'tool_use' || toolUses.length === 0) {
        break;
      }

      const toolResults: unknown[] = [];
      for (const tu of toolUses) {
        let result: LlmToolResult;
        try {
          result = await handler({
            id: tu.id,
            name: tu.name,
            input: tu.input ?? {},
          });
        } catch (err) {
          result = {
            toolUseId: tu.id,
            content:
              err instanceof Error ? err.message : 'tool handler failed',
            isError: true,
          };
        }
        toolCalls.push({
          name: tu.name,
          input: tu.input ?? {},
          result: { ok: !result.isError, content: result.content },
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: result.toolUseId,
          content: result.content,
          is_error: result.isError ?? false,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    return { text: finalText, toolCalls };
  }
}

/**
 * Gemini (Google) provider
 */
export class GeminiProvider implements LlmProvider {
  private logger = new Logger('GeminiProvider');

  constructor(
    private httpService: HttpService,
    private apiKey: string,
  ) {}

  async generate(prompt: string, options?: { maxTokens?: number; json?: boolean }): Promise<LlmResponse> {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 2048,
      },
    };

    if (options?.json) {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const res: AxiosResponse = await lastValueFrom(
      this.httpService.post(url, body, {
        headers: { 'Content-Type': 'application/json' },
      }) as any,
    );

    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { text };
  }
}

/**
 * Factory: env vars から適切なプロバイダーを選択
 * AI_PROVIDER=claude (default) | gemini
 */
export function createLlmProvider(httpService: HttpService): LlmProvider | null {
  const provider = (process.env.AI_PROVIDER || 'claude').toLowerCase();

  if (provider === 'gemini') {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) return null;
    return new GeminiProvider(httpService, key);
  }

  // default: claude
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new ClaudeProvider(httpService, key);
}

/**
 * LLMレスポンスからJSONを抽出
 */
export function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
