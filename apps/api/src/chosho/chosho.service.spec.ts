import {
  computeAnomaliesFromSaved,
  computeMonthOrderFromFyStart,
  parseMonthlyBalances,
} from './chosho.service';

/**
 * Unit 2B-2: chosho.service の純粋 helper 群のテスト。
 * createDraft / getVersion 本体は Prisma 結合のため、ここでは helper だけを純関数テスト。
 */

describe('parseMonthlyBalances', () => {
  it('parses {"4": 1234, "5": 5678} into Record<number, number>', () => {
    const out = parseMonthlyBalances({ '4': 1234, '5': 5678 });
    expect(out).toEqual({ 4: 1234, 5: 5678 });
  });

  it('returns empty object for null / undefined / array', () => {
    expect(parseMonthlyBalances(null)).toEqual({});
    expect(parseMonthlyBalances(undefined)).toEqual({});
    expect(parseMonthlyBalances([1, 2, 3])).toEqual({});
  });

  it('skips invalid month keys (out of 1-12 or non-numeric)', () => {
    const out = parseMonthlyBalances({ '0': 1, '13': 2, foo: 3, '4': 100 });
    expect(out).toEqual({ 4: 100 });
  });

  it('skips non-numeric values', () => {
    const out = parseMonthlyBalances({ '4': 100, '5': 'oops', '6': null });
    expect(out).toEqual({ 4: 100 });
  });
});

describe('computeMonthOrderFromFyStart', () => {
  it('returns [4..3] for fyStartMonth = 4 (March-end fiscal year)', () => {
    expect(computeMonthOrderFromFyStart(4)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
  });

  it('returns [1..12] for fyStartMonth = 1 (December-end)', () => {
    expect(computeMonthOrderFromFyStart(1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('returns [10..9] for fyStartMonth = 10', () => {
    expect(computeMonthOrderFromFyStart(10)).toEqual([10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('computeAnomaliesFromSaved', () => {
  it('flags ZERO_VIOLATION when expectedRule=ZERO and selectedMonth balance != 0', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 165000 },
      expectedRule: 'ZERO',
      agingCheckEnabled: false,
      selectedMonth: 6,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('ZERO_VIOLATION');
  });

  it('does not flag ZERO_VIOLATION when balance is exactly 0', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 0 },
      expectedRule: 'ZERO',
      agingCheckEnabled: false,
      selectedMonth: 6,
    });
    expect(out).toEqual([]);
  });

  it('flags AGING_3M when last 3 months are identical non-zero', () => {
    // 期首4月の場合、selectedMonth=8 → m0=6 m1=7 m2=8
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 165000, 7: 165000, 8: 165000 },
      expectedRule: 'NONE',
      agingCheckEnabled: true,
      selectedMonth: 8,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('AGING_3M');
    expect(out[0].detail).toMatchObject({ sameAmount: 165000 });
  });

  it('does not flag AGING_3M when any of the 3 months is missing', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 7: 165000, 8: 165000 },
      expectedRule: 'NONE',
      agingCheckEnabled: true,
      selectedMonth: 8,
    });
    expect(out).toEqual([]);
  });

  it('handles month wrap-around (selectedMonth=2 → checks Dec/Jan/Feb)', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 12: 5000, 1: 5000, 2: 5000 },
      expectedRule: 'NONE',
      agingCheckEnabled: true,
      selectedMonth: 2,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('AGING_3M');
    expect(out[0].detail).toMatchObject({ monthsChecked: [12, 1, 2] });
  });
});
