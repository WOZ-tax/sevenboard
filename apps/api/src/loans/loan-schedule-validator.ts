/**
 * 借入返済予定 (draft) の決定論バリデータ。
 *
 * LLM が PDF から抽出した数値をそのまま信じないための検算層。純関数で実装し、
 * 網羅的なユニットテストで守る（loan-schedule-validator.spec.ts）。
 *
 * 円単位の整数を前提とするが、LLM 由来の微小な float ノイズを吸収するため
 * 金額比較は 0.5 円の許容で行う。
 */

export type LoanRepaymentMethodDraft =
  | 'EQUAL_INSTALLMENT'
  | 'EQUAL_PRINCIPAL'
  | 'BULLET'
  | 'OTHER';

export interface LoanDraftEntry {
  seq: number;
  dueDate: string; // YYYY-MM-DD
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  balanceAfter: number;
  interestRate?: number | null;
  isEstimated?: boolean;
}

export interface LoanDraftBasic {
  principal?: number | null;
  repaymentMethod?: LoanRepaymentMethodDraft | string | null;
  [key: string]: unknown;
}

export interface LoanDraft {
  loan: LoanDraftBasic;
  entries: LoanDraftEntry[];
}

export interface RowIssue {
  seq: number;
  code: 'ROW_SUM' | 'BALANCE_CHAIN' | 'DATE_ORDER';
  message: string;
}

export interface GlobalIssue {
  code: 'FINAL_BALANCE' | 'EMPTY';
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  rowIssues: RowIssue[];
  globalIssues: GlobalIssue[];
}

/** 金額の不一致判定（0.5 円の許容）。 */
function amountsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.5;
}

function yen(n: number): string {
  return `${Math.round(n).toLocaleString('ja-JP')}円`;
}

/**
 * draft を検算し ValidationReport を返す。
 *
 * - ROW_SUM: totalAmount === principalAmount + interestAmount（行ごと）
 * - BALANCE_CHAIN: 前行 balanceAfter - 当行 principalAmount === 当行 balanceAfter。
 *   初行は「balanceAfter + principalAmount <= principal」の緩い整合のみ
 *   （SMBC 実例のように予定表が期中から始まり初行残高 < principal のケースは正常）。
 * - FINAL_BALANCE: 最終行 balanceAfter === 0（完済予定 / 期日一括の全額償還）。
 * - DATE_ORDER: dueDate 昇順。
 */
export function validateLoanSchedule(draft: LoanDraft): ValidationReport {
  const rowIssues: RowIssue[] = [];
  const globalIssues: GlobalIssue[] = [];
  const entries = draft?.entries ?? [];

  if (entries.length === 0) {
    // 基本情報のみの手入力を許容するため、行が無いこと自体は失敗にしない。
    return { ok: true, rowIssues, globalIssues };
  }

  const principal =
    typeof draft.loan?.principal === 'number' && draft.loan.principal > 0
      ? draft.loan.principal
      : null;

  entries.forEach((entry, idx) => {
    // ROW_SUM
    if (amountsDiffer(entry.totalAmount, entry.principalAmount + entry.interestAmount)) {
      rowIssues.push({
        seq: entry.seq,
        code: 'ROW_SUM',
        message: `合計 ${yen(entry.totalAmount)} が元金 ${yen(entry.principalAmount)} + 利息 ${yen(entry.interestAmount)} = ${yen(entry.principalAmount + entry.interestAmount)} と一致しません`,
      });
    }

    // DATE_ORDER（前行より前の日付なら当行に付す）
    if (idx > 0) {
      const prev = entries[idx - 1];
      if (entry.dueDate < prev.dueDate) {
        rowIssues.push({
          seq: entry.seq,
          code: 'DATE_ORDER',
          message: `返済日 ${entry.dueDate} が前行 ${prev.dueDate} より前です`,
        });
      }
    }

    // BALANCE_CHAIN
    if (idx === 0) {
      // 初行は緩い整合のみ（期中開始で balanceAfter < principal は正常）
      if (principal != null && entry.balanceAfter + entry.principalAmount - principal > 0.5) {
        rowIssues.push({
          seq: entry.seq,
          code: 'BALANCE_CHAIN',
          message: `初行の返済後残高 ${yen(entry.balanceAfter)} + 元金 ${yen(entry.principalAmount)} が借入総額 ${yen(principal)} を超えています`,
        });
      }
    } else {
      const prev = entries[idx - 1];
      const expected = prev.balanceAfter - entry.principalAmount;
      if (amountsDiffer(entry.balanceAfter, expected)) {
        rowIssues.push({
          seq: entry.seq,
          code: 'BALANCE_CHAIN',
          message: `返済後残高 ${yen(entry.balanceAfter)} が 前行残高 ${yen(prev.balanceAfter)} - 元金 ${yen(entry.principalAmount)} = ${yen(expected)} と一致しません`,
        });
      }
    }
  });

  // FINAL_BALANCE: 返済予定表は満期まで写すため最終行残高は 0 のはず。
  const last = entries[entries.length - 1];
  if (amountsDiffer(last.balanceAfter, 0)) {
    globalIssues.push({
      code: 'FINAL_BALANCE',
      message: `最終行(${last.seq})の返済後残高が ${yen(last.balanceAfter)} で 0 になっていません。予定表の途中までしか読めていない可能性があります`,
    });
  }

  return {
    ok: rowIssues.length === 0 && globalIssues.length === 0,
    rowIssues,
    globalIssues,
  };
}
