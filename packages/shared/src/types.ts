// ダッシュボード用の型定義

export interface KpiCardData {
  title: string;
  value: number;
  unit: string;
  budgetVariance?: number; // 予算比（%）
  monthOverMonth?: number; // 前月比（%）
  trend: 'up' | 'down' | 'flat';
}

export interface VarianceRow {
  accountId: string;
  accountName: string;
  category: string;
  budget: number;
  actual: number;
  variance: number;
  varianceRate: number; // %
  children?: VarianceRow[];
  hasAiComment?: boolean;
  isAnomaly?: boolean;
}

export interface CashFlowRow {
  category: string;
  items: CashFlowItem[];
  months: Record<string, number>; // "2026-01": 1200000
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export interface CashFlowItem {
  name: string;
  months: Record<string, number>;
}

export interface RunwayData {
  cashBalance: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  alertLevel: 'SAFE' | 'CAUTION' | 'WARNING' | 'CRITICAL';
  trend: { month: string; balance: number; isActual: boolean }[];
}

export interface MonthlyRevenue {
  month: string;
  actual: number;
  budget: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CFO' | 'VIEWER' | 'ADVISOR';
  orgId: string | null;
  organizationName?: string;
}
