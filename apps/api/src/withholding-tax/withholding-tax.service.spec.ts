import { BadRequestException } from '@nestjs/common';
import { WithholdingTaxService } from './withholding-tax.service';

describe('WithholdingTaxService', () => {
  function createService() {
    const prisma = {
      organization: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ fiscalMonthEnd: 3 }),
      },
    };
    const mfApi = {
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
