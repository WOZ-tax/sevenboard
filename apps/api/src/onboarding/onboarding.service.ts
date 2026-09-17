import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MfApiService } from '../mf/mf-api.service';
import { SyncService } from '../sync/sync.service';

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
    private sync: SyncService,
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

      const category = guessCategory(mfAccount.name, mfAccount.category);
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
      const result = await this.sync.runSync(orgId);
      entriesImported =
        (result.entriesUpserted ?? 0) + (result.monthlyEntries ?? 0);
      if (result.status !== 'SUCCESS')
        warnings.push('月次実績の同期が完了していません。再同期してください。');
    } catch (err: any) {
      warnings.push(`Monthly import failed: ${err?.message}`);
    }

    let fiscalYearCreated = false;
    try {
      const office = await this.mfApi.getOffice(orgId);
      for (const period of office.accounting_periods ?? []) {
        const start = new Date(`${period.start_date}T00:00:00Z`);
        const end = new Date(`${period.end_date}T00:00:00Z`);
        if (
          !Number.isInteger(period.fiscal_year) ||
          !Number.isFinite(start.getTime()) ||
          !Number.isFinite(end.getTime()) ||
          start > end
        )
          continue;
        await this.prisma.fiscalYear.upsert({
          where: {
            tenantId_orgId_year: { tenantId, orgId, year: period.fiscal_year },
          },
          update: {},
          create: {
            tenantId,
            orgId,
            year: period.fiscal_year,
            startDate: start,
            endDate: end,
            status: 'OPEN',
          },
        });
        fiscalYearCreated = true;
      }
    } catch (err: any) {
      warnings.push(`Fiscal year create failed: ${err?.message}`);
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
