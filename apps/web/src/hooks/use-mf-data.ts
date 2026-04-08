"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";
import { usePeriodStore } from "@/lib/period-store";

function useOrgId() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return "";
  return user?.orgId || "";
}

/** グローバル期間セレクターの値を返す */
function useGlobalPeriod() {
  const fiscalYear = usePeriodStore((s) => s.fiscalYear);
  const month = usePeriodStore((s) => s.month);
  return { fiscalYear, month };
}

/**
 * P-1: ログイン後に主要MFデータを一括プリフェッチ
 * DashboardShell で呼び出すことで、画面遷移前にキャッシュを温める
 */
export function usePrefetchMfData() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    // ログイン後に主要データを一括プリフェッチ
    queryClient.prefetchQuery({ queryKey: ["mf", "dashboard", orgId], queryFn: () => api.mf.getDashboard(orgId), staleTime: 5 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ["mf", "pl", orgId], queryFn: () => api.mf.getPL(orgId), staleTime: 5 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ["mf", "bs", orgId], queryFn: () => api.mf.getBS(orgId), staleTime: 5 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ["mf", "cashflow", orgId], queryFn: () => api.mf.getCashflow(orgId), staleTime: 5 * 60 * 1000 });
  }, [orgId, queryClient]);
}

export function useMfDashboard() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["mf", "dashboard", orgId, fiscalYear, month],
    queryFn: () => api.mf.getDashboard(orgId, fiscalYear, month),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfPL() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["mf", "pl", orgId, fiscalYear, month],
    queryFn: () => api.mf.getPL(orgId, fiscalYear, month),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfBS() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["mf", "bs", orgId, fiscalYear, month],
    queryFn: () => api.mf.getBS(orgId, fiscalYear, month),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfCashflow() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["mf", "cashflow", orgId, fiscalYear, month],
    queryFn: () => api.mf.getCashflow(orgId, fiscalYear, month),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMfPLTransition() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["mf", "pl-transition", orgId, fiscalYear, month],
    queryFn: () => api.mf.getPLTransition(orgId, fiscalYear, month),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAiSummary() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["ai", "summary", orgId, fiscalYear, month],
    queryFn: () => api.ai.getSummary(orgId, fiscalYear),
    enabled: !!orgId,
    staleTime: 30 * 60 * 1000, // 30分キャッシュ（AI生成はコストがかかるため）
  });
}

export function useAiTalkScript(fiscalYear?: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai", "talk-script", orgId, fiscalYear],
    queryFn: () => api.ai.getTalkScript(orgId, fiscalYear),
    enabled: false, // manual trigger only
    staleTime: 30 * 60 * 1000,
  });
}

export function useAiBudgetScenarios(fiscalYear?: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai", "budget-scenarios", orgId, fiscalYear],
    queryFn: () => api.ai.getBudgetScenarios(orgId, fiscalYear),
    enabled: false, // manual trigger only
    staleTime: 30 * 60 * 1000,
  });
}

export function useAiFundingReport(fiscalYear?: number) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai", "funding-report", orgId, fiscalYear],
    queryFn: () => api.ai.getFundingReport(orgId, fiscalYear),
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

export function useVariableCost(month?: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["variable-cost", orgId, month],
    queryFn: () => api.getVariableCost(orgId, month),
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

export function useMfFinancialIndicators() {
  const orgId = useOrgId();
  const { fiscalYear, month } = useGlobalPeriod();
  return useQuery({
    queryKey: ["mf", "financial-indicators", orgId, fiscalYear, month],
    queryFn: () => api.mf.getFinancialIndicators(orgId, fiscalYear, month),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAlerts() {
  const orgId = useOrgId();
  const { fiscalYear } = useGlobalPeriod();
  return useQuery({
    queryKey: ["alerts", orgId, fiscalYear],
    queryFn: () => api.alerts.getAll(orgId, fiscalYear),
    enabled: !!orgId,
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
