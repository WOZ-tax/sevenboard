import { MfTransformService } from '../mf/mf-transform.service';
import { WithholdingTaxService } from '../withholding-tax/withholding-tax.service';
import { MfApiService } from '../mf/mf-api.service';
import { DEMO_ORG_ID } from './demo.constants';
import {
  demoBalance,
  demoJournals,
  demoOffice,
  demoTrialBalance,
  demoTransition,
  monthEnd,
} from './wholesale-ledger';

describe('wholesale accounting dataset', () => {
  it('balances every journal including split VAT and payroll deductions', () => {
    const data = demoJournals({
      startDate: '2022-01-01',
      endDate: '2026-08-31',
    });
    expect(data.journals.length).toBeGreaterThan(800);
    expect(new Set(data.journals.map((j) => j.id)).size).toBe(
      data.journals.length,
    );
    for (const j of data.journals) {
      const total = (side: 'debitor' | 'creditor') =>
        j.branches.reduce(
          (n, b) => n + (b[side]?.value ?? 0) + (b[side]?.tax_value ?? 0),
          0,
        );
      expect(Number.isSafeInteger(total('debitor'))).toBe(true);
      expect(total('debitor')).toBe(total('creditor'));
    }
  });
  it.each([2022, 2023, 2024, 2025, 2026])(
    'balances BS and rolls forward opening cash for %i',
    (year) => {
      for (let m = 1; m <= (year === 2026 ? 8 : 12); m++) {
        const bs = demoTrialBalance('bs', year, m);
        expect(bs.rows[0].values[3]).toBe(bs.rows[3].values[3]);
        expect(bs.rows[0].values[0]).toBe(bs.rows[3].values[0]);
        expect(demoBalance('cash', monthEnd(year, m))).toBeGreaterThan(0);
        const cashflow = new MfTransformService().deriveCashflow(
          demoTransition('bs', year, m),
          demoTransition('pl', year, m),
          bs,
        );
        expect(cashflow.cashBalances[m - 1]).toBe(
          demoBalance('cash', monthEnd(year, m)),
        );
      }
    },
  );
  it('uses the normal transform for monthly PL, cumulative PL and cash', () => {
    const transform = new MfTransformService();
    const pl = demoTrialBalance('pl', 2026, 8),
      bs = demoTrialBalance('bs', 2026, 8);
    const monthly = transform.transformTransitionPL(
      demoTransition('pl', 2026, 8),
    );
    const dashboard = transform.buildDashboardSummary(pl, bs);
    expect(monthly.reduce((n, m) => n + m.revenue, 0)).toBe(dashboard.revenue);
    expect(dashboard.cashBalance).toBe(demoBalance('cash', '2026-08-31'));
  });
  it.each([
    [2025, 1, '2025-07-10'],
    [2025, 2, '2026-01-20'],
    [2026, 1, '2026-07-10'],
  ] as const)(
    'clears the target withholding period %i/%i on %s through the real review service',
    async (year, half, checkDate) => {
      const mf = new MfApiService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      const service = new WithholdingTaxService({} as any, mf);
      const result = await service.review(DEMO_ORG_ID, {
        year,
        half,
        checkDate,
      });
      expect(result.issues).toEqual([]);
      expect(result.totals.remainingBalance).toBe(0);
      expect(result.totals.balanceDifference).toBe(0);
    },
  );
  it('does not contain future journals or invented accounting periods', () => {
    expect(demoJournals({ startDate: '2026-09-01' }).journals).toHaveLength(0);
    expect(demoOffice().accounting_periods).toHaveLength(5);
    expect(() => demoTrialBalance('pl', 2030)).toThrow();
    expect(demoTrialBalance('pl', 2026, 12).end_date).toBe('2026-08-31');
  });
});
