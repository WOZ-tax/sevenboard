import { SyncService } from './sync.service';
import { MfApiService } from '../mf/mf-api.service';
import { MfTransformService } from '../mf/mf-transform.service';
import { DEMO_ACCOUNTS, demoMonthAmount } from '../demo/wholesale-ledger';
import { DEMO_ORG_ID, DEMO_TENANT_ID } from '../demo/demo.constants';

describe('monthly import source and date boundaries', () => {
  function setup() {
    const accounts = DEMO_ACCOUNTS.map((a) => ({
      id: a.key,
      name: a.name,
      externalId: `demo-${a.key}`,
      category: a.category === 'TAX' ? 'ADMIN_EXPENSE' : a.category,
    }));
    const prisma: any = {
      orgScope: jest.fn().mockResolvedValue({ tenantId: DEMO_TENANT_ID }),
      integration: { upsert: jest.fn() },
      organization: {
        findFirst: jest.fn().mockResolvedValue({ fiscalMonthEnd: 12 }),
      },
      accountMaster: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            accounts.find((a) =>
              where.name
                ? a.name === where.name
                : a.externalId === where.externalId,
            ),
          ),
        ),
      },
      actualEntry: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const mf = new MfApiService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const svc = new SyncService(
      prisma,
      mf,
      new MfTransformService(),
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(svc as any, 'kickoffRiskScanAfterSync')
      .mockResolvedValue(undefined);
    return { prisma, mf, svc };
  }
  it('never writes cumulative PL into an unbooked month and dates BS at its report cutoff', async () => {
    const { prisma, svc } = setup();
    const result = await svc.runSync(DEMO_ORG_ID);
    expect(result.status).toBe('SUCCESS');
    const writes = prisma.actualEntry.create.mock.calls.map(
      ([arg]) => arg.data,
    );
    expect(writes.filter((w) => w.accountId === 'sales')).toHaveLength(8);
    expect(
      writes.find(
        (w) =>
          w.accountId === 'sales' &&
          w.month.toISOString().startsWith('2026-08'),
      )?.amount,
    ).toBe(demoMonthAmount('sales', 2026, 8));
    expect(
      writes.every((w) => w.month.toISOString().slice(0, 10) <= '2026-08-01'),
    ).toBe(true);
    expect(
      writes
        .find((w) => w.accountId === 'cash')
        ?.month.toISOString()
        .slice(0, 10),
    ).toBe('2026-08-01');
  });
  it('does not fall back to a cumulative PL value when the monthly source fails', async () => {
    const { prisma, mf, svc } = setup();
    jest
      .spyOn(mf, 'getTransitionPL')
      .mockRejectedValue(new Error('upstream unavailable'));
    const result = await svc.runSync(DEMO_ORG_ID);
    expect(result.status).toBe('PARTIAL');
    expect(prisma.actualEntry.create).not.toHaveBeenCalled();
    expect(prisma.actualEntry.update).not.toHaveBeenCalled();
  });
});
