import {
  fiscalMonthToCalendarYear,
  fyStartMonthFromFiscalMonthEnd,
  fiscalMonthToDate,
} from './fiscal-period.util';

/**
 * 会計年度は「期末年(end year)」で統一する。
 * 例: 2025年4月〜2026年3月の3月決算 → fiscalYear = 2026。
 */
describe('fiscal-period.util (期末年 convention)', () => {
  describe('fyStartMonthFromFiscalMonthEnd', () => {
    it('3月決算 → 期首4月', () => {
      expect(fyStartMonthFromFiscalMonthEnd(3)).toBe(4);
    });
    it('12月決算 → 期首1月', () => {
      expect(fyStartMonthFromFiscalMonthEnd(12)).toBe(1);
    });
    it('6月決算 → 期首7月', () => {
      expect(fyStartMonthFromFiscalMonthEnd(6)).toBe(7);
    });
  });

  describe('fiscalMonthToCalendarYear', () => {
    // 3月決算: fiscalYear(期末年)=2026, 期間=2025-04〜2026-03, 期首月=4
    it('3月決算: 期首月(4月)は前年(2025)', () => {
      expect(fiscalMonthToCalendarYear(2026, 4, 4)).toBe(2025);
    });
    it('3月決算: 12月は前年(2025)', () => {
      expect(fiscalMonthToCalendarYear(2026, 12, 4)).toBe(2025);
    });
    it('3月決算: 1月は期末年(2026)', () => {
      expect(fiscalMonthToCalendarYear(2026, 1, 4)).toBe(2026);
    });
    it('3月決算: 期末月(3月)は期末年(2026)', () => {
      expect(fiscalMonthToCalendarYear(2026, 3, 4)).toBe(2026);
    });

    // 12月決算: 会計期間=暦年。全月が期末年と一致。
    it('12月決算: 全月が期末年(2025)', () => {
      expect(fiscalMonthToCalendarYear(2025, 1, 1)).toBe(2025);
      expect(fiscalMonthToCalendarYear(2025, 6, 1)).toBe(2025);
      expect(fiscalMonthToCalendarYear(2025, 12, 1)).toBe(2025);
    });

    // 6月決算: fiscalYear(期末年)=2026, 期間=2025-07〜2026-06, 期首月=7
    it('6月決算: 7月は前年(2025)、6月は期末年(2026)', () => {
      expect(fiscalMonthToCalendarYear(2026, 7, 7)).toBe(2025);
      expect(fiscalMonthToCalendarYear(2026, 12, 7)).toBe(2025);
      expect(fiscalMonthToCalendarYear(2026, 1, 7)).toBe(2026);
      expect(fiscalMonthToCalendarYear(2026, 6, 7)).toBe(2026);
    });
  });

  describe('fiscalMonthToDate', () => {
    it('3月決算 11月 → 2025-11-01 (UTC月初)', () => {
      const d = fiscalMonthToDate(2026, 11, 4);
      expect(d.toISOString().slice(0, 10)).toBe('2025-11-01');
    });
    it('3月決算 1月 → 2026-01-01', () => {
      const d = fiscalMonthToDate(2026, 1, 4);
      expect(d.toISOString().slice(0, 10)).toBe('2026-01-01');
    });
  });
});
