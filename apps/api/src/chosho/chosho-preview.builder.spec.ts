import { buildChoshoPreviewRows } from './chosho-preview.builder';
import type { MfTransition } from '../mf/types/mf-api.types';
import type { ChoshoRuleOverride } from './chosho-preview.types';

/**
 * Unit 2B-1: builder の純関数テスト。
 *
 * カバー範囲:
 * - flatten (ネスト → flat、displayOrder、parentRowKey)
 * - 月別残高 (monthOrder, settlement_balance, total)
 * - ヒューリスティック agingCheckEnabled (受取勘定の子孫だけ ON)
 * - ruleOverrides による上書き
 * - 零残高違反 (ZERO ルール)
 * - 3ヶ月以上滞留 (AGING_3M ルール)
 * - 異常検知が outOfRange と独立 (selectedMonth を変えても過去月セルに干渉しない)
 */

// ============================================================
// fixtures
// ============================================================

/**
 * MF 推移表 BS の最小 fixture。期首 4 月、選択月までの値だけ詰める。
 * columns: 12ヶ月 + settlement_balance + total
 * rows: 大区分 → 勘定 → 補助/取引先
 */
function makeBsFixture(args: {
  /** 補助科目の月別残高 (4月→3月) */
  subaccountValues: (number | null)[];
  /** 補助科目の名前 */
  subaccountName?: string;
  /** 親勘定の名前 (デフォルト: 売掛金 = 受取勘定) */
  accountName?: string;
}): MfTransition {
  const months = ['4', '5', '6', '7', '8', '9', '10', '11', '12', '1', '2', '3'];
  const total = args.subaccountValues.reduce<number | null>(
    (acc, v) => (acc == null ? v : v == null ? acc : acc + v),
    null,
  );

  return {
    report_type: 'monthly_transition_balance_sheet',
    columns: [...months, 'settlement_balance', 'total'],
    fiscal_year: 2025,
    start_date: '2025-04-01',
    end_date: '2026-03-31',
    start_month: 4,
    end_month: 3,
    rows: [
      {
        name: '資産の部',
        type: 'assets',
        values: [...args.subaccountValues, args.subaccountValues.at(-1) ?? null, total],
        rows: [
          {
            name: '流動資産',
            type: 'financial_statement_item',
            values: [...args.subaccountValues, args.subaccountValues.at(-1) ?? null, total],
            rows: [
              {
                name: args.accountName ?? '売掛金',
                type: 'account',
                values: [...args.subaccountValues, args.subaccountValues.at(-1) ?? null, total],
                rows: [
                  {
                    name: args.subaccountName ?? '株式会社サンプル',
                    type: 'account',
                    values: [...args.subaccountValues, args.subaccountValues.at(-1) ?? null, total],
                    rows: null,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

// ============================================================
// flatten
// ============================================================

describe('buildChoshoPreviewRows / flatten', () => {
  it('returns empty arrays when bsTransition is null', () => {
    const { rows, monthOrder } = buildChoshoPreviewRows({ bsTransition: null });
    expect(rows).toEqual([]);
    expect(monthOrder).toEqual([]);
  });

  it('flattens MF nested rows in DFS order with parentRowKey', () => {
    const bs = makeBsFixture({ subaccountValues: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100] });
    const { rows, monthOrder } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });

    expect(monthOrder).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
    expect(rows).toHaveLength(4); // 資産の部 → 流動資産 → 売掛金 → サンプル
    expect(rows.map((r) => r.name)).toEqual([
      '資産の部',
      '流動資産',
      '売掛金',
      '株式会社サンプル',
    ]);
    expect(rows.map((r) => r.level)).toEqual([0, 1, 2, 3]);
    expect(rows[0].parentRowKey).toBeNull();
    expect(rows[1].parentRowKey).toBe(rows[0].rowKey);
    expect(rows[2].parentRowKey).toBe(rows[1].rowKey);
    expect(rows[3].parentRowKey).toBe(rows[2].rowKey);
    expect(rows.map((r) => r.displayOrder)).toEqual([0, 1, 2, 3]);
  });

  it('extracts monthlyBalances / settlementBalance / total from values array', () => {
    const bs = makeBsFixture({ subaccountValues: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    const leaf = rows.at(-1)!;
    expect(leaf.monthlyBalances).toEqual({
      4: 10, 5: 20, 6: 30, 7: 40, 8: 50, 9: 60,
      10: 70, 11: 80, 12: 90, 1: 100, 2: 110, 3: 120,
    });
    // fixture では settlement = 末月、total = 累計
    expect(leaf.settlementBalance).toBe(120);
    expect(leaf.total).toBe(780);
  });

  it('skips months with null values (MF 未取得月)', () => {
    const bs = makeBsFixture({ subaccountValues: [100, 100, null, null, null, null, null, null, null, null, null, null] });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    const leaf = rows.at(-1)!;
    expect(Object.keys(leaf.monthlyBalances)).toEqual(['4', '5']);
  });
});

// ============================================================
// rule defaults / overrides
// ============================================================

describe('buildChoshoPreviewRows / rule defaults', () => {
  it('enables agingCheckEnabled by default for descendants of receivable accounts', () => {
    const bs = makeBsFixture({
      accountName: '売掛金',
      subaccountName: '株式会社XYZ',
      subaccountValues: Array(12).fill(100),
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    // level 0 (資産の部) / level 1 (流動資産): false
    expect(rows[0].agingCheckEnabled).toBe(false);
    expect(rows[1].agingCheckEnabled).toBe(false);
    // level 2 (売掛金 親勘定自身): false
    expect(rows[2].agingCheckEnabled).toBe(false);
    // level 3 (株式会社XYZ = 売掛金子孫): true
    expect(rows[3].agingCheckEnabled).toBe(true);
  });

  it('does NOT enable agingCheckEnabled for non-receivable accounts (棚卸資産 等)', () => {
    const bs = makeBsFixture({
      accountName: '商品',
      subaccountName: '在庫1',
      subaccountValues: Array(12).fill(100),
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    expect(rows.every((r) => r.agingCheckEnabled === false)).toBe(true);
  });

  it('never auto-enables ZERO rule (must be explicitly set via override)', () => {
    const bs = makeBsFixture({ subaccountValues: Array(12).fill(0) });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    expect(rows.every((r) => r.expectedRule === 'NONE')).toBe(true);
  });

  it('applies ruleOverrides on top of heuristics', () => {
    const bs = makeBsFixture({ subaccountValues: Array(12).fill(0) });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    const targetKey = rows.at(-1)!.rowKey;
    const overrides = new Map<string, ChoshoRuleOverride>([
      [targetKey, { expectedRule: 'EXPECTED_VALUE', expectedValue: 0, agingCheckEnabled: false }],
    ]);
    const { rows: out } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], ruleOverrides: overrides });
    expect(out.at(-1)!.expectedRule).toBe('EXPECTED_VALUE');
    expect(out.at(-1)!.expectedValue).toBe(0);
    expect(out.at(-1)!.agingCheckEnabled).toBe(false);
  });
});

// ============================================================
// anomaly detection: expected value violation
// ============================================================

describe('buildChoshoPreviewRows / EXPECTED_VALUE_VIOLATION', () => {
  it('flags EXPECTED_VALUE_VIOLATION when expectedRule=EXPECTED_VALUE and balance ≠ expectedValue (期待値=0)', () => {
    const bs = makeBsFixture({
      accountName: '商品',
      subaccountValues: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    });
    const initial = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    const leafKey = initial.rows.at(-1)!.rowKey;
    const { rows } = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: [],
      selectedMonth: 6,
      ruleOverrides: new Map([[leafKey, { expectedRule: 'EXPECTED_VALUE', expectedValue: 0 }]]),
    });
    const leaf = rows.at(-1)!;
    expect(leaf.anomalies).toHaveLength(1);
    expect(leaf.anomalies[0].type).toBe('EXPECTED_VALUE_VIOLATION');
    expect(leaf.anomalies[0].month).toBe(6);
    expect(leaf.anomalies[0].detail).toEqual({ actualAmount: 100, expectedValue: 0 });
  });

  it('flags EXPECTED_VALUE_VIOLATION with non-zero expectedValue (期待値=300万)', () => {
    const bs = makeBsFixture({
      accountName: '商品',
      subaccountValues: [3_000_000, 3_000_000, 2_500_000, null, null, null, null, null, null, null, null, null],
    });
    const initial = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    const leafKey = initial.rows.at(-1)!.rowKey;
    const { rows } = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: [],
      selectedMonth: 6,
      ruleOverrides: new Map([[leafKey, { expectedRule: 'EXPECTED_VALUE', expectedValue: 3_000_000 }]]),
    });
    const leaf = rows.at(-1)!;
    expect(leaf.anomalies).toHaveLength(1);
    expect(leaf.anomalies[0].detail).toEqual({ actualAmount: 2_500_000, expectedValue: 3_000_000 });
  });

  it('flags BOTH EXPECTED_VALUE_VIOLATION and AGING_3M when both conditions hold', () => {
    // 売掛金子孫 (aging ON デフォルト) で 12 ヶ月同額 ¥100 → aging 検知。
    // さらに EXPECTED_VALUE=0 上書き → EXPECTED_VALUE_VIOLATION も発火。
    const bs = makeBsFixture({
      subaccountValues: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    });
    const initial = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    const leafKey = initial.rows.at(-1)!.rowKey;
    const { rows } = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: [],
      selectedMonth: 6,
      ruleOverrides: new Map([[leafKey, { expectedRule: 'EXPECTED_VALUE', expectedValue: 0 }]]),
    });
    const types = rows.at(-1)!.anomalies.map((a) => a.type).sort();
    expect(types).toEqual(['AGING_3M', 'EXPECTED_VALUE_VIOLATION']);
  });

  it('does not flag EXPECTED_VALUE_VIOLATION when balance matches expectedValue', () => {
    const bs = makeBsFixture({ subaccountValues: [100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 6 });
    const leafKey = rows.at(-1)!.rowKey;
    const re = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: [],
      selectedMonth: 6,
      ruleOverrides: new Map([[leafKey, { expectedRule: 'EXPECTED_VALUE', expectedValue: 0 }]]),
    });
    expect(re.rows.at(-1)!.anomalies).toEqual([]);
  });

  it('does not flag EXPECTED_VALUE_VIOLATION when expectedValue is null (未設定)', () => {
    // EXPECTED_VALUE ルールに切り替えても expectedValue 未指定なら何も発火しない
    const bs = makeBsFixture({ subaccountValues: [100, 100, 100, null, null, null, null, null, null, null, null, null] });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 6 });
    const leafKey = rows.at(-1)!.rowKey;
    const re = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: [],
      selectedMonth: 6,
      ruleOverrides: new Map([[leafKey, { expectedRule: 'EXPECTED_VALUE' }]]),
    });
    // EXPECTED_VALUE_VIOLATION は発火しない (expectedValue null のため)
    const types = re.rows.at(-1)!.anomalies.map((a) => a.type);
    expect(types).not.toContain('EXPECTED_VALUE_VIOLATION');
  });
});

// ============================================================
// anomaly detection: 3-month aging stagnation
// ============================================================

describe('buildChoshoPreviewRows / AGING_3M', () => {
  it('flags AGING_3M when last 3 months have identical non-zero balance', () => {
    // 4-7月で165,000固定、8月選択 → 6,7,8月が同額 = 滞留
    const bs = makeBsFixture({
      subaccountValues: [200000, 200000, 165000, 165000, 165000, null, null, null, null, null, null, null],
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 8 });
    const leaf = rows.at(-1)!;
    expect(leaf.agingCheckEnabled).toBe(true);
    expect(leaf.anomalies).toHaveLength(1);
    expect(leaf.anomalies[0].type).toBe('AGING_3M');
    expect(leaf.anomalies[0].detail).toMatchObject({
      sameAmount: 165000,
      monthsChecked: [6, 7, 8],
    });
  });

  it('does not flag AGING_3M when balance changed within last 3 months', () => {
    const bs = makeBsFixture({
      subaccountValues: [165000, 165000, 165000, 100000, null, null, null, null, null, null, null, null],
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 7 });
    expect(rows.at(-1)!.anomalies).toEqual([]);
  });

  it('does not flag AGING_3M when target month balance is 0', () => {
    const bs = makeBsFixture({
      subaccountValues: [0, 0, 0, null, null, null, null, null, null, null, null, null],
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 6 });
    expect(rows.at(-1)!.anomalies).toEqual([]);
  });

  it('does not flag AGING_3M when selectedMonth is too early to compare 3 months', () => {
    const bs = makeBsFixture({
      subaccountValues: [165000, 165000, null, null, null, null, null, null, null, null, null, null],
    });
    // 4月選択: monthOrder の先頭、比較材料なし
    const r4 = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 4 });
    expect(r4.rows.at(-1)!.anomalies).toEqual([]);
    // 5月選択: 前月までしかない、比較材料不足
    const r5 = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 5 });
    expect(r5.rows.at(-1)!.anomalies).toEqual([]);
  });

  it('does not flag AGING_3M for non-receivable account descendants (棚卸資産 等)', () => {
    const bs = makeBsFixture({
      accountName: '商品',
      subaccountValues: [165000, 165000, 165000, null, null, null, null, null, null, null, null, null],
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 6 });
    expect(rows.at(-1)!.anomalies).toEqual([]);
  });
});

// ============================================================
// outOfRange と anomaly が干渉しない
// ============================================================

describe('buildChoshoPreviewRows / outOfRange independence', () => {
  it('detects anomalies only for selectedMonth, not for past months that would qualify', () => {
    // 4-6月で同額 (滞留条件成立) だが、selectedMonth=10 にしてみると
    // 10月は欠落しているので滞留検知も走らない (= 干渉なし)
    const bs = makeBsFixture({
      subaccountValues: [165000, 165000, 165000, null, null, null, null, null, null, null, null, null],
    });
    const r6 = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 6 });
    expect(r6.rows.at(-1)!.anomalies).toHaveLength(1); // 6月選択なら滞留検知
    const r10 = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 10 });
    expect(r10.rows.at(-1)!.anomalies).toEqual([]); // 10月選択なら検知なし (10月残高欠落)
  });

  it('keeps monthlyBalances unchanged regardless of selectedMonth (anomaly does not mutate balances)', () => {
    const bs = makeBsFixture({ subaccountValues: Array(12).fill(100) });
    const r1 = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 6 });
    const r2 = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [], selectedMonth: 12 });
    expect(r1.rows.at(-1)!.monthlyBalances).toEqual(r2.rows.at(-1)!.monthlyBalances);
  });

  it('skips anomaly detection entirely when selectedMonth is undefined', () => {
    const bs = makeBsFixture({ subaccountValues: [165000, 165000, 165000, null, null, null, null, null, null, null, null, null] });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    expect(rows.every((r) => r.anomalies.length === 0)).toBe(true);
  });
});

// ============================================================
// 補助科目フィルタ (filterAccountKeywords 明示指定時)
//
// 仕様:
//   - BS全体 (大区分・中区分・全勘定) は残す
//   - 指定した勘定の補助科目だけ展開
//   - それ以外の勘定の補助科目・取引先は drop
//   - 親勘定の行自体は drop しない (BS残高は崩れない)
// ============================================================

describe('buildChoshoPreviewRows / sub-account filter', () => {
  it('keeps full BS hierarchy + sub-accounts of target account', () => {
    // fixture: 資産の部 → 流動資産 → 売掛金 → 株式会社サンプル
    const bs = makeBsFixture({
      accountName: '売掛金',
      subaccountName: '株式会社サンプル',
      subaccountValues: Array(12).fill(100),
    });
    const { rows } = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: ['売掛金'],
    });
    // 4階層すべて残る (大区分・中区分・親勘定・補助)
    expect(rows.map((r) => r.name)).toEqual([
      '資産の部',
      '流動資産',
      '売掛金',
      '株式会社サンプル',
    ]);
    expect(rows.map((r) => r.level)).toEqual([0, 1, 2, 3]);
  });

  it('keeps non-target account row but drops its sub-accounts', () => {
    // 商品 (棚卸資産) は対象外。親勘定行は残し、補助 "在庫1" は drop
    const bs = makeBsFixture({
      accountName: '商品',
      subaccountName: '在庫1',
      subaccountValues: Array(12).fill(100),
    });
    const { rows } = buildChoshoPreviewRows({
      bsTransition: bs,
      filterAccountKeywords: ['売掛金'],
    });
    // 大区分・中区分・親勘定 (商品) は残る、補助 (在庫1) は drop
    expect(rows.map((r) => r.name)).toEqual(['資産の部', '流動資産', '商品']);
    // 親勘定 商品 は補助が drop されたので hasChildren = false に再計算
    const shohin = rows.find((r) => r.name === '商品')!;
    expect(shohin.hasChildren).toBe(false);
  });

  it('keeps sub-accounts for explicitly filtered accounts', () => {
    for (const accountName of [
      '売掛金',
      '買掛金',
      '未収金',
      '未払金',
      '前受金',
      '前払金',
      '立替金',
    ]) {
      const bs = makeBsFixture({
        accountName,
        subaccountName: '取引先A',
        subaccountValues: Array(12).fill(0),
      });
      const { rows } = buildChoshoPreviewRows({
        bsTransition: bs,
        filterAccountKeywords: [accountName],
      });
      // 大区分・中区分・親勘定・補助 = 4 件
      expect(rows.map((r) => r.name)).toContain('取引先A');
      expect(rows).toHaveLength(4);
    }
  });

  it('returns full BS without dropping any row when filterAccountKeywords is empty', () => {
    const bs = makeBsFixture({
      accountName: '商品',
      subaccountName: '在庫1',
      subaccountValues: Array(12).fill(100),
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, filterAccountKeywords: [] });
    // filter 無しなら 商品 + 在庫1 も残る
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.name)).toContain('在庫1');
  });

  it('suppresses AGING_3M when recentActivityByPath shows debit/credit activity', () => {
    // 売掛金子孫で 3ヶ月同額 → 通常なら aging 検知。
    // 試算表上で debit/credit 発生があれば「動きあり」とみなして抑制。
    const bs = makeBsFixture({
      accountName: '売掛金',
      subaccountName: '株式会社サンプル',
      subaccountValues: [165000, 165000, 165000, null, null, null, null, null, null, null, null, null],
    });
    // 抑制なし → 検知あり
    const r1 = buildChoshoPreviewRows({ bsTransition: bs, selectedMonth: 6 });
    expect(r1.rows.find((r) => r.level === 3)!.anomalies.some((a) => a.type === 'AGING_3M')).toBe(true);
    // 抑制あり (debit > 0) → 検知なし
    const activity = new Map([
      ['資産の部/流動資産/売掛金/株式会社サンプル', { debit: 50000, credit: 0 }],
    ]);
    const r2 = buildChoshoPreviewRows({ bsTransition: bs, selectedMonth: 6, recentActivityByPath: activity });
    expect(r2.rows.find((r) => r.level === 3)!.anomalies.some((a) => a.type === 'AGING_3M')).toBe(false);
    // 抑制あり (credit > 0) → 同様に検知なし
    const activity2 = new Map([
      ['資産の部/流動資産/売掛金/株式会社サンプル', { debit: 0, credit: 30000 }],
    ]);
    const r3 = buildChoshoPreviewRows({ bsTransition: bs, selectedMonth: 6, recentActivityByPath: activity2 });
    expect(r3.rows.find((r) => r.level === 3)!.anomalies.some((a) => a.type === 'AGING_3M')).toBe(false);
  });

  it('does NOT suppress AGING_3M when activity entry is absent or both zero', () => {
    const bs = makeBsFixture({
      accountName: '売掛金',
      subaccountName: '株式会社サンプル',
      subaccountValues: [165000, 165000, 165000, null, null, null, null, null, null, null, null, null],
    });
    // path が map に無い (activity entry なし) → 検知あり
    const r1 = buildChoshoPreviewRows({
      bsTransition: bs,
      selectedMonth: 6,
      recentActivityByPath: new Map(),
    });
    expect(r1.rows.find((r) => r.level === 3)!.anomalies.some((a) => a.type === 'AGING_3M')).toBe(true);
    // entry はあるが debit=credit=0 → 検知あり (= activity なし)
    const r2 = buildChoshoPreviewRows({
      bsTransition: bs,
      selectedMonth: 6,
      recentActivityByPath: new Map([
        ['資産の部/流動資産/売掛金/株式会社サンプル', { debit: 0, credit: 0 }],
      ]),
    });
    expect(r2.rows.find((r) => r.level === 3)!.anomalies.some((a) => a.type === 'AGING_3M')).toBe(true);
  });

  it('preserves anomalies and rules through filter for target account sub-accounts', () => {
    const bs = makeBsFixture({
      accountName: '売掛金',
      subaccountValues: [200000, 200000, 165000, 165000, 165000, null, null, null, null, null, null, null],
    });
    const { rows } = buildChoshoPreviewRows({ bsTransition: bs, selectedMonth: 8 });
    const leaf = rows.find((r) => r.level === 3)!; // 取引先 (補助) 行
    expect(leaf).toBeDefined();
    expect(leaf.agingCheckEnabled).toBe(true);
    expect(leaf.anomalies).toHaveLength(1);
    expect(leaf.anomalies[0].type).toBe('AGING_3M');
  });
});
