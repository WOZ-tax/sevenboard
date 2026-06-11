import {
  buildNamePathByIdFromSavedRows,
  computeAnomaliesFromSaved,
  computeMonthOrderFromFyStart,
  flattenTrialForActivity,
  parseMonthlyBalances,
} from './chosho.service';
import type { MfReportRow } from '../mf/types/mf-api.types';

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
  it('flags EXPECTED_VALUE_VIOLATION when balance != expectedValue (期待値=0)', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 165000 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'EXPECTED_VALUE',
      expectedValue: 0,
      agingCheckEnabled: false,
      selectedMonth: 6,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('EXPECTED_VALUE_VIOLATION');
    expect(out[0].detail).toEqual({ actualAmount: 165000, expectedValue: 0 });
  });

  it('flags EXPECTED_VALUE_VIOLATION with non-zero expectedValue (期待値=300万)', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 2_500_000 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'EXPECTED_VALUE',
      expectedValue: 3_000_000,
      agingCheckEnabled: false,
      selectedMonth: 6,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('EXPECTED_VALUE_VIOLATION');
    expect(out[0].detail).toEqual({ actualAmount: 2_500_000, expectedValue: 3_000_000 });
  });

  it('does not flag EXPECTED_VALUE_VIOLATION when balance matches expectedValue', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 0 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'EXPECTED_VALUE',
      expectedValue: 0,
      agingCheckEnabled: false,
      selectedMonth: 6,
    });
    expect(out).toEqual([]);
  });

  it('does not flag EXPECTED_VALUE_VIOLATION when expectedValue is null', () => {
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 100000 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'EXPECTED_VALUE',
      expectedValue: null,
      agingCheckEnabled: false,
      selectedMonth: 6,
    });
    expect(out).toEqual([]);
  });

  it('flags AGING_3M when last 3 months are identical non-zero', () => {
    // 期首4月 (monthOrder=[4,5,6,7,8,...]) で selectedMonth=8 → idx=4 → m0=6 m1=7 m2=8
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 6: 165000, 7: 165000, 8: 165000 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'NONE',
      expectedValue: null,
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
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'NONE',
      expectedValue: null,
      agingCheckEnabled: true,
      selectedMonth: 8,
    });
    expect(out).toEqual([]);
  });

  it('skips AGING_3M for the first 2 months of the fiscal year (idx < 2)', () => {
    // 3月決算 (期首4月) で selectedMonth=5 は monthOrder の idx=1 → 判定不能。
    // 暦ラップ実装だと m0=3月 (同FYの期末=未来) と比較して誤検知していた。
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 3: 5000, 4: 5000, 5: 5000 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'NONE',
      expectedValue: null,
      agingCheckEnabled: true,
      selectedMonth: 5,
    });
    expect(out).toEqual([]);
  });

  it('uses monthOrder (not calendar wrap) — fyStart=12 → selectedMonth=2 checks Dec/Jan/Feb', () => {
    // 12月始まり (monthOrder=[12,1,2,...]) で selectedMonth=2 → idx=2 → m0=12 m1=1 m2=2
    const out = computeAnomaliesFromSaved({
      monthlyBalances: { 12: 5000, 1: 5000, 2: 5000 },
      monthOrder: computeMonthOrderFromFyStart(12),
      expectedRule: 'NONE',
      expectedValue: null,
      agingCheckEnabled: true,
      selectedMonth: 2,
    });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('AGING_3M');
    expect(out[0].detail).toMatchObject({ monthsChecked: [12, 1, 2] });
  });

  it('suppresses AGING_3M when recentActivity has debit or credit > 0', () => {
    const base = {
      monthlyBalances: { 6: 165000, 7: 165000, 8: 165000 },
      monthOrder: computeMonthOrderFromFyStart(4),
      expectedRule: 'NONE' as const,
      expectedValue: null,
      agingCheckEnabled: true,
      selectedMonth: 8,
    };
    // debit > 0 → 抑制
    expect(computeAnomaliesFromSaved({ ...base, recentActivity: { debit: 50000, credit: 0 } })).toEqual([]);
    // credit > 0 → 抑制
    expect(computeAnomaliesFromSaved({ ...base, recentActivity: { debit: 0, credit: 30000 } })).toEqual([]);
    // 両方 0 → 検知あり
    expect(computeAnomaliesFromSaved({ ...base, recentActivity: { debit: 0, credit: 0 } })).toHaveLength(1);
    // null → 検知あり (既存挙動)
    expect(computeAnomaliesFromSaved({ ...base, recentActivity: null })).toHaveLength(1);
    // undefined (省略) → 検知あり
    expect(computeAnomaliesFromSaved(base)).toHaveLength(1);
  });
});

// ============================================================
// flattenTrialForActivity (試算表 → name path map)
// ============================================================

describe('flattenTrialForActivity', () => {
  function makeTrialRow(name: string, debit: number, credit: number, children: MfReportRow[] = []): MfReportRow {
    // values columns: [opening, debit, credit, closing, ratio]
    return { name, type: 'account', values: [0, debit, credit, 0, null], rows: children.length > 0 ? children : null };
  }

  it('builds name path -> {debit, credit} map from nested rows', () => {
    const rows: MfReportRow[] = [
      makeTrialRow('資産の部', 0, 0, [
        makeTrialRow('流動資産', 0, 0, [
          makeTrialRow('売掛金', 100, 80, [
            makeTrialRow('株式会社A', 60, 50),
            makeTrialRow('株式会社B', 40, 30),
          ]),
        ]),
      ]),
    ];
    const map = new Map<string, { debit: number; credit: number }>();
    flattenTrialForActivity(rows, [], map);
    expect(map.get('資産の部/流動資産/売掛金')).toEqual({ debit: 100, credit: 80 });
    expect(map.get('資産の部/流動資産/売掛金/株式会社A')).toEqual({ debit: 60, credit: 50 });
    expect(map.get('資産の部/流動資産/売掛金/株式会社B')).toEqual({ debit: 40, credit: 30 });
  });

  it('skips rows where both debit and credit are 0', () => {
    const rows: MfReportRow[] = [makeTrialRow('資産の部', 0, 0)];
    const map = new Map<string, { debit: number; credit: number }>();
    flattenTrialForActivity(rows, [], map);
    expect(map.size).toBe(0);
  });

  it('handles null rows (leaf node)', () => {
    const rows: MfReportRow[] = [makeTrialRow('現金', 100, 50)];
    const map = new Map<string, { debit: number; credit: number }>();
    flattenTrialForActivity(rows, [], map);
    expect(map.get('現金')).toEqual({ debit: 100, credit: 50 });
  });
});

// ============================================================
// buildNamePathByIdFromSavedRows
// ============================================================

describe('buildNamePathByIdFromSavedRows', () => {
  it('walks parentRowId chain to build /-joined name paths', () => {
    const rows = [
      { id: 'r1', accountName: '資産の部', parentRowId: null },
      { id: 'r2', accountName: '流動資産', parentRowId: 'r1' },
      { id: 'r3', accountName: '売掛金', parentRowId: 'r2' },
      { id: 'r4', accountName: '株式会社A', parentRowId: 'r3' },
    ];
    const map = buildNamePathByIdFromSavedRows(rows);
    expect(map.get('r1')).toBe('資産の部');
    expect(map.get('r2')).toBe('資産の部/流動資産');
    expect(map.get('r3')).toBe('資産の部/流動資産/売掛金');
    expect(map.get('r4')).toBe('資産の部/流動資産/売掛金/株式会社A');
  });

  it('handles missing parent (orphan) gracefully', () => {
    const rows = [
      { id: 'r1', accountName: '売掛金', parentRowId: 'missing' },
    ];
    const map = buildNamePathByIdFromSavedRows(rows);
    expect(map.get('r1')).toBe('売掛金');
  });
});
