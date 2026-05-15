"use client";

/**
 * 決算検討 + ロカベン + 汎用 KV (feature-state) の DB 永続化 hooks。
 *
 * 設計:
 *   - 取得は React Query useQuery (5分staleキャッシュ)。orgId/fiscalYear ごとにキー分割
 *   - 書込は useMutation で、成功時に invalidateQueries で再取得
 *   - useFeatureStateLocal は「ローカル即時編集 + debounced PUT」のラッパ。
 *     UIで頻繁に書き換える入力欄 (税予想・KPI 等) に使う。
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/contexts/current-org";

function useOrgId(): string {
  const { currentOrgId } = useCurrentOrg();
  return currentOrgId ?? "";
}

// ============================================================
// 04 tax-saving
// ============================================================
export function useTaxSavingDone(fiscalYear: number | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["yes", "tax-saving", orgId, fiscalYear],
    queryFn: () => api.yearEndState.listTaxSaving(orgId, fiscalYear!),
    enabled: !!orgId && !!fiscalYear,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTaxSavingMutation() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { fiscalYear: number; itemId: string; isDone: boolean }) =>
      api.yearEndState.upsertTaxSaving(orgId, body.itemId, {
        fiscalYear: body.fiscalYear,
        isDone: body.isDone,
      }),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({
        queryKey: ["yes", "tax-saving", orgId, body.fiscalYear],
      });
    },
  });
}

// ============================================================
// 06 bs-cleanup
// ============================================================
export function useBsCleanupTasks(fiscalYear: number | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["yes", "bs-cleanup", orgId, fiscalYear],
    queryFn: () => api.yearEndState.listBsCleanup(orgId, fiscalYear!),
    enabled: !!orgId && !!fiscalYear,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBsCleanupCreate() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.yearEndState.createBsCleanup>[1]) =>
      api.yearEndState.createBsCleanup(orgId, body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({
        queryKey: ["yes", "bs-cleanup", orgId, body.fiscalYear],
      });
    },
  });
}

export function useBsCleanupUpdate() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      id: string;
      fiscalYear: number;
      patch: Parameters<typeof api.yearEndState.updateBsCleanup>[2];
    }) => api.yearEndState.updateBsCleanup(orgId, params.id, params.patch),
    onSuccess: (_data, params) => {
      qc.invalidateQueries({
        queryKey: ["yes", "bs-cleanup", orgId, params.fiscalYear],
      });
    },
  });
}

export function useBsCleanupDelete() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; fiscalYear: number }) =>
      api.yearEndState.deleteBsCleanup(orgId, params.id),
    onSuccess: (_data, params) => {
      qc.invalidateQueries({
        queryKey: ["yes", "bs-cleanup", orgId, params.fiscalYear],
      });
    },
  });
}

// ============================================================
// 07 schedule
// ============================================================
export function useYearEndSchedule(fiscalYear: number | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["yes", "schedule", orgId, fiscalYear],
    queryFn: () => api.yearEndState.listSchedule(orgId, fiscalYear!),
    enabled: !!orgId && !!fiscalYear,
    staleTime: 5 * 60 * 1000,
  });
}

export function useScheduleMutation() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      itemId: string;
      fiscalYear: number;
      isDone?: boolean;
      customDate?: string | null;
    }) =>
      api.yearEndState.upsertSchedule(orgId, body.itemId, {
        fiscalYear: body.fiscalYear,
        isDone: body.isDone,
        customDate: body.customDate,
      }),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({
        queryKey: ["yes", "schedule", orgId, body.fiscalYear],
      });
    },
  });
}

// ============================================================
// locaben
// ============================================================
export function useLocabenState() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["yes", "locaben", orgId],
    queryFn: () => api.yearEndState.getLocaben(orgId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLocabenStateMutation() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.yearEndState.upsertLocaben>[1]) =>
      api.yearEndState.upsertLocaben(orgId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["yes", "locaben", orgId] });
    },
  });
}

// ============================================================
// 汎用 feature-state KV
// ============================================================
export function useFeatureState<T = unknown>(
  featureKey: string,
  scope: string = "",
) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["yes", "feature", orgId, featureKey, scope],
    queryFn: () => api.yearEndState.getFeature<T>(orgId, featureKey, scope),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeatureStateMutation<T = unknown>(
  featureKey: string,
  scope: string = "",
) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: T) =>
      api.yearEndState.upsertFeature<T>(orgId, featureKey, scope, value),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["yes", "feature", orgId, featureKey, scope],
      });
    },
  });
}

/**
 * 「ローカル即時編集 + debounced PUT」 のラッパ。
 * 既存セクションが LocalStorage への即時保存パターンで動いていたので、それを置換する。
 *
 * @param featureKey  feature 識別子
 * @param scope       任意スコープ (例: 会計年度)
 * @param defaultValue 初期値 (DB に レコードが無い時)
 * @param debounceMs  書込み debounce (デフォルト 600ms)
 */
export function useFeatureStateLocal<T>(
  featureKey: string,
  scope: string,
  defaultValue: T,
  debounceMs = 600,
): {
  value: T;
  setValue: (next: T | ((prev: T) => T)) => void;
  isLoading: boolean;
  isSaving: boolean;
  saveError: Error | null;
} {
  const orgId = useOrgId();
  const query = useFeatureState<T>(featureKey, scope);
  const mutation = useFeatureStateMutation<T>(featureKey, scope);
  const [local, setLocal] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // scope / featureKey / orgId の組合せが変わったかを検知して再 hydrate する
  const scopeHash = `${orgId}|${featureKey}|${scope}`;
  const lastScopeRef = useRef<string>("");

  /* eslint-disable react-hooks/set-state-in-effect -- サーバー値からの hydrate + scope 切替対応 */
  // scope 切替検知: 旧 scope の debounce タイマーを破棄して hydrated をリセット
  useEffect(() => {
    if (lastScopeRef.current === scopeHash) return;
    lastScopeRef.current = scopeHash;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHydrated(false);
    setLocal(defaultValue);
  }, [scopeHash, defaultValue]);

  // サーバー値で初期化 (scope 毎に 1 回)
  useEffect(() => {
    if (hydrated) return;
    if (query.isLoading) return;
    if (
      query.data &&
      query.data.value !== undefined &&
      query.data.value !== null
    ) {
      setLocal(query.data.value);
    } else {
      // サーバーに記録なし → default のまま (setLocal は scope 切替時に既に default 化済)
    }
    setHydrated(true);
  }, [hydrated, query.isLoading, query.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setValue = useMemo(() => {
    return (next: T | ((prev: T) => T)) => {
      // hydrate 完了前のセットは保存しない (空 default で DB を上書きしない)
      if (!hydrated) return;
      setLocal((prev) => {
        const resolved =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          mutation.mutate(resolved);
        }, debounceMs);
        return resolved;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation は安定参照前提
  }, [debounceMs, hydrated]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    value: local,
    setValue,
    isLoading: query.isLoading && !hydrated,
    isSaving: mutation.isPending,
    saveError: (mutation.error as Error | null) ?? null,
  };
}
