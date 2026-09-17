import { Decimal } from '@prisma/client/runtime/library';
import { ReportsService } from './reports.service';

it('compares summed departmental budgets with company-wide actuals once', async () => {
  const account = {
    id: 'sales',
    code: '1',
    name: '売上高',
    category: 'REVENUE',
  };
  const month = new Date('2026-08-01T00:00:00Z');
  const prisma: any = {
    orgScope: jest.fn().mockResolvedValue({ tenantId: 't' }),
    budgetVersion: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ fiscalYear: { tenantId: 't', orgId: 'o' } }),
    },
    budgetEntry: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          [100, 200].map((amount) => ({
            accountId: 'sales',
            account,
            month,
            amount: new Decimal(amount),
          })),
        ),
    },
    actualEntry: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(
          [120, 220].map((amount) => ({
            accountId: 'sales',
            month,
            amount: new Decimal(amount),
          })),
        )
        .mockResolvedValueOnce(
          [90, 180].map((amount) => ({
            accountId: 'sales',
            month: new Date('2025-08-01T00:00:00Z'),
            amount: new Decimal(amount),
          })),
        ),
    },
  };
  const rows = await new ReportsService(prisma, {} as any).getVarianceReport(
    'o',
    { budgetVersionId: 'b' },
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    budgetAmount: 300,
    actualAmount: 340,
    priorYearAmount: 270,
    varianceAmount: 40,
  });
});
