import type {
  AiSummaryResponse,
  AlertItem,
  BSStatement,
  CashflowData,
  DashboardSummary,
  FinancialIndicators,
  KintoneMonthlyProgress,
  PLStatement,
  PlTransitionPoint,
  ReviewResult,
} from './mf-types';
import type {
  AccountMaster,
  Action,
  ActualEntry,
  AdvisorOrgListItem,
  AuthUser,
  BudgetEntry,
  BudgetEntryInput,
  BudgetScenario,
  BudgetVersion,
  BusinessEvent,
  CalendarEvent,
  CashFlowCategory,
  CashFlowEntry,
  CertaintyLevel,
  Comment as AiComment,
  CreateAccountInput,
  CreateDepartmentInput,
  CreateUserInput,
  DataSyncLog,
  DeletedResult,
  DepartmentMaster,
  FiscalYear,
  FundingReport,
  LinkedStatementsInput,
  LinkedStatementsResult,
  LoanSimulationInput,
  LoanSimulationResult,
  MfAccountsResponse,
  MfJournalsResponse,
  MfOffice,
  OnboardingStartResult,
  OnboardingStatus,
  Organization,
  PlRow,
  RunwayStatus,
  SyncRunResult,
  SyncStatusResult,
  TalkScript,
  UpdateAccountInput,
  UpdateBusinessEventInput,
  UpdateCalendarEventInput,
  UpdateDepartmentInput,
  UpdateUserInput,
  UserSummary,
  VariableCostReport,
  VarianceRow,
  WhatIfResult,
} from './api-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// CSRF トークン (Double Submit Cookie パターン)。
// 認証は httpOnly Cookie(sb_token)で行うが、本番は web(Vercel) と API(Cloud Run,
// *.run.app) がクロスオリジンのため、API ドメインに発行された sb_csrf Cookie を
// web の document.cookie から読めない。そこで login/switch-org のレスポンス body で
// 受け取った CSRF トークンを x-csrf-token ヘッダーに使う。
// メモリだけだとページリロードで消えて全 mutation が 403 になるため localStorage にも
// 永続化する(double-submit トークンは設計上クライアント JS から読める値であり、
// 「攻撃者のクロスサイトフォームはカスタムヘッダーに載せられない」という防御性質は
// 保存場所によらず変わらない)。
// Cookie 読み取りは同一サイト (ローカル開発 localhost:3000↔3001) 用フォールバック。
const CSRF_STORAGE_KEY = 'sb_csrf_token';
let csrfTokenInMemory: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfTokenInMemory = token;
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem(CSRF_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(CSRF_STORAGE_KEY);
  }
}

function getCsrfToken(): string | null {
  if (csrfTokenInMemory) return csrfTokenInMemory;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(CSRF_STORAGE_KEY);
    if (stored) {
      csrfTokenInMemory = stored;
      return stored;
    }
  }
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/sb_csrf=([^;]+)/);
  return match ? match[1] : null;
}

// CSRF 403 時の自動回復。/auth/refresh (CSRF 除外・cookie 認証・5回/分) で
// csrfToken を取り直す。cookie 一本化デプロイ以前からのセッション(body 経由の
// csrfToken を一度も受け取っていない)を再ログインなしで救済する経路。
// 同時多発 403 で refresh を連打しないよう single-flight にする。
let csrfHealInFlight: Promise<boolean> | null = null;

async function tryHealCsrfToken(): Promise<boolean> {
  if (!csrfHealInFlight) {
    csrfHealInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) return false;
        const body = (await res.json().catch(() => null)) as {
          csrfToken?: string;
        } | null;
        if (!body?.csrfToken) return false;
        setCsrfToken(body.csrfToken);
        return true;
      } catch {
        return false;
      } finally {
        csrfHealInFlight = null;
      }
    })();
  }
  return csrfHealInFlight;
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
  isCsrfRetry = false,
): Promise<T> {
  const csrfToken = getCsrfToken();
  const method = options?.method?.toUpperCase() || 'GET';
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // httpOnly Cookie(sb_token)で認証
    headers: {
      'Content-Type': 'application/json',
      ...(needsCsrf && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    // Cookie 期限切れ/無効 → ログイン画面にリダイレクト
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      // 旧実装が localStorage に残した 'token' の掃除 (マイグレーション。数リリース後に削除)
      localStorage.removeItem('token');
      setCsrfToken(null);
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message: string = body.message || `API error: ${res.status}`;
    // CSRF 不一致は保持トークンの欠落/陳腐化が原因のことが多い。
    // refresh で取り直して 1 回だけ再試行する(無限ループ防止に isCsrfRetry ガード)。
    if (
      res.status === 403 &&
      needsCsrf &&
      !isCsrfRetry &&
      message.includes('CSRF') &&
      (await tryHealCsrfToken())
    ) {
      return apiFetch<T>(path, options, true);
    }
    const err = new Error(message) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

export function isMfNotConnected(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 503;
}

export type MonthlyReviewApprovalStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export interface MonthlyReviewApprovalRecord {
  id: string;
  orgId: string;
  fiscalYear: number;
  month: number;
  status: MonthlyReviewApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TenantStaffRole =
  | 'firm_owner'
  | 'firm_admin'
  | 'firm_manager'
  | 'firm_advisor'
  | 'firm_viewer';

export interface TenantStaffRow {
  id: string;
  email: string;
  name: string;
  role: TenantStaffRole;
  status: 'invited' | 'active' | 'suspended' | 'revoked';
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { memberships: number };
}

export interface OrgAdvisor {
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer' | 'advisor';
  side: 'advisor' | 'client';
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}

// === Health Snapshot (会計レビュー ① 健康サマリー) ===
export interface HealthScoreBreakdownDetail {
  operatingProfitMargin: number;
  roe: number;
  roa: number;
  currentRatio: number;
  equityRatio: number;
  debtCoverage: number;
  totalAssetTurnover: number;
  receivablesTurnover: number;
}

export interface HealthScoreBreakdown {
  activity: number;
  safety: number;
  efficiency: number;
  detail: HealthScoreBreakdownDetail;
  /** 銀行格付けランク (S/A/B/C/D) */
  rank?: 'S' | 'A' | 'B' | 'C' | 'D';
  /** 倒産リスク即時減点が発動したフラグ */
  insolvencyFlags?: string[];
  /** 業種ベンチマーク使用の信頼度 */
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** 業種コード (実際に使われた、未設定なら null) */
  appliedIndustry?: string | null;
}

export interface HealthFinancialIndicators {
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

export interface HealthSnapshotItem {
  id: string;
  snapshotDate: string;
  score: number;
  prevScore: number | null;
  breakdown: HealthScoreBreakdown;
  indicators: HealthFinancialIndicators;
  aiQuestions: string[];
  createdAt: string;
}

// === Risk Findings (会計レビュー ② 要確認アイテム) ===
export type RiskLayer = 'L1_RULE' | 'L2_STATS' | 'L3_LLM';
export type RiskFindingStatus = 'OPEN' | 'CONFIRMED' | 'DISMISSED' | 'RESOLVED';

export interface RiskFindingItem {
  id: string;
  fiscalYear: number;
  month: number;
  layer: RiskLayer;
  ruleKey: string;
  scopeKey: string;
  title: string;
  body: string;
  riskScore: number;
  flags: string[];
  evidence: Record<string, unknown>;
  recommendedAction: string;
  status: RiskFindingStatus;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface RiskScanRunResult {
  layer: 'L1' | 'L3';
  ruleCount: number;
  findingCount: number;
  errors: { ruleKey: string; message: string }[];
}

// === Chosho (残高調書) ===
export type ChoshoExpectedRuleValue = 'NONE' | 'EXPECTED_VALUE' | 'AGING_3M';

/**
 * 1 行で発火した異常 1 件。選択月のみ判定。
 */
export interface ChoshoAnomaly {
  type: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M';
  /** 異常を検出したカレンダー月 (1-12)。selectedMonth と同じ。 */
  month: number;
  /** UI tooltip 用の人間可読メッセージ。 */
  message: string;
  detail?: Record<string, unknown>;
}

/**
 * 残高調書プレビューの 1 行。3 階層 (大区分→勘定→補助→取引先) を level + parentRowKey で表現。
 * Unit 2A/2B-1 時点では DB に保存されない揮発データ。
 */
export interface ChoshoPreviewRow {
  rowKey: string;
  parentRowKey: string | null;
  level: number;
  displayOrder: number;
  name: string;
  /** MF row.type ('assets' | 'liabilities' | 'financial_statement_item' | 'account' 等) */
  mfType: string;
  /** 月別残高 {1-12: 残高}。MF が値を返さなかった月はキー欠落。 */
  monthlyBalances: Record<number, number>;
  settlementBalance: number | null;
  total: number | null;
  hasChildren: boolean;
  /** 期待残高ルール。ヒューリスティック or override で決定。 */
  expectedRule: ChoshoExpectedRuleValue;
  /** EXPECTED_VALUE ルール時の期待残高。null = 未設定 / 他ルール。 */
  expectedValue: number | null;
  /** 滞留チェック有効フラグ。回転性勘定の子孫はデフォルト true。 */
  agingCheckEnabled: boolean;
  /** 検知された異常。空配列 = 異常なし。 */
  anomalies: ChoshoAnomaly[];
  /**
   * 「同額条件は満たしたが直近3ヶ月で debit/credit 発生があるため AGING_3M を抑制した」
   * 場合の活動量。null = 抑制発火なし。tooltip で「動きあり」表示用。
   */
  agingSuppressedBy: { debit: number; credit: number } | null;
}

export interface ChoshoPreviewResult {
  fiscalYear: number;
  /** クライアントが指定した「最新月」(1-12 のカレンダー月) */
  selectedMonth: number;
  /** 期首月 (1-12)。Organization.fiscalMonthEnd から API 側で導出。 */
  fyStartMonth: number;
  /** MF の column 順 (例: 期首4月なら [4,5,6,...,3])。 */
  monthOrder: number[];
  rows: ChoshoPreviewRow[];
}

export type ChoshoPreviewScope = 'bs' | 'pl';

// === Journal Review ===
export interface JournalReviewFlagItem {
  id: string;
  journalId: string;
  fiscalYear: number;
  month: number;
  flaggedAt: string;
  flaggedById: string | null;
  /** null = 未解決 (赤ハイライト)、ISO string = 解決済 */
  resolvedAt: string | null;
  resolvedById: string | null;
}

export interface JournalReviewFlagPage {
  items: JournalReviewFlagItem[];
  total: number;
  unresolvedTotal: number;
  resolvedTotal: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JournalReviewCommentItem {
  id: string;
  journalId: string;
  /** null = root コメント、UUID = 返信 */
  parentCommentId: string | null;
  body: string;
  urls: string[];
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalReviewSnapshotItem {
  id: string;
  number: string | null;
  issueDate: string | null;
  description: string | null;
  partnerName: string | null;
  debits: { accountName: string; subAccountName?: string; amount: number }[];
  credits: { accountName: string; subAccountName?: string; amount: number }[];
  totalAmount: number;
  fiscalYear: number;
  month: number;
  fetchedAt: string;
}

export type WithholdingTaxCategory =
  | 'SALARY'
  | 'RETIREMENT'
  | 'PROFESSIONAL_FEE'
  | 'JUDICIAL_SCRIVENER'
  | 'MANUSCRIPT_LECTURE'
  | 'OTHER_REWARD'
  | 'OTHER';

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

/** 保存済 chosho_versions の status (DB enum と一致)。 */
export type ChoshoVersionStatus = 'DRAFT' | 'APPROVED' | 'ARCHIVED';

/** 行コメント (1:N) */
export interface ChoshoRowComment {
  id: string;
  rowId: string;
  body: string;
  urls: string[];
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** セルコメント (Phase 2-3: 1:N スレッド対応)
 *
 * 旧設計: rowId で saved version の chosho_rows に紐付け (rowId 必須)
 * 新設計: (fiscalYear, month, rowKey) で識別 (rowId は旧データ後方互換用、新規は null)
 */
export interface ChoshoCellComment {
  id: string;
  /** 旧: chosho_rows.id 紐付け。 新形式は null。 */
  rowId: string | null;
  /** 新: 会計年度。 旧データは migration で best-effort 埋め (null の可能性あり) */
  fiscalYear: number | null;
  /** 新: preview builder の rowKey 文字列 */
  rowKey: string | null;
  month: number;
  /** NULL = root コメント、UUID = 返信 */
  parentCommentId: string | null;
  body: string;
  urls: string[];
  anomalyType: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M' | null;
  authorId: string | null;
  authorName: string | null;
  /** root の解決状態 */
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** memo タブ用: chosho cell コメント (saved rowId / preview rowKey 対応、rowName 込み) */
export interface ChoshoRecentCellComment extends ChoshoCellComment {
  versionId: string;
  rowName: string;
}

export interface ChoshoRecentCellCommentPage {
  items: ChoshoRecentCellComment[];
  total: number;
  unresolvedTotal: number;
  resolvedTotal: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * POST /chosho/versions または GET /chosho/versions/:id の戻り値。
 * preview と同じ row shape を持ち、UI は同じ描画経路で再利用できる。
 */
export interface ChoshoVersionDetail {
  versionId: string;
  orgId: string;
  fiscalYear: number;
  selectedMonth: number;
  status: ChoshoVersionStatus;
  title: string | null;
  createdAt: string;
  approvedAt: string | null;
  fyStartMonth: number;
  monthOrder: number[];
  rows: ChoshoPreviewRow[];
}

export const api = {
  // Auth
  login: async (email: string, password: string) => {
    const result = await apiFetch<{
      accessToken: string;
      user: AuthUser;
      csrfToken?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // クロスオリジン本番では sb_csrf Cookie を読めないため、body 経由の
    // トークンをメモリに保持する (API が返す場合。同一サイト開発では Cookie 側で動く)。
    if (result.csrfToken) setCsrfToken(result.csrfToken);
    return result;
  },

  // 認証 Cookie(sb_token/sb_csrf)をサーバ側でクリアする。
  logout: () =>
    apiFetch<{ message: string }>('/auth/logout', { method: 'POST' }),

  // Advisor organizations
  getAdvisorOrgs: () =>
    apiFetch<
      {
        id: string;
        name: string;
        code: string;
        industry: string;
        fiscalMonthEnd: number;
      }[]
    >('/auth/me/organizations'),

  /**
   * factory-hybrid と整合する membership API。
   * フロントの useCurrentOrg() context が消費する。
   */
  getMemberships: () =>
    apiFetch<
      Array<{
        tenantId: string;
        orgId: string;
        role: 'owner' | 'admin' | 'member' | 'viewer' | 'advisor';
        tenantRole?: string;
        orgRole?: string;
        side?: 'advisor' | 'client';
        orgName: string;
        orgCode: string | null;
        industry?: string | null;
        fiscalMonthEnd?: number | null;
      }>
    >('/auth/me/memberships'),

  // Switch org (ADVISOR)
  switchOrg: async (orgId: string) => {
    const result = await apiFetch<{
      accessToken: string;
      user: AuthUser;
      csrfToken?: string;
    }>('/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    });
    if (result.csrfToken) setCsrfToken(result.csrfToken);
    return result;
  },

  // Organizations
  getOrganization: (orgId: string) =>
    apiFetch<Organization>(`/organizations/${orgId}`),

  /**
   * 新規顧問先を作成。SEVENRICH スタッフ (owner / advisor) のみ。
   */
  createOrganization: (payload: {
    name: string;
    code?: string;
    managementNo?: string;
    fiscalMonthEnd: number;
    industry?: string;
    usesCostAccounting?: boolean;
    advisorUserIds?: string[];
  }) =>
    apiFetch<Organization>('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateOrganization: (
    orgId: string,
    payload: {
      name?: string;
      code?: string;
      managementNo?: string;
      fiscalMonthEnd?: number;
      industry?: string;
      planType?: 'STARTER' | 'GROWTH' | 'PRO';
      usesCostAccounting?: boolean;
      websiteUrl?: string | null;
      businessContext?: string | null;
    },
  ) =>
    apiFetch<Organization>(`/organizations/${orgId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteOrganization: (orgId: string) =>
    apiFetch<{ success: boolean }>(`/organizations/${orgId}`, {
      method: 'DELETE',
    }),

  // === Tenant Staff (会計事務所スタッフ) ===
  tenantStaff: {
    list: (tenantId: string) =>
      apiFetch<TenantStaffRow[]>(`/tenants/${tenantId}/staff`),

    create: (payload: {
      tenantId: string;
      email: string;
      name?: string;
      password?: string;
      role: TenantStaffRole;
    }) =>
      apiFetch<TenantStaffRow>(`/tenants/${payload.tenantId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          email: payload.email,
          name: payload.name,
          password: payload.password,
          role: payload.role,
        }),
      }),

    update: (
      tenantId: string,
      userId: string,
      payload: {
        name?: string;
        role?: TenantStaffRole;
        password?: string;
      },
    ) =>
      apiFetch<TenantStaffRow>(`/tenants/${tenantId}/staff/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    remove: (tenantId: string, userId: string) =>
      apiFetch<{ success: boolean }>(`/tenants/${tenantId}/staff/${userId}`, {
        method: 'DELETE',
      }),
  },

  // === Organization Advisors (担当アサイン) ===
  organizationAdvisors: {
    list: (orgId: string) =>
      apiFetch<OrgAdvisor[]>(`/organizations/${orgId}/advisors`),

    add: (orgId: string, userIds: string[]) =>
      apiFetch<OrgAdvisor[]>(`/organizations/${orgId}/advisors`, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      }),

    remove: (orgId: string, userId: string) =>
      apiFetch<{ success: boolean }>(
        `/organizations/${orgId}/advisors/${userId}`,
        { method: 'DELETE' },
      ),
  },

  getFiscalYears: (orgId: string) =>
    apiFetch<FiscalYear[]>(`/organizations/${orgId}/fiscal-years`),

  // Reports
  getVariance: (
    orgId: string,
    params: {
      budgetVersionId: string;
      startMonth?: string;
      endMonth?: string;
    },
  ) => {
    const query = new URLSearchParams({
      budgetVersionId: params.budgetVersionId,
      ...(params.startMonth ? { startMonth: params.startMonth } : {}),
      ...(params.endMonth ? { endMonth: params.endMonth } : {}),
    });
    return apiFetch<VarianceRow[]>(
      `/organizations/${orgId}/reports/variance?${query.toString()}`,
    );
  },

  getPL: (
    orgId: string,
    params?: {
      startMonth?: string;
      endMonth?: string;
    },
  ) => {
    const query = new URLSearchParams({
      ...(params?.startMonth ? { startMonth: params.startMonth } : {}),
      ...(params?.endMonth ? { endMonth: params.endMonth } : {}),
    });
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiFetch<PlRow[]>(`/organizations/${orgId}/reports/pl${suffix}`);
  },

  getVariableCost: (orgId: string, fiscalYear?: number, endMonth?: number) => {
    const qs = new URLSearchParams();
    if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
    if (endMonth) qs.set('endMonth', String(endMonth));
    const suffix = qs.toString() ? `?${qs}` : '';
    return apiFetch<VariableCostReport>(
      `/organizations/${orgId}/reports/variable-cost${suffix}`,
    );
  },

  // Budgets
  getBudgetVersions: (fyId: string) =>
    apiFetch<BudgetVersion[]>(`/fiscal-years/${fyId}/budget-versions`),

  getBudgetEntries: (bvId: string) =>
    apiFetch<BudgetEntry[]>(`/budget-versions/${bvId}/entries`),

  updateBudgetEntries: (bvId: string, entries: BudgetEntryInput[]) =>
    apiFetch<BudgetEntry[]>(`/budget-versions/${bvId}/entries`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),

  // Actuals
  getActuals: (orgId: string, month?: string) =>
    apiFetch<ActualEntry[]>(
      `/organizations/${orgId}/actuals${month ? `?month=${month}` : ''}`,
    ),

  // Cashflow
  getCashflowActual: (orgId: string) =>
    apiFetch<CashFlowEntry[]>(`/organizations/${orgId}/cashflow/actual`),

  getRunway: (orgId: string) =>
    apiFetch<RunwayStatus>(`/organizations/${orgId}/cashflow/runway`),

  getCashflowCategories: (orgId: string) =>
    apiFetch<CashFlowCategory[]>(`/organizations/${orgId}/cashflow/categories`),

  // === Calendar ===
  calendar: {
    getEvents: (orgId: string, year: number, month: number) =>
      apiFetch<CalendarEvent[]>(
        `/organizations/${orgId}/calendar?year=${year}&month=${month}`,
      ),
    createEvent: (
      orgId: string,
      data: {
        title: string;
        date: string;
        type?: string;
        description?: string;
      },
    ) =>
      apiFetch<CalendarEvent>(`/organizations/${orgId}/calendar`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateEvent: (
      orgId: string,
      eventId: string,
      data: UpdateCalendarEventInput,
    ) =>
      apiFetch<CalendarEvent>(`/organizations/${orgId}/calendar/${eventId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteEvent: (orgId: string, eventId: string) =>
      apiFetch<DeletedResult>(`/organizations/${orgId}/calendar/${eventId}`, {
        method: 'DELETE',
      }),
  },

  // === Comments ===
  comments: {
    getAll: (orgId: string, month?: string) =>
      apiFetch<AiComment[]>(
        `/organizations/${orgId}/comments${month ? `?month=${month}` : ''}`,
      ),
    create: (
      orgId: string,
      data: {
        content: string;
        month?: string;
        cellRef?: string;
        priority?: string;
      },
    ) =>
      apiFetch<AiComment>(`/organizations/${orgId}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateStatus: (
      orgId: string,
      commentId: string,
      data: { status: string; content?: string; rejectReason?: string },
    ) =>
      apiFetch<AiComment>(
        `/organizations/${orgId}/comments/${commentId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      ),
    remove: (orgId: string, commentId: string) =>
      apiFetch<DeletedResult>(`/organizations/${orgId}/comments/${commentId}`, {
        method: 'DELETE',
      }),
  },

  // === Advisor Portal ===
  advisor: {
    listOrgs: (params: {
      page?: number;
      limit?: number;
      search?: string;
      industry?: string;
      sortBy?: string;
      order?: string;
    }) => {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
      if (params.search) qs.set('search', params.search);
      if (params.industry) qs.set('industry', params.industry);
      if (params.sortBy) qs.set('sortBy', params.sortBy);
      if (params.order) qs.set('order', params.order);
      return apiFetch<{
        data: AdvisorOrgListItem[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/advisor/organizations?${qs}`);
    },
    getSummary: () =>
      apiFetch<{
        totalOrgs: number;
        activeOrgs: number;
        alertCount: number;
        pendingComments: number;
      }>('/advisor/summary'),
    getRecent: () => apiFetch<Organization[]>('/advisor/recent'),
  },

  // === AI ===
  ai: {
    getSummary: (
      orgId: string,
      fiscalYear?: number,
      month?: number,
      runwayMode?: 'worstCase' | 'netBurn' | 'actual',
      focus?: 'all' | 'revenue' | 'cost' | 'cashflow' | 'indicators',
      locabenOverride?: {
        industry?: string | null;
        values?: Record<string, number | null>;
        nonFinancial?: Record<string, Record<string, string>>;
      },
    ) => {
      // ロカベン定性情報を渡す必要があるので POST 経路。
      // 何も渡さない場合も同じ endpoint で動く (GET endpoint は互換維持で残置)。
      return apiFetch<AiSummaryResponse>(
        `/organizations/${orgId}/ai/summary`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fiscalYear,
            endMonth: month,
            runwayMode,
            focus,
            locabenOverride,
          }),
        },
      );
    },
    getTalkScript: (
      orgId: string,
      fiscalYear?: number,
      endMonth?: number,
      runwayMode?: 'worstCase' | 'netBurn' | 'actual',
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (endMonth) qs.set('endMonth', String(endMonth));
      if (runwayMode) qs.set('runwayMode', runwayMode);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<TalkScript>(
        `/organizations/${orgId}/ai/talk-script${suffix}`,
      );
    },
    getBudgetScenarios: (
      orgId: string,
      fiscalYear?: number,
      runwayMode?: 'worstCase' | 'netBurn' | 'actual',
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (runwayMode) qs.set('runwayMode', runwayMode);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<BudgetScenario[]>(
        `/organizations/${orgId}/ai/budget-scenarios${suffix}`,
      );
    },
    generateBudgetScenarios: (
      orgId: string,
      params: {
        fiscalYear?: number;
        baseGrowthRate?: number;
        upsideGrowthRate?: number;
        downsideGrowthRate?: number;
        newHires?: number;
        costReductionRate?: number;
        notes?: string;
        runwayMode?: 'worstCase' | 'netBurn' | 'actual';
      },
    ) =>
      apiFetch<BudgetScenario[]>(
        `/organizations/${orgId}/ai/budget-scenarios`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      ),
    /**
     * 財務指標ページの AI CFO 解説。
     * 安全性 / 収益性 / 効率性 の 3 カテゴリ別 commentary。
     */
    getIndicatorsCommentary: (
      orgId: string,
      fiscalYear?: number,
      endMonth?: number,
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (endMonth) qs.set('endMonth', String(endMonth));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        categories: Array<{
          name: '安全性' | '収益性' | '効率性';
          level: 'good' | 'caution' | 'warning';
          summary: string;
          advice: string;
        }>;
        overallSummary: string;
        inputs: {
          currentRatio: number;
          equityRatio: number;
          debtEquityRatio: number;
          grossProfitMargin: number;
          operatingProfitMargin: number;
          roe: number;
          roa: number;
          totalAssetTurnover: number;
          receivablesTurnover: number;
        };
        generatedAt: string;
        fallbackReason?: string;
      }>(`/organizations/${orgId}/ai/indicators-commentary${suffix}`);
    },

    getFundingReport: (
      orgId: string,
      fiscalYear?: number,
      endMonth?: number,
      runwayMode?: 'worstCase' | 'netBurn' | 'actual',
      locabenOverride?: {
        industry?: string | null;
        values?: Record<string, number | null>;
      },
    ) => {
      return apiFetch<FundingReport>(
        `/organizations/${orgId}/ai/funding-report`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            fiscalYear,
            endMonth,
            runwayMode,
            locabenOverride,
          }),
        },
      );
    },

    /** 融資シミュの結果を添えてレポート再生成 */
    getFundingReportWithScenarios: (
      orgId: string,
      params: {
        fiscalYear?: number;
        endMonth?: number;
        runwayMode?: 'worstCase' | 'netBurn' | 'actual';
        scenarios?: Array<{
          name: string;
          principal: number;
          monthlyPayment: number;
          totalInterest: number;
          termMonths: number;
          interestRate: number;
        }>;
        locabenOverride?: {
          industry?: string | null;
          values?: Record<string, number | null>;
        };
      },
    ) =>
      apiFetch<FundingReport>(`/organizations/${orgId}/ai/funding-report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
      }),
  },

  // === MF OAuth ===
  mfOAuth: {
    getAuthUrl: (orgId: string) =>
      apiFetch<{ authUrl: string }>(`/auth/mf/authorize?orgId=${orgId}`),
    refresh: (orgId: string) =>
      apiFetch<{ refreshed: true; expiresAt: string; lastRefreshedAt: string }>(
        `/auth/mf/refresh?orgId=${orgId}`,
        { method: 'POST' },
      ),
    getStatus: (orgId: string) =>
      apiFetch<{
        connected: boolean;
        expiresAt?: string | null;
        lastRefreshedAt?: string | null;
        lastSyncAt?: string | null;
        syncStatus?: string;
      }>(`/auth/mf/status?orgId=${orgId}`),
  },

  // === Integrations (データ連携) ===
  integrations: {
    getAll: (orgId: string) =>
      apiFetch<
        {
          provider: string;
          isConnected: boolean;
          lastSyncAt: string | null;
          syncStatus: string;
        }[]
      >(`/organizations/${orgId}/integrations`),
    connect: (orgId: string, provider: string) =>
      apiFetch<{ authUrl: string; provider: string }>(
        `/organizations/${orgId}/integrations/${provider}/connect`,
        { method: 'POST' },
      ),
    disconnect: (orgId: string, provider: string) =>
      apiFetch<{ provider: string; disconnected: boolean }>(
        `/organizations/${orgId}/integrations/${provider}/disconnect`,
        { method: 'POST' },
      ),
    sync: (orgId: string, provider: string) =>
      apiFetch<{ provider: string; syncStatus: string; lastSyncAt: string }>(
        `/organizations/${orgId}/integrations/${provider}/sync`,
        { method: 'POST' },
      ),
  },

  // === Masters (マスタ管理) ===
  masters: {
    getAccounts: (orgId: string) =>
      apiFetch<AccountMaster[]>(`/organizations/${orgId}/masters/accounts`),
    createAccount: (orgId: string, data: CreateAccountInput) =>
      apiFetch<AccountMaster>(`/organizations/${orgId}/masters/accounts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateAccount: (orgId: string, id: string, data: UpdateAccountInput) =>
      apiFetch<AccountMaster>(
        `/organizations/${orgId}/masters/accounts/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      ),
    deleteAccount: (orgId: string, id: string) =>
      apiFetch<AccountMaster>(
        `/organizations/${orgId}/masters/accounts/${id}`,
        {
          method: 'DELETE',
        },
      ),
    /** 変動損益分析画面の固定/変動分類を一括保存 */
    bulkUpdateVariableCostFlags: (
      orgId: string,
      updates: Array<{ name: string; isVariableCost: boolean }>,
    ) =>
      apiFetch<{ ok: boolean; count: number }>(
        `/organizations/${orgId}/masters/accounts/variable-cost-flags`,
        {
          method: 'PUT',
          body: JSON.stringify({ updates }),
        },
      ),
    getDepartments: (orgId: string) =>
      apiFetch<DepartmentMaster[]>(
        `/organizations/${orgId}/masters/departments`,
      ),
    createDepartment: (orgId: string, data: CreateDepartmentInput) =>
      apiFetch<DepartmentMaster>(
        `/organizations/${orgId}/masters/departments`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      ),
    updateDepartment: (
      orgId: string,
      id: string,
      data: UpdateDepartmentInput,
    ) =>
      apiFetch<DepartmentMaster>(
        `/organizations/${orgId}/masters/departments/${id}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        },
      ),
    deleteDepartment: (orgId: string, id: string) =>
      apiFetch<DepartmentMaster>(
        `/organizations/${orgId}/masters/departments/${id}`,
        {
          method: 'DELETE',
        },
      ),
    getUsers: (orgId: string) =>
      apiFetch<UserSummary[]>(`/organizations/${orgId}/masters/users`),
    createUser: (orgId: string, data: CreateUserInput) =>
      apiFetch<UserSummary>(`/organizations/${orgId}/masters/users`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateUser: (orgId: string, id: string, data: UpdateUserInput) =>
      apiFetch<UserSummary>(`/organizations/${orgId}/masters/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteUser: (orgId: string, id: string) =>
      apiFetch<UserSummary>(`/organizations/${orgId}/masters/users/${id}`, {
        method: 'DELETE',
      }),
  },

  // === MF (MoneyForward連携) ===
  mf: {
    getOffice: (orgId: string) =>
      apiFetch<MfOffice>(`/organizations/${orgId}/mf/office`),

    getDashboard: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<DashboardSummary>(
        `/organizations/${orgId}/mf/dashboard${suffix}`,
      );
    },

    getPL: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<PLStatement>(
        `/organizations/${orgId}/mf/financial-statements/pl${suffix}`,
      );
    },

    getBS: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<BSStatement>(
        `/organizations/${orgId}/mf/financial-statements/bs${suffix}`,
      );
    },

    getCashflow: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<CashflowData>(
        `/organizations/${orgId}/mf/cashflow${suffix}`,
      );
    },

    getPLTransition: (orgId: string, fiscalYear?: number) =>
      apiFetch<PlTransitionPoint[]>(
        `/organizations/${orgId}/mf/pl-transition${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getAccounts: (orgId: string) =>
      apiFetch<MfAccountsResponse>(`/organizations/${orgId}/mf/accounts`),

    getAccountTransition: (
      orgId: string,
      accountName: string,
      fiscalYear?: number,
    ) =>
      apiFetch<{ month: string; amount: number }[]>(
        `/organizations/${orgId}/mf/accounts/${encodeURIComponent(accountName)}/transition${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getJournals: (
      orgId: string,
      params?: { startDate?: string; endDate?: string; accountName?: string },
    ) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      if (params?.accountName) qs.set('accountName', params.accountName);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<MfJournalsResponse>(
        `/organizations/${orgId}/mf/journals${suffix}`,
      );
    },

    getFinancialIndicators: (
      orgId: string,
      fiscalYear?: number,
      month?: number,
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<FinancialIndicators>(
        `/organizations/${orgId}/mf/financial-indicators${suffix}`,
      );
    },
  },

  // === Year-End State (決算検討 + ロカベン + 汎用 KV の DB 永続化) ===
  yearEndState: {
    // 04 節税策チェック
    listTaxSaving: (orgId: string, fiscalYear: number) =>
      apiFetch<
        {
          id: string;
          fiscalYear: number;
          itemId: string;
          isDone: boolean;
          doneAt: string | null;
        }[]
      >(
        `/organizations/${orgId}/year-end-state/tax-saving?fiscalYear=${fiscalYear}`,
      ),
    upsertTaxSaving: (
      orgId: string,
      itemId: string,
      body: { fiscalYear: number; isDone: boolean },
    ) =>
      apiFetch<{ id: string }>(
        `/organizations/${orgId}/year-end-state/tax-saving/${encodeURIComponent(itemId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),

    // 06 BS整理
    listBsCleanup: (orgId: string, fiscalYear: number) =>
      apiFetch<
        {
          id: string;
          fiscalYear: number;
          templateKey: string | null;
          category: string;
          label: string;
          amount: string | number;
          hint: string;
          done: boolean;
          memo: string;
          updatedAt: string;
        }[]
      >(
        `/organizations/${orgId}/year-end-state/bs-cleanup?fiscalYear=${fiscalYear}`,
      ),
    createBsCleanup: (
      orgId: string,
      body: {
        fiscalYear: number;
        templateKey?: string | null;
        category: string;
        label: string;
        amount?: number;
        hint?: string;
        memo?: string;
        done?: boolean;
      },
    ) =>
      apiFetch<{ id: string }>(
        `/organizations/${orgId}/year-end-state/bs-cleanup`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    updateBsCleanup: (
      orgId: string,
      id: string,
      body: {
        done?: boolean;
        memo?: string;
        label?: string;
        amount?: number;
        hint?: string;
      },
    ) =>
      apiFetch<{ updated: number }>(
        `/organizations/${orgId}/year-end-state/bs-cleanup/${id}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    deleteBsCleanup: (orgId: string, id: string) =>
      apiFetch<{ deleted: number }>(
        `/organizations/${orgId}/year-end-state/bs-cleanup/${id}`,
        { method: 'DELETE' },
      ),

    // 07 スケジュール
    listSchedule: (orgId: string, fiscalYear: number) =>
      apiFetch<
        {
          id: string;
          fiscalYear: number;
          itemId: string;
          isDone: boolean;
          customDate: string | null;
        }[]
      >(
        `/organizations/${orgId}/year-end-state/schedule?fiscalYear=${fiscalYear}`,
      ),
    upsertSchedule: (
      orgId: string,
      itemId: string,
      body: { fiscalYear: number; isDone?: boolean; customDate?: string | null },
    ) =>
      apiFetch<{ id: string }>(
        `/organizations/${orgId}/year-end-state/schedule/${encodeURIComponent(itemId)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),
    /** 設定画面登録済の brief webhook にスケジュール送信
     *  text は query string 経由 (global ValidationPipe が body を strip するため) */
    notifySchedule: (orgId: string, text: string) =>
      apiFetch<{ ok: boolean; reason?: string }>(
        `/organizations/${orgId}/year-end-state/schedule/slack-notify?text=${encodeURIComponent(text)}`,
        { method: 'POST' },
      ),

    // locaben
    getLocaben: (orgId: string) =>
      apiFetch<{
        industryOverride: string | null;
        values: Record<string, number | null>;
        nonFinancial: Record<string, Record<string, string>>;
        manualKeys: Record<string, true>;
        updatedAt: string;
      } | null>(`/organizations/${orgId}/year-end-state/locaben`),
    upsertLocaben: (
      orgId: string,
      body: {
        industryOverride?: string | null;
        values?: Record<string, number | null>;
        nonFinancial?: Record<string, Record<string, string>>;
        manualKeys?: Record<string, true>;
      },
    ) =>
      apiFetch<{ id: string }>(
        `/organizations/${orgId}/year-end-state/locaben`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),

    // 汎用 feature KV
    getFeature: <T = unknown>(
      orgId: string,
      featureKey: string,
      scope: string = '',
    ) => {
      const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
      return apiFetch<{ value: T; updatedAt: string } | null>(
        `/organizations/${orgId}/year-end-state/feature/${encodeURIComponent(featureKey)}${qs}`,
      );
    },
    upsertFeature: <T = unknown>(
      orgId: string,
      featureKey: string,
      scope: string,
      value: T,
    ) => {
      const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
      return apiFetch<{ id: string }>(
        `/organizations/${orgId}/year-end-state/feature/${encodeURIComponent(featureKey)}${qs}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ value }),
        },
      );
    },
  },

  // === Locaben (ローカルベンチマーク) ===
  locaben: {
    getSourceData: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        revenueCurrent: number | null;
        revenuePrior: number | null;
        operatingProfit: number | null;
        depreciation: number | null;
        totalAssets: number | null;
        netAssets: number | null;
        receivables: number | null;
        inventory: number | null;
        payables: number | null;
        borrowings: number | null;
        cashAndDeposits: number | null;
        employeeCount: number | null;
      }>(`/organizations/${orgId}/locaben/source-data${suffix}`);
    },
  },

  // === Alerts (異常値検知) ===
  alerts: {
    getAll: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<AlertItem[]>(`/organizations/${orgId}/alerts${suffix}`);
    },
  },

  // === Simulation ===
  simulation: {
    whatIf: (
      orgId: string,
      dto: {
        revenueChangePercent?: number;
        costChangePercent?: number;
        newHires?: number;
        additionalInvestment?: number;
      },
    ) =>
      apiFetch<WhatIfResult>(`/organizations/${orgId}/simulation/what-if`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    loan: (orgId: string, params: LoanSimulationInput) =>
      apiFetch<LoanSimulationResult>(
        `/organizations/${orgId}/simulation/loan`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      ),
    linkedStatements: (orgId: string, params: LinkedStatementsInput) =>
      apiFetch<LinkedStatementsResult>(
        `/organizations/${orgId}/simulation/linked-statements`,
        {
          method: 'POST',
          body: JSON.stringify(params),
        },
      ),
  },

  // === Review (経理レビュー) ===
  review: {
    run: (orgId: string, fiscalYear?: number, month?: number) => {
      const params = new URLSearchParams();
      if (fiscalYear) params.set('fiscalYear', String(fiscalYear));
      if (month) params.set('month', String(month));
      const qs = params.toString();
      return apiFetch<ReviewResult>(
        `/organizations/${orgId}/mf/review${qs ? `?${qs}` : ''}`,
      );
    },
  },

  // === Monthly review approval (月次レビュー承認) ===
  monthlyReviewApproval: {
    list: (orgId: string, fiscalYear: number) =>
      apiFetch<{ records: MonthlyReviewApprovalRecord[] }>(
        `/organizations/${orgId}/monthly-review-approvals?fiscalYear=${fiscalYear}`,
      ),
    get: (orgId: string, fiscalYear: number, month: number) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord | null }>(
        `/organizations/${orgId}/monthly-review-approvals/current?fiscalYear=${fiscalYear}&month=${month}`,
      ),
    submit: (
      orgId: string,
      fiscalYear: number,
      month: number,
      comment?: string,
    ) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord }>(
        `/organizations/${orgId}/monthly-review-approvals/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ fiscalYear, month, comment }),
        },
      ),
    approve: (
      orgId: string,
      fiscalYear: number,
      month: number,
      comment?: string,
    ) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord }>(
        `/organizations/${orgId}/monthly-review-approvals/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ fiscalYear, month, comment }),
        },
      ),
    reject: (
      orgId: string,
      fiscalYear: number,
      month: number,
      comment?: string,
    ) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord }>(
        `/organizations/${orgId}/monthly-review-approvals/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ fiscalYear, month, comment }),
        },
      ),
    reset: (orgId: string, fiscalYear: number, month: number) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord | null }>(
        `/organizations/${orgId}/monthly-review-approvals/reset`,
        { method: 'POST', body: JSON.stringify({ fiscalYear, month }) },
      ),
  },

  // === Cashflow certainty (確度ルール) ===
  cashflowCertainty: {
    get: (orgId: string) =>
      apiFetch<{ rules: Record<string, CertaintyLevel> }>(
        `/organizations/${orgId}/cashflow-certainty`,
      ),
    update: (orgId: string, rules: Record<string, CertaintyLevel>) =>
      apiFetch<{ rules: Record<string, CertaintyLevel> }>(
        `/organizations/${orgId}/cashflow-certainty`,
        {
          method: 'PUT',
          body: JSON.stringify({ rules }),
        },
      ),
  },

  // === kintone (月次進捗) ===
  kintone: {
    getMonthlyProgress: (
      fiscalYear?: string,
      search?: string,
      assignee?: string,
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', fiscalYear);
      if (search) qs.set('search', search);
      if (assignee) qs.set('assignee', assignee);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<KintoneMonthlyProgress[]>(
        `/kintone/monthly-progress${suffix}`,
      );
    },
    getByMfCode: (mfCode: string, fiscalYear?: string) =>
      apiFetch<KintoneMonthlyProgress>(
        `/kintone/monthly-progress/by-mf/${mfCode}${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),
    updateStatus: (recordId: string, month: number, status: string) =>
      apiFetch<{ success: boolean }>(`/kintone/monthly-progress/${recordId}`, {
        method: 'PUT',
        body: JSON.stringify({ month, status }),
      }),
  },

  // === MonthlyClose（SevenBoard 内の月次締め: OPEN/IN_REVIEW/CLOSED） ===
  monthlyClose: {
    list: (orgId: string, fiscalYear: number) =>
      apiFetch<
        Array<{
          id: string;
          orgId: string;
          fiscalYear: number;
          month: number;
          status: 'OPEN' | 'IN_REVIEW' | 'CLOSED';
          changedAt: string;
          changedBy: string | null;
          note: string | null;
        }>
      >(`/organizations/${orgId}/monthly-closes?fiscalYear=${fiscalYear}`),
    getDefaultMonth: (orgId: string, fiscalYear: number) =>
      apiFetch<{ month: number | null }>(
        `/organizations/${orgId}/monthly-closes/default-month?fiscalYear=${fiscalYear}`,
      ),
    setStatus: (
      orgId: string,
      fiscalYear: number,
      month: number,
      status: 'OPEN' | 'IN_REVIEW' | 'CLOSED',
      note?: string,
    ) =>
      apiFetch<unknown>(
        `/organizations/${orgId}/monthly-closes/${fiscalYear}/${month}`,
        {
          method: 'PUT',
          body: JSON.stringify({ status, note }),
        },
      ),
  },

  // === Sync ===
  sync: {
    run: (orgId: string) =>
      apiFetch<SyncRunResult>(`/organizations/${orgId}/sync/run`, {
        method: 'POST',
      }),
    status: (orgId: string) =>
      apiFetch<SyncStatusResult>(`/organizations/${orgId}/sync/status`),
  },

  // === Kintone import (会社情報の prefill) ===
  kintoneImport: (orgId: string) =>
    apiFetch<{
      ok: boolean;
      message?: string;
      applied?: Record<string, string>;
      skipped?: string[];
      kintoneSyncedAt?: string;
      clientName?: string;
    }>(`/organizations/${orgId}/kintone-import`, { method: 'POST' }),

  // === Health Snapshot (会計レビュー ① 健康サマリー) ===
  healthSnapshot: {
    latest: (orgId: string) =>
      apiFetch<HealthSnapshotItem | null>(
        `/organizations/${orgId}/health-snapshot/latest`,
      ),
    byMonth: (orgId: string, fiscalYear: number, month: number) =>
      apiFetch<HealthSnapshotItem | null>(
        `/organizations/${orgId}/health-snapshot/by-month?fiscalYear=${fiscalYear}&month=${month}`,
      ),
    history: (orgId: string, months: number) =>
      apiFetch<HealthSnapshotItem[]>(
        `/organizations/${orgId}/health-snapshot/history?months=${months}`,
      ),
    refresh: (
      orgId: string,
      fiscalYear: number,
      month: number,
      generateAiQuestions = false,
    ) =>
      apiFetch<HealthSnapshotItem>(
        `/organizations/${orgId}/health-snapshot/refresh`,
        {
          method: 'POST',
          body: JSON.stringify({ fiscalYear, month, generateAiQuestions }),
        },
      ),
  },

  // === Risk Findings (会計レビュー ② 要確認アイテム) ===
  riskFindings: {
    list: (
      orgId: string,
      fiscalYear: number,
      month: number,
      status?: string,
    ) => {
      const params = new URLSearchParams({
        fiscalYear: String(fiscalYear),
        month: String(month),
      });
      if (status) params.set('status', status);
      return apiFetch<RiskFindingItem[]>(
        `/organizations/${orgId}/risk-findings?${params.toString()}`,
      );
    },
    updateStatus: (
      orgId: string,
      findingId: string,
      status: RiskFindingStatus,
    ) =>
      apiFetch<RiskFindingItem>(
        `/organizations/${orgId}/risk-findings/${findingId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      ),
    runScan: (
      orgId: string,
      fiscalYear: number,
      month: number,
      layer: 'L1' | 'L3',
    ) =>
      apiFetch<RiskScanRunResult>(
        `/organizations/${orgId}/risk-findings/scan`,
        {
          method: 'POST',
          body: JSON.stringify({ fiscalYear, month, layer }),
        },
      ),
  },

  // === Withholding Tax (源泉所得税集計) ===
  withholdingTax: {
    preview: (
      orgId: string,
      params: {
        fiscalYear?: number;
        month?: number;
        startDate?: string;
        endDate?: string;
      },
    ) => {
      const qs = new URLSearchParams();
      if (params.fiscalYear != null) {
        qs.set('fiscalYear', String(params.fiscalYear));
      }
      if (params.month != null) qs.set('month', String(params.month));
      if (params.startDate) qs.set('startDate', params.startDate);
      if (params.endDate) qs.set('endDate', params.endDate);
      return apiFetch<WithholdingTaxPreviewResult>(
        `/organizations/${orgId}/withholding-tax/preview?${qs.toString()}`,
      );
    },
  },

  // === Chosho (残高調書) ===
  chosho: {
    /**
     * 残高調書プレビュー — MF推移表 (BS) を 3 階層 row 配列に flatten したものを返す。
     * DB 書き込みなし。Phase 1 Unit 2A。
     */
    preview: (
      orgId: string,
      fiscalYear: number,
      month: number,
      scope: ChoshoPreviewScope = 'bs',
    ) => {
      const qs = new URLSearchParams({
        fiscalYear: String(fiscalYear),
        month: String(month),
      });
      if (scope !== 'bs') qs.set('scope', scope);
      return apiFetch<ChoshoPreviewResult>(
        `/organizations/${orgId}/chosho/preview?${qs.toString()}`,
      );
    },
    /**
     * preview の snapshot を DRAFT で保存。row 配列は client から送らず、
     * server 側で再生成される (越境改ざん防止)。Phase 1 Unit 2B-2。
     */
    createVersion: (
      orgId: string,
      input: { fiscalYear: number; month: number; title?: string },
    ) =>
      apiFetch<ChoshoVersionDetail>(`/organizations/${orgId}/chosho/versions`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    /** 保存済 version を読み取り。preview と同じ row shape。 */
    getVersion: (orgId: string, versionId: string) =>
      apiFetch<ChoshoVersionDetail>(
        `/organizations/${orgId}/chosho/versions/${versionId}`,
      ),
    /**
     * DRAFT → APPROVED 遷移。失敗時:
     *   - 404: version が org に属さない
     *   - 409: 既に APPROVED / 同期間に既存 APPROVED あり
     */
    approveVersion: (orgId: string, versionId: string) =>
      apiFetch<ChoshoVersionDetail>(
        `/organizations/${orgId}/chosho/versions/${versionId}/approve`,
        { method: 'POST' },
      ),

    /**
     * 行ルール更新 (期待残高 / 滞留チェック)。DRAFT のみ可能。
     * 成功で更新後の version 全体が返る (query cache をそのまま差し替え可能)。
     */
    updateRowRule: (
      orgId: string,
      versionId: string,
      rowId: string,
      input: {
        expectedRule: ChoshoExpectedRuleValue;
        expectedValue?: number | null;
        agingCheckEnabled: boolean;
      },
    ) =>
      apiFetch<ChoshoVersionDetail>(
        `/organizations/${orgId}/chosho/versions/${versionId}/rows/${rowId}/rule`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),

    // === 行コメント (1:N) ===
    listRowComments: (orgId: string, versionId: string) =>
      apiFetch<ChoshoRowComment[]>(
        `/organizations/${orgId}/chosho/versions/${versionId}/comments`,
      ),
    addRowComment: (
      orgId: string,
      versionId: string,
      rowId: string,
      input: { body: string; urls?: string[] },
    ) =>
      apiFetch<ChoshoRowComment>(
        `/organizations/${orgId}/chosho/versions/${versionId}/rows/${rowId}/comments`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    deleteRowComment: (orgId: string, versionId: string, commentId: string) =>
      apiFetch<void>(
        `/organizations/${orgId}/chosho/versions/${versionId}/comments/${commentId}`,
        { method: 'DELETE' },
      ),

    // === セルコメント (1:1) ===
    listCellComments: (orgId: string, versionId: string) =>
      apiFetch<ChoshoCellComment[]>(
        `/organizations/${orgId}/chosho/versions/${versionId}/cell-comments`,
      ),
    upsertCellComment: (
      orgId: string,
      versionId: string,
      rowId: string,
      month: number,
      input: {
        body: string;
        urls?: string[];
        anomalyType: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M' | null;
      },
    ) =>
      apiFetch<ChoshoCellComment>(
        `/organizations/${orgId}/chosho/versions/${versionId}/rows/${rowId}/cell-comments/${month}`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    deleteCellComment: (
      orgId: string,
      versionId: string,
      rowId: string,
      month: number,
    ) =>
      apiFetch<void>(
        `/organizations/${orgId}/chosho/versions/${versionId}/rows/${rowId}/cell-comments/${month}`,
        { method: 'DELETE' },
      ),

    // === セルコメント Phase 2-3 拡張 (複数 root + 返信 + 解決) ===
    /** 1セルに新規 root or 返信を追加 */
    addCellComment: (
      orgId: string,
      versionId: string,
      rowId: string,
      input: {
        month: number;
        body: string;
        urls?: string[];
        anomalyType: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M' | null;
        parentCommentId?: string;
      },
    ) =>
      apiFetch<ChoshoCellComment>(
        `/organizations/${orgId}/chosho/versions/${versionId}/rows/${rowId}/cell-comments`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    /** 解決 toggle (root のみ意味あり) */
    resolveCellComment: (orgId: string, commentId: string, resolved: boolean) =>
      apiFetch<ChoshoCellComment>(
        `/organizations/${orgId}/chosho/cell-comments/${commentId}/resolve`,
        { method: 'PUT', body: JSON.stringify({ resolved }) },
      ),
    /** commentId 指定の編集 (本人のみ、本文+URLを上書き) */
    updateCellCommentById: (
      orgId: string,
      commentId: string,
      input: { body: string; urls?: string[] },
    ) =>
      apiFetch<ChoshoCellComment>(
        `/organizations/${orgId}/chosho/cell-comments/${commentId}`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    /** commentId 指定の delete (本人のみ、返信はカスケード) */
    deleteCellCommentById: (orgId: string, commentId: string) =>
      apiFetch<void>(
        `/organizations/${orgId}/chosho/cell-comments/${commentId}`,
        { method: 'DELETE' },
      ),
    /** memo タブ用: 期間内最新 version の cell コメント全件。 month 省略時は会計年度全月。 */
    listRecentCellComments: (
      orgId: string,
      fiscalYear: number,
      month?: number,
    ) => {
      const qs = new URLSearchParams({ fiscalYear: String(fiscalYear) });
      if (month != null) qs.set('month', String(month));
      return apiFetch<ChoshoRecentCellComment[]>(
        `/organizations/${orgId}/chosho/recent-cell-comments?${qs.toString()}`,
      );
    },
    listRecentCellCommentGroups: (
      orgId: string,
      fiscalYear: number,
      input: { month?: number; page?: number; limit?: number } = {},
    ) => {
      const qs = new URLSearchParams({ fiscalYear: String(fiscalYear) });
      if (input.month != null) qs.set('month', String(input.month));
      if (input.page != null) qs.set('page', String(input.page));
      if (input.limit != null) qs.set('limit', String(input.limit));
      return apiFetch<ChoshoRecentCellCommentPage>(
        `/organizations/${orgId}/chosho/recent-cell-comment-groups?${qs.toString()}`,
      );
    },

    // === 新 API: preview/saved 共通の cell コメント (rowKey ベース) ===
    /** GET /preview-cell-comments?fiscalYear=&month=[&rowKey=] */
    listPreviewCellComments: (
      orgId: string,
      fiscalYear: number,
      month?: number,
      rowKey?: string,
    ) => {
      const qs = new URLSearchParams({
        fiscalYear: String(fiscalYear),
      });
      if (month != null) qs.set('month', String(month));
      if (rowKey) qs.set('rowKey', rowKey);
      return apiFetch<ChoshoCellComment[]>(
        `/organizations/${orgId}/chosho/preview-cell-comments?${qs.toString()}`,
      );
    },
    /** POST /preview-cell-comments — 任意セル (anomalyType=null) でも書ける */
    addPreviewCellComment: (
      orgId: string,
      input: {
        fiscalYear: number;
        month: number;
        rowKey: string;
        body: string;
        urls?: string[];
        anomalyType?: 'EXPECTED_VALUE_VIOLATION' | 'AGING_3M' | null;
        parentCommentId?: string;
      },
    ) =>
      apiFetch<ChoshoCellComment>(
        `/organizations/${orgId}/chosho/preview-cell-comments`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
  },

  // === Journal Review (仕訳レビュー: 要確認フラグ + 解決管理) ===
  journalReview: {
    listFlags: (orgId: string, fiscalYear: number, month?: number) => {
      const qs = new URLSearchParams({ fiscalYear: String(fiscalYear) });
      if (month != null) qs.set('month', String(month));
      return apiFetch<JournalReviewFlagItem[]>(
        `/organizations/${orgId}/journal-flags?${qs.toString()}`,
      );
    },
    listFlagsPage: (
      orgId: string,
      fiscalYear: number,
      input: { month?: number; page?: number; limit?: number } = {},
    ) => {
      const qs = new URLSearchParams({ fiscalYear: String(fiscalYear) });
      if (input.month != null) qs.set('month', String(input.month));
      if (input.page != null) qs.set('page', String(input.page));
      if (input.limit != null) qs.set('limit', String(input.limit));
      return apiFetch<JournalReviewFlagPage>(
        `/organizations/${orgId}/journal-review/memo-flags?${qs.toString()}`,
      );
    },
    upsertFlag: (
      orgId: string,
      journalId: string,
      input: { resolved: boolean; fiscalYear?: number; month?: number },
    ) =>
      apiFetch<JournalReviewFlagItem>(
        `/organizations/${orgId}/journal-flags/${encodeURIComponent(journalId)}`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    deleteFlag: (orgId: string, journalId: string) =>
      apiFetch<void>(
        `/organizations/${orgId}/journal-flags/${encodeURIComponent(journalId)}`,
        { method: 'DELETE' },
      ),
    listComments: (orgId: string, journalIds?: string[]) => {
      const qs =
        journalIds && journalIds.length > 0
          ? `?journalIds=${encodeURIComponent(journalIds.join(','))}`
          : '';
      return apiFetch<JournalReviewCommentItem[]>(
        `/organizations/${orgId}/journal-comments${qs}`,
      );
    },
    listSnapshots: (
      orgId: string,
      input: {
        fiscalYear: number;
        month?: number;
        throughMonth?: number;
        journalIds?: string[];
      },
    ) => {
      const qs = new URLSearchParams({ fiscalYear: String(input.fiscalYear) });
      if (input.month != null) qs.set('month', String(input.month));
      if (input.throughMonth != null)
        qs.set('throughMonth', String(input.throughMonth));
      if (input.journalIds && input.journalIds.length > 0)
        qs.set('journalIds', input.journalIds.join(','));
      return apiFetch<JournalReviewSnapshotItem[]>(
        `/organizations/${orgId}/journal-review/snapshots?${qs.toString()}`,
      );
    },
    /** 指定月 (省略時は fy 全月) の snapshot cache を破棄して MF から再取得させる。 */
    refreshSnapshots: (
      orgId: string,
      input: { fiscalYear: number; month?: number },
    ) =>
      apiFetch<{ refreshedMonths: number[] }>(
        `/organizations/${orgId}/journal-review/snapshots/refresh`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    addComment: (
      orgId: string,
      input: {
        journalId: string;
        body: string;
        urls?: string[];
        parentCommentId?: string;
      },
    ) =>
      apiFetch<JournalReviewCommentItem>(
        `/organizations/${orgId}/journal-comments`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    /** 本人のみ編集可。 本文+URLを上書き、 author/createdAt は不変。 */
    updateComment: (
      orgId: string,
      commentId: string,
      input: { body: string; urls?: string[] },
    ) =>
      apiFetch<JournalReviewCommentItem>(
        `/organizations/${orgId}/journal-comments/${commentId}`,
        { method: 'PUT', body: JSON.stringify(input) },
      ),
    deleteComment: (orgId: string, commentId: string) =>
      apiFetch<void>(`/organizations/${orgId}/journal-comments/${commentId}`, {
        method: 'DELETE',
      }),
  },

  // === Onboarding ===
  onboarding: {
    start: (orgId: string) =>
      apiFetch<OnboardingStartResult>(
        `/organizations/${orgId}/onboarding/start`,
        {
          method: 'POST',
        },
      ),
    status: (orgId: string) =>
      apiFetch<OnboardingStatus>(`/organizations/${orgId}/onboarding/status`),
  },

  // === Actions (§5 共通オブジェクト) ===
  actions: {
    list: (
      orgId: string,
      params?: {
        status?: string;
        ownerUserId?: string;
        sourceScreen?: string;
        overdueOnly?: boolean;
      },
    ) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set('status', params.status);
      if (params?.ownerUserId) qs.set('ownerUserId', params.ownerUserId);
      if (params?.sourceScreen) qs.set('sourceScreen', params.sourceScreen);
      if (params?.overdueOnly) qs.set('overdueOnly', 'true');
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<Action[]>(`/organizations/${orgId}/actions${suffix}`);
    },
    summary: (orgId: string, ownerUserId?: string) => {
      const qs = new URLSearchParams();
      if (ownerUserId) qs.set('ownerUserId', ownerUserId);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        total: number;
        notStarted: number;
        inProgress: number;
        overdue: number;
      }>(`/organizations/${orgId}/actions/summary${suffix}`);
    },
    getById: (orgId: string, actionId: string) =>
      apiFetch<Action>(`/organizations/${orgId}/actions/${actionId}`),
    create: (
      orgId: string,
      data: {
        title: string;
        description?: string;
        sourceScreen: string;
        sourceRef?: Record<string, unknown>;
        severity?: string;
        ownerRole?: string;
        ownerUserId?: string;
        dueDate?: string;
        linkedSlackThreadUrl?: string;
      },
    ) =>
      apiFetch<Action>(`/organizations/${orgId}/actions`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      orgId: string,
      actionId: string,
      data: {
        title?: string;
        description?: string;
        severity?: string;
        ownerRole?: string;
        ownerUserId?: string | null;
        dueDate?: string | null;
        status?: string;
        linkedSlackThreadUrl?: string | null;
        note?: string;
      },
    ) =>
      apiFetch<Action>(`/organizations/${orgId}/actions/${actionId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (orgId: string, actionId: string) =>
      apiFetch<DeletedResult>(`/organizations/${orgId}/actions/${actionId}`, {
        method: 'DELETE',
      }),
  },

  // === Data Health (§6.1) ===
  dataHealth: {
    getStatus: (orgId: string) =>
      apiFetch<{
        overall: 'HEALTHY' | 'DEGRADED' | 'UNKNOWN';
        sources: Array<{
          source: string;
          lastSyncAt: string | null;
          status: string | null;
          errorMessage: string | null;
          durationMs: number | null;
        }>;
      }>(`/organizations/${orgId}/data-health`),
    getLogs: (orgId: string, limit?: number) =>
      apiFetch<DataSyncLog[]>(
        `/organizations/${orgId}/data-health/logs${limit ? `?limit=${limit}` : ''}`,
      ),
  },

  // === Triage (AI司令塔 §2.x) ===
  triage: {
    classify: (
      orgId: string,
      params?: { fiscalYear?: number; endMonth?: number },
    ) => {
      const qs = new URLSearchParams();
      if (params?.fiscalYear) qs.set('fiscalYear', String(params.fiscalYear));
      if (params?.endMonth) qs.set('endMonth', String(params.endMonth));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        summary: {
          urgent: number;
          thisWeek: number;
          monthly: number;
          noise: number;
          total: number;
          lastRunAt: string;
        };
        signals: Array<{
          id: string;
          source: 'ACTION' | 'ALERT' | 'DATA_SYNC' | 'BUSINESS_EVENT';
          bucket: 'URGENT' | 'THIS_WEEK' | 'MONTHLY' | 'NOISE';
          title: string;
          description: string;
          severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
          agentOwner: 'brief' | 'sentinel' | 'drafter' | 'auditor';
          reason: string;
          evidenceSource: string;
          confidence: 'HIGH' | 'MEDIUM' | 'LOW';
          linkHref?: string;
          detectedAt: string;
          refId?: string;
        }>;
      }>(`/organizations/${orgId}/triage/classify${suffix}`);
    },
  },

  // === Briefing (brief エージェントの朝のダイジェスト) ===
  briefing: {
    today: (
      orgId: string,
      params?: { fiscalYear?: number; endMonth?: number },
    ) => {
      const qs = new URLSearchParams();
      if (params?.fiscalYear) qs.set('fiscalYear', String(params.fiscalYear));
      if (params?.endMonth) qs.set('endMonth', String(params.endMonth));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        generatedAt: string;
        greeting: string;
        headlines: Array<{
          title: string;
          body: string;
          source: 'URGENT' | 'ALERT' | 'ACTION' | 'FINANCIAL' | 'DATA_HEALTH';
          severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
          linkHref?: string;
        }>;
        fallbackReason?: string;
      }>(`/organizations/${orgId}/briefing/today${suffix}`);
    },
    history: (orgId: string, params?: { limit?: number; days?: number }) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.days) qs.set('days', String(params.days));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<
        Array<{
          id: string;
          generatedAt: string;
          greeting: string;
          headlines: Array<{
            title: string;
            body: string;
            source: 'URGENT' | 'ALERT' | 'ACTION' | 'FINANCIAL' | 'DATA_HEALTH';
            severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
            linkHref?: string;
          }>;
          fallbackReason?: string;
          urgentCount: number;
          headlineCount: number;
        }>
      >(`/organizations/${orgId}/briefing/history${suffix}`);
    },
    getPushConfig: (orgId: string) =>
      apiFetch<{
        enabled: boolean;
        hourJst: number;
        webhookConfigured: boolean;
      }>(`/organizations/${orgId}/briefing/push-config`),
    updatePushConfig: (
      orgId: string,
      payload: {
        enabled?: boolean;
        hourJst?: number;
        webhookUrl?: string | null;
      },
    ) =>
      apiFetch<{
        enabled: boolean;
        hourJst: number;
        webhookConfigured: boolean;
      }>(`/organizations/${orgId}/briefing/push-config`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    pushTest: (orgId: string) =>
      apiFetch<{ sent: boolean; reason?: string }>(
        `/organizations/${orgId}/briefing/push-test`,
        { method: 'POST' },
      ),
  },

  // === Notifications (通知センター) ===
  notifications: {
    list: (
      orgId: string,
      params?: { unreadOnly?: boolean; limit?: number; days?: number },
    ) => {
      const qs = new URLSearchParams();
      if (params?.unreadOnly) qs.set('unreadOnly', 'true');
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.days) qs.set('days', String(params.days));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<
        Array<{
          id: string;
          type:
            | 'ANOMALY_ALERT'
            | 'CASHFLOW_ALERT'
            | 'SYNC_ERROR'
            | 'AI_COMMENT'
            | 'ADVISOR_COMMENT'
            | 'SYSTEM';
          title: string;
          message: string;
          isRead: boolean;
          createdAt: string;
          metadata: Record<string, unknown>;
          linkHref?: string;
        }>
      >(`/organizations/${orgId}/notifications${suffix}`);
    },
    unreadCount: (orgId: string) =>
      apiFetch<{ count: number }>(
        `/organizations/${orgId}/notifications/unread-count`,
      ),
    markRead: (orgId: string, id: string) =>
      apiFetch<{ id: string; isRead: boolean } | { ok: false }>(
        `/organizations/${orgId}/notifications/${id}/read`,
        { method: 'PATCH' },
      ),
    markAllRead: (orgId: string) =>
      apiFetch<{ count: number }>(
        `/organizations/${orgId}/notifications/mark-all-read`,
        { method: 'POST' },
      ),
  },

  // === Sentinel (異常検知エージェント) ===
  sentinel: {
    signals: (
      orgId: string,
      params?: {
        fiscalYear?: number;
        endMonth?: number;
        runwayMode?: 'worstCase' | 'netBurn' | 'actual';
      },
    ) => {
      const qs = new URLSearchParams();
      if (params?.fiscalYear) qs.set('fiscalYear', String(params.fiscalYear));
      if (params?.endMonth) qs.set('endMonth', String(params.endMonth));
      if (params?.runwayMode) qs.set('runwayMode', params.runwayMode);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        generatedAt: string;
        detections: Array<{
          id: string;
          kind: 'CASH_TREND' | 'RUNWAY_SHORT' | 'DSO_SPIKE' | 'SHORT_BORROW_UP';
          severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
          title: string;
          body: string;
          evidence: {
            source: string;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            premise: string;
          };
          linkHref?: string;
        }>;
        fallbackReason?: string;
      }>(`/organizations/${orgId}/sentinel/signals${suffix}`);
    },
  },

  // === Auditor (品質監査エージェント) ===
  auditor: {
    qualityCheck: (orgId: string) =>
      apiFetch<{
        generatedAt: string;
        findings: Array<{
          id: string;
          category:
            | 'COVERAGE_GAP'
            | 'RECURRING_FINDING'
            | 'RULE_DECAY'
            | 'DATA_FRESHNESS';
          severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
          title: string;
          body: string;
          evidence: {
            source: string;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            premise: string;
          };
          linkHref?: string;
        }>;
        fallbackReason?: string;
      }>(`/organizations/${orgId}/auditor/quality-check`),
  },

  // === Drafter (月次レポート初稿エージェント) ===
  drafter: {
    monthlyDraft: (
      orgId: string,
      params?: {
        fiscalYear?: number;
        endMonth?: number;
        runwayMode?: 'worstCase' | 'netBurn' | 'actual';
      },
    ) => {
      const qs = new URLSearchParams();
      if (params?.fiscalYear) qs.set('fiscalYear', String(params.fiscalYear));
      if (params?.endMonth) qs.set('endMonth', String(params.endMonth));
      if (params?.runwayMode) qs.set('runwayMode', params.runwayMode);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        generatedAt: string;
        kind: 'DRAFT';
        period: { fiscalYear: number | null; endMonth: number | null };
        sections: Array<{
          heading: string;
          body: string;
          evidence: {
            source: string;
            confidence: 'HIGH' | 'MEDIUM' | 'LOW';
            premise: string;
          };
        }>;
        fallbackReason?: string;
      }>(`/organizations/${orgId}/drafter/monthly-draft${suffix}`);
    },
  },

  // === Copilot (β版 AIペイン。レビュー/対話/実行の3モード) ===
  copilot: {
    chat: (
      orgId: string,
      payload: {
        agentKey: 'brief' | 'sentinel' | 'drafter' | 'auditor';
        mode: 'observe' | 'dialog' | 'execute';
        pathname: string;
        fiscalYear?: number;
        endMonth?: number;
        runwayMode?: 'worstCase' | 'netBurn' | 'actual';
        /** 業種別知識（getKnowledgeForAI で生成） */
        industryContext?: string;
        messages: { role: 'user' | 'assistant'; content: string }[];
      },
    ) =>
      apiFetch<{
        reply: string;
        model: string;
        toolCalls?: Array<{
          name: string;
          input: Record<string, unknown>;
          ok: boolean;
          summary: string;
        }>;
      }>(`/organizations/${orgId}/copilot/chat`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  // === Agent Runs (全エージェント実行履歴) ===
  agentRuns: {
    list: (
      orgId: string,
      params?: {
        agentKey?: 'BRIEF' | 'SENTINEL' | 'DRAFTER' | 'AUDITOR' | 'COPILOT';
        limit?: number;
        days?: number;
      },
    ) => {
      const qs = new URLSearchParams();
      if (params?.agentKey) qs.set('agentKey', params.agentKey);
      if (params?.limit) qs.set('limit', String(params.limit));
      if (params?.days) qs.set('days', String(params.days));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{
        items: Array<{
          id: string;
          agentKey: 'BRIEF' | 'SENTINEL' | 'DRAFTER' | 'AUDITOR' | 'COPILOT';
          mode: 'OBSERVE' | 'DIALOG' | 'EXECUTE' | 'CRON' | null;
          generatedAt: string;
          fiscalYear: number | null;
          endMonth: number | null;
          status: 'SUCCESS' | 'FALLBACK' | 'FAILED';
          errorMessage: string | null;
          durationMs: number | null;
          toolCalls: unknown;
        }>;
      }>(`/organizations/${orgId}/agent-runs${suffix}`);
    },
    get: (orgId: string, id: string) =>
      apiFetch<{
        id: string;
        orgId: string;
        agentKey: 'BRIEF' | 'SENTINEL' | 'DRAFTER' | 'AUDITOR' | 'COPILOT';
        mode: 'OBSERVE' | 'DIALOG' | 'EXECUTE' | 'CRON' | null;
        generatedAt: string;
        fiscalYear: number | null;
        endMonth: number | null;
        userId: string | null;
        input: unknown;
        output: unknown;
        toolCalls: unknown;
        status: 'SUCCESS' | 'FALLBACK' | 'FAILED';
        errorMessage: string | null;
        durationMs: number | null;
        createdAt: string;
      }>(`/organizations/${orgId}/agent-runs/${id}`),
  },

  // === Business Events (§6.2) ===
  businessEvents: {
    list: (orgId: string, fromDate?: string, toDate?: string) => {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('fromDate', fromDate);
      if (toDate) qs.set('toDate', toDate);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<BusinessEvent[]>(
        `/organizations/${orgId}/business-events${suffix}`,
      );
    },
    create: (
      orgId: string,
      data: {
        eventDate: string;
        eventType: string;
        title: string;
        note?: string;
        impactTags?: string[];
      },
    ) =>
      apiFetch<BusinessEvent>(`/organizations/${orgId}/business-events`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (orgId: string, eventId: string, data: UpdateBusinessEventInput) =>
      apiFetch<BusinessEvent>(
        `/organizations/${orgId}/business-events/${eventId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      ),
    remove: (orgId: string, eventId: string) =>
      apiFetch<DeletedResult>(
        `/organizations/${orgId}/business-events/${eventId}`,
        {
          method: 'DELETE',
        },
      ),
  },
};
