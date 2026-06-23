import { BadRequestException } from '@nestjs/common';
import { WithholdingTaxService } from './withholding-tax.service';

describe('WithholdingTaxService', () => {
  function createService(
    accountingPeriods = [
      {
        fiscal_year: 2025,
        start_date: '2025-01-01',
        end_date: '2025-12-31',
      },
    ],
  ) {
    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ fiscalMonthEnd: 3 }),
      },
    };
    const mfApi = {
      getOffice: jest
        .fn()
        .mockResolvedValue({ accounting_periods: accountingPeriods }),
      getJournals: jest.fn().mockResolvedValue({ journals: [], truncated: false }),
    };
    return {
      service: new WithholdingTaxService(prisma as any, mfApi as any),
      prisma,
      mfApi,
    };
  }

  it('uses an explicit aggregation date range when provided', async () => {
    const { service, mfApi } = createService();

    const result = await service.preview('org-1', {
      startDate: '2025-01-01',
      endDate: '2025-06-30',
    });

    expect(mfApi.getJournals).toHaveBeenCalledWith('org-1', {
      startDate: '2025-01-01',
      endDate: '2025-06-30',
    });
    expect(result).toMatchObject({
      fiscalYear: 2025,
      month: null,
      range: { startDate: '2025-01-01', endDate: '2025-06-30' },
    });
  });

  it('splits explicit date ranges by MoneyForward accounting periods', async () => {
    const { service, mfApi } = createService([
      {
        fiscal_year: 2025,
        start_date: '2024-10-01',
        end_date: '2025-09-30',
      },
      {
        fiscal_year: 2026,
        start_date: '2025-10-01',
        end_date: '2026-09-30',
      },
    ]);

    await service.preview('org-1', {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    expect(mfApi.getJournals).toHaveBeenCalledTimes(2);
    expect(mfApi.getJournals).toHaveBeenNthCalledWith(1, 'org-1', {
      startDate: '2025-01-01',
      endDate: '2025-09-30',
    });
    expect(mfApi.getJournals).toHaveBeenNthCalledWith(2, 'org-1', {
      startDate: '2025-10-01',
      endDate: '2025-12-31',
    });
  });

  it('keeps legacy fiscal year and month range support', async () => {
    const { service, mfApi } = createService();

    const result = await service.preview('org-1', {
      fiscalYear: 2026,
      month: 4,
    });

    expect(mfApi.getJournals).toHaveBeenCalledWith('org-1', {
      startDate: '2025-04-01',
      endDate: '2025-04-30',
    });
    expect(result.range).toEqual({
      startDate: '2025-04-01',
      endDate: '2025-04-30',
    });
  });

  it('rejects invalid explicit date ranges', async () => {
    const { service } = createService();

    await expect(
      service.preview('org-1', {
        startDate: '2025-07-01',
        endDate: '2025-06-30',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
