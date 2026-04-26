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

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/sb_csrf=([^;]+)/);
  return match ? match[1] : null;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const csrfToken = getCsrfToken();
  const method = options?.method?.toUpperCase() || 'GET';
  const needsCsrf = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include', // Cookie送信
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(needsCsrf && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...options?.headers,
    },
  });
  if (res.status === 401) {
    // トークン期限切れ → ログイン画面にリダイレクト
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.message || `API error: ${res.status}`) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

export function isMfNotConnected(err: unknown): boolean {
  return (err as { statusCode?: number })?.statusCode === 503;
}

export type MonthlyReviewApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

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

export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Advisor organizations
  getAdvisorOrgs: () =>
    apiFetch<{ id: string; name: string; code: string; industry: string; fiscalMonthEnd: number }[]>(
      '/auth/me/organizations',
    ),

  /**
   * factory-hybrid と整合する membership API。
   * フロントの useCurrentOrg() context が消費する。
   */
  getMemberships: () =>
    apiFetch<
      Array<{
        orgId: string;
        role: 'owner' | 'admin' | 'member' | 'viewer' | 'advisor';
        orgName: string;
        orgCode: string | null;
        industry?: string | null;
        fiscalMonthEnd?: number | null;
      }>
    >('/auth/me/memberships'),

  // Switch org (ADVISOR)
  switchOrg: (orgId: string) =>
    apiFetch<{ accessToken: string; user: AuthUser }>('/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    }),

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
    apiFetch<Organization>("/organizations", {
      method: "POST",
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
    },
  ) =>
    apiFetch<Organization>(`/organizations/${orgId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteOrganization: (orgId: string) =>
    apiFetch<{ success: boolean }>(`/organizations/${orgId}`, {
      method: "DELETE",
    }),

  // === Internal Users (SEVENRICH 事務所スタッフ) ===
  internalUsers: {
    list: () =>
      apiFetch<
        Array<{
          id: string;
          email: string;
          name: string;
          role: 'owner' | 'advisor';
          avatarUrl: string | null;
          createdAt: string;
          updatedAt: string;
          _count: { memberships: number };
        }>
      >('/internal/users'),

    create: (payload: {
      email: string;
      name: string;
      password: string;
      role: 'owner' | 'advisor';
    }) =>
      apiFetch<{
        id: string;
        email: string;
        name: string;
        role: 'owner' | 'advisor';
      }>('/internal/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    update: (
      userId: string,
      payload: {
        name?: string;
        role?: 'owner' | 'advisor';
        password?: string;
      },
    ) =>
      apiFetch<{ id: string; email: string; name: string; role: string }>(
        `/internal/users/${userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      ),

    remove: (userId: string) =>
      apiFetch<{ success: boolean }>(`/internal/users/${userId}`, {
        method: 'DELETE',
      }),
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
    return apiFetch<VarianceRow[]>(`/organizations/${orgId}/reports/variance?${query.toString()}`);
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
    const suffix = query.toString() ? `?${query.toString()}` : "";
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
    apiFetch<ActualEntry[]>(`/organizations/${orgId}/actuals${month ? `?month=${month}` : ''}`),

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
      apiFetch<CalendarEvent[]>(`/organizations/${orgId}/calendar?year=${year}&month=${month}`),
    createEvent: (orgId: string, data: { title: string; date: string; type?: string; description?: string }) =>
      apiFetch<CalendarEvent>(`/organizations/${orgId}/calendar`, { method: 'POST', body: JSON.stringify(data) }),
    updateEvent: (orgId: string, eventId: string, data: UpdateCalendarEventInput) =>
      apiFetch<CalendarEvent>(`/organizations/${orgId}/calendar/${eventId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEvent: (orgId: string, eventId: string) =>
      apiFetch<DeletedResult>(`/organizations/${orgId}/calendar/${eventId}`, { method: 'DELETE' }),
  },

  // === Comments ===
  comments: {
    getAll: (orgId: string, month?: string) =>
      apiFetch<AiComment[]>(
        `/organizations/${orgId}/comments${month ? `?month=${month}` : ''}`,
      ),
    create: (orgId: string, data: { content: string; month?: string; cellRef?: string; priority?: string }) =>
      apiFetch<AiComment>(`/organizations/${orgId}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateStatus: (
      orgId: string,
      commentId: string,
      data: { status: string; content?: string; rejectReason?: string },
    ) =>
      apiFetch<AiComment>(`/organizations/${orgId}/comments/${commentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
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
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      if (runwayMode) qs.set('runwayMode', runwayMode);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<AiSummaryResponse>(
        `/organizations/${orgId}/ai/summary${suffix}`,
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
      return apiFetch<TalkScript>(`/organizations/${orgId}/ai/talk-script${suffix}`);
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
    generateBudgetScenarios: (orgId: string, params: {
      fiscalYear?: number;
      baseGrowthRate?: number;
      upsideGrowthRate?: number;
      downsideGrowthRate?: number;
      newHires?: number;
      costReductionRate?: number;
      notes?: string;
      runwayMode?: 'worstCase' | 'netBurn' | 'actual';
    }) =>
      apiFetch<BudgetScenario[]>(`/organizations/${orgId}/ai/budget-scenarios`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
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
    ) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (endMonth) qs.set('endMonth', String(endMonth));
      if (runwayMode) qs.set('runwayMode', runwayMode);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<FundingReport>(`/organizations/${orgId}/ai/funding-report${suffix}`);
    },

    /** 融資シミュの結果を添えてレポート再生成 */
    getFundingReportWithScenarios: (
      orgId: string,
      params: {
        fiscalYear?: number;
        endMonth?: number;
        scenarios?: Array<{
          name: string;
          principal: number;
          monthlyPayment: number;
          totalInterest: number;
          termMonths: number;
          interestRate: number;
        }>;
      },
    ) =>
      apiFetch<FundingReport>(`/organizations/${orgId}/ai/funding-report`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },

  // === MF OAuth ===
  mfOAuth: {
    getAuthUrl: (orgId: string) =>
      apiFetch<{ authUrl: string }>(`/auth/mf/authorize?orgId=${orgId}`),
  },

  // === Integrations (データ連携) ===
  integrations: {
    getAll: (orgId: string) =>
      apiFetch<{ provider: string; isConnected: boolean; lastSyncAt: string | null; syncStatus: string }[]>(
        `/organizations/${orgId}/integrations`,
      ),
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
      apiFetch<AccountMaster>(`/organizations/${orgId}/masters/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteAccount: (orgId: string, id: string) =>
      apiFetch<AccountMaster>(`/organizations/${orgId}/masters/accounts/${id}`, {
        method: 'DELETE',
      }),
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
      apiFetch<DepartmentMaster[]>(`/organizations/${orgId}/masters/departments`),
    createDepartment: (orgId: string, data: CreateDepartmentInput) =>
      apiFetch<DepartmentMaster>(`/organizations/${orgId}/masters/departments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateDepartment: (orgId: string, id: string, data: UpdateDepartmentInput) =>
      apiFetch<DepartmentMaster>(`/organizations/${orgId}/masters/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteDepartment: (orgId: string, id: string) =>
      apiFetch<DepartmentMaster>(`/organizations/${orgId}/masters/departments/${id}`, {
        method: 'DELETE',
      }),
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
      return apiFetch<DashboardSummary>(`/organizations/${orgId}/mf/dashboard${suffix}`);
    },

    getPL: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<PLStatement>(`/organizations/${orgId}/mf/financial-statements/pl${suffix}`);
    },

    getBS: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<BSStatement>(`/organizations/${orgId}/mf/financial-statements/bs${suffix}`);
    },

    getCashflow: (orgId: string, fiscalYear?: number) =>
      apiFetch<CashflowData>(
        `/organizations/${orgId}/mf/cashflow${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getPLTransition: (orgId: string, fiscalYear?: number) =>
      apiFetch<PlTransitionPoint[]>(
        `/organizations/${orgId}/mf/pl-transition${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getAccounts: (orgId: string) =>
      apiFetch<MfAccountsResponse>(`/organizations/${orgId}/mf/accounts`),

    getAccountTransition: (orgId: string, accountName: string, fiscalYear?: number) =>
      apiFetch<{ month: string; amount: number }[]>(
        `/organizations/${orgId}/mf/accounts/${encodeURIComponent(accountName)}/transition${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getJournals: (orgId: string, params?: { startDate?: string; endDate?: string; accountName?: string }) => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set('startDate', params.startDate);
      if (params?.endDate) qs.set('endDate', params.endDate);
      if (params?.accountName) qs.set('accountName', params.accountName);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return apiFetch<MfJournalsResponse>(`/organizations/${orgId}/mf/journals${suffix}`);
    },

    getFinancialIndicators: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<FinancialIndicators>(`/organizations/${orgId}/mf/financial-indicators${suffix}`);
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
    whatIf: (orgId: string, dto: {
      revenueChangePercent?: number;
      costChangePercent?: number;
      newHires?: number;
      additionalInvestment?: number;
    }) =>
      apiFetch<WhatIfResult>(`/organizations/${orgId}/simulation/what-if`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    loan: (orgId: string, params: LoanSimulationInput) =>
      apiFetch<LoanSimulationResult>(`/organizations/${orgId}/simulation/loan`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    linkedStatements: (orgId: string, params: LinkedStatementsInput) =>
      apiFetch<LinkedStatementsResult>(`/organizations/${orgId}/simulation/linked-statements`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
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
    submit: (orgId: string, fiscalYear: number, month: number, comment?: string) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord }>(
        `/organizations/${orgId}/monthly-review-approvals/submit`,
        { method: 'POST', body: JSON.stringify({ fiscalYear, month, comment }) },
      ),
    approve: (orgId: string, fiscalYear: number, month: number, comment?: string) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord }>(
        `/organizations/${orgId}/monthly-review-approvals/approve`,
        { method: 'POST', body: JSON.stringify({ fiscalYear, month, comment }) },
      ),
    reject: (orgId: string, fiscalYear: number, month: number, comment?: string) =>
      apiFetch<{ record: MonthlyReviewApprovalRecord }>(
        `/organizations/${orgId}/monthly-review-approvals/reject`,
        { method: 'POST', body: JSON.stringify({ fiscalYear, month, comment }) },
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
    getMonthlyProgress: (fiscalYear?: string, search?: string, assignee?: string) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', fiscalYear);
      if (search) qs.set('search', search);
      if (assignee) qs.set('assignee', assignee);
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<KintoneMonthlyProgress[]>(`/kintone/monthly-progress${suffix}`);
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
      apiFetch<SyncRunResult>(`/organizations/${orgId}/sync/run`, { method: 'POST' }),
    status: (orgId: string) =>
      apiFetch<SyncStatusResult>(`/organizations/${orgId}/sync/status`),
  },

  // === Onboarding ===
  onboarding: {
    start: (orgId: string) =>
      apiFetch<OnboardingStartResult>(`/organizations/${orgId}/onboarding/start`, {
        method: 'POST',
      }),
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
      if (params?.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
      if (params?.endMonth) qs.set("endMonth", String(params.endMonth));
      const suffix = qs.toString() ? `?${qs}` : "";
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
          source: "ACTION" | "ALERT" | "DATA_SYNC" | "BUSINESS_EVENT";
          bucket: "URGENT" | "THIS_WEEK" | "MONTHLY" | "NOISE";
          title: string;
          description: string;
          severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
          agentOwner: "brief" | "sentinel" | "drafter" | "auditor";
          reason: string;
          evidenceSource: string;
          confidence: "HIGH" | "MEDIUM" | "LOW";
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
      if (params?.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
      if (params?.endMonth) qs.set("endMonth", String(params.endMonth));
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<{
        generatedAt: string;
        greeting: string;
        headlines: Array<{
          title: string;
          body: string;
          source: "URGENT" | "ALERT" | "ACTION" | "FINANCIAL" | "DATA_HEALTH";
          severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
          linkHref?: string;
        }>;
        fallbackReason?: string;
      }>(`/organizations/${orgId}/briefing/today${suffix}`);
    },
    history: (
      orgId: string,
      params?: { limit?: number; days?: number },
    ) => {
      const qs = new URLSearchParams();
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.days) qs.set("days", String(params.days));
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<
        Array<{
          id: string;
          generatedAt: string;
          greeting: string;
          headlines: Array<{
            title: string;
            body: string;
            source:
              | "URGENT"
              | "ALERT"
              | "ACTION"
              | "FINANCIAL"
              | "DATA_HEALTH";
            severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
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
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    pushTest: (orgId: string) =>
      apiFetch<{ sent: boolean; reason?: string }>(
        `/organizations/${orgId}/briefing/push-test`,
        { method: "POST" },
      ),
  },

  // === Notifications (通知センター) ===
  notifications: {
    list: (
      orgId: string,
      params?: { unreadOnly?: boolean; limit?: number; days?: number },
    ) => {
      const qs = new URLSearchParams();
      if (params?.unreadOnly) qs.set("unreadOnly", "true");
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.days) qs.set("days", String(params.days));
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<
        Array<{
          id: string;
          type:
            | "ANOMALY_ALERT"
            | "CASHFLOW_ALERT"
            | "SYNC_ERROR"
            | "AI_COMMENT"
            | "ADVISOR_COMMENT"
            | "SYSTEM";
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
        { method: "PATCH" },
      ),
    markAllRead: (orgId: string) =>
      apiFetch<{ count: number }>(
        `/organizations/${orgId}/notifications/mark-all-read`,
        { method: "POST" },
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
      if (params?.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
      if (params?.endMonth) qs.set("endMonth", String(params.endMonth));
      if (params?.runwayMode) qs.set("runwayMode", params.runwayMode);
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<{
        generatedAt: string;
        detections: Array<{
          id: string;
          kind:
            | "CASH_TREND"
            | "RUNWAY_SHORT"
            | "DSO_SPIKE"
            | "SHORT_BORROW_UP";
          severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
          title: string;
          body: string;
          evidence: {
            source: string;
            confidence: "HIGH" | "MEDIUM" | "LOW";
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
            | "COVERAGE_GAP"
            | "RECURRING_FINDING"
            | "RULE_DECAY"
            | "DATA_FRESHNESS";
          severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
          title: string;
          body: string;
          evidence: {
            source: string;
            confidence: "HIGH" | "MEDIUM" | "LOW";
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
      if (params?.fiscalYear) qs.set("fiscalYear", String(params.fiscalYear));
      if (params?.endMonth) qs.set("endMonth", String(params.endMonth));
      if (params?.runwayMode) qs.set("runwayMode", params.runwayMode);
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<{
        generatedAt: string;
        kind: "DRAFT";
        period: { fiscalYear: number | null; endMonth: number | null };
        sections: Array<{
          heading: string;
          body: string;
          evidence: {
            source: string;
            confidence: "HIGH" | "MEDIUM" | "LOW";
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
        agentKey: "brief" | "sentinel" | "drafter" | "auditor";
        mode: "observe" | "dialog" | "execute";
        pathname: string;
        fiscalYear?: number;
        endMonth?: number;
        runwayMode?: 'worstCase' | 'netBurn' | 'actual';
        messages: { role: "user" | "assistant"; content: string }[];
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
      }>(
        `/organizations/${orgId}/copilot/chat`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
  },

  // === Agent Runs (全エージェント実行履歴) ===
  agentRuns: {
    list: (
      orgId: string,
      params?: {
        agentKey?: "BRIEF" | "SENTINEL" | "DRAFTER" | "AUDITOR" | "COPILOT";
        limit?: number;
        days?: number;
      },
    ) => {
      const qs = new URLSearchParams();
      if (params?.agentKey) qs.set("agentKey", params.agentKey);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.days) qs.set("days", String(params.days));
      const suffix = qs.toString() ? `?${qs}` : "";
      return apiFetch<{
        items: Array<{
          id: string;
          agentKey: "BRIEF" | "SENTINEL" | "DRAFTER" | "AUDITOR" | "COPILOT";
          mode: "OBSERVE" | "DIALOG" | "EXECUTE" | "CRON" | null;
          generatedAt: string;
          fiscalYear: number | null;
          endMonth: number | null;
          status: "SUCCESS" | "FALLBACK" | "FAILED";
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
        agentKey: "BRIEF" | "SENTINEL" | "DRAFTER" | "AUDITOR" | "COPILOT";
        mode: "OBSERVE" | "DIALOG" | "EXECUTE" | "CRON" | null;
        generatedAt: string;
        fiscalYear: number | null;
        endMonth: number | null;
        userId: string | null;
        input: unknown;
        output: unknown;
        toolCalls: unknown;
        status: "SUCCESS" | "FALLBACK" | "FAILED";
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
      return apiFetch<BusinessEvent[]>(`/organizations/${orgId}/business-events${suffix}`);
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
      apiFetch<BusinessEvent>(`/organizations/${orgId}/business-events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (orgId: string, eventId: string) =>
      apiFetch<DeletedResult>(`/organizations/${orgId}/business-events/${eventId}`, {
        method: 'DELETE',
      }),
  },
};
