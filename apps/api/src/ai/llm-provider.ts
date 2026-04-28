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
  /**
   * LLM レスポンスを streaming で取得。トークンが届くたびに yield する。
   * 未対応のプロバイダーは undefined を返してよい（呼び出し側はバッチ generate にフォールバック）。
   */
  generateStream?(
    prompt: string,
    options?: { maxTokens?: number },
  ): AsyncGenerator<string, void, unknown>;
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

  /**
   * Anthropic Messages streaming (SSE)
   * https://docs.anthropic.com/en/api/messages-streaming
   * content_block_delta の text_delta だけを yield する。
   */
  async *generateStream(
    prompt: string,
    options?: { maxTokens?: number },
  ): AsyncGenerator<string, void, unknown> {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: options?.maxTokens || 2048,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body,
    });
    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Anthropic stream failed: ${res.status} ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE event = "event: ...\ndata: ...\n\n"
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          // 各 SSE block 内 "data: <json>" 行を抽出
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const dataStr = line.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr) as {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              if (
                data.type === 'content_block_delta' &&
                data.delta?.type === 'text_delta' &&
                typeof data.delta.text === 'string'
              ) {
                yield data.delta.text;
              }
            } catch {
              // ignore malformed line
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
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
    const model = 'gemini-3-flash-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const body: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: options?.maxTokens || 4096,
        // Gemini 2.5は thinkingトークンが maxOutputTokens を食って出力が途中で切れる。無効化する。
        thinkingConfig: { thinkingBudget: 0 },
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

  async runWithTools(
    prompt: string,
    tools: LlmToolDefinition[],
    handler: ToolUseHandler,
    options?: LlmToolRunOptions,
  ): Promise<LlmToolRunResult> {
    const model = 'gemini-3-flash-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
    const maxIterations = options?.maxIterations ?? 4;

    // Gemini は Anthropic と違い input_schema ではなく parameters を使う
    const functionDeclarations = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    }));

    const contents: Array<{
      role: 'user' | 'model';
      parts: Array<Record<string, unknown>>;
    }> = [{ role: 'user', parts: [{ text: prompt }] }];

    if (options?.system) {
      // Gemini の systemInstruction は body 直下だが、会話継続時は毎回送る必要あり。
      // ここでは簡略化して prompt 先頭に融合済みを想定し、未指定時のみ注入。
    }

    const toolCalls: LlmToolRunResult['toolCalls'] = [];
    let finalText = '';

    for (let iter = 0; iter < maxIterations; iter++) {
      const body: Record<string, unknown> = {
        contents,
        tools: [{ functionDeclarations }],
        generationConfig: {
          maxOutputTokens: options?.maxTokens || 2048,
          thinkingConfig: { thinkingBudget: 0 },
        },
      };
      if (options?.system) {
        body.systemInstruction = { parts: [{ text: options.system }] };
      }

      const res: AxiosResponse = await lastValueFrom(
        this.httpService.post(url, body, {
          headers: { 'Content-Type': 'application/json' },
        }) as any,
      );

      const candidate = res.data?.candidates?.[0];
      const parts: Array<Record<string, unknown>> =
        candidate?.content?.parts ?? [];
      const finishReason: string | undefined = candidate?.finishReason;

      contents.push({ role: 'model', parts });

      const textParts = parts
        .filter((p) => typeof p.text === 'string')
        .map((p) => p.text as string)
        .filter(Boolean);
      if (textParts.length > 0) finalText = textParts.join('\n');

      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => p.functionCall as { name: string; args?: Record<string, unknown> });

      if (functionCalls.length === 0) break;

      const responseParts: Array<Record<string, unknown>> = [];
      for (const fc of functionCalls) {
        const input = (fc.args ?? {}) as Record<string, unknown>;
        let result: LlmToolResult;
        try {
          result = await handler({
            id: fc.name,
            name: fc.name,
            input,
          });
        } catch (err) {
          result = {
            toolUseId: fc.name,
            content:
              err instanceof Error ? err.message : 'tool handler failed',
            isError: true,
          };
        }
        toolCalls.push({
          name: fc.name,
          input,
          result: { ok: !result.isError, content: result.content },
        });
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: result.isError
              ? { error: result.content }
              : { result: result.content },
          },
        });
      }

      contents.push({ role: 'user', parts: responseParts });

      if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
        // safety stop etc.
        break;
      }
    }

    return { text: finalText, toolCalls };
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
