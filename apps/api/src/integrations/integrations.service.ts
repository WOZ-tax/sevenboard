import {
  Injectable,
  NotFoundException,
  NotImplementedException,
  BadGatewayException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encryptIfAvailable } from '../common/crypto.util';
import { SyncService } from '../sync/sync.service';
import { MfApiService } from '../mf/mf-api.service';
import { KintoneApiService } from '../kintone/kintone-api.service';
import { isDemoOrg, DEMO_AS_OF } from '../demo/demo.constants';

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private syncService: SyncService,
    private mf: MfApiService,
    private kintone: KintoneApiService,
  ) {}

  async findAll(orgId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const integrations = await this.prisma.integration.findMany({
      where: { tenantId, orgId },
    });

    // トークンは返さない（セキュリティ）
    return integrations.map((i) => ({
      provider: i.provider,
      isConnected: isDemoOrg(orgId) || !!i.accessToken,
      dataSource: isDemoOrg(orgId) ? 'demo' : 'external',
      dataAsOf: isDemoOrg(orgId) ? DEMO_AS_OF : undefined,
      lastSyncAt: i.lastSyncAt,
      syncStatus: i.syncStatus,
    }));
  }

  async connect(orgId: string, provider: string) {
    const providerEnum = this.toProviderEnum(provider);
    const { tenantId } = await this.prisma.orgScope(orgId);

    // kintone: 環境変数で認証。疎通テスト後にIntegrationレコード作成
    if (providerEnum === 'BOOKKEEPING_PLUGIN') {
      const office = await this.mf.getOffice(orgId);
      const progress = await this.kintone.getByMfOfficeCode(office.code);
      if (!progress)
        throw new BadGatewayException(
          'kintoneの月次進捗を取得できませんでした',
        );
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

    if (!integration || (!integration.accessToken && !isDemoOrg(orgId))) {
      throw new NotFoundException(`Integration ${provider} not connected`);
    }

    if (providerEnum === 'MF_CLOUD') {
      const result = await this.syncService.runSync(orgId);
      if (result.status !== 'SUCCESS')
        throw new BadGatewayException(
          'MFの同期が完了しませんでした。データ連携状況を確認してください。',
        );
      return {
        provider,
        ...result,
        syncStatus: 'SUCCESS',
        lastSyncAt: result.syncedAt,
      };
    }
    if (providerEnum !== 'BOOKKEEPING_PLUGIN')
      throw new NotImplementedException(`${provider}の同期は未対応です`);
    // Only mark success after reading the actual connection (or isolated demo source).
    const office = await this.mf.getOffice(orgId);
    const progress = await this.kintone.getByMfOfficeCode(office.code);
    if (!progress)
      throw new BadGatewayException('kintoneの月次進捗を取得できませんでした');
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
      isConnected: isDemoOrg(orgId) || !!integration.accessToken,
      dataSource: isDemoOrg(orgId) ? 'demo' : 'external',
      dataAsOf: isDemoOrg(orgId) ? DEMO_AS_OF : undefined,
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
