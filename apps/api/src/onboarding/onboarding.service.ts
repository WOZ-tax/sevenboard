import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';

function guessCategory(accountName: string, mfCategory?: string): string {
  const source = `${mfCategory ?? ''} ${accountName}`.toUpperCase();
  if (source.includes('REVENUE') || source.includes('SALES')) {
    return 'REVENUE';
  }
  if (source.includes('COST')) {
    return 'COST_OF_SALES';
  }
  if (source.includes('ASSET')) {
    return 'ASSET';
  }
  if (source.includes('LIABILITY')) {
    return 'LIABILITY';
  }
  if (source.includes('EQUITY')) {
    return 'EQUITY';
  }
  return 'ADMIN_EXPENSE';
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
    const { tenantId } = await this.prisma.orgScope(orgId);
    const warnings: string[] = [];

    const { accounts: mfAccounts } = await this.mfApi.getAccounts(orgId);

    let accountsMapped = 0;
    for (const mfAccount of mfAccounts) {
      const externalId = String(mfAccount.id);

      const existing = await this.prisma.accountMaster.findFirst({
        where: { tenantId, orgId, externalId },
      });
      if (existing) {
        accountsMapped++;
        continue;
      }

      const byExactName = await this.prisma.accountMaster.findFirst({
        where: { tenantId, orgId, name: mfAccount.name },
      });
      if (byExactName) {
        await this.prisma.accountMaster.update({
          where: { id: byExactName.id },
          data: { externalId },
        });
        accountsMapped++;
        continue;
      }

      const allAccounts = await this.prisma.accountMaster.findMany({
        where: { tenantId, orgId },
      });
      const partial = allAccounts.find(
        (account) =>
          account.name.includes(mfAccount.name) ||
          mfAccount.name.includes(account.name),
      );
      if (partial) {
        await this.prisma.accountMaster.update({
          where: { id: partial.id },
          data: { externalId },
        });
        accountsMapped++;
        continue;
      }

      const category = guessCategory(
        mfAccount.name,
        (mfAccount as any).account_category,
      );
      try {
        await this.prisma.accountMaster.create({
          data: {
            tenantId,
            orgId,
            code: mfAccount.id ? String(mfAccount.id) : `MF_${Date.now()}`,
            name: mfAccount.name,
            category: category as any,
            externalId,
          },
        });
        accountsMapped++;
      } catch (err: any) {
        warnings.push(
          `Account create skipped: ${mfAccount.name} (${err?.message})`,
        );
      }
    }

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
          where: { tenantId, orgId, name: accountName },
        });
        if (!account) continue;

        try {
          const existingEntry = await this.prisma.actualEntry.findFirst({
            where: {
              tenantId,
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
          entriesImported++;
        } catch {
          // Constraint races are non-fatal during onboarding import.
        }
      }
    } catch (err: any) {
      warnings.push(`Trial balance import failed: ${err?.message}`);
    }

    let fiscalYearCreated = false;
    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, tenantId },
    });
    if (org) {
      const now = new Date();
      const fiscalEnd = org.fiscalMonthEnd;
      let fyYear = now.getFullYear();
      if (now.getMonth() + 1 <= fiscalEnd) {
        fyYear -= 1;
      }

      const start = new Date(fyYear, fiscalEnd, 1);
      const end = new Date(fyYear + 1, fiscalEnd, 0);

      try {
        await this.prisma.fiscalYear.upsert({
          where: {
            tenantId_orgId_year: { tenantId, orgId, year: fyYear },
          },
          update: {},
          create: {
            tenantId,
            orgId,
            year: fyYear,
            startDate: start,
            endDate: end,
            status: 'OPEN',
          },
        });
        fiscalYearCreated = true;
      } catch (err: any) {
        warnings.push(`Fiscal year create failed: ${err?.message}`);
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
    const { tenantId } = await this.prisma.orgScope(orgId);
    const [accountCount, entryCount, fyCount, integration] = await Promise.all([
      this.prisma.accountMaster.count({
        where: { tenantId, orgId, externalId: { not: null } },
      }),
      this.prisma.actualEntry.count({
        where: { tenantId, orgId, source: 'MF_CLOUD' },
      }),
      this.prisma.fiscalYear.count({ where: { tenantId, orgId } }),
      this.prisma.integration.findFirst({
        where: { tenantId, orgId, provider: 'MF_CLOUD' },
      }),
    ]);

    const steps = [
      {
        name: 'MF integration',
        completed: !!integration,
      },
      {
        name: 'Account mapping',
        completed: accountCount > 0,
        count: accountCount,
      },
      {
        name: 'Actual data import',
        completed: entryCount > 0,
        count: entryCount,
      },
      {
        name: 'Fiscal year setup',
        completed: fyCount > 0,
        count: fyCount,
      },
    ];

    const completedSteps = steps.filter((step) => step.completed).length;

    return {
      isComplete: completedSteps === steps.length,
      progress: Math.round((completedSteps / steps.length) * 100),
      steps,
    };
  }
}
