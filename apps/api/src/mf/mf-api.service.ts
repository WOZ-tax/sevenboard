import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
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

@Injectable()
export class MfApiService {
  private readonly logger = new Logger(MfApiService.name);
  private readonly baseUrl: string;

  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
    private cache: CacheService,
  ) {
    this.baseUrl =
      process.env.MF_API_BASE_URL ||
      'https://accounting.moneyforward.com/api/v3';
  }

  /**
   * Resolve access token for an organization.
   * Dev: falls back to MF_ACCESS_TOKEN env var.
   * Prod: reads from Integration table and refreshes if expired.
   */
  private async getAccessToken(orgId: string): Promise<string> {
    // Dev shortcut (production では無効)
    const envToken = process.env.MF_ACCESS_TOKEN;
    if (envToken && process.env.NODE_ENV !== 'production') return envToken;

    // Integration テーブルから MF_CLOUD のトークンを取得
    const integration = await this.prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: 'MF_CLOUD' } },
    });

    if (!integration?.accessToken) {
      throw new UnauthorizedException(
        'MoneyForward not connected. Please connect from Settings.',
      );
    }

    // トークン期限チェック → リフレッシュ
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
    if (!refreshToken) {
      throw new UnauthorizedException('MF refresh token not available');
    }

    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.post(
          'https://api.biz.moneyforward.com/oauth/v2/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: process.env.MF_CLIENT_ID || '',
            client_secret: process.env.MF_CLIENT_SECRET || '',
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
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
    } catch (err) {
      this.logger.error('MF token refresh failed', err);
      throw new UnauthorizedException('MF token refresh failed');
    }
  }

  private async request<T>(
    orgId: string,
    path: string,
    params?: Record<string, any>,
  ): Promise<T> {
    // A-3: インメモリキャッシュ（5分TTL）
    const cacheKey = `mf:${orgId}:${path}:${JSON.stringify(params || {})}`;
    const cached = this.cache.get<T>(cacheKey);
    if (cached) return cached;

    const token = await this.getAccessToken(orgId);

    try {
      const res: AxiosResponse = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }) as any,
      );
      this.cache.set(cacheKey, res.data, 5 * 60 * 1000); // 5分キャッシュ
      return res.data as T;
    } catch (err: any) {
      const status = err?.response?.status;

      // 401: try refresh once
      if (status === 401) {
        this.logger.warn('MF 401, attempting token refresh');
        const org = await this.prisma.organization.findUnique({
          where: { id: orgId },
        });
        const rawRefresh = (org as any)?.mfRefreshToken;
        const newToken = await this.refreshToken(
          orgId,
          rawRefresh ? decryptIfAvailable(rawRefresh) : null,
        );

        const retry: AxiosResponse = await lastValueFrom(
          this.httpService.get(`${this.baseUrl}${path}`, {
            headers: { Authorization: `Bearer ${newToken}` },
            params,
          }) as any,
        );
        return retry.data as T;
      }

      if (status === 429) {
        throw new InternalServerErrorException(
          'MF API rate limit exceeded. Please retry later.',
        );
      }

      this.logger.error(`MF API error: ${status} ${path}`, err?.message);
      throw new InternalServerErrorException(
        `MF API error: ${status || 'unknown'}`,
      );
    }
  }

  // --- Public API methods ---

  async getOffice(orgId: string): Promise<MfOffice> {
    return this.request<MfOffice>(orgId, '/office');
  }

  async getTrialBalancePL(
    orgId: string,
    fiscalYear?: number,
  ): Promise<MfTrialBalance> {
    const params: Record<string, any> = {};
    if (fiscalYear) params.fiscal_year = fiscalYear;
    return this.request<MfTrialBalance>(
      orgId,
      '/reports/trial_balance/profit_loss',
      params,
    );
  }

  async getTrialBalanceBS(
    orgId: string,
    fiscalYear?: number,
  ): Promise<MfTrialBalance> {
    const params: Record<string, any> = {};
    if (fiscalYear) params.fiscal_year = fiscalYear;
    return this.request<MfTrialBalance>(
      orgId,
      '/reports/trial_balance/balance_sheet',
      params,
    );
  }

  async getTransitionPL(
    orgId: string,
    fiscalYear?: number,
  ): Promise<MfTransition> {
    const params: Record<string, any> = { type: 'monthly' };
    if (fiscalYear) params.fiscal_year = fiscalYear;
    return this.request<MfTransition>(
      orgId,
      '/reports/transition/profit_loss',
      params,
    );
  }

  async getTransitionBS(
    orgId: string,
    fiscalYear?: number,
  ): Promise<MfTransition> {
    const params: Record<string, any> = { type: 'monthly' };
    if (fiscalYear) params.fiscal_year = fiscalYear;
    return this.request<MfTransition>(
      orgId,
      '/reports/transition/balance_sheet',
      params,
    );
  }

  async getAccounts(orgId: string): Promise<{ accounts: MfAccount[] }> {
    return this.request<{ accounts: MfAccount[] }>(orgId, '/accounts');
  }

  async getJournals(
    orgId: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<any> {
    const queryParams: Record<string, any> = {};
    if (params?.startDate) queryParams.start_date = params.startDate;
    if (params?.endDate) queryParams.end_date = params.endDate;
    return this.request<any>(orgId, '/journals', queryParams);
  }
}
