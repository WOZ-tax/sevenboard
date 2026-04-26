"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuthStore } from "@/lib/auth";
import { api } from "@/lib/api";
import {
  readCurrentOrgStorage,
  writeCurrentOrgStorage,
} from "@/lib/current-org-storage";

export type MembershipRole = "owner" | "admin" | "member" | "viewer" | "advisor";

export interface Membership {
  orgId: string;
  role: MembershipRole;
  orgName: string;
  orgCode: string | null;
  industry?: string | null;
  fiscalMonthEnd?: number | null;
}

interface CurrentOrgContextValue {
  memberships: Membership[];
  currentOrgId: string | null;
  currentOrg: Membership | null;
  currentRole: MembershipRole | null;
  setCurrentOrgId: (orgId: string) => void;
  isLoading: boolean;
  hasMemberships: boolean;
}

const CurrentOrgContext = createContext<CurrentOrgContextValue | null>(null);

/**
 * factory-hybrid の `current-company` パターンを SevenBoard 用に移植。
 *
 * 仕組み：
 * - `/auth/me/memberships` で自分のアクセス可能 org 一覧を取得
 * - 前回選択 orgId を localStorage に保存
 * - membership 一覧と reconcile し、revoked/missing なら先頭の有効 org に fallback
 * - `setCurrentOrgId` で切替時に react-query キャッシュ全消し（org スコープのデータが残らないように）
 */
export function CurrentOrgProvider({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();

  const memberships = useQuery<Membership[]>({
    queryKey: ["auth", "memberships"],
    queryFn: () => api.getMemberships(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const list = memberships.data ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readCurrentOrgStorage(),
  );

  // localStorage の選択値と memberships を reconcile：
  // 失効/削除されてたら memberships の先頭にフォールバック。何も無ければ null。
  const currentOrgId = useMemo<string | null>(() => {
    if (list.length === 0) return null;
    if (selectedId && list.some((m) => m.orgId === selectedId)) {
      return selectedId;
    }
    return list[0]?.orgId ?? null;
  }, [list, selectedId]);

  const currentOrg = useMemo<Membership | null>(() => {
    if (!currentOrgId) return null;
    return list.find((m) => m.orgId === currentOrgId) ?? null;
  }, [list, currentOrgId]);

  const currentRole = currentOrg?.role ?? null;

  // 解決後の値が localStorage と乖離していたら同期
  useEffect(() => {
    if (currentOrgId && readCurrentOrgStorage() !== currentOrgId) {
      writeCurrentOrgStorage(currentOrgId);
    }
  }, [currentOrgId]);

  const setCurrentOrgId = useCallback(
    (orgId: string) => {
      if (orgId === currentOrgId) return;
      setSelectedId(orgId);
      writeCurrentOrgStorage(orgId);
      // org スコープの全クエリを破棄。次の render で各 hook が新しい orgId で再フェッチ。
      // memberships 自身は orgId 非依存なので残す。
      queryClient.removeQueries({
        predicate: (q) => {
          const key = q.queryKey;
          return Array.isArray(key) && key[0] !== "auth";
        },
      });
    },
    [currentOrgId, queryClient],
  );

  const value = useMemo<CurrentOrgContextValue>(
    () => ({
      memberships: list,
      currentOrgId,
      currentOrg,
      currentRole,
      setCurrentOrgId,
      isLoading: !isAuthenticated ? false : memberships.isLoading,
      hasMemberships: list.length > 0,
    }),
    [
      list,
      currentOrgId,
      currentOrg,
      currentRole,
      setCurrentOrgId,
      isAuthenticated,
      memberships.isLoading,
    ],
  );

  return (
    <CurrentOrgContext.Provider value={value}>
      {children}
    </CurrentOrgContext.Provider>
  );
}

export function useCurrentOrg(): CurrentOrgContextValue {
  const ctx = useContext(CurrentOrgContext);
  if (!ctx) {
    throw new Error("useCurrentOrg must be used within <CurrentOrgProvider>");
  }
  return ctx;
}
