/**
 * SevenBoard / factory-hybrid 共通のロール体系。
 * factory の `requireRole(req, companyId, ROLE_*)` パターンと整合させる。
 */
export type MembershipRole =
  | 'owner'
  | 'admin'
  | 'member'
  | 'viewer'
  | 'advisor';

export const ROLE_READ: readonly MembershipRole[] = [
  'owner',
  'admin',
  'member',
  'viewer',
  'advisor',
];

export const ROLE_WRITE: readonly MembershipRole[] = [
  'owner',
  'admin',
  'member',
  'advisor',
];

export const ROLE_APPROVE: readonly MembershipRole[] = ['owner', 'admin'];

export function isMembershipRole(value: unknown): value is MembershipRole {
  return (
    value === 'owner' ||
    value === 'admin' ||
    value === 'member' ||
    value === 'viewer' ||
    value === 'advisor'
  );
}
