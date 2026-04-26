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

export type RunwayAlertLevel = 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';
export type RunwayMode = 'worstCase' | 'netBurn' | 'actual';

export interface RunwayVariant {
  /** ランウェイ月数。算出不能時は999扱い（∞表現） */
  months: number;
  /** 計算根拠の月次値（worstCase=営業支出, netBurn=構造的損失, actual=BS純減+財務ネット） */
  basis: number;
  alertLevel: RunwayAlertLevel;
}

/** Net Burn → 実 Cash Burn への乖離内訳（直近3ヶ月平均、月次） */
export interface BurnComposition {
  /** Net Burn (営業バーン、税・CAPEX除外) */
  netBurn: number;
  /** 設備投資 (CAPEX) */
  capex: number;
  /** 法人税納付額 */
  taxPayment: number;
  /** Actual Burn (= BS現預金純減 + 財務ネット。財務ネットは流入プラス/流出マイナス) */
  actualBurn: number;
  /** 借入流入 + 増資 − 借入返済（プラス = 純調達） */
  financingNet: number;
  /** BS残高の純減（プラス = 残高減少） */
  realBalanceDrop: number;
  /** Net Burn と Actual Burn の差分（AR回収・前受金取崩し・税/CAPEX等） */
  otherWorkingCapital: number;
  /**
   * active 月の判定ソース。
   * - "settled": MonthlyClose の IN_REVIEW/CLOSED 月を使用（信頼度 HIGH）
   * - "heuristic": 月次締め未設定のためフォールバック（人件費・その他経費・仕入原価が動いた月、信頼度 MEDIUM）
   * - "none": active 月特定不可。数値は参考値（信頼度 LOW）
   */
  dataQuality: 'settled' | 'heuristic' | 'none';
  /** 計算に使った active 月（カレンダー月、1-12） */
  activeMonths: number[];
}

export interface CashflowDerived {
  months: string[];
  cashBalances: number[];
  rows: CashflowRow[];
  runway: {
    months: number;            // defaultMode の値（後方互換）
    cashBalance: number;
    monthlyBurnRate: number;   // defaultMode の basis（後方互換）
    alertLevel: RunwayAlertLevel;
    /** デフォルトのランウェイ計算方式 */
    defaultMode: RunwayMode;
    /** 3定義それぞれの計算結果 */
    variants: {
      worstCase: RunwayVariant;
      netBurn: RunwayVariant;
      actual: RunwayVariant;
    };
    /** Burn の構成内訳（Net Burn と実バーンの乖離分析用） */
    composition: BurnComposition;
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
  alertLevel: RunwayAlertLevel;
  /** ランウェイの3定義それぞれの結果（クライアント側でモード切替する場合に使う） */
  runwayVariants?: {
    defaultMode: RunwayMode;
    worstCase: RunwayVariant;
    netBurn: RunwayVariant;
    actual: RunwayVariant;
  };
  /** burn 計算の信頼度（active 月の判定ソース） */
  runwayDataQuality?: 'settled' | 'heuristic' | 'none';
  fiscalYear: number;
  period: { start: string; end: string };
  /**
   * 前年同期の主要指標（YoY 比較用）。
   * 取得失敗 or 前年データなしなら undefined。
   */
  prevYear?: {
    revenue: number;
    operatingProfit: number;
    ordinaryProfit: number;
    netIncome: number;
    cashBalance: number;
    fiscalYear: number;
  };
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
