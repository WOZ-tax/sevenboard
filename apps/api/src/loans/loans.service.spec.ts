import { Prisma } from '@prisma/client';
import { LoansService } from './loans.service';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** MF BS の負債行（closing は index 3） */
function account(name: string, closing: number) {
  return { name, type: 'account', values: [0, 0, 0, closing, 0], rows: null };
}

const NOW = new Date('2025-06-15T00:00:00.000Z');

function buildService(overrides?: {
  bs?: unknown;
  bsError?: boolean;
}) {
  const loanA = {
    id: 'loan-a',
    tenantId: 'tenant-1',
    orgId: 'org-1',
    lenderName: 'みずほ銀行',
    branchName: '渋谷支店',
    loanNumber: 'A-001',
    loanType: '証書貸付',
    principal: BigInt(1_200_000),
    interestRate: new Prisma.Decimal('1.5'),
    rateType: 'FIXED',
    startDate: d('2025-04-01'),
    termMonths: 12,
    maturityDate: d('2026-03-31'),
    repaymentMethod: 'EQUAL_PRINCIPAL',
    repaymentAccount: null,
    driveUrl: null,
    memo: null,
    status: 'ACTIVE',
    updatedById: null,
    createdAt: d('2025-04-01'),
    updatedAt: d('2025-04-01'),
    scheduleEntries: [
      {
        id: 'e2',
        seq: 2,
        dueDate: d('2025-05-31'),
        principalAmount: BigInt(100_000),
        interestAmount: BigInt(1_400),
        totalAmount: BigInt(101_400),
        balanceAfter: BigInt(1_000_000),
        interestRate: null,
        isEstimated: false,
      },
      {
        id: 'e3',
        seq: 3,
        dueDate: d('2025-06-30'),
        principalAmount: BigInt(100_000),
        interestAmount: BigInt(1_300),
        totalAmount: BigInt(101_300),
        balanceAfter: BigInt(900_000),
        interestRate: new Prisma.Decimal('2.375'),
        isEstimated: false,
      },
      {
        id: 'e4',
        seq: 4,
        dueDate: d('2025-07-31'),
        principalAmount: BigInt(100_000),
        interestAmount: BigInt(1_200),
        totalAmount: BigInt(101_200),
        balanceAfter: BigInt(800_000),
        interestRate: null,
        isEstimated: false,
      },
    ],
    documents: [],
  };

  const prisma = {
    loan: {
      findMany: jest.fn().mockResolvedValue([loanA]),
    },
  };

  const defaultBs = {
    rows: [
      { name: '資産', type: 'assets', values: [], rows: [] },
      {
        name: '負債',
        type: 'liabilities',
        values: [0, 0, 0, 2_300_000, 0],
        rows: [
          {
            name: '流動負債',
            type: 'financial_statement_item',
            values: [],
            rows: [account('短期借入金', 500_000), account('役員借入金', 1_000_000)],
          },
          {
            name: '固定負債',
            type: 'financial_statement_item',
            values: [],
            rows: [account('長期借入金', 400_000)],
          },
        ],
      },
    ],
  };

  const mfApi = {
    getTrialBalanceBS: overrides?.bsError
      ? jest.fn().mockRejectedValue(new Error('MF not connected'))
      : jest.fn().mockResolvedValue(overrides?.bs ?? defaultBs),
  };

  const service = new LoansService(
    prisma as any,
    mfApi as any,
    {} as any,
    {} as any,
  );
  return { service, prisma, mfApi };
}

describe('LoansService.list', () => {
  it('derives current-month balance, next payment, and current rate per loan', async () => {
    const { service } = buildService();
    const result = await service.list('org-1', NOW);

    expect(result.loans).toHaveLength(1);
    const row = result.loans[0];
    expect(row.currentBalance).toBe(900_000);
    expect(row.nextDueDate).toBe('2025-07-31');
    expect(row.nextPaymentAmount).toBe(101_200);
    // 当月(6月)行の interestRate=2.375 が優先される
    expect(row.interestRate).toBe(2.375);
    expect(row.principal).toBe(1_200_000);
    expect(row.startDate).toBe('2025-04-01');
  });

  it('aggregates totals over ACTIVE loans for the current month', async () => {
    const { service } = buildService();
    const { totals } = await service.list('org-1', NOW);

    expect(totals.outstandingBalance).toBe(900_000);
    expect(totals.monthlyPayment).toBe(101_300);
    expect(totals.monthlyPrincipal).toBe(100_000);
    expect(totals.monthlyInterest).toBe(1_300);
    // 今後12ヶ月(7月〜翌6月末)の利息: 7月 1,200 のみ
    expect(totals.annualInterestEstimate).toBe(1_200);
  });

  it('sums MF 借入金 accounts excluding 役員借入金 and computes diff', async () => {
    const { service } = buildService();
    const { mfBookBalance } = await service.list('org-1', NOW);

    expect(mfBookBalance.amount).toBe(900_000); // 500k + 400k, 役員借入金 は除外
    expect(mfBookBalance.accounts).toEqual([
      { name: '短期借入金', amount: 500_000 },
      { name: '長期借入金', amount: 400_000 },
    ]);
    // diff = MF帳簿(900k) - 台帳残高(900k)
    expect(mfBookBalance.diff).toBe(0);
  });

  it('returns amount:null when MF is unavailable (no 500)', async () => {
    const { service } = buildService({ bsError: true });
    const { mfBookBalance, totals } = await service.list('org-1', NOW);

    expect(mfBookBalance.amount).toBeNull();
    expect(mfBookBalance.accounts).toEqual([]);
    expect(mfBookBalance.diff).toBeNull();
    // 借入台帳側の集計は MF 失敗と無関係に返る
    expect(totals.outstandingBalance).toBe(900_000);
  });
});
