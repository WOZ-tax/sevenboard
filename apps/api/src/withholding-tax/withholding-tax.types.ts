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
