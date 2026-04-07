import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';

// MF科目カテゴリマッピング
const CATEGORY_MAP: Record<string, string> = {
  売上高: 'REVENUE',
  売上原価: 'COST_OF_SALES',
  販売費: 'SELLING_EXPENSE',
  一般管理費: 'ADMIN_EXPENSE',
  営業外収益: 'NON_OPERATING_INCOME',
  営業外費用: 'NON_OPERATING_EXPENSE',
  特別利益: 'EXTRAORDINARY_INCOME',
  特別損失: 'EXTRAORDINARY_EXPENSE',
  資産: 'ASSET',
  負債: 'LIABILITY',
  純資産: 'EQUITY',
};

function guessCategory(
  accountName: string,
  mfCategory?: string,
): string {
  // 完全一致
  if (mfCategory && CATEGORY_MAP[mfCategory]) {
    return CATEGORY_MAP[mfCategory];
  }
  // 部分一致
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (accountName.includes(key)) return val;
  }
  return 'ADMIN_EXPENSE'; // デフォルト
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private mfApi: MfApiService,
    private mfTransform: MfTransformService,
  ) {}

  async startOnboarding(orgId: string) {
    this.logger.log(`Starting onboarding for org ${orgId}`);
    const warnings: string[] = [];

    // 1. MFの科目一覧を取得
    const { accounts: mfAccounts } = await this.mfApi.getAccounts(orgId);

    // 2. AccountMaster に自動マッピング
    let accountsMapped = 0;
    for (const mfAccount of mfAccounts) {
      const externalId = String(mfAccount.id);

      // externalIdで既存チェック
      const existing = await this.prisma.accountMaster.findFirst({
        where: { orgId, externalId },
      });
      if (existing) {
        accountsMapped++;
        continue;
      }

      // 名前完全一致
      const byExactName = await this.prisma.accountMaster.findFirst({
        where: { orgId, name: mfAccount.name },
      });
      if (byExactName) {
        await this.prisma.accountMaster.update({
          where: { id: byExactName.id },
          data: { externalId },
        });
        accountsMapped++;
        continue;
      }

      // 部分一致
      const allAccounts = await this.prisma.accountMaster.findMany({
        where: { orgId },
      });
      const partial = allAccounts.find(
        (a) =>
          a.name.includes(mfAccount.name) ||
          mfAccount.name.includes(a.name),
      );
      if (partial) {
        await this.prisma.accountMaster.update({
          where: { id: partial.id },
          data: { externalId },
        });
        accountsMapped++;
        continue;
      }

      // 新規作成
      const category = guessCategory(
        mfAccount.name,
        (mfAccount as any).account_category,
      );
      try {
        await this.prisma.accountMaster.create({
          data: {
            orgId,
            code: mfAccount.id ? String(mfAccount.id) : `MF_${Date.now()}`,
            name: mfAccount.name,
            category: category as any,
            externalId,
          },
        });
        accountsMapped++;
      } catch (err: any) {
        warnings.push(`科目作成スキップ: ${mfAccount.name} (${err?.message})`);
      }
    }

    // 3. PL/BS試算表を取得しActualEntryに初期データ投入
    let entriesImported = 0;
    try {
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

      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      for (const row of allRows) {
        if (row.isHeader) continue;
        const accountName = row.category.trim();
        const account = await this.prisma.accountMaster.findFirst({
          where: { orgId, name: accountName },
        });
        if (!account) continue;

        try {
          const existingEntry = await this.prisma.actualEntry.findFirst({
            where: {
              orgId,
              accountId: account.id,
              departmentId: null,
              month: currentMonth,
            },
          });
          if (existingEntry) {
            await this.prisma.actualEntry.update({
              where: { id: existingEntry.id },
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
          entriesImported++;
        } catch {
          // skip on constraint error
        }
      }
    } catch (err: any) {
      warnings.push(`試算表取得失敗: ${err?.message}`);
    }

    // 4. FiscalYear 自動作成
    let fiscalYearCreated = false;
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
    });
    if (org) {
      const now = new Date();
      const fiscalEnd = org.fiscalMonthEnd;
      // 現在の会計年度を推定
      let fyYear = now.getFullYear();
      if (now.getMonth() + 1 <= fiscalEnd) {
        // 決算月以前 → 会計年度は前年開始
        fyYear = fyYear - 1;
      }

      const startMonth = fiscalEnd + 1 > 12 ? 1 : fiscalEnd + 1;
      const startDate = new Date(
        startMonth === 1 ? fyYear + 1 : fyYear,
        startMonth - 1,
        1,
      );
      // Actually, let's simplify: fiscal year starts the month after the fiscal end
      const start = new Date(fyYear, fiscalEnd, 1); // month after fiscal end (0-indexed: fiscalEnd = 3 → April = index 3)
      const end = new Date(fyYear + 1, fiscalEnd - 1 + 1, 0); // last day of fiscal end month next year

      try {
        await this.prisma.fiscalYear.upsert({
          where: {
            orgId_year: { orgId, year: fyYear },
          },
          update: {},
          create: {
            orgId,
            year: fyYear,
            startDate: start,
            endDate: end,
            status: 'OPEN',
          },
        });
        fiscalYearCreated = true;
      } catch (err: any) {
        warnings.push(`会計年度作成失敗: ${err?.message}`);
      }
    }

    this.logger.log(
      `Onboarding completed for org ${orgId}: ${accountsMapped} accounts, ${entriesImported} entries`,
    );

    return {
      accountsMapped,
      entriesImported,
      fiscalYearCreated,
      warnings,
    };
  }

  async getStatus(orgId: string) {
    const [accountCount, entryCount, fyCount, integration] = await Promise.all([
      this.prisma.accountMaster.count({
        where: { orgId, externalId: { not: null } },
      }),
      this.prisma.actualEntry.count({
        where: { orgId, source: 'MF_CLOUD' },
      }),
      this.prisma.fiscalYear.count({ where: { orgId } }),
      this.prisma.integration.findFirst({
        where: { orgId, provider: 'MF_CLOUD' },
      }),
    ]);

    const steps = [
      {
        name: 'MF連携',
        completed: !!integration,
      },
      {
        name: '科目マッピング',
        completed: accountCount > 0,
        count: accountCount,
      },
      {
        name: '実績データ取込',
        completed: entryCount > 0,
        count: entryCount,
      },
      {
        name: '会計年度設定',
        completed: fyCount > 0,
        count: fyCount,
      },
    ];

    const completedSteps = steps.filter((s) => s.completed).length;

    return {
      isComplete: completedSteps === steps.length,
      progress: Math.round((completedSteps / steps.length) * 100),
      steps,
    };
  }
}
