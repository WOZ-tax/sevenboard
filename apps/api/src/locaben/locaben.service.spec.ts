import { LocabenService } from './locaben.service';
import { MfApiService } from '../mf/mf-api.service';

describe('LocabenService period comparison', () => {
  const row = (name: string, amount: number) => ({
    name,
    type: 'account',
    values: [0, 0, 0, amount],
    rows: null,
  });
  const setup = () => {
    const mf = {
      getTrialBalancePL: jest.fn(
        async (_org: string, year: number, month?: number) => ({
          rows: [
            row(
              '売上高合計',
              year === 2026 ? 120_000_000 : month ? 100_000_000 : 240_000_000,
            ),
            row('営業利益', 8_000_000),
          ],
        }),
      ),
      getTrialBalanceBS: jest.fn(async () => ({ rows: [] })),
      getTransitionPL: jest.fn(async () => ({ columns: ['total'], rows: [] })),
    };
    return { mf, service: new LocabenService(mf as unknown as MfApiService) };
  };

  it('compares sales through the same cutoff month, including non-December fiscal years', async () => {
    const { mf, service } = setup();
    const result = await service.getSourceData('org-a', 2026, 8);
    expect(mf.getTrialBalancePL.mock.calls).toEqual([
      ['org-a', 2026, 8],
      ['org-a', 2025, 8],
    ]);
    expect(result.revenueCurrent).toBe(120_000);
    expect(result.revenuePrior).toBe(100_000);
    expect(
      (result.revenueCurrent! / result.revenuePrior! - 1) * 100,
    ).toBeCloseTo(20);
  });

  it('uses full-year figures for both sides when no month is selected', async () => {
    const { mf, service } = setup();
    const result = await service.getSourceData('org-b', 2026);
    expect(mf.getTrialBalancePL).toHaveBeenCalledWith('org-b', 2025, undefined);
    expect(result.revenuePrior).toBe(240_000);
  });

  it('keeps missing prior-period sales null instead of inventing zero growth', async () => {
    const { mf, service } = setup();
    mf.getTrialBalancePL.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.getSourceData('org-a', 2026, 8)).rejects.toThrow(
      'unavailable',
    );
    mf.getTrialBalancePL.mockImplementation(async (_org, year) => {
      if (year === 2025) throw new Error('no prior period');
      return { rows: [row('売上高合計', 120_000_000)] };
    });
    const result = await service.getSourceData('org-a', 2026, 8);
    expect(result.revenuePrior).toBeNull();
    expect(result.employeeCount).toBeNull();
  });
});
