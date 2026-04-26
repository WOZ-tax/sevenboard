export interface CashflowRow {
  category: string;
  values: (number | null)[];
  isTotal?: boolean;
  isHeader?: boolean;
  isDiff?: boolean;
}

export type RunwayAlertLevel = "SAFE" | "CAUTION" | "WARNING" | "CRITICAL";
export type RunwayMode = "worstCase" | "netBurn" | "actual";

export interface RunwayVariant {
  months: number;
  basis: number;
  alertLevel: RunwayAlertLevel;
}

export interface RunwayVariants {
  defaultMode: RunwayMode;
  worstCase: RunwayVariant;
  netBurn: RunwayVariant;
  actual: RunwayVariant;
}

export interface BurnComposition {
  netBurn: number;
  capex: number;
  taxPayment: number;
  actualBurn: number;
  financingNet: number;
  realBalanceDrop: number;
  otherWorkingCapital: number;
  /** active月の判定ソース */
  dataQuality: 'settled' | 'heuristic' | 'none';
  /** 計算に使った active 月（カレンダー月、1-12） */
  activeMonths: number[];
}

export interface CashflowRunway {
  months: number;
  cashBalance: number;
  monthlyBurnRate: number;
  alertLevel: RunwayAlertLevel;
  defaultMode?: RunwayMode;
  variants?: {
    worstCase: RunwayVariant;
    netBurn: RunwayVariant;
    actual: RunwayVariant;
  };
  composition?: BurnComposition;
}

export interface CashflowData {
  months: string[];
  cashBalances: number[];
  rows: CashflowRow[];
  runway: CashflowRunway;
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
  runwayVariants?: RunwayVariants;
  fiscalYear: number;
  period: { start: string; end: string };
  /** 前年同期の主要指標（YoY 比較用）。前年データが無いと undefined */
  prevYear?: {
    revenue: number;
    operatingProfit: number;
    ordinaryProfit: number;
    netIncome: number;
    cashBalance: number;
    fiscalYear: number;
  };
}

export interface FinancialStatementRow {
  category: string;
  current: number;
  prior?: number;
  isTotal?: boolean;
  isHeader?: boolean;
}

export type PLStatement = FinancialStatementRow[];

export interface BSStatement {
  assets: FinancialStatementRow[];
  liabilitiesEquity: FinancialStatementRow[];
}

export interface FinancialIndicators {
  currentRatio: number;
  equityRatio: number;
  debtEquityRatio: number;
  grossProfitMargin: number;
  operatingProfitMargin: number;
  roe: number;
  roa: number;
  totalAssetTurnover: number;
  receivablesTurnover: number;
}

export interface PlTransitionPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
  ordinaryProfit?: number;
  netIncome?: number;
}

export interface AiSummarySection {
  title: string;
  content: string;
}

export interface AiSummaryHighlight {
  type: string;
  text: string;
}

export interface AiMonthlyTrendPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
  actual: boolean;
}

export interface AiTargetMonthData {
  month: string;
  revenue: number;
  grossProfit: number;
  sga: number;
  operatingProfit: number;
  ordinaryProfit: number;
}

export interface AiSummaryResponse {
  summary: string;
  sections?: AiSummarySection[];
  highlights: AiSummaryHighlight[];
  targetMonth?: string;
  targetMonthData?: AiTargetMonthData;
  monthlyTrend?: AiMonthlyTrendPoint[];
  generatedAt: string;
}

export interface AlertItem {
  id: string;
  title: string;
  description?: string;
  message?: string;
  level?: "critical" | "warning" | "info";
  severity?: "critical" | "warning" | "info";
  category?: string;
  date?: string;
  createdAt?: string;
  detectedAt?: string;
}

export interface KintoneMonthlyProgress {
  recordId: string;
  clientName: string;
  clientId: string;
  fiscalYear: string;
  closingMonth: string;
  mfOfficeCode: string;
  inCharge: string[];
  reviewer: string[];
  preparer: string[];
  commitment: string;
  contractStatus: string;
  monthlyStatus: Record<number, string>;
  meetingDates: Record<number, string | null>;
}

export interface ReviewPlMonthlyRow {
  month: string;
  sales: number;
  sga: number;
  sga_ratio: number;
  operating: number;
  ordinary: number;
}

export interface ReviewPlSgaBreakdown {
  account: string;
  total: number;
}

export interface ReviewPlSection {
  all_ok?: boolean;
  interpretations?: string[];
  monthly_table?: ReviewPlMonthlyRow[];
  sga_breakdown?: ReviewPlSgaBreakdown[];
}

export interface ReviewBsRatio {
  month: string;
  current_ratio: number;
  equity_ratio: number;
}

export interface ReviewBsEntry {
  account: string;
  sub?: string;
  amount: number;
  month?: string;
  months?: number;
}

export interface ReviewBsSection {
  ratios?: ReviewBsRatio[];
  negatives?: ReviewBsEntry[];
  stagnant?: ReviewBsEntry[];
  neg_interpretations?: string[];
  stagnant_interpretations?: string[];
}

export interface ReviewTaxMismatch {
  date: string;
  no: string;
  account: string;
  actual_tax: string;
  expected_tax: string;
  memo: string;
}

export interface ReviewTaxInv80Entry {
  date: string;
  account: string;
  amount: number;
  tax_full: number;
  denied: number;
  memo: string;
}

export interface ReviewTaxSection {
  mismatches?: ReviewTaxMismatch[];
  inv_80_entries?: ReviewTaxInv80Entry[];
  inv_80_total_denied?: number;
  karibarai_est?: number;
}

export interface ReviewJournalDuplicate {
  date: string;
  nos?: string[];
  dr_acct: string;
  dr_amt: number;
  memo: string;
  count: number;
}

export interface ReviewJournalPersonal {
  date: string;
  dr_acct: string;
  dr_amt: number;
  memo: string;
}

export interface ReviewJournalBalance {
  debit_total: number;
  credit_total: number;
  balance: number;
}

export interface ReviewJournalSection {
  entry_count?: number;
  no_memo_count?: number;
  duplicates?: ReviewJournalDuplicate[];
  anomalies?: unknown[];
  personal?: ReviewJournalPersonal[];
  karibarai?: ReviewJournalBalance;
  yakuin_kashitsuke?: ReviewJournalBalance;
}

export interface ReviewCrossFinding {
  title: string;
  priority: "高" | "中" | "低";
  interpretation: string;
}

export interface ReviewCrossSection {
  findings?: ReviewCrossFinding[];
}

export interface ReviewAlert {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  detail?: string;
  description?: string;
  date?: string;
}

export interface ReviewSummary {
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalAlerts: number;
}

export interface ReviewResult {
  companyName: string;
  analyzedAt: string;
  alerts: ReviewAlert[];
  pl: ReviewPlSection;
  bs: ReviewBsSection;
  tax: ReviewTaxSection;
  journal: ReviewJournalSection;
  crossCheck: ReviewCrossSection;
  summary: ReviewSummary;
}
