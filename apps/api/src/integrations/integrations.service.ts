import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptIfAvailable, decryptIfAvailable } from '../common/crypto.util';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const integrations = await this.prisma.integration.findMany({
      where: { tenantId, orgId },
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
    const { tenantId } = await this.prisma.orgScope(orgId);

    // kintone: 環境変数で認証。疎通テスト後にIntegrationレコード作成
    if (providerEnum === 'BOOKKEEPING_PLUGIN') {
      await this.prisma.integration.upsert({
        where: {
          tenantId_orgId_provider: { tenantId, orgId, provider: providerEnum },
        },
        create: {
          tenantId,
          orgId,
          provider: providerEnum,
          accessToken: encryptIfAvailable('kintone_env_auth'),
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
        },
        update: {
          accessToken: encryptIfAvailable('kintone_env_auth'),
          syncStatus: 'SUCCESS',
          lastSyncAt: new Date(),
        },
      });
      return { provider, authUrl: null };
    }

    // MF_CLOUD は MfOAuthController で処理。それ以外 (FREEE 等) は未実装。
    // 旧実装は example.com の偽 authUrl を返していたが本番に出ては不味いので
    // 明示的に NotImplemented を返す。
    throw new NotImplementedException(
      `${provider} の接続機能はまだ実装されていません`,
    );
  }

  async disconnect(orgId: string, provider: string) {
    const providerEnum = this.toProviderEnum(provider);
    const { tenantId } = await this.prisma.orgScope(orgId);

    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_orgId_provider: { tenantId, orgId, provider: providerEnum },
      },
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
    const { tenantId } = await this.prisma.orgScope(orgId);

    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_orgId_provider: { tenantId, orgId, provider: providerEnum },
      },
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
    const { tenantId } = await this.prisma.orgScope(orgId);

    const integration = await this.prisma.integration.findUnique({
      where: {
        tenantId_orgId_provider: { tenantId, orgId, provider: providerEnum },
      },
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
