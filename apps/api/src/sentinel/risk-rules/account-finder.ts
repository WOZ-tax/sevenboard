/**
 * MF 試算表 / 推移表の MfReportRow ツリーから、特定の勘定科目行を見つけるユーティリティ。
 *
 * 既存の MfTransformService にも findRow/findRowByPartial があるが private なので、
 * ルール側で再利用するためにここに公開ヘルパーとして実装する。
 *
 * 注意: MF の科目名は会社設定により揺れる ("売掛金" / "売上債権" など) ため、
 * ルールでは複数の候補名を順に試すパターンに統一する。
 */

import type { MfReportRow } from '../../mf/types/mf-api.types';

/**
 * name 完全一致で行を探す (深さ優先で再帰)。
 */
export function findRowExact(
  rows: MfReportRow[] | null | undefined,
  name: string,
): MfReportRow | null {
  if (!rows) return null;
  for (const row of rows) {
    if (row.name === name) return row;
    if (row.rows) {
      const found = findRowExact(row.rows, name);
      if (found) return found;
    }
  }
  return null;
}

/**
 * name に部分一致で行を探す。
 */
export function findRowPartial(
  rows: MfReportRow[] | null | undefined,
  partial: string,
): MfReportRow | null {
  if (!rows) return null;
  for (const row of rows) {
    if (row.name.includes(partial)) return row;
    if (row.rows) {
      const found = findRowPartial(row.rows, partial);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 候補名のリストを順に試す。最初に当たったものを返す。
 * 完全一致 → 部分一致 の順で評価する。
 */
export function findRowByCandidates(
  rows: MfReportRow[] | null | undefined,
  candidates: string[],
): MfReportRow | null {
  if (!rows) return null;
  for (const name of candidates) {
    const exact = findRowExact(rows, name);
    if (exact) return exact;
  }
  for (const name of candidates) {
    const partial = findRowPartial(rows, name);
    if (partial) return partial;
  }
  return null;
}

/**
 * 主要勘定の候補名一覧。会社により呼称が違うことがあるため複数列挙する。
 */
export const ACCOUNT_CANDIDATES = {
  /** 売掛金 / 売上債権 */
  accountsReceivable: ['売掛金', '売上債権'],
  /** 買掛金 / 仕入債務 */
  accountsPayable: ['買掛金', '仕入債務'],
  /** 未払金 (流動負債、固定資産購入や経費の未決済) */
  unpaidExpenses: ['未払金'],
  /** 未払費用 (経過勘定、月割で計上する費用の未払分) */
  accruedExpenses: ['未払費用'],
  /** 預り金 (各種源泉徴収・社保など総称) */
  withholdingPayables: ['預り金'],
  /** 仮払金 */
  advancePayments: ['仮払金'],
  /** 仮受金 */
  unidentifiedReceipts: ['仮受金'],
  /** 借入金 (短期 + 長期) */
  shortTermBorrowings: ['短期借入金'],
  longTermBorrowings: ['長期借入金'],
  /** 棚卸資産 */
  inventory: ['棚卸資産', '商品', '製品', '原材料'],
  /** 減価償却累計額 */
  depreciation: ['減価償却累計額'],
  /** 役員報酬 */
  executiveCompensation: ['役員報酬'],
  /** 給料手当 */
  salary: ['給料手当', '給与手当', '給料賃金'],
  /** 法定福利費 */
  socialInsurance: ['法定福利費'],
  /** 消耗品費 */
  consumables: ['消耗品費'],
  /** 仮払消費税 */
  consumptionTaxAdvance: ['仮払消費税'],
  /** 仮受消費税 */
  consumptionTaxReceived: ['仮受消費税'],
  /** 支払利息 */
  interestExpense: ['支払利息'],
} as const;

/** ACCOUNT_CANDIDATES の値を使う型ヘルパー */
export type AccountKind = keyof typeof ACCOUNT_CANDIDATES;

/**
 * 主要勘定を 1 件取得するショートカット。
 *
 * @example
 * const row = findAccountRow(bsTrial.rows, 'accountsReceivable')
 */
export function findAccountRow(
  rows: MfReportRow[] | null | undefined,
  kind: AccountKind,
): MfReportRow | null {
  return findRowByCandidates(rows, [...ACCOUNT_CANDIDATES[kind]]);
}
