import {
  Controller,
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

@Controller('auth/mf')
export class MfOAuthController {
  private readonly logger = new Logger(MfOAuthController.name);

  constructor(
    private httpService: HttpService,
    private prisma: PrismaService,
  ) {}

  /**
   * Step 1: 認可URL生成 -- フロントにリダイレクトURLを返す
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

    const user = req.user as any;
    // state に orgId + userId を含める (CSRF対策 + コールバック時に紐付け)
    const state = Buffer.from(
      JSON.stringify({ orgId, userId: user.id }),
    ).toString('base64url');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'mfc/accounting/offices.read mfc/accounting/accounts.read mfc/accounting/journal.read mfc/accounting/journal.write mfc/accounting/report.read mfc/accounting/taxes.read mfc/accounting/trade_partners.read mfc/accounting/connected_account.read mfc/accounting/transaction.write',
      state,
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

    let orgId: string;
    try {
      const parsed = JSON.parse(
        Buffer.from(state, 'base64url').toString(),
      );
      orgId = parsed.orgId;
    } catch {
      this.logger.warn('MF OAuth callback: invalid state');
      res.redirect(`${frontendOrigin}/settings?mf=error&reason=invalid_state`);
      return;
    }

    try {
      // Token exchange
      const tokenRes: AxiosResponse = await firstValueFrom(
        this.httpService.post(
          'https://api.biz.moneyforward.com/oauth/v2/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: process.env.MF_CLIENT_ID!,
            client_secret: process.env.MF_CLIENT_SECRET!,
            redirect_uri: process.env.MF_REDIRECT_URI!,
          }).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
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
