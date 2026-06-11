import { CashflowService } from './cashflow.service';

function createPrismaMock() {
  return {
    orgScope: jest
      .fn()
      .mockResolvedValue({ tenantId: 'tenant-1', orgId: 'org-1' }),
    cashFlowEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    runwaySnapshot: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    cashFlowForecast: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    cashFlowCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  return new CashflowService(prisma as unknown as never);
}

function burnEntries(monthlyBurn: number) {
  // getRunway は「エントリが実際にまたぐ異なる暦月数」でバーンを平均する仕様
  // (monthsSpanned)。よって月次バーン monthlyBurn を表現するには、3つの別々の
  // 暦月にそれぞれ monthlyBurn の outflow を置く(合計 monthlyBurn*3 ÷ 3か月 = monthlyBurn)。
  // 日付は mock の findMany が where を無視して返すため固定の過去3か月でよい。
  return [
    { amount: monthlyBurn, category: { direction: 'OUT' }, entryDate: new Date('2026-01-15T00:00:00Z') },
    { amount: monthlyBurn, category: { direction: 'OUT' }, entryDate: new Date('2026-02-15T00:00:00Z') },
    { amount: monthlyBurn, category: { direction: 'OUT' }, entryDate: new Date('2026-03-15T00:00:00Z') },
  ];
}

describe('CashflowService.getRunway', () => {
  it('returns the latest snapshot verbatim when one exists', async () => {
    const prisma = createPrismaMock();
    const snapshotDate = new Date('2026-04-01T00:00:00Z');
    prisma.runwaySnapshot.findFirst.mockResolvedValue({
      snapshotDate,
      cashBalance: 10_000_000,
      monthlyBurnRate: 1_000_000,
      runwayMonths: 10,
      alertLevel: 'CAUTION',
    });
    const svc = createService(prisma);
    const result = await svc.getRunway('org-1');
    expect(prisma.runwaySnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', orgId: 'org-1' },
      }),
    );
    expect(result).toEqual({
      snapshotDate,
      cashBalance: 10_000_000,
      monthlyBurnRate: 1_000_000,
      runwayMonths: 10,
      alertLevel: 'CAUTION',
    });
    expect(prisma.cashFlowEntry.findMany).not.toHaveBeenCalled();
  });

  describe('fallback threshold (12 / 6 / 3 months, Japanese SMB baseline)', () => {
    async function runwayFor(cashBalance: number, monthlyBurn: number) {
      const prisma = createPrismaMock();
      prisma.runwaySnapshot.findFirst.mockResolvedValue(null);
      prisma.cashFlowEntry.findMany.mockResolvedValue(burnEntries(monthlyBurn));
      prisma.cashFlowForecast.findFirst.mockResolvedValue({ closingBalance: cashBalance });
      const svc = createService(prisma);
      return svc.getRunway('org-1');
    }

    it('SAFE at 12+ months of runway', async () => {
      const r = await runwayFor(12_000_000, 1_000_000); // 12 months exactly
      expect(r.alertLevel).toBe('SAFE');
      expect(r.runwayMonths).toBe(12);
    });

    it('CAUTION at 6-12 months', async () => {
      const r = await runwayFor(8_000_000, 1_000_000); // 8 months
      expect(r.alertLevel).toBe('CAUTION');
    });

    it('WARNING at 3-6 months', async () => {
      const r = await runwayFor(4_000_000, 1_000_000); // 4 months
      expect(r.alertLevel).toBe('WARNING');
    });

    it('CRITICAL below 3 months', async () => {
      const r = await runwayFor(2_000_000, 1_000_000); // 2 months
      expect(r.alertLevel).toBe('CRITICAL');
    });

    it('SAFE with infinite-runway sentinel (999) when monthly burn is zero', async () => {
      // JSON は Infinity を表現できない(null に化けて「データ無し」と区別不能)ため、
      // 実装は有限センチネル 999 + runwayInfinite:true で「実質無限」を表す
      // (フロントは >= 999 を無限として扱う既存契約)。
      const prisma = createPrismaMock();
      prisma.runwaySnapshot.findFirst.mockResolvedValue(null);
      prisma.cashFlowEntry.findMany.mockResolvedValue([]);
      prisma.cashFlowForecast.findFirst.mockResolvedValue({ closingBalance: 5_000_000 });
      const svc = createService(prisma);
      const r = await svc.getRunway('org-1');
      expect(r.runwayMonths).toBe(999);
      expect((r as { runwayInfinite?: boolean }).runwayInfinite).toBe(true);
      expect(r.alertLevel).toBe('SAFE');
    });
  });
});
