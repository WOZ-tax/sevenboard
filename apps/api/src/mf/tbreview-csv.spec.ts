/**
 * tbreview モードの推移表 CSV writer のゴールデンテスト。
 *
 * 期待形は MF クラウド会計の推移表エクスポート実物（TBLab 202607 の CP932 原本
 * 680ファイルを実測。BS は "合計" 列なし 255件 / PL は "合計" 列あり 254件が
 * それぞれ支配的な形）。テストデータはすべて架空値。
 */
import { buildTbReviewBsCsv, buildTbReviewPlCsv } from './tbreview-csv';
import type { MfReportRow, MfTransition } from './types/mf-api.types';

function row(
  name: string,
  type: MfReportRow['type'],
  values: (number | null)[],
  children: MfReportRow[] | null = null,
): MfReportRow {
  return { name, type, values, rows: children };
}

/** columns は MF の実形式（月 → settlement_balance → total）。 */
const COLUMNS = ['4', '5', '6', 'settlement_balance', 'total'];

function bsFixture(): MfTransition {
  return {
    report_type: 'balance_sheet',
    columns: COLUMNS,
    fiscal_year: 2026,
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    start_month: 4,
    end_month: 6,
    rows: [
      row('資産の部', 'assets', [110, 120, 130, 0, 130], [
        row('流動資産', 'financial_statement_item', [110, 120, 130, 0, 130], [
          row('現金及び預金', 'financial_statement_item', [110, 120, 130, 0, 130], [
            row('普通預金', 'account', [110, 120, 130, 0, 130], [
              row('架空銀行本店', 'account', [60, 70, 80, 0, 80]),
              row('架空信金支店', 'account', [50, 50, 50, 0, 50]),
            ]),
          ]),
        ]),
      ]),
      row('負債の部', 'liabilities', [40, 40, 40, 0, 40], [
        row('流動負債', 'financial_statement_item', [40, 40, 40, 0, 40], [
          row('買掛金', 'account', [40, 40, 40, 0, 40]),
        ]),
      ]),
    ],
  };
}

function plFixture(): MfTransition {
  return {
    report_type: 'profit_and_loss',
    columns: COLUMNS,
    fiscal_year: 2026,
    start_date: '2026-04-01',
    end_date: '2026-06-30',
    start_month: 4,
    end_month: 6,
    rows: [
      row('売上高', 'financial_statement_item', [1000, 1100, 1200, 0, 3300], [
        row('売上高', 'account', [1000, 1100, 1200, 0, 3300]),
      ]),
      // 子を持たない集計行（MF 実物では col0 の単独行として出る）
      row('売上総利益', 'financial_statement_item', [1000, 1100, 1200, 0, 3300]),
    ],
  };
}

describe('buildTbReviewBsCsv', () => {
  it('MFエクスポート互換の行構造を出す（合計列なし・決算整理列なし）', () => {
    expect(buildTbReviewBsCsv(bsFixture())).toBe(
      [
        '"","勘定科目","補助科目","4月","5月","6月"',
        '"資産の部"',
        '"流動資産"',
        '"現金及び預金"',
        '"","普通預金","","110","120","130"',
        '"","","架空銀行本店","60","70","80"',
        '"","","架空信金支店","50","50","50"',
        '"現金及び預金合計","","","110","120","130"',
        '"流動資産合計","","","110","120","130"',
        '"資産の部合計","","","110","120","130"',
        '"負債の部"',
        '"流動負債"',
        '"","買掛金","","40","40","40"',
        '"流動負債合計","","","40","40","40"',
        '"負債の部合計","","","40","40","40"',
      ].join('\n'),
    );
  });

  it('決算整理列を出さない（transition.py の closing 優先で残高が0に潰れるため）', () => {
    const csv = buildTbReviewBsCsv(bsFixture());
    expect(csv).not.toContain('決算整理');
    expect(csv.split('\n')[0]).toBe('"","勘定科目","補助科目","4月","5月","6月"');
  });
});

describe('buildTbReviewPlCsv', () => {
  it('MFエクスポート互換の行構造を出す（末尾に合計列）', () => {
    expect(buildTbReviewPlCsv(plFixture())).toBe(
      [
        '"","勘定科目","補助科目","4月","5月","6月","合計"',
        '"売上高"',
        '"","売上高","","1000","1100","1200","3300"',
        '"売上高合計","","","1000","1100","1200","3300"',
        '"売上総利益","","","1000","1100","1200","3300"',
      ].join('\n'),
    );
  });

  it('columns に total が無ければ合計列を出さない', () => {
    const t = plFixture();
    t.columns = ['4', '5', '6'];
    t.rows = [row('売上総利益', 'financial_statement_item', [1, 2, 3])];
    expect(buildTbReviewPlCsv(t)).toBe(
      ['"","勘定科目","補助科目","4月","5月","6月"', '"売上総利益","","","1","2","3"'].join('\n'),
    );
  });
});

describe('欠損値の扱い', () => {
  it('null / 未定義の月値は 0 として出す（MF エクスポートは空セルを出さない）', () => {
    const t: MfTransition = {
      ...bsFixture(),
      rows: [row('資産の部', 'assets', [null, 5, null, 0, 5], [row('現金', 'account', [null, 5], null)])],
    };
    const lines = buildTbReviewBsCsv(t).split('\n');
    expect(lines[1]).toBe('"資産の部"');
    expect(lines[2]).toBe('"","現金","","0","5","0"');
    expect(lines[3]).toBe('"資産の部合計","","","0","5","0"');
  });

  it('rows が空/未定義でもヘッダだけ返す', () => {
    const t: MfTransition = { ...bsFixture(), rows: [] };
    expect(buildTbReviewBsCsv(t)).toBe('"","勘定科目","補助科目","4月","5月","6月"');
  });
});

describe('CSVエスケープ', () => {
  it('ダブルクォートを二重化する', () => {
    const t: MfTransition = {
      ...bsFixture(),
      rows: [row('資産の部', 'assets', [1, 1, 1, 0, 1], [row('株式会社"A"', 'account', [1, 1, 1])])],
    };
    expect(buildTbReviewBsCsv(t).split('\n')[2]).toBe('"","株式会社""A""","","1","1","1"');
  });
});
