"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/auth";

function useOrgId() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return "";
  return user?.orgId || "";
}

export function useBudgetContext() {
  const orgId = useOrgId();

  const fiscalYearsQuery = useQuery({
    queryKey: ["fiscal-years", orgId],
    queryFn: () => api.getFiscalYears(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const activeFiscalYear = fiscalYearsQuery.data?.[0] ?? null;
  const activeBudgetVersion = activeFiscalYear?.budgetVersions?.[0] ?? null;

  const budgetEntriesQuery = useQuery({
    queryKey: ["budget-entries", activeBudgetVersion?.id],
    queryFn: () => api.getBudgetEntries(activeBudgetVersion.id),
    enabled: !!activeBudgetVersion?.id,
    staleTime: 60 * 1000,
  });

  const varianceQuery = useQuery({
    queryKey: ["variance", orgId, activeBudgetVersion?.id],
    queryFn: () =>
      api.getVariance(orgId, {
        budgetVersionId: activeBudgetVersion.id,
      }),
    enabled: !!orgId && !!activeBudgetVersion?.id,
    staleTime: 60 * 1000,
  });

  return {
    orgId,
    fiscalYearsQuery,
    activeFiscalYear,
    activeBudgetVersion,
    budgetEntriesQuery,
    varianceQuery,
  };
}

export function useUpdateBudgetEntries(budgetVersionId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entries: any[]) =>
      api.updateBudgetEntries(budgetVersionId as string, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["budget-entries", budgetVersionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["variance"],
      });
    },
  });
}

export function useNormalizedBudgetRows(entries: any[] | undefined) {
  return useMemo(() => {
    if (!entries?.length) return [];

    const monthKeys = ["apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "jan", "feb", "mar"] as const;
    const monthMap: Record<number, (typeof monthKeys)[number]> = {
      4: "apr",
      5: "may",
      6: "jun",
      7: "jul",
      8: "aug",
      9: "sep",
      10: "oct",
      11: "nov",
      12: "dec",
      1: "jan",
      2: "feb",
      3: "mar",
    };

    const grouped = new Map<string, any>();

    for (const entry of entries) {
      const key = entry.accountId;
      const month = new Date(entry.month).getMonth() + 1;
      const targetMonth = monthMap[month];
      if (!targetMonth) continue;

      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          accountId: entry.accountId,
          category: entry.account.name,
          apr: 0,
          may: 0,
          jun: 0,
          jul: 0,
          aug: 0,
          sep: 0,
          oct: 0,
          nov: 0,
          dec: 0,
          jan: 0,
          feb: 0,
          mar: 0,
          sourceEntries: [],
        });
      }

      const row = grouped.get(key);
      row[targetMonth] = Number(entry.amount);
      row.sourceEntries.push(entry);
    }

    return Array.from(grouped.values());
  }, [entries]);
}

export function useNormalizedVarianceRows(rows: any[] | undefined) {
  return useMemo(() => {
    if (!rows?.length) return [];

    const grouped = new Map<string, any>();

    for (const row of rows) {
      const key = row.accountId;
      if (!grouped.has(key)) {
        grouped.set(key, {
          category: row.accountName,
          budget: 0,
          actual: 0,
          variance: 0,
          ratio: 0,
        });
      }

      const current = grouped.get(key);
      current.budget += Number(row.budgetAmount);
      current.actual += Number(row.actualAmount);
      current.variance += Number(row.varianceAmount);
    }

    return Array.from(grouped.values()).map((row) => ({
      ...row,
      ratio: row.budget !== 0 ? (row.variance / row.budget) * 100 : 0,
    }));
  }, [rows]);
}
