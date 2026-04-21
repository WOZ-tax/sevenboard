import {
  Injectable,
  ServiceUnavailableException,
  InternalServerErrorException,
  BadGatewayException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/cache.service';
import { decryptIfAvailable, encryptIfAvailable } from '../common/crypto.util';
import {
  MfOffice,
  MfTrialBalance,
  MfTransition,
  MfAccount,
} from './types/mf-api.types';

/**
 * MF Biz Platform API Service
 *
 * MF Cloud Accounting API は MCP (Model Context Protocol) HTTP transport 経由でのみ
 * アクセス可能。OAuth トークンを Bearer ヘッダーに付与し、MCP サーバーに
 * JSON-RPC リクエストを送信してデータを取得する。
 */
@Injectable()
export class MfApiService {
  private readonly logger = new Logger(MfApiService.name);
  private readonly mcpUrl: string;

  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {
    this.mcpUrl =
      process.env.MF_MCP_URL ||
      'https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3';
  }

  // ============================
  // Token management
  // ============================

  private async getAccessToken(orgId: string): Promise<string> {
    const envToken = process.env.MF_ACCESS_TOKEN;
    if (envToken && process.env.NODE_ENV !== 'production') return envToken;

    const integration = await this.prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: 'MF_CLOUD' } },
    });

    if (!integration?.accessToken) {
      throw new ServiceUnavailableException(
        'MoneyForward not connected. Please connect from Settings.',
      );
    }

    if (integration.tokenExpiry && integration.tokenExpiry < new Date()) {
      return this.refreshToken(
        orgId,
        integration.refreshToken
          ? decryptIfAvailable(integration.refreshToken)
          : null,
      );
    }

    return decryptIfAvailable(integration.accessToken);
  }

  private async refreshToken(
    orgId: string,
    refreshToken: string | null,
  ): Promise<string> {
    // refresh token missing → integration is effectively disconnected; user must reconnect.
    if (!refreshToken) {
      throw new ServiceUnavailableException(
        'MoneyForward reconnect required. Please reconnect from Settings.',
      );
    }

    try {
      const clientId = process.env.MF_CLIENT_ID || '';
      const clientSecret = process.env.MF_CLIENT_SECRET || '';
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const res: AxiosResponse = await lastValueFrom(
        this.httpService.post(
          'https://api.biz.moneyforward.com/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${basicAuth}`,
            },
          },
        ) as any,
      );

      const newAccessToken = res.data.access_token;
      const newRefreshToken = res.data.refresh_token || refreshToken;

      await this.prisma.integration.update({
        where: { orgId_provider: { orgId, provider: 'MF_CLOUD' } },
        data: {
          accessToken: encryptIfAvailable(newAccessToken),
          refreshToken: encryptIfAvailable(newRefreshToken),
          tokenExpiry: new Date(
            Date.now() + (res.data.expires_in || 2592000) * 1000,
          ),
        },
      });

      return newAccessToken;
    } catch (err: any) {
      const status = err?.response?.status;
      const errorCode = err?.response?.data?.error;
      this.logger.error(
        `MF token refresh failed: status=${status} error=${errorCode}`,
        err?.response?.data || err?.message,
      );

      // invalid_grant / unauthorized_client / 400 → refresh token is dead, reconnect needed
      if (
        status === 400 ||
        status === 401 ||
        errorCode === 'invalid_grant' ||
        errorCode === 'unauthorized_client'
      ) {
        throw new ServiceUnavailableException(
          'MoneyForward reconnect required. Please reconnect from Settings.',
        );
      }

      // transient upstream failure (network, 5xx) → retryable
      throw new BadGatewayException('MF token refresh temporarily failed');
    }
  }

  // ============================
  // MCP transport
  // ============================

  /**
   * MCP セッションを初期化し sessionId を取得
   */
  private async initSession(token: string): Promise<string> {
    const res: AxiosResponse = await lastValueFrom(
      this.httpService.post(
        this.mcpUrl,
        {
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'sevenboard-api', version: '1.0.0' },
          },
          id: 1,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${token}`,
          },
          // MCP HTTP transport may return SSE; we need to handle both
          transformResponse: [(data: string) => data],
        },
      ) as any,
    );

    // Extract session ID from Mcp-Session header
    const sessionId = res.headers['mcp-session'] || res.headers['mcp-session-id'] || '';

    // Parse response: may be JSON or SSE
    const body = this.parseMcpResponse(res.data);
    if (body?.error) {
      throw new InternalServerErrorException(`MCP init error: ${body.error.message}`);
    }

    // Send initialized notification
    if (sessionId) {
      try {
        await lastValueFrom(
          this.httpService.post(
            this.mcpUrl,
            {
              jsonrpc: '2.0',
              method: 'notifications/initialized',
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'Mcp-Session': sessionId,
              },
            },
          ) as any,
        );
      } catch {
        // notification failures are non-fatal
      }
    }

    return sessionId;
  }

  /**
   * MCP tool を呼び出す
   */
  private async callTool(
    token: string,
    sessionId: string,
    toolName: string,
    args: Record<string, any> = {},
  ): Promise<any> {
    const res: AxiosResponse = await lastValueFrom(
      this.httpService.post(
        this.mcpUrl,
        {
          jsonrpc: '2.0',
          method: 'tools/call',
          params: { name: toolName, arguments: args },
          id: 2,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            Authorization: `Bearer ${token}`,
            ...(sessionId ? { 'Mcp-Session': sessionId } : {}),
          },
          transformResponse: [(data: string) => data],
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      ) as any,
    );

    const body = this.parseMcpResponse(res.data);
    if (body?.error) {
      throw new InternalServerErrorException(`MCP tool error: ${body.error.message}`);
    }

    // Extract content from MCP tool result
    const result = body?.result;
    if (!result?.content) return result;

    // MCP returns content as array of {type, text} blocks
    const textBlock = result.content.find((c: any) => c.type === 'text');
    if (!textBlock?.text) return result;

    try {
      return JSON.parse(textBlock.text);
    } catch {
      return textBlock.text;
    }
  }

  /**
   * SSE or JSON レスポンスをパース
   */
  private parseMcpResponse(raw: string): any {
    if (!raw) return null;
    const trimmed = raw.trim();

    // Pure JSON
    if (trimmed.startsWith('{')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }

    // SSE format: events separated by double newlines.
    // Large MCP responses split JSON across multiple data: lines.
    // Concatenate all data: fragments within each event before parsing.
    const events = trimmed.split(/\n\n+/);

    for (const event of events) {
      const eventLines = event.split('\n');
      const dataFragments: string[] = [];
      for (const line of eventLines) {
        if (line.startsWith('data:')) {
          dataFragments.push(line.slice(5).trim());
        }
      }
      if (dataFragments.length === 0) continue;

      // Try concatenating fragments (JSON split across lines)
      const joined = dataFragments.join('');
      try {
        const parsed = JSON.parse(joined);
        if (parsed.id !== undefined || parsed.result || parsed.error) return parsed;
      } catch { /* try next */ }

      // Try each fragment individually
      for (const frag of dataFragments) {
        try {
          const parsed = JSON.parse(frag);
          if (parsed.id !== undefined || parsed.result || parsed.error) return parsed;
        } catch { /* skip */ }
      }
    }

    return null;
  }

  // ============================
  // Cached MCP request
  // ============================

  private async mcpRequest<T>(
    orgId: string,
    toolName: string,
    args: Record<string, any> = {},
  ): Promise<T> {
    const cacheKey = `mf:${orgId}:${toolName}:${JSON.stringify(args)}`;
    const cached = this.cache.get<T>(cacheKey);
    if (cached) return cached;

    const token = await this.getAccessToken(orgId);

    try {
      const sessionId = await this.initSession(token);
      const data = await this.callTool(token, sessionId, toolName, args);
      if (data == null) {
        throw new InternalServerErrorException(
          `MF MCP returned empty response for ${toolName}`,
        );
      }
      this.cache.set(cacheKey, data, 5 * 60 * 1000);
      return data as T;
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data || err?.message;
      const headers = err?.response?.headers || {};
      this.logger.error(`MF MCP error detail: status=${status} wwwAuth=${headers['www-authenticate']} body=${JSON.stringify(msg).substring(0, 500)}`);

      // 401/403: try token refresh (MCP server returns 401 for expired/invalid tokens)
      if (status === 401 || status === 403 || String(msg).includes('invalid_token')) {
        this.logger.warn('MF MCP 401, attempting token refresh');
        const integration = await this.prisma.integration.findUnique({
          where: { orgId_provider: { orgId, provider: 'MF_CLOUD' } },
        });
        const newToken = await this.refreshToken(
          orgId,
          integration?.refreshToken
            ? decryptIfAvailable(integration.refreshToken)
            : null,
        );
        const sessionId = await this.initSession(newToken);
        const data = await this.callTool(newToken, sessionId, toolName, args);
        this.cache.set(cacheKey, data, 5 * 60 * 1000);
        return data as T;
      }

      this.logger.error(`MF MCP error: ${toolName}`, msg);
      throw new InternalServerErrorException(
        `MF API error: ${status || 'unknown'}`,
      );
    }
  }

  // ============================
  // Public API methods
  // ============================

  async getOffice(orgId: string): Promise<MfOffice> {
    return this.mcpRequest<MfOffice>(orgId, 'mfc_ca_currentOffice');
  }

  async getTrialBalancePL(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<MfTrialBalance> {
    const args: Record<string, any> = {};
    if (fiscalYear) args.fiscal_year = fiscalYear;
    if (endMonth) args.end_month = endMonth;
    return this.mcpRequest<MfTrialBalance>(
      orgId,
      'mfc_ca_getReportsTrialBalanceProfitLoss',
      args,
    );
  }

  async getTrialBalanceBS(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<MfTrialBalance> {
    const args: Record<string, any> = {};
    if (fiscalYear) args.fiscal_year = fiscalYear;
    if (endMonth) args.end_month = endMonth;
    return this.mcpRequest<MfTrialBalance>(
      orgId,
      'mfc_ca_getReportsTrialBalanceBalanceSheet',
      args,
    );
  }

  async getTransitionPL(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<MfTransition> {
    const args: Record<string, any> = { type: 'monthly' };
    if (fiscalYear) args.fiscal_year = fiscalYear;
    if (endMonth) args.end_month = endMonth;
    return this.mcpRequest<MfTransition>(
      orgId,
      'mfc_ca_getReportsTransitionProfitLoss',
      args,
    );
  }

  async getTransitionBS(
    orgId: string,
    fiscalYear?: number,
    endMonth?: number,
  ): Promise<MfTransition> {
    const args: Record<string, any> = { type: 'monthly' };
    if (fiscalYear) args.fiscal_year = fiscalYear;
    if (endMonth) args.end_month = endMonth;
    return this.mcpRequest<MfTransition>(
      orgId,
      'mfc_ca_getReportsTransitionBalanceSheet',
      args,
    );
  }

  async getAccounts(orgId: string): Promise<{ accounts: MfAccount[] }> {
    const data = await this.mcpRequest<any>(orgId, 'mfc_ca_getAccounts');
    return { accounts: Array.isArray(data) ? data : data?.accounts || [] };
  }

  async getJournals(
    orgId: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<any> {
    const args: Record<string, any> = { per_page: 500 };
    if (params?.startDate) args.start_date = params.startDate;
    if (params?.endDate) args.end_date = params.endDate;

    // ページネーション: 全件取得
    const firstPage = await this.mcpRequest<any>(orgId, 'mfc_ca_getJournals', args);
    const allJournals = [...(firstPage?.journals || [])];

    // 500件ちょうどなら次ページがある可能性
    let page = 2;
    while (firstPage?.journals?.length === 500 && page <= 20) {
      const nextPage = await this.mcpRequest<any>(orgId, 'mfc_ca_getJournals', { ...args, page });
      if (!nextPage?.journals?.length) break;
      allJournals.push(...nextPage.journals);
      if (nextPage.journals.length < 500) break;
      page++;
    }

    return { journals: allJournals };
  }
}
