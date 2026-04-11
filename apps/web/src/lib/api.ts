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
    // 401はthrowするだけ。トークン消去やリダイレクトはAuthGuardに任せる
    // window.location.hrefでハードリロードするとReact stateが全消しされる
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiFetch<{ accessToken: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Advisor organizations
  getAdvisorOrgs: () =>
    apiFetch<{ id: string; name: string; code: string; industry: string; fiscalMonthEnd: number }[]>(
      '/auth/me/organizations',
    ),

  // Switch org (ADVISOR)
  switchOrg: (orgId: string) =>
    apiFetch<{ accessToken: string; user: any }>('/auth/switch-org', {
      method: 'POST',
      body: JSON.stringify({ orgId }),
    }),

  // Organizations
  getOrganization: (orgId: string) =>
    apiFetch<any>(`/organizations/${orgId}`),

  getFiscalYears: (orgId: string) =>
    apiFetch<any[]>(`/organizations/${orgId}/fiscal-years`),

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
    return apiFetch<any>(`/organizations/${orgId}/reports/variance?${query.toString()}`);
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
    return apiFetch<any>(`/organizations/${orgId}/reports/pl${suffix}`);
  },

  getVariableCost: (orgId: string, month?: string) =>
    apiFetch<any>(`/organizations/${orgId}/reports/variable-cost${month ? `?month=${month}` : ''}`),

  // Budgets
  getBudgetVersions: (fyId: string) =>
    apiFetch<any>(`/fiscal-years/${fyId}/budget-versions`),

  getBudgetEntries: (bvId: string) =>
    apiFetch<any>(`/budget-versions/${bvId}/entries`),

  updateBudgetEntries: (bvId: string, entries: any[]) =>
    apiFetch<any>(`/budget-versions/${bvId}/entries`, {
      method: 'PUT',
      body: JSON.stringify({ entries }),
    }),

  // Actuals
  getActuals: (orgId: string, month?: string) =>
    apiFetch<any>(`/organizations/${orgId}/actuals${month ? `?month=${month}` : ''}`),

  // Cashflow
  getCashflowActual: (orgId: string) =>
    apiFetch<any>(`/organizations/${orgId}/cashflow/actual`),

  getRunway: (orgId: string) =>
    apiFetch<any>(`/organizations/${orgId}/cashflow/runway`),

  getCashflowCategories: (orgId: string) =>
    apiFetch<any>(`/organizations/${orgId}/cashflow/categories`),

  // === Calendar ===
  calendar: {
    getEvents: (orgId: string, year: number, month: number) =>
      apiFetch<any[]>(`/organizations/${orgId}/calendar?year=${year}&month=${month}`),
    createEvent: (orgId: string, data: { title: string; date: string; type?: string; description?: string }) =>
      apiFetch<any>(`/organizations/${orgId}/calendar`, { method: 'POST', body: JSON.stringify(data) }),
    updateEvent: (orgId: string, eventId: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/calendar/${eventId}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteEvent: (orgId: string, eventId: string) =>
      apiFetch<any>(`/organizations/${orgId}/calendar/${eventId}`, { method: 'DELETE' }),
  },

  // === Comments ===
  comments: {
    getAll: (orgId: string, month?: string) =>
      apiFetch<any[]>(
        `/organizations/${orgId}/comments${month ? `?month=${month}` : ''}`,
      ),
    create: (orgId: string, data: { content: string; month?: string; cellRef?: string; priority?: string }) =>
      apiFetch<any>(`/organizations/${orgId}/comments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateStatus: (
      orgId: string,
      commentId: string,
      data: { status: string; content?: string; rejectReason?: string },
    ) =>
      apiFetch<any>(`/organizations/${orgId}/comments/${commentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (orgId: string, commentId: string) =>
      apiFetch<any>(`/organizations/${orgId}/comments/${commentId}`, {
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
        data: any[];
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
    getRecent: () => apiFetch<any[]>('/advisor/recent'),
  },

  // === AI ===
  ai: {
    getSummary: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<{ summary: string; sections?: { title: string; content: string }[]; highlights: { type: string; text: string }[]; generatedAt: string }>(
        `/organizations/${orgId}/ai/summary${suffix}`,
      );
    },
    getTalkScript: (orgId: string, fiscalYear?: number) =>
      apiFetch<any>(`/organizations/${orgId}/ai/talk-script${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`),
    getBudgetScenarios: (orgId: string, fiscalYear?: number) =>
      apiFetch<any>(`/organizations/${orgId}/ai/budget-scenarios${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`),
    generateBudgetScenarios: (orgId: string, params: {
      fiscalYear?: number;
      baseGrowthRate?: number;
      upsideGrowthRate?: number;
      downsideGrowthRate?: number;
      newHires?: number;
      costReductionRate?: number;
      notes?: string;
    }) =>
      apiFetch<any>(`/organizations/${orgId}/ai/budget-scenarios`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    getFundingReport: (orgId: string, fiscalYear?: number) =>
      apiFetch<any>(`/organizations/${orgId}/ai/funding-report${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`),
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
      apiFetch<any[]>(`/organizations/${orgId}/masters/accounts`),
    createAccount: (orgId: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/masters/accounts`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateAccount: (orgId: string, id: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/masters/accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteAccount: (orgId: string, id: string) =>
      apiFetch<any>(`/organizations/${orgId}/masters/accounts/${id}`, {
        method: 'DELETE',
      }),
    getDepartments: (orgId: string) =>
      apiFetch<any[]>(`/organizations/${orgId}/masters/departments`),
    createDepartment: (orgId: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/masters/departments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateDepartment: (orgId: string, id: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/masters/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteDepartment: (orgId: string, id: string) =>
      apiFetch<any>(`/organizations/${orgId}/masters/departments/${id}`, {
        method: 'DELETE',
      }),
    getUsers: (orgId: string) =>
      apiFetch<any[]>(`/organizations/${orgId}/masters/users`),
    createUser: (orgId: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/masters/users`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateUser: (orgId: string, id: string, data: any) =>
      apiFetch<any>(`/organizations/${orgId}/masters/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteUser: (orgId: string, id: string) =>
      apiFetch<any>(`/organizations/${orgId}/masters/users/${id}`, {
        method: 'DELETE',
      }),
  },

  // === MF (MoneyForward連携) ===
  mf: {
    getOffice: (orgId: string) =>
      apiFetch<any>(`/organizations/${orgId}/mf/office`),

    getDashboard: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<any>(`/organizations/${orgId}/mf/dashboard${suffix}`);
    },

    getPL: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<any>(`/organizations/${orgId}/mf/financial-statements/pl${suffix}`);
    },

    getBS: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<any>(`/organizations/${orgId}/mf/financial-statements/bs${suffix}`);
    },

    getCashflow: (orgId: string, fiscalYear?: number) =>
      apiFetch<any>(
        `/organizations/${orgId}/mf/cashflow${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getPLTransition: (orgId: string, fiscalYear?: number) =>
      apiFetch<any>(
        `/organizations/${orgId}/mf/pl-transition${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),

    getAccounts: (orgId: string) =>
      apiFetch<any>(`/organizations/${orgId}/mf/accounts`),

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
      return apiFetch<any>(`/organizations/${orgId}/mf/journals${suffix}`);
    },

    getFinancialIndicators: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<any>(`/organizations/${orgId}/mf/financial-indicators${suffix}`);
    },
  },

  // === Alerts (異常値検知) ===
  alerts: {
    getAll: (orgId: string, fiscalYear?: number, month?: number) => {
      const qs = new URLSearchParams();
      if (fiscalYear) qs.set('fiscalYear', String(fiscalYear));
      if (month) qs.set('endMonth', String(month));
      const suffix = qs.toString() ? `?${qs}` : '';
      return apiFetch<any[]>(`/organizations/${orgId}/alerts${suffix}`);
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
      apiFetch<any>(`/organizations/${orgId}/simulation/what-if`, {
        method: 'POST',
        body: JSON.stringify(dto),
      }),
    loan: (orgId: string, params: any) =>
      apiFetch<any>(`/organizations/${orgId}/simulation/loan`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
    linkedStatements: (orgId: string, params: any) =>
      apiFetch<any>(`/organizations/${orgId}/simulation/linked-statements`, {
        method: 'POST',
        body: JSON.stringify(params),
      }),
  },

  // === Review (経理レビュー) ===
  review: {
    run: (orgId: string, fiscalYear?: number) =>
      apiFetch<any>(
        `/organizations/${orgId}/mf/review${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
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
      return apiFetch<any[]>(`/kintone/monthly-progress${suffix}`);
    },
    getByMfCode: (mfCode: string, fiscalYear?: string) =>
      apiFetch<any>(
        `/kintone/monthly-progress/by-mf/${mfCode}${fiscalYear ? `?fiscalYear=${fiscalYear}` : ''}`,
      ),
    updateStatus: (recordId: string, month: number, status: string) =>
      apiFetch<{ success: boolean }>(`/kintone/monthly-progress/${recordId}`, {
        method: 'PUT',
        body: JSON.stringify({ month, status }),
      }),
  },

  // === Sync ===
  sync: {
    run: (orgId: string) =>
      apiFetch<any>(`/organizations/${orgId}/sync/run`, { method: 'POST' }),
    status: (orgId: string) =>
      apiFetch<any>(`/organizations/${orgId}/sync/status`),
  },

  // === Onboarding ===
  onboarding: {
    start: (orgId: string) =>
      apiFetch<any>(`/organizations/${orgId}/onboarding/start`, {
        method: 'POST',
      }),
    status: (orgId: string) =>
      apiFetch<any>(`/organizations/${orgId}/onboarding/status`),
  },
};
