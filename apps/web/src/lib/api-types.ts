// Shared API response + DTO types for apps/web.
// Covers endpoints outside the Tier-S MF/review scope already living in mf-types.ts.

export type CertaintyLevel = 'CONFIRMED' | 'PLANNED' | 'ESTIMATED';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  orgId: string | null;
}

export interface DepartmentMaster {
  id: string;
  orgId: string;
  name: string;
  parentId: string | null;
  type: string | null;
  displayOrder: number;
  createdAt: string;
  children?: DepartmentMaster[];
}

export interface AccountMaster {
  id: string;
  orgId: string;
  code: string;
  name: string;
  category: string;
  isVariableCost: boolean;
  displayOrder: number;
  externalId: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string | null;
  fiscalMonthEnd: number;
  industry: string | null;
  employeeCount: number | null;
  planType: string;
  aiOptOut: boolean;
  briefPushEnabled: boolean;
  briefPushHourJst: number;
  briefSlackWebhookUrl: string | null;
  /**
   * 原価計算を運用しているかのトグル。false（既定）= 売上総利益率は信用しない。
   * 中小企業で原価計算をしていないケースに合わせて UI / AI コメントを切替える。
   */
  usesCostAccounting: boolean;
  /** 公開 HP URL (AI CFO の事業理解に使う) */
  websiteUrl: string | null;
  /** 経営コンテキスト (自由記述、AI prompt に注入される) */
  businessContext: string | null;
  contextUpdatedAt: string | null;
  contextUpdatedById: string | null;
  /** kintone から最後に prefill した時刻 */
  kintoneSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  departments: DepartmentMaster[];
  accounts: AccountMaster[];
}

export interface BudgetVersion {
  id: string;
  fiscalYearId: string;
  name: string;
  scenarioType: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; name: string; email: string };
}

export interface FiscalYear {
  id: string;
  orgId: string;
  year: number;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
  budgetVersions: BudgetVersion[];
}

export interface BudgetEntry {
  id: string;
  budgetVersionId: string;
  accountId: string;
  departmentId: string | null;
  month: string;
  amount: number | string;
  createdAt: string;
  updatedAt: string;
  account: { id: string; code: string; name: string; category: string };
  department?: { id: string; name: string } | null;
}

export interface BudgetEntryInput {
  id?: string;
  accountId: string;
  departmentId?: string | null;
  month: string;
  amount: number;
}

export interface ActualEntry {
  id: string;
  orgId: string;
  accountId: string;
  departmentId: string | null;
  month: string;
  amount: number | string;
  source: string;
  syncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account: { id: string; code: string; name: string; category: string };
  department?: { id: string; name: string } | null;
}

export interface VarianceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  category: string;
  month: string;
  budgetAmount: number;
  actualAmount: number;
  varianceAmount: number;
  variancePercent: number;
  priorYearAmount: number | null;
}

export interface PlRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  category: string;
  months: Record<string, number>;
}

export interface VariableCostItem {
  name: string;
  amount: number;
}

export interface VariableCostReport {
  revenue: number;
  variableCosts: VariableCostItem[];
  fixedCosts: VariableCostItem[];
  totalVariableCost: number;
  totalFixedCost: number;
  marginalProfit: number;
  marginalProfitRatio: number;
  breakEvenPoint: number;
  safetyMargin: number;
}

export interface CashFlowCategory {
  id: string;
  orgId: string;
  name: string;
  direction: "IN" | "OUT";
  cfType: "OPERATING" | "INVESTING" | "FINANCING";
  isFixed: boolean;
  recurrenceRule: string | null;
  displayOrder: number;
  createdAt: string;
}

export interface CashFlowEntry {
  id: string;
  orgId: string;
  categoryId: string;
  entryDate: string;
  amount: number | string;
  isActual: boolean;
  tradePartner: string | null;
  description: string | null;
  createdAt: string;
  category: CashFlowCategory;
}

export interface RunwayStatus {
  snapshotDate: string;
  cashBalance: number;
  monthlyBurnRate: number;
  runwayMonths: number;
  alertLevel: "SAFE" | "CAUTION" | "WARNING" | "CRITICAL";
}

export type CalendarEventType = "deadline" | "meeting" | "task";
export type CalendarEventStatus = "upcoming" | "completed" | "cancelled";

export interface CalendarEvent {
  id: string;
  orgId: string;
  title: string;
  date: string;
  type: CalendarEventType;
  status: CalendarEventStatus;
  description: string | null;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateCalendarEventInput {
  title?: string;
  date?: string;
  type?: string;
  status?: string;
  description?: string;
  assigneeId?: string | null;
}

export interface Comment {
  id: string;
  reportId: string;
  cellRef: string | null;
  content: string;
  confidenceScore: number | null;
  reviewedBy: string | null;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
  report?: { id: string; name: string; type: string; config: unknown };
  reviewer?: { id: string; name: string; role: string } | null;
}

export interface AdvisorOrgListItem {
  id: string;
  name: string;
  code: string | null;
  industry: string | null;
  fiscalMonthEnd: number;
  planType: string;
  employeeCount: number | null;
  updatedAt: string;
}

export interface TalkScriptSection {
  title: string;
  material?: string;
  content: string;
  hearings?: string[];
  anticipatedResponses?: string[];
  proposals?: string[];
  qa?: Array<{ q: string; a: string }>;
}

export interface TalkScript {
  opening: string;
  sections: TalkScriptSection[];
  closing: string;
  nextActionsForAdvisor?: string[];
  nextActionsForExecutive?: string[];
  generatedAt: string;
}

export interface BudgetScenario {
  name: string;
  description: string;
  revenue: number;
  operatingProfit: number;
  assumptions: string[];
}

export interface FundingOption {
  type: string;
  amount: number;
  rationale: string;
  suggestedRate?: number;
  suggestedMonths?: number;
  repaymentType?: "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL" | "BULLET";
}

export interface FundingScenarioSeed {
  name: string;
  principal: number;
  monthlyPayment: number;
  totalInterest: number;
  termMonths: number;
  interestRate: number;
}

export interface FundingReport {
  executiveSummary: string;
  financialHighlights: string[];
  strengthsRisks: { strengths: string[]; risks: string[] };
  projections: string;
  suggestedOptions?: FundingOption[];
  echoedScenarios?: FundingScenarioSeed[];
  generatedAt: string;
}

export interface CreateAccountInput {
  code: string;
  name: string;
  category: string;
  isVariableCost?: boolean;
  displayOrder?: number;
}
export type UpdateAccountInput = Partial<CreateAccountInput>;

export interface CreateDepartmentInput {
  name: string;
  parentId?: string | null;
  type?: string;
  displayOrder?: number;
}
export type UpdateDepartmentInput = Partial<CreateDepartmentInput>;

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: string;
  orgId: string | null;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password?: string;
  role?: string;
}
export type UpdateUserInput = Partial<CreateUserInput>;

export interface MfAccountingPeriod {
  fiscal_year: number;
  start_date: string;
  end_date: string;
}

export interface MfOffice {
  name: string;
  code: string;
  type: string;
  accounting_periods: MfAccountingPeriod[];
}

export interface MfSubAccount {
  id: string;
  name: string;
}

export interface MfAccountItem {
  id: string;
  name: string;
  account_group?: string;
  category?: string;
  financial_statement_type?: string;
  available?: boolean;
  sub_accounts?: MfSubAccount[];
}

export interface MfAccountsResponse {
  accounts: MfAccountItem[];
}

export interface MfJournalBranch {
  debitor?: Record<string, unknown>;
  creditor?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MfJournal {
  branches: MfJournalBranch[];
  [key: string]: unknown;
}

export interface MfJournalsResponse {
  journals: MfJournal[];
}

export interface WhatIfSnapshot {
  revenue: number;
  operatingProfit: number;
  cashBalance: number;
  runway: number;
  payrollCost?: number;
  totalExpense?: number;
}

export interface WhatIfImpact {
  revenueChange: number;
  profitChange: number;
  cashChange: number;
  runwayChange: number;
  costChange?: number;
  hireChange?: number;
  investmentChange?: number;
}

export interface WhatIfResult {
  before: WhatIfSnapshot;
  after: WhatIfSnapshot;
  impact: WhatIfImpact;
}

export interface LoanSimulationInput {
  principal: number;
  interestRate: number;
  termMonths: number;
  graceMonths?: number;
  repaymentType: "EQUAL_INSTALLMENT" | "EQUAL_PRINCIPAL" | "BULLET";
}

export interface LoanScheduleEntry {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface LoanSimulationResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  schedule: LoanScheduleEntry[];
  runwayImpact?: {
    currentCash: number;
    monthlyPaymentBurden: number;
    adjustedRunwayMonths: number;
  };
}

export interface LinkedStatementsInput {
  revenueOverride?: number;
  cogsOverride?: number;
  sgaOverride?: number;
}

import type { CashflowRow, FinancialStatementRow } from "./mf-types";

export interface LinkedStatementsResult {
  pl: FinancialStatementRow[];
  bs: {
    assets: FinancialStatementRow[];
    liabilitiesEquity: FinancialStatementRow[];
  };
  cf: CashflowRow[];
  summary: {
    beforeProfit?: number;
    afterProfit?: number;
    profitImpact?: number;
    cashImpact: number;
    [key: string]: number | undefined;
  };
}

export interface SyncRunResult {
  message: string;
  accountsSynced: number;
  entriesUpserted: number;
  syncDurationMs: number;
}

export interface SyncStatusResult {
  lastSyncAt: string | null;
  status: string | null;
  accountsSynced: number;
  entriesUpserted: number;
}

export interface OnboardingStartResult {
  accountsMapped: number;
  accountsCreated: number;
  success: boolean;
  warnings: string[];
}

export interface OnboardingStatus {
  complete: boolean;
  steps?: Array<{ step: string; completed: boolean }>;
  [key: string]: unknown;
}

export interface ActionOwnerRef {
  id: string;
  name: string;
  email: string;
}

export interface ActionEvent {
  id: string;
  actionId: string;
  eventType: string;
  eventBy: string;
  eventAt: string;
  payload: Record<string, unknown>;
  user?: { id: string; name: string };
}

export interface Action {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  sourceScreen: string;
  sourceRef: Record<string, unknown>;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  ownerRole: "ADVISOR" | "EXECUTIVE" | "ACCOUNTING";
  ownerUserId: string | null;
  dueDate: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "ON_HOLD";
  linkedSlackThreadUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  owner?: ActionOwnerRef | null;
  creator?: ActionOwnerRef | null;
  events?: ActionEvent[];
}

export interface DataSyncLog {
  id: string;
  source: string;
  status: string;
  errorMessage: string | null;
  syncedAt: string;
  durationMs: number | null;
}

export interface BusinessEvent {
  id: string;
  eventDate: string;
  eventType: string;
  title: string;
  note: string | null;
  impactTags: string[];
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface UpdateBusinessEventInput {
  eventDate?: string;
  eventType?: string;
  title?: string;
  note?: string;
  impactTags?: string[];
}

export interface DeletedResult {
  deleted: true;
}
