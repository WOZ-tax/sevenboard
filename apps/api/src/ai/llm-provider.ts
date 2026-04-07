import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

export interface LlmResponse {
  text: string;
}

export interface LlmProvider {
  generate(prompt: string, options?: { maxTokens?: number; json?: boolean }): Promise<LlmResponse>;
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
