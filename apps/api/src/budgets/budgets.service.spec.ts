import { ForbiddenException } from '@nestjs/common';
import { BudgetsService } from './budgets.service';

it('rejects changes to a persisted locked budget before writing entries', async () => {
  const tx = {
    featureState: {
      findUnique: jest.fn().mockResolvedValue({ value: { status: 'LOCKED' } }),
    },
    budgetEntry: { updateMany: jest.fn() },
  };
  const prisma: any = {
    budgetVersion: {
      findUnique: jest
        .fn()
        .mockResolvedValue({
          id: 'b',
          fiscalYear: { tenantId: 't', orgId: 'o' },
        }),
    },
    $transaction: (fn: any) => fn(tx),
  };
  const authorization: any = {
    assertOrgPermission: jest.fn().mockResolvedValue({ tenantId: 't' }),
  };
  await expect(
    new BudgetsService(prisma, authorization).updateBudgetEntries(
      { id: 'u', role: 'advisor', orgId: null },
      'b',
      {
        entries: [
          { id: 'e', accountId: 'a', month: '2026-08-01', amount: 999 },
        ],
      },
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(tx.budgetEntry.updateMany).not.toHaveBeenCalled();
  expect(tx.featureState.findUnique).toHaveBeenCalledWith({
    where: {
      orgId_featureKey_scope: {
        orgId: 'o',
        featureKey: 'budget.workflow',
        scope: 'b',
      },
    },
  });
});
