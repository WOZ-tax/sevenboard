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
import { decryptIfAvailable } from '../common/crypto.util';
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
   * Prod: reads from Organization record and refreshes if expired.
   */
  private async getAccessToken(orgId: string): Promise<string> {
    // Dev shortcut (production では無効)
    const envToken = process.env.MF_ACCESS_TOKEN;
    if (envToken && process.env.NODE_ENV !== 'production') return envToken;

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (!org) throw new UnauthorizedException('Organization not found');

    const mfTokenRaw = (org as any).mfAccessToken;
    if (!mfTokenRaw) {
      throw new UnauthorizedException(
        'MoneyForward not connected for this organization',
      );
    }

    const expiresAt = (org as any).mfTokenExpiresAt as Date | null;
    if (expiresAt && expiresAt < new Date()) {
      const rawRefresh = (org as any).mfRefreshToken;
      return this.refreshToken(orgId, rawRefresh ? decryptIfAvailable(rawRefresh) : null);
    }

    return decryptIfAvailable(mfTokenRaw);
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
          `${this.baseUrl}/oauth/token`,
          {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          },
          { headers: { 'Content-Type': 'application/json' } },
        ) as any,
      );

      await this.prisma.organization.update({
        where: { id: orgId },
        data: {
          mfAccessToken: res.data.access_token,
          mfRefreshToken: res.data.refresh_token || refreshToken,
          mfTokenExpiresAt: new Date(
            Date.now() + (res.data.expires_in || 3600) * 1000,
          ),
        } as any,
      });

      return res.data.access_token;
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
