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
      getJournals: jest
        .fn()
        .mockResolvedValue({ journals: [], truncated: false }),
      getTrialBalanceBS: jest.fn().mockResolvedValue({
        report_type: 'trial_balance_bs',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        columns: [
          'opening_balance',
          'debit_amount',
          'credit_amount',
          'closing_balance',
        ],
        rows: [],
      }),
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

  describe('payment review', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2027-02-01T00:00:00Z'));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('fetches next-January remittances and uses the MF fiscal-year identifier for the closing balance', async () => {
      const { service, mfApi } = createService([
        { fiscal_year: 2025, start_date: '2025-04-01', end_date: '2026-03-31' },
      ]);
      const result = await service.review('org-1', { year: 2025, half: 2 });
      expect(mfApi.getJournals).toHaveBeenCalledWith('org-1', {
        startDate: '2025-06-01',
        endDate: '2026-01-20',
      });
      expect(mfApi.getTrialBalanceBS).toHaveBeenCalledWith('org-1', 2025, 12, {
        withSubAccounts: true,
      });
      expect(result.coverage.complete).toBe(true);
      expect(result.checkDate).toBe('2026-01-20');
    });

    it('splits at fiscal boundaries, deduplicates journals and ignores records outside the requested range', async () => {
      const { service, mfApi } = createService([
        { fiscal_year: 2025, start_date: '2025-01-01', end_date: '2025-12-31' },
        { fiscal_year: 2026, start_date: '2026-01-01', end_date: '2026-12-31' },
      ]);
      const raw = (
        id: string,
        date: string,
        debit: string,
        credit: string,
        remark: string,
      ) => ({
        id,
        transaction_date: date,
        branches: [
          {
            remark,
            debitor: {
              account_name: debit,
              sub_account_name: debit === '預り金' ? '源泉所得税' : null,
              value: 100,
            },
            creditor: {
              account_name: credit,
              sub_account_name: credit === '預り金' ? '源泉所得税' : null,
              value: 100,
            },
          },
        ],
      });
      const wage = raw('wage', '2025-12-25', '給料手当', '預り金', '給与');
      const paid = raw(
        'paid',
        '2026-01-20',
        '預り金',
        '普通預金',
        '源泉所得税納付',
      );
      mfApi.getJournals.mockResolvedValue({
        journals: [
          wage,
          wage,
          paid,
          raw('outside', '2026-07-10', '預り金', '普通預金', '納付'),
        ],
        truncated: false,
      });
      mfApi.getTrialBalanceBS.mockResolvedValue({
        report_type: 'trial_balance_bs',
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        columns: [
          'opening_balance',
          'debit_amount',
          'credit_amount',
          'closing_balance',
        ],
        rows: [
          {
            name: '預り金',
            type: 'account',
            values: [],
            rows: [
              {
                name: '源泉所得税',
                type: 'account',
                values: [0, 0, 100, 100],
                rows: null,
              },
            ],
          },
        ],
      });
      const result = await service.review('org-2', { year: 2025, half: 2 });
      expect(mfApi.getJournals).toHaveBeenNthCalledWith(1, 'org-2', {
        startDate: '2025-06-01',
        endDate: '2025-12-31',
      });
      expect(mfApi.getJournals).toHaveBeenNthCalledWith(2, 'org-2', {
        startDate: '2026-01-01',
        endDate: '2026-01-20',
      });
      expect(result.status).toBe('CLEARED');
      expect(result.totals).toMatchObject({
        aggregatedTax: 100,
        payments: 100,
      });
      expect(result.details).toHaveLength(2);
    });

    it('holds the review when the next fiscal period is missing', async () => {
      const { service } = createService();
      const result = await service.review('org-1', { year: 2025, half: 2 });
      expect(result.coverage.complete).toBe(false);
      expect(result.status).toBe('REVIEW_REQUIRED');
    });

    it.each(['truncated', 'invalid', 'failed', 'missing-array'] as const)(
      'does not report complete for %s journal data',
      async (kind) => {
        const { service, mfApi } = createService([
          {
            fiscal_year: 2025,
            start_date: '2025-04-01',
            end_date: '2026-03-31',
          },
        ]);
        if (kind === 'failed')
          mfApi.getJournals.mockRejectedValue(new Error('MF unavailable'));
        else if (kind === 'missing-array')
          mfApi.getJournals.mockResolvedValue({});
        else
          mfApi.getJournals.mockResolvedValue({
            journals:
              kind === 'invalid'
                ? [null, { id: 'bad', transaction_date: '2025-12-10' }]
                : [],
            truncated: kind === 'truncated',
          });
        const result = await service.review('org-1', { year: 2025, half: 2 });
        expect(result.status).toBe('REVIEW_REQUIRED');
        expect(result.issues.length).toBeGreaterThan(0);
      },
    );

    it('does not infer a zero balance when the BS request fails', async () => {
      const { service, mfApi } = createService([
        { fiscal_year: 2025, start_date: '2025-04-01', end_date: '2026-03-31' },
      ]);
      mfApi.getTrialBalanceBS.mockRejectedValue(new Error('MF unavailable'));
      const result = await service.review('org-1', { year: 2025, half: 2 });
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.totals.periodEndBalance).toBeNull();
    });

    it('does not request future half-years', async () => {
      const { service, mfApi } = createService();
      expect(
        (await service.review('org-1', { year: 2027, half: 1 })).status,
      ).toBe('NOT_READY');
      expect(mfApi.getOffice).not.toHaveBeenCalled();
      expect(mfApi.getJournals).not.toHaveBeenCalled();
    });

    it.each([
      { year: NaN, half: 1 },
      { year: 2026, half: 3 },
      { year: 2026.1, half: 1 },
      { year: 2026, half: 1, checkDate: '2026-06-30' },
      { year: 2026, half: 2, checkDate: '2027-02-30' },
      { year: 2026, half: 1, checkDate: '2027-01-01' },
    ])(
      'validates requested dates and half-years before contacting MF: %p',
      async (params) => {
        const { service, mfApi } = createService();
        await expect(service.review('org-1', params)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(mfApi.getOffice).not.toHaveBeenCalled();
      },
    );
  });
});
