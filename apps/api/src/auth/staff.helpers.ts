/**
 * SEVENRICH 事務所スタッフ（内部スタッフ）判定ロジック。
 *
 * G-1 ロール設計：
 * - 内部スタッフ = SEVENRICH 事務所側ユーザー。`user.orgId === null` かつ
 *   `user.role IN ('owner', 'advisor')`。クロステナントで顧問先を横断管理する
 * - 顧問先側ユーザー = `user.orgId !== null`。role が 'owner' / 'admin' /
 *   'member' / 'viewer' のいずれであっても、自社 org に閉じる
 *
 * 重要：role だけで判定すると、顧問先側で role='owner' のユーザー（CL の管理者）が
 * 全 org access を取ってしまう。必ず orgId === null も併せて確認すること。
 */
export interface UserLike {
  id: string;
  role: string;
  orgId: string | null;
}

/** 内部スタッフ（事務所オーナー or 顧問スタッフ） */
export function isInternalStaff(user: UserLike): boolean {
  if (user.orgId !== null) return false;
  return user.role === 'owner' || user.role === 'advisor';
}

/** 内部スタッフのオーナー（事務所自体の管理権限） */
export function isInternalOwner(user: UserLike): boolean {
  return user.orgId === null && user.role === 'owner';
}

/** 内部スタッフの顧問担当者 */
export function isInternalAdvisor(user: UserLike): boolean {
  return user.orgId === null && user.role === 'advisor';
}
