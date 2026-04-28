"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { useCurrentOrg } from "@/contexts/current-org";
import { usePeriodStore } from "@/lib/period-store";
import type {
  CashflowData,
  DashboardSummary,
  PLStatement,
  BSStatement,
  FinancialIndicators,
  PlTransitionPoint,
  AiSummaryResponse,
  AlertItem,
} from "@/lib/mf-types";

function useOrgId() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { currentOrgId } = useCurrentOrg();
  if (!isAuthenticated) return "";
  return currentOrgId ?? "";
}

/** グローバル期間セレクターの値を返す */
function useGlobalPeriod() {
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const month = usePeriodStore((s) => s.month);
  return { fiscalYear, month };
}

interface QueryOptions {
  enabled?: boolean;
}

export function useMfDashboard(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery<DashboardSummary>({
    queryKey: ["mf", "dashboard", orgId, fiscalYear, month],
    queryFn: () => api.mf.getDashboard(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfPL(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery<PLStatement>({
    queryKey: ["mf", "pl", orgId, fiscalYear, month],
    queryFn: () => api.mf.getPL(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfBS(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery<BSStatement>({
    queryKey: ["mf", "bs", orgId, fiscalYear, month],
    queryFn: () => api.mf.getBS(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfCashflow(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery<CashflowData>({
    queryKey: ["mf", "cashflow", orgId, fiscalYear, month],
    queryFn: () => api.mf.getCashflow(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfPLTransition(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear } = useGlobalPeriod();
  return useQuery<PlTransitionPoint[]>({
    queryKey: ["mf", "pl-transition", orgId, fiscalYear],
    queryFn: () => api.mf.getPLTransition(orgId, fiscalYear),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

function useStoredRunwayMode(): 'worstCase' | 'netBurn' | 'actual' | undefined {
  if (typeof window === 'undefined') return undefined;
  const v = window.localStorage.getItem('sevenboard:runway-mode:v2');
  return v === 'worstCase' || v === 'netBurn' || v === 'actual' ? v : undefined;
}

export function useAiSummary(
  options?: QueryOptions & {
    focus?: 'all' | 'revenue' | 'cost' | 'cashflow' | 'indicators';
  },
) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  const runwayMode = useStoredRunwayMode();
  const focus = options?.focus ?? 'all';
  return useQuery<AiSummaryResponse>({
    queryKey: ["ai", "summary", orgId, fiscalYear, month, runwayMode, focus],
    queryFn: () => api.ai.getSummary(orgId, fiscalYear, month, runwayMode, focus),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 30 * 60 * 1000,
  });
}

export function useAiTalkScript() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  const runwayMode = useStoredRunwayMode();
  return useQuery({
    queryKey: ["ai", "talk-script", orgId, fiscalYear, month, runwayMode],
    queryFn: () => api.ai.getTalkScript(orgId, fiscalYear, month, runwayMode),
    enabled: false, // manual trigger only
    staleTime: 30 * 60 * 1000,
  });
}

export function useAiBudgetScenarios(fiscalYear?: number) {
  const orgId = useOrgId();
  const runwayMode = useStoredRunwayMode();
  return useQuery({
    queryKey: ["ai", "budget-scenarios", orgId, fiscalYear, runwayMode],
    queryFn: () => api.ai.getBudgetScenarios(orgId, fiscalYear, runwayMode),
    enabled: false, // manual trigger only
    staleTime: 30 * 60 * 1000,
  });
}

export function useAiFundingReport() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  const runwayMode = useStoredRunwayMode();
  return useQuery({
    queryKey: ["ai", "funding-report", orgId, fiscalYear, month, runwayMode],
    queryFn: () => api.ai.getFundingReport(orgId, fiscalYear, month, runwayMode),
    enabled: false, // manual trigger only
    staleTime: 30 * 60 * 1000,
  });
}

export function useMfOffice() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["mf", "office", orgId],
    queryFn: () => api.mf.getOffice(orgId),
    enabled: !!orgId,
    staleTime: 30 * 60 * 1000, // 30分キャッシュ
  });
}

export function useVariableCost(fiscalYear?: number, endMonth?: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["variable-cost", orgId, fiscalYear, endMonth],
    queryFn: () => api.getVariableCost(orgId, fiscalYear, endMonth),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfAccountTransition(accountName: string, fiscalYear?: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["mf", "account-transition", orgId, accountName, fiscalYear],
    queryFn: () => api.mf.getAccountTransition(orgId, accountName, fiscalYear),
    enabled: !!orgId && !!accountName,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfJournals(params?: { startDate?: string; endDate?: string; accountName?: string }) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["mf", "journals", orgId, params],
    queryFn: () => api.mf.getJournals(orgId, params),
    enabled: !!orgId && !!(params?.startDate || params?.accountName),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfFinancialIndicators(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery<FinancialIndicators>({
    queryKey: ["mf", "financial-indicators", orgId, fiscalYear, month],
    queryFn: () => api.mf.getFinancialIndicators(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * 財務指標ページの AI CFO 解説。
 * indicators 同様の period スコープで生成。LLM 呼び出しコストが大きいので 30 分キャッシュ。
 */
export function useAiIndicatorsCommentary(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["ai", "indicators-commentary", orgId, fiscalYear, month],
    queryFn: () => api.ai.getIndicatorsCommentary(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useAlerts(options?: QueryOptions) {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery<AlertItem[]>({
    queryKey: ["alerts", orgId, fiscalYear, month],
    queryFn: () => api.alerts.getAll(orgId, fiscalYear, month),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWhatIfSimulation() {
  const orgId = useOrgId();
  return useMutation({
    mutationFn: (dto: {
      revenueChangePercent?: number;
      costChangePercent?: number;
      newHires?: number;
      additionalInvestment?: number;
    }) => api.simulation.whatIf(orgId, dto),
  });
}
