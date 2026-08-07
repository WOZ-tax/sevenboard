/**
 * tb-review エンジン向け CSV writer（REVIEW_ENGINE=tbreview 専用）。
 *
 * legacy(analyze.py) 向けの writer とは別物。tb-review の推移表パーサ
 * (engine/core/transition.py) は MF クラウド会計の「推移表エクスポート」
 * そのものを前提にしているため、MF API のツリーからその形を再構成する。
 *
 * MF エクスポート実物（TBLab 202607 の CP932 原本で実測）の構造:
 *   ヘッダ  : ["", "勘定科目", "補助科目", "10月", ..., "6月"]  ← PL のみ末尾に "合計"
 *   セクション行 : ["資産の部"]                 1セルだけの行
 *   勘定科目行   : ["", "普通預金", "", 値...]   col0 空 / col1 に科目
 *   補助科目行   : ["", "", "○○銀行", 値...]    col0,col1 空 / col2 に補助
 *   小計行       : ["現金及び預金合計", "", "", 値...]  col0 に名前
 *
 * transition.py は col0 に名前がある小計行を（col1/col2 が空なので）読み飛ばす。
 * つまりエンジンが実際に消費するのは勘定科目行と補助科目行だけで、小計行は
 * MF エクスポートとの体裁互換のためだけに出力する。
 *
 * 決算整理列は出さない。MF エクスポート実物（期中）にも無く、かつ
 * engine/monthly/engine.py の _bs_rows_from_table は closing が非 None なら
 * 月次残高より優先するため、0 埋めの決算整理列を足すと BS 残高が全て 0 になる。
 */
import type { MfReportRow, MfTransition } from './types/mf-api.types';

/** MF 推移表の月列は "1".."12"。settlement_balance / total は別扱い。 */
const MONTH_COL_RE = /^\d+$/;

type Cell = string | number;

function csvLine(cells: Cell[]): string {
  return cells
    .map((c) => `"${String(c).replace(/"/g, '""')}"`)
    .join(',');
}

/** 月列のインデックスとラベル。columns の並び順（会計年度順）をそのまま保つ。 */
function monthColumns(transition: MfTransition): { index: number; label: string }[] {
  const columns = transition?.columns || [];
  const out: { index: number; label: string }[] = [];
  columns.forEach((c, i) => {
    if (MONTH_COL_RE.test(c)) out.push({ index: i, label: `${c}月` });
  });
  return out;
}

function valueAt(row: MfReportRow, index: number): number {
  const v = row?.values?.[index];
  return typeof v === 'number' ? v : 0;
}

function hasChildren(row: MfReportRow): boolean {
  return Array.isArray(row?.rows) && row.rows.length > 0;
}

/**
 * MF ツリー1ノードを CSV 行群へ展開する。
 *
 * - 子を持つ集計ノード（資産の部 / 流動資産 / 現金及び預金 …）
 *     → セクション行 → 子 → 小計行「<名前>合計」
 * - 子を持たない financial_statement_item（売上総利益 / 営業利益 …）
 *     → 小計行（col0 に名前）。エンジンからは不可視だが MF 実物と同じ位置に出す。
 * - account ノード → 勘定科目行。その子（補助科目）は補助科目行。
 */
function emitRow(
  row: MfReportRow,
  months: { index: number; label: string }[],
  totalIndex: number | null,
  out: string[],
  depth: number,
): void {
  const name = (row?.name || '').trim();
  const values: Cell[] = months.map((m) => valueAt(row, m.index));
  if (totalIndex !== null) values.push(valueAt(row, totalIndex));

  const isAccount = row?.type === 'account';

  if (isAccount) {
    // depth は account 階層内での深さ。0 = 勘定科目、1 以上 = 補助科目。
    if (depth === 0) {
      out.push(csvLine(['', name, '', ...values]));
    } else {
      out.push(csvLine(['', '', name, ...values]));
    }
    for (const child of row.rows || []) {
      emitRow(child, months, totalIndex, out, depth + 1);
    }
    return;
  }

  // 集計ノード（assets / liabilities / net_assets / financial_statement_item）
  if (!hasChildren(row)) {
    // 子のない集計行（売上総利益・営業利益・繰越利益剰余金 等）は col0 の単独行
    out.push(csvLine([name, '', '', ...values]));
    return;
  }

  out.push(csvLine([name])); // セクション見出し（1セル行）
  for (const child of row.rows || []) {
    emitRow(child, months, totalIndex, out, 0);
  }
  out.push(csvLine([`${name}合計`, '', '', ...values]));
}

function buildTransitionCsv(transition: MfTransition, withTotal: boolean): string {
  const months = monthColumns(transition);
  const columns = transition?.columns || [];
  const totalIdx = withTotal ? columns.indexOf('total') : -1;
  const totalIndex = totalIdx >= 0 ? totalIdx : null;

  const header: Cell[] = ['', '勘定科目', '補助科目', ...months.map((m) => m.label)];
  if (totalIndex !== null) header.push('合計');

  const lines: string[] = [csvLine(header)];
  for (const row of transition?.rows || []) {
    emitRow(row, months, totalIndex, lines, 0);
  }
  return lines.join('\n');
}

/**
 * 推移表BS。MF エクスポート実物に合計列は無いので出さない。
 * 補助科目行を出すには getTransitionBS(..., { withSubAccounts: true }) で取得すること。
 */
export function buildTbReviewBsCsv(transition: MfTransition): string {
  return buildTransitionCsv(transition, false);
}

/** 推移表PL。MF エクスポート実物どおり末尾に合計列を付ける（columns に total がある場合）。 */
export function buildTbReviewPlCsv(transition: MfTransition): string {
  return buildTransitionCsv(transition, true);
}
