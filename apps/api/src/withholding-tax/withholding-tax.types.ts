export type WithholdingTaxCategory =
  | 'SALARY'
  | 'RETIREMENT'
  | 'PROFESSIONAL_FEE'
  | 'JUDICIAL_SCRIVENER'
  | 'MANUSCRIPT_LECTURE'
  | 'OTHER_REWARD'
  | 'OTHER';

export const WITHHOLDING_TAX_CATEGORY_LABELS: Record<
  WithholdingTaxCategory,
  string
> = {
  SALARY: '給与・賞与',
  RETIREMENT: '退職手当',
  PROFESSIONAL_FEE: '士業報酬',
  JUDICIAL_SCRIVENER: '司法書士等報酬',
  MANUSCRIPT_LECTURE: '原稿料・講演料',
  OTHER_REWARD: 'その他報酬',
  OTHER: 'その他',
};

export interface WithholdingTaxJournalSide {
  accountName: string;
  subAccountName?: string | null;
  partnerName?: string | null;
  amount: number;
}

export interface WithholdingTaxJournalInput {
  id: string;
  number: string | null;
  date: string | null;
  memo: string | null;
  partnerName: string | null;
  debits: WithholdingTaxJournalSide[];
  credits: WithholdingTaxJournalSide[];
  /** MFの開始仕訳。通常の増減と重複計上しない。 */
  isOpening?: boolean;
}

export interface WithholdingTaxEntry {
  id: string;
  journalId: string;
  journalNumber: string | null;
  sourceDate: string | null;
  paymentDate: string | null;
  month: number | null;
  payeeName: string | null;
  memo: string | null;
  category: WithholdingTaxCategory;
  categoryLabel: string;
  paymentAmount: number;
  withholdingTax: number;
  paymentAmountEstimated: boolean;
  sourceAccountName: string | null;
  sourceSubAccountName: string | null;
  withholdingAccountName: string | null;
  withholdingSubAccountName: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  warnings: string[];
}

export interface WithholdingTaxSummaryRow {
  category: WithholdingTaxCategory;
  categoryLabel: string;
  count: number;
  payeeCount: number;
  paymentAmount: number;
  withholdingTax: number;
}

export interface WithholdingTaxMonthlySummaryRow {
  month: number;
  count: number;
  payeeCount: number;
  paymentAmount: number;
  withholdingTax: number;
}

export interface WithholdingTaxPaymentStatementRow {
  payeeName: string;
  category: WithholdingTaxCategory;
  categoryLabel: string;
  count: number;
  h1PaymentAmount: number;
  h1WithholdingTax: number;
  h2PaymentAmount: number;
  h2WithholdingTax: number;
  totalPaymentAmount: number;
  totalWithholdingTax: number;
}

export interface WithholdingTaxPreviewResult {
  fiscalYear: number;
  month: number | null;
  fyStartMonth: number;
  range: { startDate: string; endDate: string };
  generatedAt: string;
  sourceJournalCount: number;
  truncated: boolean;
  entries: WithholdingTaxEntry[];
  categorySummary: WithholdingTaxSummaryRow[];
  monthlySummary: WithholdingTaxMonthlySummaryRow[];
  paymentStatements: WithholdingTaxPaymentStatementRow[];
  totals: {
    count: number;
    payeeCount: number;
    paymentAmount: number;
    withholdingTax: number;
    warningCount: number;
  };
}

export type WithholdingTaxReviewStatus =
  | 'CLEARED'
  | 'BALANCE_REMAINING'
  | 'OVERPAID'
  | 'REVIEW_REQUIRED'
  | 'NOT_READY'
  | 'NO_DATA';

export interface WithholdingTaxReviewAmounts {
  aggregatedTax: number;
  adjustments: number;
  openingBalance: number | null;
  periodPayments: number;
  periodOtherMovements: number;
  /** 前期計上・当期支払の推定額。期首残高との二重加算を避ける。 */
  priorAccrualTax: number;
  /** 半期末までに未払計上された翌期支払予定分（推定）。 */
  deferredTax: number;
  periodEndBalance: number | null;
  /** 繰越・期中納付・未払計上等を調整した集計と半期末残高との差。 */
  balanceDifference: number | null;
  payments: number;
  nextPeriodTax: number;
  otherMovements: number;
  bookBalance: number | null;
  /** 確認日残高から翌期の新規徴収額と翌期支払予定分を除いた残高。 */
  remainingBalance: number | null;
}

export interface WithholdingTaxReviewAccount extends WithholdingTaxReviewAmounts {
  accountName: string;
  subAccountName: string | null;
}

export interface WithholdingTaxReviewDetail {
  journalId: string;
  journalNumber: string | null;
  date: string;
  memo: string | null;
  accountName: string;
  subAccountName: string | null;
  kind:
    | 'WITHHOLDING'
    | 'ADJUSTMENT'
    | 'PAYMENT'
    | 'NEXT_PERIOD'
    | 'DEFERRED'
    | 'OPENING'
    | 'UNCLASSIFIED';
  /** 貸方（預り金の増加）が正、借方（減少）が負。 */
  amount: number;
}

export interface WithholdingTaxReviewResult {
  year: number;
  half: 1 | 2;
  period: { startDate: string; endDate: string };
  nominalDueDate: string;
  checkDate: string;
  checkedThroughDate: string;
  generatedAt: string;
  status: WithholdingTaxReviewStatus;
  totals: WithholdingTaxReviewAmounts;
  accounts: WithholdingTaxReviewAccount[];
  details: WithholdingTaxReviewDetail[];
  issues: string[];
  coverage: {
    ranges: Array<{ startDate: string; endDate: string }>;
    complete: boolean;
    truncated: boolean;
  };
}
