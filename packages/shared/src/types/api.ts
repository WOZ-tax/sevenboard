// ============================================================
// Dashboard
// ============================================================

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

// ============================================================
// Financial Statements
// ============================================================

export interface FinancialStatementRow {
  category: string;
  current: number;
  prior: number;
  isTotal?: boolean;
  isHeader?: boolean;
}

// ============================================================
// Cashflow
// ============================================================

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
    alertLevel: string;
  };
}

// ============================================================
// KPI
// ============================================================

export interface PlTransitionPoint {
  month: string;
  revenue: number;
  operatingProfit: number;
}

// ============================================================
// Financial Indicators
// ============================================================

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

// ============================================================
// AI
// ============================================================

export interface AiSummaryResponse {
  summary: string;
  highlights: { type: 'positive' | 'negative' | 'neutral'; text: string }[];
  generatedAt: string;
}

export interface TalkScript {
  opening: string;
  sections: {
    title: string;
    content: string;
    qa?: { q: string; a: string }[];
  }[];
  closing: string;
  generatedAt: string;
}

export interface BudgetScenario {
  name: string;
  description: string;
  revenue: number;
  operatingProfit: number;
  assumptions: string[];
}

// ============================================================
// Alerts
// ============================================================

export interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  detectedAt: string;
}

// ============================================================
// Pagination
// ============================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ============================================================
// Auth
// ============================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  orgId: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// ============================================================
// Organization
// ============================================================

export interface OrgListItem {
  id: string;
  name: string;
  code: string | null;
  industry: string | null;
  fiscalMonthEnd: number;
  planType: string;
  employeeCount: number | null;
  updatedAt: string;
}
