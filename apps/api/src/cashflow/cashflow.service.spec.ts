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
  // 3か月で monthlyBurn*3 の純流出になる outflow のみのエントリを1件作る
  return [
    {
      amount: monthlyBurn * 3,
      category: { direction: 'OUT' },
      entryDate: new Date(),
    },
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

    it('SAFE with Infinity runway when monthly burn is zero', async () => {
      const prisma = createPrismaMock();
      prisma.runwaySnapshot.findFirst.mockResolvedValue(null);
      prisma.cashFlowEntry.findMany.mockResolvedValue([]);
      prisma.cashFlowForecast.findFirst.mockResolvedValue({ closingBalance: 5_000_000 });
      const svc = createService(prisma);
      const r = await svc.getRunway('org-1');
      expect(r.runwayMonths).toBe(Infinity);
      expect(r.alertLevel).toBe('SAFE');
    });
  });
});
