-- factory-hybrid との概念統合のため、advisor_assignments を organization_memberships に rename。
-- データ・列構造は変更しない。FK・unique index・PK 制約名も合わせて変更。

-- テーブル本体
ALTER TABLE "advisor_assignments" RENAME TO "organization_memberships";

-- 主キー
ALTER TABLE "organization_memberships"
  RENAME CONSTRAINT "advisor_assignments_pkey" TO "organization_memberships_pkey";

-- FK 制約
ALTER TABLE "organization_memberships"
  RENAME CONSTRAINT "advisor_assignments_user_id_fkey" TO "organization_memberships_user_id_fkey";
ALTER TABLE "organization_memberships"
  RENAME CONSTRAINT "advisor_assignments_org_id_fkey" TO "organization_memberships_org_id_fkey";

-- Unique index（compound key）
ALTER INDEX "advisor_assignments_user_id_org_id_key"
  RENAME TO "organization_memberships_user_id_org_id_key";
