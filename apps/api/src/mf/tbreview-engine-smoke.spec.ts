/**
 * writer が出す推移表 CSV を tb-review の実パーサ (engine/core/transition.py) に
 * 食わせて、勘定科目行・補助科目行が期待どおり読めることを確認するスモークテスト。
 *
 * vendor 一式を持つマシンでのみ走る。無い環境（CI・他メンバー）では skip する。
 *   既定パス : <repo>/../../tb-review-web/vendor/tb-review  を含む候補群
 *   明示指定 : TB_REVIEW_VENDOR_DIR=<...>/vendor/tb-review
 * python が無い場合も skip する。
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

const COLUMNS = ['4', '5', '6', 'settlement_balance', 'total'];

const BS: MfTransition = {
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
    row('負債の部', 'liabilities', [-40, -40, -40, 0, -40], [
      row('流動負債', 'financial_statement_item', [-40, -40, -40, 0, -40], [
        row('買掛金', 'account', [-40, -40, -40, 0, -40]),
      ]),
    ]),
  ],
};

const PL: MfTransition = {
  ...BS,
  report_type: 'profit_and_loss',
  rows: [
    row('売上高', 'financial_statement_item', [1000, 1100, 1200, 0, 3300], [
      row('売上高', 'account', [1000, 1100, 1200, 0, 3300]),
    ]),
    row('売上総利益', 'financial_statement_item', [1000, 1100, 1200, 0, 3300]),
  ],
};

function findVendorDir(): string | null {
  const explicit = process.env.TB_REVIEW_VENDOR_DIR;
  const candidates = [
    ...(explicit ? [explicit] : []),
    path.resolve(__dirname, '../../../../../tb-review-web/vendor/tb-review'),
    path.join(
      os.homedir(),
      'Desktop/brain-team/projects/tb-review-web/vendor/tb-review',
    ),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'engine', 'core', 'transition.py'))) return c;
  }
  return null;
}

function findPython(vendorDir: string): string | null {
  for (const cmd of ['python', 'python3']) {
    try {
      execFileSync(cmd, ['-c', 'import sys'], { cwd: vendorDir, stdio: 'ignore' });
      return cmd;
    } catch {
      /* 次の候補へ */
    }
  }
  return null;
}

const vendorDir = findVendorDir();
const python = vendorDir ? findPython(vendorDir) : null;
const describeIfVendor = vendorDir && python ? describe : describe.skip;

describeIfVendor('tb-review 実パーサでの読み取り (vendor 有りのマシンのみ)', () => {
  let parsed: {
    bs: { months: string[]; has_total: boolean; has_closing: boolean; rows: any[] };
    pl: { months: string[]; has_total: boolean; has_closing: boolean; rows: any[] };
  };

  beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tbrev-smoke-'));
    const bsPath = path.join(dir, 'bs.csv');
    const plPath = path.join(dir, 'pl.csv');
    fs.writeFileSync(bsPath, buildTbReviewBsCsv(BS), 'utf-8');
    fs.writeFileSync(plPath, buildTbReviewPlCsv(PL), 'utf-8');

    const script = [
      'import json, sys',
      'from engine.core.transition import parse_transition',
      'def dump(p):',
      '    t = parse_transition(p)',
      '    return {"months": t.months, "has_total": t.has_total,',
      '            "has_closing": t.has_closing,',
      '            "rows": [r.as_dict() for r in t.rows]}',
      'print(json.dumps({"bs": dump(sys.argv[1]), "pl": dump(sys.argv[2])}, ensure_ascii=False))',
    ].join('\n');

    const stdout = execFileSync(python!, ['-c', script, bsPath, plPath], {
      cwd: vendorDir!,
      encoding: 'utf-8',
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    });
    parsed = JSON.parse(stdout);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('月列を認識し、BSに合計/決算整理列は無く PL には合計列がある', () => {
    expect(parsed.bs.months).toEqual(['4月', '5月', '6月']);
    expect(parsed.bs.has_total).toBe(false);
    expect(parsed.bs.has_closing).toBe(false);
    expect(parsed.pl.months).toEqual(['4月', '5月', '6月']);
    expect(parsed.pl.has_total).toBe(true);
    expect(parsed.pl.has_closing).toBe(false);
  });

  it('勘定科目行と補助科目行だけを行として読み、小計行は読み飛ばす', () => {
    expect(parsed.bs.rows.map((r) => [r.account, r.sub])).toEqual([
      ['普通預金', ''],
      ['普通預金', '架空銀行本店'],
      ['普通預金', '架空信金支店'],
      ['買掛金', ''],
    ]);
  });

  it('補助科目行は直前の勘定科目に帰属し、セクション見出しが引き継がれる', () => {
    const sub = parsed.bs.rows.find((r) => r.sub === '架空銀行本店');
    expect(sub.account).toBe('普通預金');
    expect(sub.section).toBe('現金及び預金');
    expect(sub.values).toEqual({ '4月': 60, '5月': 70, '6月': 80 });
  });

  it('マイナス残高がそのまま負値で読める', () => {
    const ap = parsed.bs.rows.find((r) => r.account === '買掛金');
    expect(ap.values).toEqual({ '4月': -40, '5月': -40, '6月': -40 });
    expect(ap.section).toBe('流動負債');
  });

  it('PL は勘定科目行のみ読まれ、合計列が total に入る', () => {
    expect(parsed.pl.rows.map((r) => [r.account, r.sub])).toEqual([['売上高', '']]);
    expect(parsed.pl.rows[0].total).toBe(3300);
    expect(parsed.pl.rows[0].values).toEqual({ '4月': 1000, '5月': 1100, '6月': 1200 });
  });
});
