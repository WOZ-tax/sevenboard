import type {
  LoanBasicInput,
  LoanDetail,
  LoanRateType,
  LoanRepaymentMethod,
  LoanScheduleRow,
  LoanStatus,
  LoanSummary,
} from "@/lib/api-types";

// === 表示ラベル ===

export const RATE_TYPE_LABELS: Record<LoanRateType, string> = {
  FIXED: "固定",
  VARIABLE: "変動",
};

export const REPAYMENT_METHOD_LABELS: Record<LoanRepaymentMethod, string> = {
  EQUAL_INSTALLMENT: "元利均等",
  EQUAL_PRINCIPAL: "元金均等",
  BULLET: "期限一括",
  OTHER: "その他",
};

export const STATUS_LABELS: Record<LoanStatus, string> = {
  ACTIVE: "返済中",
  REPAID: "完済",
};

export const RATE_TYPE_OPTIONS: LoanRateType[] = ["FIXED", "VARIABLE"];
export const REPAYMENT_METHOD_OPTIONS: LoanRepaymentMethod[] = [
  "EQUAL_INSTALLMENT",
  "EQUAL_PRINCIPAL",
  "BULLET",
  "OTHER",
];
export const STATUS_OPTIONS: LoanStatus[] = ["ACTIVE", "REPAID"];

// === 金額 / 数値フォーマット ===

/** 円表示。null/NaN は "—"。 */
export function yen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

/** 利率表示 (%)。 */
export function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value;
}

/** 空文字/不正値は null。NaN 耐性のための入力パーサ。 */
export function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

// === フォーム状態 (数値は文字列で保持し NaN 耐性を持たせる) ===

export interface LoanFormState {
  lenderName: string;
  branchName: string;
  loanType: string;
  principal: string;
  interestRate: string;
  rateType: LoanRateType;
  startDate: string;
  termMonths: string;
  maturityDate: string;
  repaymentMethod: LoanRepaymentMethod;
  status: LoanStatus;
  driveUrl: string;
}

export function emptyLoanForm(): LoanFormState {
  return {
    lenderName: "",
    branchName: "",
    loanType: "",
    principal: "",
    interestRate: "",
    rateType: "FIXED",
    startDate: "",
    termMonths: "",
    maturityDate: "",
    repaymentMethod: "EQUAL_INSTALLMENT",
    status: "ACTIVE",
    driveUrl: "",
  };
}

function str(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value;
  return "";
}

/**
 * 部分的な借入データ (API draft / 既存レコード) を欠損耐性ありでフォーム状態に変換する。
 * undefined フィールドがあってもクラッシュせず既定値で埋める。
 */
export function normalizeLoanForm(
  source: Partial<LoanBasicInput> | LoanSummary | LoanDetail | null | undefined,
): LoanFormState {
  const base = emptyLoanForm();
  if (!source || typeof source !== "object") return base;
  const s = source as Partial<LoanSummary & LoanBasicInput>;
  return {
    lenderName: str(s.lenderName),
    branchName: str(s.branchName),
    loanType: str(s.loanType),
    principal: str(s.principal),
    interestRate: str(s.interestRate),
    rateType: s.rateType === "VARIABLE" ? "VARIABLE" : "FIXED",
    startDate: str(s.startDate),
    termMonths: str(s.termMonths),
    maturityDate: str(s.maturityDate),
    repaymentMethod: isRepaymentMethod(s.repaymentMethod)
      ? s.repaymentMethod
      : "EQUAL_INSTALLMENT",
    status: s.status === "REPAID" ? "REPAID" : "ACTIVE",
    driveUrl: str(s.driveUrl),
  };
}

function isRepaymentMethod(v: unknown): v is LoanRepaymentMethod {
  return (
    v === "EQUAL_INSTALLMENT" ||
    v === "EQUAL_PRINCIPAL" ||
    v === "BULLET" ||
    v === "OTHER"
  );
}

/** フォーム状態 → API 送信用 basic input。数値は number へ (空は 0 / null)。 */
export function formStateToBasicInput(state: LoanFormState): LoanBasicInput {
  return {
    lenderName: state.lenderName.trim(),
    branchName: state.branchName.trim() || null,
    loanType: state.loanType.trim() || null,
    principal: toNumberOrNull(state.principal) ?? 0,
    interestRate: toNumberOrNull(state.interestRate) ?? 0,
    rateType: state.rateType,
    startDate: state.startDate,
    termMonths: toNumberOrNull(state.termMonths) ?? 0,
    maturityDate: state.maturityDate.trim() || null,
    repaymentMethod: state.repaymentMethod,
    status: state.status,
    driveUrl: state.driveUrl.trim() || null,
  };
}

/** 基本情報フォームの必須項目チェック。 */
export function validateLoanForm(state: LoanFormState): string[] {
  const errors: string[] = [];
  if (!state.lenderName.trim()) errors.push("借入先(銀行名)は必須です。");
  if ((toNumberOrNull(state.principal) ?? 0) <= 0)
    errors.push("借入総額を正しく入力してください。");
  if (toNumberOrNull(state.interestRate) == null)
    errors.push("利率を入力してください。");
  if (!state.startDate) errors.push("借入開始日は必須です。");
  if ((toNumberOrNull(state.termMonths) ?? 0) <= 0)
    errors.push("返済期間(月数)を正しく入力してください。");
  return errors;
}

// === スケジュール編集用フォーム行 ===

export interface ScheduleRowForm {
  key: string;
  id?: string;
  seq: string;
  dueDate: string;
  principalAmount: string;
  interestAmount: string;
  totalAmount: string;
  balanceAfter: string;
  interestRate: string;
  isEstimated: boolean;
}

let rowKeySeq = 0;
function nextRowKey(): string {
  rowKeySeq += 1;
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${rowKeySeq}`;
}

export function scheduleRowsToForm(
  rows: LoanScheduleRow[] | null | undefined,
): ScheduleRowForm[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    key: nextRowKey(),
    id: r?.id,
    seq: str(r?.seq),
    dueDate: str(r?.dueDate),
    principalAmount: str(r?.principalAmount),
    interestAmount: str(r?.interestAmount),
    totalAmount: str(r?.totalAmount),
    balanceAfter: str(r?.balanceAfter),
    interestRate: str(r?.interestRate),
    isEstimated: !!r?.isEstimated,
  }));
}

export function emptyScheduleRowForm(seq: number): ScheduleRowForm {
  return {
    key: nextRowKey(),
    seq: String(seq),
    dueDate: "",
    principalAmount: "",
    interestAmount: "",
    totalAmount: "",
    balanceAfter: "",
    interestRate: "",
    isEstimated: false,
  };
}

/** フォーム行 → API 送信用スケジュール。数値は number (空は 0)。 */
export function scheduleFormToRows(rows: ScheduleRowForm[]): LoanScheduleRow[] {
  return rows.map((r, idx) => {
    const rate = toNumberOrNull(r.interestRate);
    const entry: LoanScheduleRow = {
      seq: toNumberOrNull(r.seq) ?? idx + 1,
      dueDate: r.dueDate,
      principalAmount: toNumberOrNull(r.principalAmount) ?? 0,
      interestAmount: toNumberOrNull(r.interestAmount) ?? 0,
      totalAmount: toNumberOrNull(r.totalAmount) ?? 0,
      balanceAfter: toNumberOrNull(r.balanceAfter) ?? 0,
      isEstimated: r.isEstimated,
    };
    if (r.id) entry.id = r.id;
    if (rate != null) entry.interestRate = rate;
    return entry;
  });
}

// === 元利均等 / 元金均等 スケジュール自動生成 ===

/** dateStr(YYYY-MM-DD) に months ヶ月を加算。月末はクランプ。 */
export function addMonths(dateStr: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  const target = new Date(Date.UTC(year, monthIdx + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const useDay = Math.min(day, lastDay);
  const y = target.getUTCFullYear();
  const mm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(useDay).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

export interface GenerateScheduleParams {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  startDate: string;
  method: LoanRepaymentMethod;
  /** VARIABLE 等、将来利率が変わりうる場合は見直し待ちフラグを立てる。 */
  markEstimated?: boolean;
}

/**
 * 元利均等 / 元金均等 / 期限一括 のスケジュールをクライアント側で生成する。
 * 円未満は各回四捨五入し、端数は最終回の利息(元利均等)/元金(その他)で吸収して
 * 残高がちょうど 0 になるよう調整する。
 */
export function generateSchedule(
  params: GenerateScheduleParams,
): LoanScheduleRow[] {
  const { principal, annualRatePct, termMonths, startDate, method } = params;
  const estimated = !!params.markEstimated;
  if (
    !Number.isFinite(principal) ||
    principal <= 0 ||
    !Number.isFinite(termMonths) ||
    termMonths <= 0
  ) {
    return [];
  }
  const n = Math.floor(termMonths);
  const r = Number.isFinite(annualRatePct) ? annualRatePct / 100 / 12 : 0;
  const rows: LoanScheduleRow[] = [];
  let balance = principal;

  const push = (
    seq: number,
    principalAmount: number,
    interestAmount: number,
  ) => {
    const after = Math.max(0, Math.round(balance - principalAmount));
    rows.push({
      seq,
      dueDate: startDate ? addMonths(startDate, seq) : "",
      principalAmount: Math.round(principalAmount),
      interestAmount: Math.round(interestAmount),
      totalAmount: Math.round(principalAmount) + Math.round(interestAmount),
      balanceAfter: after,
      interestRate: annualRatePct,
      isEstimated: estimated,
    });
    balance = after;
  };

  if (method === "BULLET") {
    for (let i = 1; i <= n; i += 1) {
      const interest = balance * r;
      const isLast = i === n;
      push(i, isLast ? balance : 0, interest);
    }
    return rows;
  }

  if (method === "EQUAL_PRINCIPAL") {
    const basePrincipal = Math.round(principal / n);
    for (let i = 1; i <= n; i += 1) {
      const interest = balance * r;
      const principalAmount = i === n ? balance : basePrincipal;
      push(i, principalAmount, interest);
    }
    return rows;
  }

  // EQUAL_INSTALLMENT (元利均等) / OTHER も元利均等で近似
  let payment: number;
  if (r > 0) {
    const factor = Math.pow(1 + r, n);
    payment = Math.round((principal * r * factor) / (factor - 1));
  } else {
    payment = Math.round(principal / n);
  }
  for (let i = 1; i <= n; i += 1) {
    const interest = balance * r;
    let principalAmount = payment - interest;
    if (i === n) {
      // 最終回は残高を全額返済し端数を吸収
      principalAmount = balance;
    }
    push(i, principalAmount, interest);
  }
  return rows;
}
