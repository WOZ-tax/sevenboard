import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
  ) {}

  async runSync(orgId: string) {
    this.logger.log(`Starting sync for org ${orgId}`);

    // Integration レコードの syncStatus を IN_PROGRESS に更新
    await this.updateSyncStatus(orgId, 'IN_PROGRESS');

    try {
      // 1. MF科目一覧を取得し AccountMaster に同期
      const { accounts: mfAccounts } = await this.mfApi.getAccounts(orgId);
      let accountsSynced = 0;

      for (const mfAccount of mfAccounts) {
        const externalId = String(mfAccount.id);
        const existing = await this.prisma.accountMaster.findFirst({
          where: { orgId, externalId },
        });

        if (existing) {
          // externalIdで紐付け済み。名前はSevenBoard側の変更を尊重して上書きしない
          // MF側科目名はログのみ記録
        } else {
          // 名前でマッチ試行
          const byName = await this.prisma.accountMaster.findFirst({
            where: { orgId, name: mfAccount.name, externalId: null },
          });
          if (byName) {
            await this.prisma.accountMaster.update({
              where: { id: byName.id },
              data: { externalId },
            });
          }
          // 未マッチの場合はスキップ（オンボーディングで処理）
        }
        accountsSynced++;
      }

      // 2. PL/BS試算表を取得
      const [plData, bsData] = await Promise.all([
        this.mfApi.getTrialBalancePL(orgId),
        this.mfApi.getTrialBalanceBS(orgId),
      ]);

      const plRows = this.mfTransform.transformTrialBalancePL(plData);
      const bsResult = this.mfTransform.transformTrialBalanceBS(bsData);
      const allRows = [
        ...plRows,
        ...bsResult.assets,
        ...bsResult.liabilitiesEquity,
      ];

      // 3. ActualEntry に upsert
      let entriesUpserted = 0;
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const row of allRows) {
        if (row.isHeader) continue;

        const accountName = row.category.trim();
        const account = await this.prisma.accountMaster.findFirst({
          where: { orgId, name: accountName },
        });
        if (!account) continue;

        // find existing or create
        const existing = await this.prisma.actualEntry.findFirst({
          where: {
            orgId,
            accountId: account.id,
            departmentId: null,
            month: currentMonth,
          },
        });
        if (existing) {
          await this.prisma.actualEntry.update({
            where: { id: existing.id },
            data: {
              amount: row.current,
              source: 'MF_CLOUD',
              syncedAt: now,
            },
          });
        } else {
          await this.prisma.actualEntry.create({
            data: {
              orgId,
              accountId: account.id,
              month: currentMonth,
              amount: row.current,
              source: 'MF_CLOUD',
              syncedAt: now,
            },
          });
        }
        entriesUpserted++;
      }

      // 4. Integration テーブル更新
      await this.updateSyncStatus(orgId, 'SUCCESS');

      this.logger.log(
        `Sync completed for org ${orgId}: ${accountsSynced} accounts, ${entriesUpserted} entries`,
      );

      return {
        status: 'SUCCESS',
        accountsSynced,
        entriesUpserted,
        syncedAt: now.toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Sync failed for org ${orgId}`, err?.message);
      await this.updateSyncStatus(orgId, 'FAILED');

      return {
        status: 'FAILED',
        error: err?.message || 'Unknown error',
        syncedAt: new Date().toISOString(),
      };
    }
  }

  async getSyncStatus(orgId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { orgId, provider: 'MF_CLOUD' },
    });

    if (!integration) {
      return {
        provider: 'MF_CLOUD',
        isConnected: false,
        lastSyncAt: null,
        syncStatus: 'NEVER',
      };
    }

    return {
      provider: 'MF_CLOUD',
      isConnected: true,
      lastSyncAt: integration.lastSyncAt?.toISOString() || null,
      syncStatus: integration.syncStatus,
    };
  }

  private async updateSyncStatus(orgId: string, status: string) {
    try {
      await this.prisma.integration.upsert({
        where: {
          orgId_provider: { orgId, provider: 'MF_CLOUD' },
        },
        update: {
          syncStatus: status as any,
          lastSyncAt: status === 'SUCCESS' ? new Date() : undefined,
        },
        create: {
          orgId,
          provider: 'MF_CLOUD',
          syncStatus: status as any,
          lastSyncAt: status === 'SUCCESS' ? new Date() : undefined,
        },
      });
    } catch (err) {
      this.logger.warn('Failed to update sync status', err);
    }
  }
}
