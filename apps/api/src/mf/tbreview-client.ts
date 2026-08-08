/**
 * tb-review-api (Cloud Run) 呼び出しクライアント。
 *
 * tb-review-api は `--no-allow-unauthenticated` で立て、sevenboard-api の実行 SA に
 * roles/run.invoker を付与する前提。認証は Cloud Run IAM の ID トークンで行う。
 *
 * ログ衛生: 社名・金額・CSV 内容は出さない（バイト数と HTTP ステータスのみ）。
 */
import { Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import type { IdTokenClient } from 'google-auth-library';
import type { TbReviewResponse } from './tbreview-adapter';

/** tb-review-api 側の上限（app/main.py MAX_API_CSV_BYTES）と同じ。超過分は送らず手前で落とす。 */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;

/**
 * タイムアウトチェーン（2026-08-08 再レビューの推奨構成。変更時は3点セットで見直す）:
 *   sevenboard-api の Cloud Run inbound 900s（tbreview 本番昇格時に --timeout 900 で設定）
 *     > このクライアント 840s
 *       > tb-review-api 側のエンジン3本合計 最大720s（TBW_ENGINE_TIMEOUT_SEC=240 × 3）
 * 実測はエンジン3本で約3秒。840s は巨大仕訳帳向けの安全余裕。
 */
const REQUEST_TIMEOUT_MS = 840_000;

export interface TbReviewRequest {
  journal_csv: string;
  bs_csv: string;
  pl_csv: string;
  prior_journal_csv?: string | null;
  client_id?: string;
  company_name?: string;
  period?: string;
}

/** localhost 宛ては Cloud Run ではないので ID トークンを付けない（ローカル検証用）。 */
function isLocalhost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export class TbReviewClient {
  private readonly logger = new Logger(TbReviewClient.name);
  private idTokenClient: Promise<IdTokenClient> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly audience: string,
  ) {}

  /**
   * 環境変数から生成する。REVIEW_ENGINE=tbreview なのに URL 未設定なら例外
   * （黙って legacy に落ちると設定ミスに気付けないため）。
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): TbReviewClient {
    const baseUrl = (env.TB_REVIEW_API_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
      throw new Error(
        'REVIEW_ENGINE=tbreview ですが TB_REVIEW_API_URL が未設定です',
      );
    }
    const audience = (env.TB_REVIEW_API_AUDIENCE || '').trim() || baseUrl;
    return new TbReviewClient(baseUrl, audience);
  }

  private async client(): Promise<IdTokenClient> {
    if (!this.idTokenClient) {
      const auth = new GoogleAuth();
      this.idTokenClient = auth.getIdTokenClient(this.audience).catch((err) => {
        // 次回呼び出しでリトライできるようキャッシュを捨てる
        this.idTokenClient = null;
        throw err;
      });
    }
    return this.idTokenClient;
  }

  async review(payload: TbReviewRequest): Promise<TbReviewResponse> {
    for (const [field, value] of [
      ['journal_csv', payload.journal_csv],
      ['bs_csv', payload.bs_csv],
      ['pl_csv', payload.pl_csv],
      ['prior_journal_csv', payload.prior_journal_csv],
    ] as const) {
      if (typeof value !== 'string') continue;
      const bytes = Buffer.byteLength(value, 'utf-8');
      if (bytes > MAX_CSV_BYTES) {
        throw new Error(
          `${field} が上限 ${MAX_CSV_BYTES} バイトを超えています (${bytes})`,
        );
      }
    }

    const url = `${this.baseUrl}/api/review`;
    const body = JSON.stringify(payload);
    this.logger.log(
      `tb-review request bytes=${Buffer.byteLength(body, 'utf-8')} local=${isLocalhost(url)}`,
    );

    const response = isLocalhost(url)
      ? await this.requestPlain(url, body)
      : await this.requestWithIdToken(url, body);

    this.logger.log(`tb-review response status=${response.status}`);
    if (response.status !== 200) {
      throw new Error(
        `tb-review-api が ${response.status} を返しました: ${response.detail || '(詳細なし)'}`,
      );
    }
    return response.data as TbReviewResponse;
  }

  private async requestWithIdToken(
    url: string,
    body: string,
  ): Promise<{ status: number; data: unknown; detail?: string }> {
    const client = await this.client();
    try {
      const res = await client.request<unknown>({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        timeout: REQUEST_TIMEOUT_MS,
        responseType: 'json',
      });
      return { status: res.status ?? 0, data: res.data };
    } catch (err: any) {
      const status = err?.response?.status;
      if (typeof status === 'number') {
        return { status, data: null, detail: detailOf(err?.response?.data) };
      }
      throw err;
    }
  }

  private async requestPlain(
    url: string,
    body: string,
  ): Promise<{ status: number; data: unknown; detail?: string }> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data, detail: detailOf(data) };
  }
}

function detailOf(data: unknown): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    return String((data as { detail: unknown }).detail);
  }
  return '';
}
