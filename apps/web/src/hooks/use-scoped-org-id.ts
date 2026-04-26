"use client";

import { useAuthStore } from "@/lib/auth";
import { useCurrentOrg } from "@/contexts/current-org";

/**
 * 現在表示中の顧問先 (org) の ID を返す。
 *
 * マルチテナント設計上、`user.orgId` を直接読んではいけない。
 * - 内部スタッフ (owner / advisor) は `user.orgId === null` のため空文字になる
 * - CL 側ユーザーでも、将来切替が入ると `user.orgId` は JWT バインドの「自社」しか指さない
 *
 * 代わりに CurrentOrgContext の `currentOrgId` を正とする。
 * `useCurrentOrg` は `/auth/me/memberships` を引いて memberships と reconcile しているので、
 * - 内部スタッフ: 担当している任意の顧問先（OrgSwitcher / advisor portal で切替可能）
 * - CL ユーザ: 自社（memberships は 1 件）
 * のいずれでも正しく解決される。
 *
 * 認証前 / memberships 解決前は空文字を返す。呼び出し側は `enabled: !!orgId` でフェッチを抑止すること。
 */
export function useScopedOrgId(): string {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { currentOrgId } = useCurrentOrg();
  if (!isAuthenticated) return "";
  return currentOrgId ?? "";
}
