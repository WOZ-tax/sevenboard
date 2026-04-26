-- G-1 strict: CL side is read-only.
-- The previous migration (20260426010000) demoted CL owner/advisor to admin
-- as a less aggressive fix; this migration tightens it to viewer.
--
-- Rationale: SevenBoard is "事務所主体". CL users only ever consume reports;
-- all writes (master / actual / budget / approval) come from internal staff.
-- Keeping CL=viewer-only means @Roles('admin','member',...) become dead in
-- practice, so the codebase can be audited on the basis that any role other
-- than 'viewer' implies internal staff.
--
-- enum 値 admin/member そのものは factory-hybrid 互換のため残す。
UPDATE "users"
SET    "role" = 'viewer'
WHERE  "org_id" IS NOT NULL
  AND  "role" IN ('admin', 'member');
