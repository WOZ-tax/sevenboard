import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import {
  MfV3AccountResponse,
  MfV3ConnectedAccountsResponse,
  MfV3CRUDJournalRequest,
  MfV3CRUDJournalResponse,
  MfV3DeleteVouchersRequest,
  MfV3DepartmentResponse,
  MfV3GetJournalsResponse,
  MfV3GetTransactionsResponse,
  MfV3JournalItem,
  MfV3JournalsQuery,
  MfV3Office,
  MfV3PostTradePartnersRequest,
  MfV3PostTransactionJournalizeRequest,
  MfV3PostTransactionsRequest,
  MfV3PostTransactionsResponse,
  MfV3PostVouchersRequest,
  MfV3PostVouchersResponse,
  MfV3SubAccountResponse,
  MfV3TaxResponse,
  MfV3TbQuery,
  MfV3TbResponse,
  MfV3TermSettingsResponse,
  MfV3TradePartnersResponse,
  MfV3TransactionsQuery,
  MfV3TransitionQuery,
  MfV3TransitionResponse,
} from './types/mf-v3.types';

export const MF_V3_DEFAULT_BASE_URL = 'https://api-accounting.moneyforward.com';

/** 3 req/s per (ClientID × office). MF enforces this per 事業者. */
const RATE_LIMIT_PER_SEC = 3;
const RATE_WINDOW_MS = 1000;
/** 429/5xx exponential backoff, matching the MCP transport's policy. */
const RETRY_BACKOFFS_MS = [3000, 6000, 12000];

/**
 * Context every request needs: the Bearer token (owned by MfApiService's token
 * store) and an optional rateKey. The rate limiter buckets by rateKey so that
 * each office throttles independently; when omitted it falls back to the token
 * (token↔office is 1:1), so a standalone caller like the smoke script still
 * gets per-office throttling.
 */
export interface MfV3RequestContext {
  token: string;
  rateKey?: string;
}

export type MfV3QueryValue =
  | string
  | number
  | boolean
  | Array<string | number>
  | undefined
  | null;

/**
 * Terminal HTTP error from the MF v3 REST API. Retryable statuses (429/5xx) are
 * exhausted before this is thrown. 401/403 are surfaced immediately (never
 * retried here) so MfApiService's single-flight refresh can handle them.
 */
export class MfV3HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'MfV3HttpError';
  }
}

/**
 * Thin, typed wrapper over every MF Cloud Accounting Public API v3 endpoint.
 *
 * No business logic and no token management: the Bearer token is passed in per
 * call. Responsibilities are transport-only — URL building (without
 * double-encoding pre-encoded MF ids), per-office rate limiting, 429/5xx
 * backoff, and surfacing terminal errors as MfV3HttpError. Response envelopes
 * are returned as-is (the caller unwraps the named collection key).
 */
@Injectable()
export class MfV3ClientService {
  private readonly logger = new Logger(MfV3ClientService.name);
  private readonly baseUrl: string;

  /** Per-key request timestamps (sliding 1s window) for rate limiting. */
  private readonly rateTimestamps = new Map<string, number[]>();
  /** Per-key FIFO chain so concurrent callers acquire slots in order. */
  private readonly rateChain = new Map<string, Promise<void>>();

  constructor(private readonly httpService: HttpService) {
    this.baseUrl = (
      process.env.MF_V3_BASE_URL || MF_V3_DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
  }

  // ============================
  // Offices / term settings
  // ============================

  getOffice(ctx: MfV3RequestContext): Promise<MfV3Office> {
    return this.request<MfV3Office>('GET', '/api/v3/offices', ctx);
  }

  getTermSettings(ctx: MfV3RequestContext): Promise<MfV3TermSettingsResponse> {
    return this.request<MfV3TermSettingsResponse>(
      'GET',
      '/api/v3/term_settings',
      ctx,
    );
  }

  // ============================
  // Masters (accounts / sub_accounts / departments / taxes)
  // ============================

  getAccounts(
    ctx: MfV3RequestContext,
    params?: { available?: boolean },
  ): Promise<MfV3AccountResponse> {
    return this.request<MfV3AccountResponse>('GET', '/api/v3/accounts', ctx, {
      query: { available: params?.available },
    });
  }

  getSubAccounts(
    ctx: MfV3RequestContext,
    params?: { account_id?: string },
  ): Promise<MfV3SubAccountResponse> {
    return this.request<MfV3SubAccountResponse>(
      'GET',
      '/api/v3/sub_accounts',
      ctx,
      { query: { account_id: params?.account_id } },
    );
  }

  getDepartments(ctx: MfV3RequestContext): Promise<MfV3DepartmentResponse> {
    return this.request<MfV3DepartmentResponse>(
      'GET',
      '/api/v3/departments',
      ctx,
    );
  }

  getTaxes(
    ctx: MfV3RequestContext,
    params?: { available?: boolean },
  ): Promise<MfV3TaxResponse> {
    return this.request<MfV3TaxResponse>('GET', '/api/v3/taxes', ctx, {
      query: { available: params?.available },
    });
  }

  // ============================
  // Trade partners
  // ============================

  getTradePartners(
    ctx: MfV3RequestContext,
    params?: { available?: boolean },
  ): Promise<MfV3TradePartnersResponse> {
    return this.request<MfV3TradePartnersResponse>(
      'GET',
      '/api/v3/trade_partners',
      ctx,
      { query: { available: params?.available } },
    );
  }

  postTradePartners(
    ctx: MfV3RequestContext,
    body: MfV3PostTradePartnersRequest,
  ): Promise<MfV3TradePartnersResponse> {
    return this.request<MfV3TradePartnersResponse>(
      'POST',
      '/api/v3/trade_partners',
      ctx,
      { body },
    );
  }

  // ============================
  // Connected accounts
  // ============================

  getConnectedAccounts(
    ctx: MfV3RequestContext,
  ): Promise<MfV3ConnectedAccountsResponse> {
    return this.request<MfV3ConnectedAccountsResponse>(
      'GET',
      '/api/v3/connected_accounts',
      ctx,
    );
  }

  // ============================
  // Reports
  // ============================

  getTrialBalanceBs(
    ctx: MfV3RequestContext,
    query: MfV3TbQuery = {},
  ): Promise<MfV3TbResponse> {
    return this.request<MfV3TbResponse>(
      'GET',
      '/api/v3/reports/trial_balance_bs',
      ctx,
      { query: query as unknown as Record<string, MfV3QueryValue> },
    );
  }

  getTrialBalancePl(
    ctx: MfV3RequestContext,
    query: MfV3TbQuery = {},
  ): Promise<MfV3TbResponse> {
    return this.request<MfV3TbResponse>(
      'GET',
      '/api/v3/reports/trial_balance_pl',
      ctx,
      { query: query as unknown as Record<string, MfV3QueryValue> },
    );
  }

  getTransitionBs(
    ctx: MfV3RequestContext,
    query: MfV3TransitionQuery,
  ): Promise<MfV3TransitionResponse> {
    return this.request<MfV3TransitionResponse>(
      'GET',
      '/api/v3/reports/transition_bs',
      ctx,
      { query: query as unknown as Record<string, MfV3QueryValue> },
    );
  }

  getTransitionPl(
    ctx: MfV3RequestContext,
    query: MfV3TransitionQuery,
  ): Promise<MfV3TransitionResponse> {
    return this.request<MfV3TransitionResponse>(
      'GET',
      '/api/v3/reports/transition_pl',
      ctx,
      { query: query as unknown as Record<string, MfV3QueryValue> },
    );
  }

  // ============================
  // Journals
  // ============================

  getJournals(
    ctx: MfV3RequestContext,
    query: MfV3JournalsQuery = {},
  ): Promise<MfV3GetJournalsResponse> {
    return this.request<MfV3GetJournalsResponse>(
      'GET',
      '/api/v3/journals',
      ctx,
      { query: query as unknown as Record<string, MfV3QueryValue> },
    );
  }

  /**
   * Fetch every page of journals for a query. Stops on metadata.total_pages so
   * it never over-pages (the MCP transport lacked total_pages and had to probe).
   */
  async getAllJournals(
    ctx: MfV3RequestContext,
    query: Omit<MfV3JournalsQuery, 'page'> = {},
    opts?: { maxPages?: number },
  ): Promise<{ journals: MfV3JournalItem[]; truncated: boolean }> {
    const maxPages = opts?.maxPages ?? 200;
    const perPage = query.per_page ?? 500;
    const all: MfV3JournalItem[] = [];
    let page = 1;
    let totalPages = 1;
    let truncated = false;

    do {
      const res = await this.getJournals(ctx, {
        ...query,
        per_page: perPage,
        page,
      });
      all.push(...(res.journals ?? []));
      totalPages = res.metadata?.total_pages ?? page;
      if (page >= maxPages && page < totalPages) {
        truncated = true;
        break;
      }
      page += 1;
    } while (page <= totalPages);

    return { journals: all, truncated };
  }

  getJournalById(
    ctx: MfV3RequestContext,
    id: string,
  ): Promise<MfV3CRUDJournalResponse> {
    return this.request<MfV3CRUDJournalResponse>(
      'GET',
      `/api/v3/journals/${this.encodePathId(id)}`,
      ctx,
    );
  }

  postJournals(
    ctx: MfV3RequestContext,
    body: MfV3CRUDJournalRequest,
  ): Promise<MfV3CRUDJournalResponse> {
    return this.request<MfV3CRUDJournalResponse>(
      'POST',
      '/api/v3/journals',
      ctx,
      { body },
    );
  }

  putJournals(
    ctx: MfV3RequestContext,
    id: string,
    body: MfV3CRUDJournalRequest,
  ): Promise<MfV3CRUDJournalResponse> {
    return this.request<MfV3CRUDJournalResponse>(
      'PUT',
      `/api/v3/journals/${this.encodePathId(id)}`,
      ctx,
      { body },
    );
  }

  deleteJournals(ctx: MfV3RequestContext, id: string): Promise<void> {
    return this.request<void>(
      'DELETE',
      `/api/v3/journals/${this.encodePathId(id)}`,
      ctx,
    );
  }

  // ============================
  // Transactions (連携明細)
  // ============================

  getTransactions(
    ctx: MfV3RequestContext,
    query: MfV3TransactionsQuery,
  ): Promise<MfV3GetTransactionsResponse> {
    return this.request<MfV3GetTransactionsResponse>(
      'GET',
      '/api/v3/transactions',
      ctx,
      { query: query as unknown as Record<string, MfV3QueryValue> },
    );
  }

  postTransactions(
    ctx: MfV3RequestContext,
    body: MfV3PostTransactionsRequest,
  ): Promise<MfV3PostTransactionsResponse> {
    return this.request<MfV3PostTransactionsResponse>(
      'POST',
      '/api/v3/transactions',
      ctx,
      { body },
    );
  }

  postTransactionJournalize(
    ctx: MfV3RequestContext,
    body: MfV3PostTransactionJournalizeRequest,
  ): Promise<MfV3CRUDJournalResponse> {
    return this.request<MfV3CRUDJournalResponse>(
      'POST',
      '/api/v3/transactions/journalize',
      ctx,
      { body },
    );
  }

  // ============================
  // Vouchers (証憑)
  // ============================

  postVouchers(
    ctx: MfV3RequestContext,
    body: MfV3PostVouchersRequest,
  ): Promise<MfV3PostVouchersResponse> {
    return this.request<MfV3PostVouchersResponse>(
      'POST',
      '/api/v3/vouchers',
      ctx,
      { body },
    );
  }

  deleteVouchers(
    ctx: MfV3RequestContext,
    body: MfV3DeleteVouchersRequest,
  ): Promise<void> {
    return this.request<void>('DELETE', '/api/v3/vouchers', ctx, { body });
  }

  // ============================
  // Transport internals
  // ============================

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    ctx: MfV3RequestContext,
    opts?: { query?: Record<string, MfV3QueryValue>; body?: unknown },
  ): Promise<T> {
    const url = this.baseUrl + path + this.buildQuery(opts?.query);
    const rateKey = ctx.rateKey || ctx.token;

    let lastErr: unknown;
    for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
      await this.acquireRateSlot(rateKey);
      try {
        const config: AxiosRequestConfig = {
          method,
          url,
          headers: {
            Authorization: `Bearer ${ctx.token}`,
            Accept: 'application/json',
            ...(opts?.body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(opts?.body !== undefined ? { data: opts.body } : {}),
        };
        // Cast around the duplicated rxjs install (root vs apps/api) whose
        // Observable types don't structurally unify — same workaround the MCP
        // path uses for httpService calls.
        const res = (await lastValueFrom(
          this.httpService.request<T>(config) as any,
        )) as AxiosResponse<T>;
        return res.data as T;
      } catch (err) {
        lastErr = err;
        const status = (err as AxiosError)?.response?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (retryable && attempt < RETRY_BACKOFFS_MS.length) {
          const delay = RETRY_BACKOFFS_MS[attempt];
          this.logger.warn(
            `MF v3 ${method} ${path} status=${status}, retry ${attempt + 1}/${RETRY_BACKOFFS_MS.length} in ${delay}ms`,
          );
          await this.sleep(delay);
          continue;
        }
        throw this.toHttpError(err, method, path);
      }
    }
    // Unreachable in practice: loop either returns or throws.
    throw this.toHttpError(lastErr, method, path);
  }

  private toHttpError(
    err: unknown,
    method: string,
    path: string,
  ): MfV3HttpError {
    const axErr = err as AxiosError<{ errors?: { code?: string; message?: string }[] }>;
    const status = axErr?.response?.status ?? 0;
    const body = axErr?.response?.data;
    const first = body?.errors?.[0];
    const code = first?.code;
    const message =
      first?.message || axErr?.message || `MF v3 request failed: ${method} ${path}`;
    return new MfV3HttpError(status, code, body, message);
  }

  /**
   * Build a query string without double-encoding MF's pre-encoded ids. Values
   * that already contain a percent-escape (e.g. account_id `...%2B...%3D%3D`,
   * transaction ids) are passed through verbatim; everything else is
   * percent-encoded normally. Arrays repeat the key (form/explode style).
   */
  private buildQuery(query?: Record<string, MfV3QueryValue>): string {
    if (!query) return '';
    const parts: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const push = (v: string | number | boolean) =>
        parts.push(`${encodeURIComponent(key)}=${this.encodeQueryValue(v)}`);
      if (Array.isArray(value)) {
        for (const v of value) push(v);
      } else {
        push(value);
      }
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  private encodeQueryValue(value: string | number | boolean): string {
    const s = String(value);
    // Already percent-encoded MF id → echo verbatim (re-encoding breaks lookups).
    if (/%[0-9A-Fa-f]{2}/.test(s)) return s;
    return encodeURIComponent(s);
  }

  /**
   * Journal ids arrive from the API already URL-encoded, so path interpolation
   * must not re-encode them; a raw id (no percent-escapes) is encoded once.
   */
  private encodePathId(id: string): string {
    return /%[0-9A-Fa-f]{2}/.test(id) ? id : encodeURIComponent(id);
  }

  private async acquireRateSlot(key: string): Promise<void> {
    const prev = this.rateChain.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const mine = prev.then(() => gate);
    this.rateChain.set(key, mine);
    await prev.catch(() => undefined);
    try {
      const now = Date.now();
      const recent = (this.rateTimestamps.get(key) ?? []).filter(
        (t) => now - t < RATE_WINDOW_MS,
      );
      if (recent.length >= RATE_LIMIT_PER_SEC) {
        const wait = RATE_WINDOW_MS - (now - recent[0]);
        if (wait > 0) await this.sleep(wait);
      }
      const after = Date.now();
      const pruned = (this.rateTimestamps.get(key) ?? []).filter(
        (t) => after - t < RATE_WINDOW_MS,
      );
      pruned.push(after);
      this.rateTimestamps.set(key, pruned);
    } finally {
      release();
      // Drop the chain tail once drained so the map does not grow unbounded.
      if (this.rateChain.get(key) === mine) this.rateChain.delete(key);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
