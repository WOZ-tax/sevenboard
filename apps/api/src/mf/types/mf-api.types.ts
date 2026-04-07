// MF Cloud Accounting API response types

export interface MfOffice {
  name: string;
  code: string;
  type: string;
  accounting_periods: {
    fiscal_year: number;
    start_date: string;
    end_date: string;
  }[];
}

export interface MfReportRow {
  name: string;
  type:
    | 'account'
    | 'financial_statement_item'
    | 'assets'
    | 'liabilities'
    | 'net_assets'
    | 'liabilities_net_assets';
  values: (number | null)[];
  rows: MfReportRow[] | null;
}

// Trial Balance columns: [opening_balance, debit_amount, credit_amount, closing_balance, ratio]
export const TB_COL = {
  OPENING: 0,
  DEBIT: 1,
  CREDIT: 2,
  CLOSING: 3,
  RATIO: 4,
} as const;

export interface MfTrialBalance {
  report_type: string;
  columns: string[];
  rows: MfReportRow[];
  start_date: string;
  end_date: string;
}

// Transition columns: ["4","5","6","7","8","9","10","11","12","1","2","3","settlement_balance","total"]
export interface MfTransition {
  report_type: string;
  columns: string[];
  rows: MfReportRow[];
  fiscal_year: number;
  start_date: string;
  end_date: string;
  start_month: number;
  end_month: number;
}

export interface MfAccount {
  id: string;
  name: string;
  account_group: 'ASSET' | 'LIABILITY' | 'CAPITAL' | 'REVENUE' | 'EXPENSE';
  category: string;
  financial_statement_type: 'BALANCE_SHEET' | 'PROFIT_LOSS';
  available: boolean;
  sub_accounts: { id: string; name: string }[];
}

// --- SevenBoard transformed types ---

export interface FinancialStatementRow {
  category: string;
  current: number;
  prior: number;
  isTotal?: boolean;
  isHeader?: boolean;
}

export interface CashflowRow {
  category: string;
  values: (number | null)[];
  isTotal?: boolean;
  isHeader?: boolean;
  isDiff?: boolean;
}

export interface CashflowDerived {
  months: string[];
  cashBalances: number[];
  rows: CashflowRow[];
  runway: {
    months: number;
    cashBalance: number;
    monthlyBurnRate: number;
    alertLevel: 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';
  };
}

export interface DashboardSummary {
  revenue: number;
  operatingProfit: number;
  ordinaryProfit: number;
  netIncome: number;
  cashBalance: number;
  totalAssets: number;
  runway: number;
  alertLevel: 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';
  fiscalYear: number;
  period: { start: string; end: string };
}

export interface PlTransitionPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
}

export interface FinancialIndicators {
  // 安全性
  currentRatio: number;       // 流動比率 = 流動資産/流動負債 × 100
  equityRatio: number;        // 自己資本比率 = 純資産/総資産 × 100
  debtEquityRatio: number;    // 負債比率 = 負債/純資産 × 100
  // 収益性
  grossProfitMargin: number;  // 売上総利益率
  operatingProfitMargin: number; // 営業利益率
  roe: number;                // ROE = 純利益/純資産 × 100
  roa: number;                // ROA = 純利益/総資産 × 100
  // 効率性
  totalAssetTurnover: number; // 総資産回転率 = 売上/総資産
  receivablesTurnover: number; // 売上債権回転率 = 売上/売掛金
}
