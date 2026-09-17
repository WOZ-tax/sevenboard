/** Explicit, insert-only provisioning. Never run the development seed against production. */
import { PrismaClient, Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  DEMO_ACCOUNTS,
  demoMonthAmount,
  demoOffice,
  monthEnd,
} from '../src/demo/wholesale-ledger';
import {
  DEMO_AS_OF,
  DEMO_CODE,
  DEMO_COMPANY_NAME,
  DEMO_DATA_VERSION,
  DEMO_MONTH,
  DEMO_ORG_ID,
  DEMO_TENANT_ID,
  DEMO_USER_ID,
  DEMO_YEAR,
} from '../src/demo/demo.constants';

const date = (s: string) => new Date(`${s}T00:00:00Z`);
const scope = { tenantId: DEMO_TENANT_ID, orgId: DEMO_ORG_ID };

export async function provisionDemo(
  prisma: PrismaClient,
  email: string,
  password: string,
) {
  if (!email.endsWith('@example.invalid') || password.length < 24)
    throw new Error(
      'Use a reserved example.invalid address and a strong generated password',
    );
  const passwordHash = await hash(password, 12);
  return prisma.$transaction(
    async (tx) => {
      const conflicts = await Promise.all([
        tx.tenant.count({
          where: {
            OR: [{ id: DEMO_TENANT_ID }, { slug: 'sevenboard-demo-wholesale' }],
          },
        }),
        tx.organization.count({
          where: { OR: [{ id: DEMO_ORG_ID }, { code: DEMO_CODE }] },
        }),
        tx.user.count({ where: { OR: [{ id: DEMO_USER_ID }, { email }] } }),
      ]);
      if (conflicts.some(Boolean))
        throw new Error(
          'Demo identities already exist; nothing was changed. Use the existing account or review a scoped reset separately.',
        );
      await tx.tenant.create({
        data: {
          id: DEMO_TENANT_ID,
          name: 'SevenBoard デモ研修事務所',
          slug: 'sevenboard-demo-wholesale',
          status: 'active',
          plan: 'PRO',
        },
      });
      await tx.organization.create({
        data: {
          id: DEMO_ORG_ID,
          tenantId: DEMO_TENANT_ID,
          name: DEMO_COMPANY_NAME,
          code: DEMO_CODE,
          fiscalMonthEnd: 12,
          industry: '卸売業',
          employeeCount: 8,
          planType: 'PRO',
          briefPushEnabled: false,
          briefSlackWebhookUrl: null,
          usesCostAccounting: false,
          businessContext:
            '【すべて架空】生活用品を小売店へ販売する卸売会社。従業員8名。2023〜2025年の確定期間と2026年1〜8月の実績、2022年比較基準。売掛・買掛は翌月回収／支払、在庫は月次実地棚卸、銀行借入は元金均等返済。法人税等の月次仕訳は30%の研修用概算で、納税予測は画面の税率と前提で別途再計算する。実在する顧客情報は入力しない。',
        },
      });
      await tx.user.create({
        data: {
          id: DEMO_USER_ID,
          email,
          name: 'デモ担当者',
          password: passwordHash,
          role: 'advisor',
          orgId: null,
        },
      });
      await tx.tenantMembership.create({
        data: {
          tenantId: DEMO_TENANT_ID,
          userId: DEMO_USER_ID,
          role: 'firm_advisor',
          status: 'active',
        },
      });
      await tx.organizationMembership.create({
        data: {
          ...scope,
          userId: DEMO_USER_ID,
          side: 'advisor',
          role: 'advisor',
        },
      });
      const accounts = new Map<string, string>();
      for (const [index, a] of DEMO_ACCOUNTS.entries()) {
        const saved = await tx.accountMaster.create({
          data: {
            ...scope,
            code: `D${String(index + 1).padStart(3, '0')}`,
            name: a.name,
            category: (a.category === 'TAX'
              ? 'ADMIN_EXPENSE'
              : a.category) as any,
            externalId: `demo-${a.key}`,
            displayOrder: index + 1,
            isVariableCost: ['cogs', 'delivery'].includes(a.key),
          },
        });
        accounts.set(a.key, saved.id);
      }
      let actualCount = 0,
        budgetCount = 0;
      for (const period of demoOffice().accounting_periods) {
        const year = period.fiscal_year;
        const fy = await tx.fiscalYear.create({
          data: {
            ...scope,
            year,
            startDate: date(period.start_date),
            endDate: date(period.end_date),
            status: year === DEMO_YEAR ? 'OPEN' : 'CLOSED',
          },
        });
        const rows: Prisma.ActualEntryCreateManyInput[] = [];
        for (
          let month = 1;
          month <= (year === DEMO_YEAR ? DEMO_MONTH : 12);
          month++
        ) {
          for (const a of DEMO_ACCOUNTS)
            rows.push({
              ...scope,
              accountId: accounts.get(a.key)!,
              month: date(`${year}-${String(month).padStart(2, '0')}-01`),
              amount: demoMonthAmount(a.key, year, month),
              source: 'MF_CLOUD',
              syncedAt: new Date(),
            });
        }
        await tx.actualEntry.createMany({ data: rows });
        actualCount += rows.length;
        if (year >= 2023) {
          const budget = await tx.budgetVersion.create({
            data: {
              fiscalYearId: fy.id,
              name: `${year}年度 基本計画`,
              scenarioType: 'BASE',
              createdBy: DEMO_USER_ID,
            },
          });
          const entries: Prisma.BudgetEntryCreateManyInput[] = [];
          for (let month = 1; month <= 12; month++) {
            for (const a of DEMO_ACCOUNTS.filter(
              (a) => a.group === 'REVENUE' || a.group === 'EXPENSE',
            )) {
              // Prior-year monthly results, not cumulative balances. Plan is intentionally
              // 8% sales / 5% cost growth so the variance screen has a realistic narrative.
              const factor = a.group === 'REVENUE' ? 1.08 : 1.05;
              entries.push({
                budgetVersionId: budget.id,
                accountId: accounts.get(a.key)!,
                month: date(`${year}-${String(month).padStart(2, '0')}-01`),
                amount: Math.round(
                  demoMonthAmount(a.key, year - 1, month) * factor,
                ),
              });
            }
          }
          await tx.budgetEntry.createMany({ data: entries });
          budgetCount += entries.length;
        }
        for (const month of [
          'full',
          ...Array.from({ length: 12 }, (_, i) => String(i + 1)),
        ]) {
          await tx.featureState.create({
            data: {
              ...scope,
              featureKey: 'locaben.source-overrides',
              scope: `${year}:${month}`,
              value: { employeeCount: 8 },
              updatedById: DEMO_USER_ID,
            },
          });
        }
        for (
          let month = 1;
          month <= (year === DEMO_YEAR ? DEMO_MONTH : 12);
          month++
        ) {
          await tx.monthlyClose.create({
            data: {
              ...scope,
              fiscalYear: year,
              month,
              status:
                year === DEMO_YEAR && month === DEMO_MONTH
                  ? 'IN_REVIEW'
                  : 'CLOSED',
              changedBy: DEMO_USER_ID,
              note: '研修用の月次締め状態',
            },
          });
        }
      }
      const loan = await tx.loan.create({
        data: {
          ...scope,
          lenderName: '架空みらい銀行',
          branchName: '青空支店（架空）',
          loanNumber: 'DEMO-LOAN-001',
          loanType: '証書貸付',
          principal: BigInt(30000000),
          interestRate: 1.5,
          rateType: 'FIXED',
          startDate: date('2021-12-31'),
          termMonths: 120,
          maturityDate: date('2031-12-31'),
          repaymentMethod: 'EQUAL_PRINCIPAL',
          repaymentAccount: '普通預金（デモ）',
          status: 'ACTIVE',
          updatedById: DEMO_USER_ID,
          memo: '全件架空。毎月元金250,000円、利息は月初残高×年1.5%÷12を円単位で四捨五入。2026年8月末残高は仕訳・貸借対照表と一致。',
        },
      });
      await tx.loanScheduleEntry.createMany({
        data: Array.from({ length: 120 }, (_, index) => {
          const seq = index + 1,
            balanceBefore = 30000000 - index * 250000;
          const interest = Math.round((balanceBefore * 0.015) / 12);
          return {
            tenantId: DEMO_TENANT_ID,
            loanId: loan.id,
            seq,
            dueDate: date(
              monthEnd(2022 + Math.floor(index / 12), (index % 12) + 1),
            ),
            principalAmount: BigInt(250000),
            interestAmount: BigInt(interest),
            totalAmount: BigInt(250000 + interest),
            balanceAfter: BigInt(balanceBefore - 250000),
            interestRate: 1.5,
            isEstimated: false,
          };
        }),
      });
      await tx.locabenState.create({
        data: {
          ...scope,
          industryOverride: '卸売業',
          updatedById: DEMO_USER_ID,
          values: {},
          manualKeys: {},
          nonFinancial: {
            manager: {
              career: '生活用品卸での営業経験を経て2015年創業（架空）。',
              strength: '小売店への小口・多頻度配送と商品提案。',
              philosophy: '地域の店舗に必要な生活用品を安定供給する。',
            },
            stakeholders: {
              customers: '架空・つばさ小売株式会社ほか地域小売店',
              suppliers: '架空・ひかり製品株式会社',
              employees: '営業3名、物流3名、管理2名。計8名。',
              banks: '架空みらい銀行',
            },
            business: {
              products: 'キッチン用品・掃除用品・生活雑貨',
              deliveryMethod: '自社倉庫から地域小売店へ配送。',
              competitors: '少量発注・短納期・売場提案に対応。',
            },
            internal: {
              orgStructure: '営業・物流・管理の3部門',
              ITSystems: '在庫台帳と販売管理を月次で照合。',
              compliance: '売掛金・買掛金・在庫・源泉税を毎月確認。',
            },
          },
        },
      });
      await tx.featureState.create({
        data: {
          ...scope,
          featureKey: 'demo.dataset',
          scope: '',
          value: {
            version: DEMO_DATA_VERSION,
            asOf: DEMO_AS_OF,
            fictional: true,
          },
        },
      });
      for (const provider of ['MF_CLOUD', 'BOOKKEEPING_PLUGIN'] as const) {
        await tx.integration.create({
          data: {
            ...scope,
            provider,
            accessToken: null,
            refreshToken: null,
            syncStatus: 'SUCCESS',
            lastSyncAt: new Date(),
          },
        });
      }
      await tx.monthlyReviewApproval.create({
        data: {
          ...scope,
          fiscalYear: DEMO_YEAR,
          month: DEMO_MONTH,
          status: 'DRAFT',
          comment:
            '研修：数値確認 → 論点整理 → 対応タスク → 承認を試してください。',
        },
      });
      await tx.action.createMany({
        data: [
          {
            ...scope,
            title: '8月の粗利率と配送費を確認する（研修）',
            description:
              '売上は成長した一方、基本計画との差を予実分析で確認する。',
            sourceScreen: 'MONTHLY_REVIEW',
            severity: 'MEDIUM',
            status: 'IN_PROGRESS',
            createdBy: DEMO_USER_ID,
            ownerUserId: DEMO_USER_ID,
            dueDate: date('2026-09-25'),
          },
          {
            ...scope,
            title: '秋冬需要に向けた在庫計画を見直す（研修）',
            sourceScreen: 'CASHFLOW',
            severity: 'MEDIUM',
            status: 'NOT_STARTED',
            createdBy: DEMO_USER_ID,
            ownerUserId: DEMO_USER_ID,
            dueDate: date('2026-09-30'),
          },
        ],
      });
      await tx.calendarEvent.createMany({
        data: [
          {
            ...scope,
            title: '8月次レビュー面談（デモ）',
            date: date('2026-09-25'),
            type: 'meeting',
            createdBy: DEMO_USER_ID,
            assigneeId: DEMO_USER_ID,
          },
          {
            ...scope,
            title: '棚卸・資金繰り計画の確認（デモ）',
            date: date('2026-09-30'),
            type: 'task',
            createdBy: DEMO_USER_ID,
          },
        ],
      });
      await tx.businessEvent.createMany({
        data: [
          {
            ...scope,
            title: '倉庫設備更新（架空）',
            eventDate: date('2024-04-15'),
            eventType: '設備投資',
            note: '税抜600万円。仕訳に計上済み。',
            impactTags: ['cash'],
            createdBy: DEMO_USER_ID,
          },
          {
            ...scope,
            title: '取扱商品と販売先の拡大（架空）',
            eventDate: date('2026-01-01'),
            eventType: '販路拡大',
            note: '前年同期比売上増加の背景。',
            impactTags: ['sales'],
            createdBy: DEMO_USER_ID,
          },
        ],
      });
      return {
        tenantId: DEMO_TENANT_ID,
        orgId: DEMO_ORG_ID,
        userId: DEMO_USER_ID,
        accountCount: accounts.size,
        actualCount,
        budgetCount,
        loanId: loan.id,
      };
    },
    { timeout: 120000, maxWait: 15000 },
  );
}

async function main() {
  if (process.env.DEMO_PROVISION_CONFIRM !== DEMO_TENANT_ID)
    throw new Error('Explicit demo provisioning confirmation is required');
  const prisma = new PrismaClient({ log: [] });
  try {
    const result = await provisionDemo(
      prisma,
      process.env.DEMO_EMAIL ?? '',
      process.env.DEMO_PASSWORD ?? '',
    );
    console.log(JSON.stringify({ created: true, ...result }));
  } finally {
    await prisma.$disconnect();
  }
}
if (require.main === module)
  main().catch((error) => {
    // Do not serialize Prisma errors: they may include connection strings or password hashes.
    console.error(
      JSON.stringify({
        created: false,
        code: error?.code ?? 'PROVISION_FAILED',
      }),
    );
    process.exitCode = 1;
  });
