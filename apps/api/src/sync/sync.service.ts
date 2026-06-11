import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { RiskScanOrchestrator } from '../sentinel/risk-rules/orchestrator.service';
import { HealthSnapshotsService } from '../health-snapshots/health-snapshots.service';
import { postHealthSnapshotToSlack } from '../health-snapshots/health-slack-notifier';
import {
  fiscalMonthToCalendarYear,
  fyStartMonthFromFiscalMonthEnd,
} from '../common/fiscal-period.util';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
    private riskScanOrchestrator: RiskScanOrchestrator,
    private healthSnapshots: HealthSnapshotsService,
    private httpService: HttpService,
  ) {}

  async runSync(orgId: string) {
    this.logger.log(`Starting sync for org ${orgId}`);
    const { tenantId } = await this.prisma.orgScope(orgId);

    await this.updateSyncStatus(orgId, tenantId, 'IN_PROGRESS');

    try {
      const { accounts: mfAccounts } = await this.mfApi.getAccounts(orgId);
      let accountsSynced = 0;

      for (const mfAccount of mfAccounts) {
        const externalId = String(mfAccount.id);
        const existing = await this.prisma.accountMaster.findFirst({
          where: { tenantId, orgId, externalId },
        });

        if (!existing) {
          const byName = await this.prisma.accountMaster.findFirst({
            where: { tenantId, orgId, name: mfAccount.name, externalId: null },
          });
          if (byName) {
            await this.prisma.accountMaster.update({
              where: { id: byName.id },
              data: { externalId },
            });
          }
        }
        accountsSynced++;
      }

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

      let entriesUpserted = 0;
      const now = new Date();
      const currentMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );

      // 月次推移(getTransitionPL)が当月の「単月実績」を持つ正本。先にこれを同期し、
      // 当月に書き込んだ accountId 集合を受け取る。
      // 試算表ループ(下)は CLOSING(FY累計)を当月行に書くため、推移が当月を埋めた
      // 科目には累計値を上書きさせない(=月次実績の汚染防止)。推移取得が失敗した場合は
      // 当月行への書き込み自体を抑止し、FY累計が単月実績として残留しないようにする。
      const {
        count: monthlyEntries,
        transitionOk,
        currentMonthAccountIds,
      } = await this.syncMonthlyFromTransition(orgId, tenantId, now);

      for (const row of allRows) {
        if (row.isHeader) continue;

        const accountName = row.category.trim();
        const account = await this.prisma.accountMaster.findFirst({
          where: { tenantId, orgId, name: accountName },
        });
        if (!account) continue;

        // 推移取得失敗時は当月行を触らない(累計値の残留を防ぐ)。
        if (!transitionOk) continue;
        // 推移が当月を埋めた科目は、累計値で上書きしない。
        if (currentMonthAccountIds.has(account.id)) continue;

        const existing = await this.prisma.actualEntry.findFirst({
          where: {
            tenantId,
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
              tenantId,
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

      // 月次推移(getTransitionPL)の取得に失敗した場合は無言で 'SUCCESS' を刻まない。
      // SyncStatus enum に 'PARTIAL' が無いため(DB変更回避)、取得失敗は 'FAILED' として
      // 可視化しつつ、TB同期で実際に書けた件数は戻り値に残して呼び出し側へ明示する。
      if (transitionOk) {
        await this.updateSyncStatus(orgId, tenantId, 'SUCCESS');
        this.logger.log(
          `Sync completed for org ${orgId}: ${accountsSynced} accounts, ${entriesUpserted} entries, ${monthlyEntries} monthly entries`,
        );
      } else {
        await this.updateSyncStatus(orgId, tenantId, 'FAILED');
        this.logger.warn(
          `Sync PARTIAL for org ${orgId}: monthly transition fetch failed. ` +
            `${accountsSynced} accounts, ${entriesUpserted} entries synced but monthly transition is incomplete.`,
        );
      }

      // 会計レビュー画面 ② 要確認アイテム用に L1 リスクスキャンをキックオフ。
      // 失敗しても sync 自体の結果は変えない。重い API 呼び出しは含むが await する
      // (sync 完了直後の整合性が高い状態で実行したい)。
      void this.kickoffRiskScanAfterSync(orgId);

      return {
        // 月次推移の取得失敗時は全体を成功扱いしない(部分成功を明示)。
        status: transitionOk ? 'SUCCESS' : 'PARTIAL',
        transitionOk,
        accountsSynced,
        entriesUpserted,
        monthlyEntries,
        syncedAt: now.toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Sync failed for org ${orgId}`, err?.message);
      await this.updateSyncStatus(orgId, tenantId, 'FAILED');

      return {
        status: 'FAILED',
        error: err?.message || 'Unknown error',
        syncedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * MF 同期完了直後に会計レビュー ② 用の L1 リスクスキャンをキックオフ。
   *
   * fiscal_year は PL 推移表のメタから取得 (会社設定の決算月との整合が取れる)。
   * 月は当月をデフォルトにするが、月初付近で前月確定値を見たいケースは UI 側の
   * 「再検証」ボタンで明示指定する想定。
   *
   * 重い API 呼び出しが含まれるが失敗しても sync API の戻り値は変えない。
   */
  private async kickoffRiskScanAfterSync(orgId: string): Promise<void> {
    try {
      const plTransition = await this.mfApi
        .getTransitionPL(orgId)
        .catch(() => null);
      const fiscalYear = plTransition?.fiscal_year ?? new Date().getUTCFullYear();
      const today = new Date();
      const month = today.getUTCMonth() + 1;
      this.logger.log(
        `Kicking off L1+L2 risk scan + health snapshot for org ${orgId}: fy=${fiscalYear}, month=${month}`,
      );
      const [l1Result, l2Result, healthSnapshot] = await Promise.all([
        this.riskScanOrchestrator.runL1(orgId, fiscalYear, month),
        this.riskScanOrchestrator.runL2(orgId, fiscalYear, month),
        this.healthSnapshots.computeAndSave(orgId, fiscalYear, month),
      ]);
      this.logger.log(
        `Risk scan finished for org ${orgId}: ` +
          `L1 ${l1Result.findingCount} findings (${l1Result.errors.length} errs), ` +
          `L2 ${l2Result.findingCount} findings (${l2Result.errors.length} errs), ` +
          `health=${healthSnapshot.score}/100`,
      );

      // 健康スコアが ±3pt 以上動いていたら Slack DM
      const delta =
        healthSnapshot.prevScore !== null
          ? healthSnapshot.score - healthSnapshot.prevScore
          : null;
      if (delta !== null && Math.abs(delta) >= 3) {
        const org = await this.prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true, briefSlackWebhookUrl: true },
        });
        if (org?.briefSlackWebhookUrl) {
          await postHealthSnapshotToSlack(
            this.httpService,
            org.briefSlackWebhookUrl,
            org.name,
            healthSnapshot,
          ).catch((err) =>
            this.logger.warn(`health slack push failed: ${err}`),
          );
          this.logger.log(
            `health slack push sent for org ${orgId}: delta=${delta} pt`,
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Risk scan / health snapshot after sync failed for org ${orgId}: ${message}`,
      );
    }
  }

  async getSyncStatus(orgId: string) {
    const { tenantId } = await this.prisma.orgScope(orgId);
    const integration = await this.prisma.integration.findFirst({
      where: { tenantId, orgId, provider: 'MF_CLOUD' },
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

  private async syncMonthlyFromTransition(
    orgId: string,
    tenantId: string,
    syncedAt: Date,
  ): Promise<{
    count: number;
    transitionOk: boolean;
    currentMonthAccountIds: Set<string>;
  }> {
    // 当月(runSync と同じ UTC 月初)を埋めた accountId を呼び出し側へ返し、
    // 試算表ループに累計値で上書きさせないために使う。
    const currentMonthAccountIds = new Set<string>();
    const currentMonthKey = (() => {
      const d = new Date();
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    })();

    // 取得「失敗」と「データ0件」を区別する。
    // 失敗(getTransitionPL が throw / 不正レスポンス) → transitionOk:false を返し、
    // 呼び出し側で 'SUCCESS' を刻ませない。データ0件(正常応答だが行が無い)は
    // transitionOk:true(取得自体は成功)として扱う。
    let plTransition: Awaited<ReturnType<typeof this.mfApi.getTransitionPL>> | null;
    try {
      plTransition = await this.mfApi.getTransitionPL(orgId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `getTransitionPL failed for org ${orgId}: ${message} — monthly transition not synced`,
      );
      return { count: 0, transitionOk: false, currentMonthAccountIds };
    }
    if (!plTransition?.rows || !plTransition.columns) {
      // 応答はあったが構造が不正 = 取得失敗扱い。
      this.logger.warn(
        `getTransitionPL returned no rows/columns for org ${orgId} — treating as fetch failure`,
      );
      return { count: 0, transitionOk: false, currentMonthAccountIds };
    }

    const monthColIdx: { idx: number; monthNum: number }[] = [];
    plTransition.columns.forEach((col, i) => {
      if (/^\d+$/.test(col)) {
        monthColIdx.push({ idx: i, monthNum: parseInt(col, 10) });
      }
    });
    // 月カラムが無いのは正常応答だが対象データ0件 → 取得は成功とみなす。
    if (monthColIdx.length === 0) {
      return { count: 0, transitionOk: true, currentMonthAccountIds };
    }

    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, tenantId },
      select: { fiscalMonthEnd: true },
    });
    const fiscalMonthEnd = org?.fiscalMonthEnd ?? 3;
    const mfFiscalYear = plTransition.fiscal_year; // 期末年(end year)
    const fyStartMonth = fyStartMonthFromFiscalMonthEnd(fiscalMonthEnd);
    let count = 0;

    type Row = {
      name: string;
      type: string;
      values: (number | null)[];
      rows: Row[] | null;
    };
    const walkLeaves = (rows: Row[] | null): Row[] => {
      if (!rows) return [];
      const out: Row[] = [];
      for (const row of rows) {
        if (row.rows && row.rows.length > 0) {
          out.push(...walkLeaves(row.rows));
        } else if (
          row.type === 'account' ||
          row.type === 'financial_statement_item'
        ) {
          out.push(row);
        }
      }
      return out;
    };

    const leaves = walkLeaves(plTransition.rows as unknown as Row[]);
    const accountCache = new Map<string, string>();

    for (const leaf of leaves) {
      const name = leaf.name.trim();
      if (!name) continue;

      let accountId = accountCache.get(name);
      if (accountId === undefined) {
        const account = await this.prisma.accountMaster.findFirst({
          where: { tenantId, orgId, name },
          select: { id: true },
        });
        if (!account) {
          accountCache.set(name, '');
          continue;
        }
        accountId = account.id;
        accountCache.set(name, accountId);
      }
      if (!accountId) continue;

      for (const { idx, monthNum } of monthColIdx) {
        const raw = leaf.values[idx];
        if (raw == null) continue;
        const amount = Number(raw);
        if (!Number.isFinite(amount)) continue;

        const calendarMonth = monthNum;
        const actualYear = fiscalMonthToCalendarYear(
          mfFiscalYear,
          calendarMonth,
          fyStartMonth,
        );
        const month = new Date(Date.UTC(actualYear, calendarMonth - 1, 1));

        // この科目の当月が推移表で確定したら記録(試算表ループの累計上書きを抑止)。
        // 値が 0 でも「推移表が当月を持っている」事実は記録する。
        if (month.getTime() === currentMonthKey) {
          currentMonthAccountIds.add(accountId);
        }

        const existing = await this.prisma.actualEntry.findFirst({
          where: { tenantId, orgId, accountId, departmentId: null, month },
        });
        if (existing) {
          await this.prisma.actualEntry.update({
            where: { id: existing.id },
            data: { amount, source: 'MF_CLOUD', syncedAt },
          });
          count++;
        } else if (amount !== 0) {
          await this.prisma.actualEntry.create({
            data: {
              tenantId,
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

    return { count, transitionOk: true, currentMonthAccountIds };
  }

  private async updateSyncStatus(
    orgId: string,
    tenantId: string,
    status: string,
  ) {
    try {
      await this.prisma.integration.upsert({
        where: {
          tenantId_orgId_provider: { tenantId, orgId, provider: 'MF_CLOUD' },
        },
        update: {
          syncStatus: status as any,
          lastSyncAt: status === 'SUCCESS' ? new Date() : undefined,
        },
        create: {
          tenantId,
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
