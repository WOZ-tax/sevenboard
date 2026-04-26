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

      // 4. PL推移表から月次ActualEntryを同期（variance/variable-cost 用）
      const monthlyEntries = await this.syncMonthlyFromTransition(orgId, now);

      // 5. Integration テーブル更新
      await this.updateSyncStatus(orgId, 'SUCCESS');

      this.logger.log(
        `Sync completed for org ${orgId}: ${accountsSynced} accounts, ${entriesUpserted} entries, ${monthlyEntries} monthly entries`,
      );

      return {
        status: 'SUCCESS',
        accountsSynced,
        entriesUpserted,
        monthlyEntries,
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

  /**
   * PL推移表から月次ActualEntryを同期する。
   * variance/variable-cost 画面の月次チャートに必要。
   */
  private async syncMonthlyFromTransition(
    orgId: string,
    syncedAt: Date,
  ): Promise<number> {
    const plTransition = await this.mfApi.getTransitionPL(orgId).catch(() => null);
    if (!plTransition?.rows || !plTransition.columns) return 0;

    // 月の列インデックス（"1"〜"12" のような数字列）
    const monthColIdx: { idx: number; monthNum: number }[] = [];
    plTransition.columns.forEach((col, i) => {
      if (/^\d+$/.test(col)) {
        monthColIdx.push({ idx: i, monthNum: parseInt(col, 10) });
      }
    });
    if (monthColIdx.length === 0) return 0;

    // MFのfiscal_yearは日本の「年度」表記（決算年度基準）。
    // Organization.fiscalMonthEnd と組み合わせて会計年度開始日を算出する。
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { fiscalMonthEnd: true },
    });
    const fiscalMonthEnd = org?.fiscalMonthEnd ?? 3; // デフォルト3月決算
    const mfFiscalYear = plTransition.fiscal_year;
    // 会計年度開始月 (1-12)。12月決算なら1月、3月決算なら4月、9月決算なら10月。
    const fyStartMonth = fiscalMonthEnd === 12 ? 1 : fiscalMonthEnd + 1;
    // 会計年度開始年。12月決算なら fiscal_year と同じ。それ以外は fiscal_year - 1。
    const fyStartYear =
      fiscalMonthEnd === 12 ? mfFiscalYear : mfFiscalYear - 1;
    let count = 0;

    type Row = { name: string; type: string; values: (number | null)[]; rows: Row[] | null };
    const walkLeaves = (rows: Row[] | null): Row[] => {
      if (!rows) return [];
      const out: Row[] = [];
      for (const r of rows) {
        if (r.rows && r.rows.length > 0) {
          out.push(...walkLeaves(r.rows));
        } else if (r.type === 'account' || r.type === 'financial_statement_item') {
          out.push(r);
        }
      }
      return out;
    };

    const leaves = walkLeaves(plTransition.rows as unknown as Row[]);

    // AccountMaster のキャッシュ
    const accountCache = new Map<string, string>();

    for (const leaf of leaves) {
      const name = leaf.name.trim();
      if (!name) continue;

      let accountId = accountCache.get(name);
      if (accountId === undefined) {
        const acc = await this.prisma.accountMaster.findFirst({
          where: { orgId, name },
          select: { id: true },
        });
        if (!acc) {
          accountCache.set(name, '');
          continue;
        }
        accountId = acc.id;
        accountCache.set(name, accountId);
      }
      if (!accountId) continue;

      for (const { idx, monthNum } of monthColIdx) {
        const raw = leaf.values[idx];
        if (raw == null) continue;
        const amount = Number(raw);
        if (!Number.isFinite(amount)) continue;

        // MFの monthNum は実カレンダー月(1-12)。会計年度開始月より手前なら翌年扱い。
        // 例: 3月決算(fyStartMonth=4) → 4〜12月は fyStartYear、1〜3月は fyStartYear+1。
        const calendarMonth = monthNum;
        const actualYear =
          calendarMonth >= fyStartMonth ? fyStartYear : fyStartYear + 1;
        const month = new Date(Date.UTC(actualYear, calendarMonth - 1, 1));

        const existing = await this.prisma.actualEntry.findFirst({
          where: { orgId, accountId, departmentId: null, month },
        });
        if (existing) {
          // 既存があれば 0 円でも更新する。MFで0に修正された場合に古い金額が残るのを防ぐ。
          await this.prisma.actualEntry.update({
            where: { id: existing.id },
            data: { amount, source: 'MF_CLOUD', syncedAt },
          });
          count++;
        } else if (amount !== 0) {
          // 新規作成は非ゼロのみ（ゼロ行を毎回大量に作らない）
          await this.prisma.actualEntry.create({
            data: {
              orgId,
              accountId,
              month,
              amount,
              source: 'MF_CLOUD',
              syncedAt,
            },
          });
          count++;
        }
      }
    }

    return count;
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
