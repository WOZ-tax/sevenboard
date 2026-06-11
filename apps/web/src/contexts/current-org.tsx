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
import { usePeriodStore } from "@/lib/period-store";
import { useCopilotStore } from "@/lib/copilot-store";

export type MembershipRole = "owner" | "admin" | "member" | "viewer" | "advisor";

export interface Membership {
  tenantId: string;
  orgId: string;
  role: MembershipRole;
  tenantRole?: string;
  orgRole?: string;
  side?: "advisor" | "client";
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
      // org スコープの zustand ストアも reset。これを呼ばないと:
      //  - period-store (sevenboard-period として localStorage 永続) が
      //    前 org の fiscalYear/month/locked を保持し、別 org に存在しない年度で
      //    クエリが飛ぶ。periods は次の office フェッチで再初期化される。
      //  - copilot-store (in-memory) に前 org の会話履歴が残る。
      usePeriodStore.getState().reset();
      useCopilotStore.getState().reset();
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

/**
 * 事務所スタッフの tenantRole（firm 階層のロール）から capability を導出する。
 *
 * 以前は `user.role === 'owner' || 'advisor'` や
 * `tenantRole === 'firm_owner'` 等の文字列直比較でゲーティングしていたため、
 * firm_admin / firm_manager で顧問先を担当するスタッフが /advisor から弾かれていた。
 * backend が effective_capabilities を membership に乗せるまでの間、最低限
 * firm_admin / firm_manager を canAccessAdvisor / canManageStaff に含める。
 *
 * NOTE: 型 (Membership / AuthUser) は変えず、既存フィールドから素直に判定する。
 */
export function deriveTenantCapabilities(
  tenantRole: string | null | undefined,
): { canAccessAdvisor: boolean; canManageStaff: boolean } {
  // 顧問先ポータル(/advisor)へアクセスできる firm ロール。
  const advisorRoles = new Set([
    "firm_owner",
    "firm_admin",
    "firm_manager",
    "firm_advisor",
  ]);
  // 事務所スタッフ管理ができる firm ロール（owner に加え admin/manager も許可）。
  const manageStaffRoles = new Set([
    "firm_owner",
    "firm_admin",
    "firm_manager",
  ]);
  const role = tenantRole ?? "";
  return {
    canAccessAdvisor: advisorRoles.has(role),
    canManageStaff: manageStaffRoles.has(role),
  };
}
