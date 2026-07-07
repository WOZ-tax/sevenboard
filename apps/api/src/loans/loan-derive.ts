/**
 * 借入の「当月末残高」「当月返済」「今後12ヶ月利息」等をスケジュール行から導出する純関数群。
 * Prisma 依存を持たず、number/Date に変換済みのドメイン型で計算するのでユニットテストしやすい。
 */

export interface DerivableEntry {
  seq: number;
  dueDate: Date;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  balanceAfter: number;
  interestRate: number | null;
}

export interface DerivableLoan {
  principal: number;
  interestRate: number | null;
  status: 'ACTIVE' | 'REPAID';
  /** dueDate/seq 昇順で並んでいる前提 */
  entries: DerivableEntry[];
}

export interface MonthWindow {
  monthStart: Date;
  monthEnd: Date;
  /** 今後12ヶ月の終端（当月末の1年後の月末） */
  yearAheadEnd: Date;
}

/** 基準日を含む「当月」の月初・月末、および今後12ヶ月の終端を UTC で返す。 */
export function monthWindow(now: Date): MonthWindow {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return {
    monthStart: new Date(Date.UTC(y, m, 1)),
    monthEnd: new Date(Date.UTC(y, m + 1, 0)),
    yearAheadEnd: new Date(Date.UTC(y + 1, m + 1, 0)),
  };
}

function inRange(date: Date, from: Date, to: Date): boolean {
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/**
 * 当月末残高。dueDate <= 当月末 の最新行の balanceAfter。
 * 行が無ければ principal（未返済開始）。REPAID は 0。
 */
export function deriveCurrentBalance(loan: DerivableLoan, monthEnd: Date): number {
  if (loan.status === 'REPAID') return 0;
  const passed = loan.entries.filter((e) => e.dueDate.getTime() <= monthEnd.getTime());
  if (passed.length === 0) return loan.principal;
  return passed[passed.length - 1].balanceAfter;
}

/** 当月末より後の直近の返済（次回返済）。 */
export function deriveNextPayment(
  loan: DerivableLoan,
  monthEnd: Date,
): { dueDate: Date; amount: number } | null {
  const upcoming = loan.entries.find((e) => e.dueDate.getTime() > monthEnd.getTime());
  return upcoming ? { dueDate: upcoming.dueDate, amount: upcoming.totalAmount } : null;
}

/** 当月適用利率: 当月スケジュール行の interestRate ?? Loan.interestRate。 */
export function deriveCurrentRate(loan: DerivableLoan, w: MonthWindow): number | null {
  const currentRow = loan.entries.find((e) => inRange(e.dueDate, w.monthStart, w.monthEnd));
  return currentRow?.interestRate ?? loan.interestRate;
}

export interface DerivedTotals {
  outstandingBalance: number;
  monthlyPayment: number;
  monthlyPrincipal: number;
  monthlyInterest: number;
  annualInterestEstimate: number;
}

/**
 * ACTIVE 借入の集計。
 * - outstandingBalance: 各借入の当月末残高の合計
 * - monthlyPayment/Principal/Interest: 当月 dueDate の行の合計
 * - annualInterestEstimate: 今後12ヶ月（当月末より後〜1年後の月末）の利息合計
 */
export function deriveTotals(loans: DerivableLoan[], w: MonthWindow): DerivedTotals {
  let outstandingBalance = 0;
  let monthlyPayment = 0;
  let monthlyPrincipal = 0;
  let monthlyInterest = 0;
  let annualInterestEstimate = 0;

  for (const loan of loans) {
    if (loan.status !== 'ACTIVE') continue;
    outstandingBalance += deriveCurrentBalance(loan, w.monthEnd);
    for (const e of loan.entries) {
      if (inRange(e.dueDate, w.monthStart, w.monthEnd)) {
        monthlyPayment += e.totalAmount;
        monthlyPrincipal += e.principalAmount;
        monthlyInterest += e.interestAmount;
      }
      if (
        e.dueDate.getTime() > w.monthEnd.getTime() &&
        e.dueDate.getTime() <= w.yearAheadEnd.getTime()
      ) {
        annualInterestEstimate += e.interestAmount;
      }
    }
  }

  return {
    outstandingBalance,
    monthlyPayment,
    monthlyPrincipal,
    monthlyInterest,
    annualInterestEstimate,
  };
}
