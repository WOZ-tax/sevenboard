import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { encryptIfAvailable } from '../common/crypto.util';
import { isInternalAdvisor, isInternalOwner } from './staff.helpers';
import {
  createMfOAuthState,
  verifyMfOAuthState,
} from './mf-oauth-state.util';

@Controller('auth/mf')
export class MfOAuthController {
  private readonly logger = new Logger(MfOAuthController.name);

  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
  ) {}

  /**
   * 当該 user が orgId に access できるかを検証。失敗時 ForbiddenException。
   * OrgAccessGuard と同じロジック（authorize / callback の両方で再利用）。
   */
  private async assertOrgAccess(
    user: { id: string; role: string; orgId: string | null },
    orgId: string,
  ): Promise<void> {
    if (isInternalOwner(user)) return;
    if (isInternalAdvisor(user)) {
      const m = await this.prisma.organizationMembership.findUnique({
        where: { userId_orgId: { userId: user.id, orgId } },
      });
      if (!m) {
        throw new ForbiddenException('この顧問先への access 権限がありません');
      }
      return;
    }
    // 顧問先側ユーザー（CL の owner/admin/member/viewer）は自社のみ
    if (user.orgId !== orgId) {
      throw new ForbiddenException('この組織への access 権限がありません');
    }
  }

  /**
   * Step 1: 認可URL生成 -- フロントにリダイレクトURLを返す
   *
   * セキュリティ:
   * - JWT 必須
   * - orgId に対して req.user が access 権限を持つことを検証
   *   （内部 owner=全件 / 内部 advisor=Membership / 顧問先側=自社のみ）
   * - state は HMAC 署名 + 短命 exp + nonce で CSRF/リプレイ耐性
   */
  @Get('authorize')
  @UseGuards(JwtAuthGuard)
  async authorize(
    @Req() req: Request,
    @Query('orgId') orgId: string,
  ) {
    if (!orgId) {
      throw new BadRequestException('orgId is required');
    }

    const clientId = process.env.MF_CLIENT_ID;
    const redirectUri = process.env.MF_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new BadRequestException(
        'MF_CLIENT_ID and MF_REDIRECT_URI must be configured',
      );
    }

    const user = req.user as { id: string; role: string; orgId: string | null };

    // 対象 org への access を検証（OrgAccessGuard と同等のロジック）
    await this.assertOrgAccess(user, orgId);

    // 署名済み state（orgId + userId + nonce + exp）。callback 側で検証
    const state = createMfOAuthState({ orgId, userId: user.id });

    // MCP HTTP transport 経由で API を叩くため、MCP サーバー URL を resource indicator として付与する。
    // これが無いと token は取れても MCP 側で弾かれる。
    const resource =
      process.env.MF_MCP_URL ||
      'https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3';

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'mfc/accounting/offices.read mfc/accounting/accounts.read mfc/accounting/departments.read mfc/accounting/journal.read mfc/accounting/journal.write mfc/accounting/report.read mfc/accounting/taxes.read mfc/accounting/trade_partners.read mfc/accounting/trade_partners.write mfc/accounting/connected_account.read mfc/accounting/transaction.write',
      state,
      resource,
    });

    return {
      authUrl: `https://api.biz.moneyforward.com/authorize?${params}`,
    };
  }

  /**
   * Step 2: コールバック -- token exchange -- DB保存
   * ブラウザリダイレクトなので JWT認証なし (state で検証)
   */
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendOrigin =
      process.env.CORS_ORIGIN || 'http://localhost:3000';

    // OAuth error (ユーザーが拒否した場合など)
    if (error) {
      this.logger.warn(`MF OAuth error: ${error}`);
      res.redirect(`${frontendOrigin}/settings?mf=error&reason=${error}`);
      return;
    }

    if (!code || !state) {
      this.logger.warn('MF OAuth callback missing code or state');
      res.redirect(`${frontendOrigin}/settings?mf=error&reason=missing_params`);
      return;
    }

    // state を HMAC 検証 + 期限確認
    const verified = verifyMfOAuthState(state);
    if (!verified.ok || !verified.payload) {
      this.logger.warn(
        `MF OAuth callback: state ${verified.reason ?? 'invalid'}`,
      );
      res.redirect(
        `${frontendOrigin}/settings?mf=error&reason=invalid_state`,
      );
      return;
    }
    const { orgId, userId } = verified.payload;

    // 念のため userId と orgId の access を再検証（authorize 時から状況が変わった場合）
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, orgId: true },
      });
      if (!user) throw new ForbiddenException('user not found');
      await this.assertOrgAccess(user, orgId);
    } catch (err) {
      this.logger.warn(
        `MF OAuth callback: post-auth access check failed: ${err instanceof Error ? err.message : err}`,
      );
      res.redirect(
        `${frontendOrigin}/settings?mf=error&reason=access_denied`,
      );
      return;
    }

    try {
      // Token exchange
      // RFC 8707: authorize で resource を送ったら token exchange でも同じ resource を送る。
      const resource =
        process.env.MF_MCP_URL ||
        'https://beta.mcp.developers.biz.moneyforward.com/mcp/ca/v3';
      const basicAuth = Buffer.from(`${process.env.MF_CLIENT_ID}:${process.env.MF_CLIENT_SECRET}`).toString('base64');
      const tokenRes: AxiosResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.biz.moneyforward.com/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.MF_REDIRECT_URI!,
            resource,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${basicAuth}`,
            },
          },
        ) as any,
      );

      const { access_token, refresh_token, expires_in } = tokenRes.data;

      // Integration テーブルに upsert
      await this.prisma.integration.upsert({
        where: {
          orgId_provider: { orgId, provider: 'MF_CLOUD' },
        },
        create: {
          orgId,
          provider: 'MF_CLOUD',
          accessToken: encryptIfAvailable(access_token),
          refreshToken: refresh_token
            ? encryptIfAvailable(refresh_token)
            : null,
          tokenExpiry: new Date(
            Date.now() + (expires_in || 2592000) * 1000,
          ),
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
        },
        update: {
          accessToken: encryptIfAvailable(access_token),
          refreshToken: refresh_token
            ? encryptIfAvailable(refresh_token)
            : undefined,
          tokenExpiry: new Date(
            Date.now() + (expires_in || 2592000) * 1000,
          ),
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
        },
      });

      this.logger.log(`MF OAuth connected for org ${orgId}`);
      res.redirect(`${frontendOrigin}/settings?mf=connected`);
    } catch (err: any) {
      this.logger.error(
        'MF OAuth token exchange failed',
        err?.response?.data || err?.message,
      );
      res.redirect(`${frontendOrigin}/settings?mf=error&reason=token_exchange`);
    }
  }
}
