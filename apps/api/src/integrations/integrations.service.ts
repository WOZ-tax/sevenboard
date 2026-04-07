import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptIfAvailable, decryptIfAvailable } from '../common/crypto.util';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    const integrations = await this.prisma.integration.findMany({
      where: { orgId },
    });

    // トークンは返さない（セキュリティ）
    return integrations.map((i) => ({
      provider: i.provider,
      isConnected: !!i.accessToken,
      lastSyncAt: i.lastSyncAt,
      syncStatus: i.syncStatus,
    }));
  }

  async connect(orgId: string, provider: string) {
    const providerEnum = this.toProviderEnum(provider);

    // upsert: 既存レコードがあれば更新、なければ作成
    await this.prisma.integration.upsert({
      where: { orgId_provider: { orgId, provider: providerEnum } },
      create: {
        orgId,
        provider: providerEnum,
        accessToken: encryptIfAvailable('mock_access_token'),
        refreshToken: encryptIfAvailable('mock_refresh_token'),
        tokenExpiry: new Date(Date.now() + 3600 * 1000),
        syncStatus: 'NEVER',
      },
      update: {
        accessToken: encryptIfAvailable('mock_access_token'),
        refreshToken: encryptIfAvailable('mock_refresh_token'),
        tokenExpiry: new Date(Date.now() + 3600 * 1000),
      },
    });

    // 本番ではOAuth URLを返す。今はモック
    return {
      authUrl: `https://api.example.com/oauth/authorize?provider=${provider}`,
      provider,
    };
  }

  async disconnect(orgId: string, provider: string) {
    const providerEnum = this.toProviderEnum(provider);

    const integration = await this.prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: providerEnum } },
    });

    if (!integration) {
      throw new NotFoundException(`Integration ${provider} not found`);
    }

    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
        syncStatus: 'NEVER',
      },
    });

    return { provider, disconnected: true };
  }

  async sync(orgId: string, provider: string) {
    const providerEnum = this.toProviderEnum(provider);

    const integration = await this.prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: providerEnum } },
    });

    if (!integration || !integration.accessToken) {
      throw new NotFoundException(
        `Integration ${provider} not connected`,
      );
    }

    // トークンを復号して利用可能か確認（本番ではAPI呼び出しに使用）
    const _accessToken = decryptIfAvailable(integration.accessToken);
    const _refreshToken = integration.refreshToken
      ? decryptIfAvailable(integration.refreshToken)
      : null;

    // 本番ではMFデータ取込を実行。今はステータスをSUCCESSに更新するだけ
    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: 'SUCCESS',
      },
    });

    return { provider, syncStatus: 'SUCCESS', lastSyncAt: new Date() };
  }

  async getStatus(orgId: string, provider: string) {
    const providerEnum = this.toProviderEnum(provider);

    const integration = await this.prisma.integration.findUnique({
      where: { orgId_provider: { orgId, provider: providerEnum } },
    });

    if (!integration) {
      return {
        provider,
        isConnected: false,
        lastSyncAt: null,
        syncStatus: 'NEVER',
      };
    }

    return {
      provider: integration.provider,
      isConnected: !!integration.accessToken,
      lastSyncAt: integration.lastSyncAt,
      syncStatus: integration.syncStatus,
    };
  }

  private toProviderEnum(provider: string) {
    const map: Record<string, 'MF_CLOUD' | 'FREEE' | 'BOOKKEEPING_PLUGIN'> = {
      MF_CLOUD: 'MF_CLOUD',
      FREEE: 'FREEE',
      BOOKKEEPING_PLUGIN: 'BOOKKEEPING_PLUGIN',
    };
    const result = map[provider.toUpperCase()];
    if (!result) {
      throw new NotFoundException(`Unknown provider: ${provider}`);
    }
    return result;
  }
}
